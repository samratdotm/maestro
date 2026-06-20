import { readFileSync } from 'fs';
import { Spectrum } from 'spectrum-ts';
import { terminal } from 'spectrum-ts/providers/terminal';
import { imessage } from 'spectrum-ts/providers/imessage';
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

// Load .env / .env.local without dotenv package
function loadEnv(...files: string[]) {
  for (const file of files) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) (process.env as Record<string, string>)[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
}
loadEnv('.env', '.env.local');

const convex = new ConvexHttpClient(process.env.CONVEX_URL ?? 'http://127.0.0.1:3210');

// CHANNEL=imessage switches to Photon iMessage; default is terminal (no creds needed)
const channel = (process.env.CHANNEL ?? 'terminal').toLowerCase();

const app = channel === 'imessage'
  ? await Spectrum({
      projectId: process.env.PHOTON_PROJECT_ID!,
      projectSecret: process.env.PHOTON_PROJECT_SECRET!,
      providers: [imessage.config()],
    })
  : await Spectrum({ providers: [terminal.config()] });

console.log(`Maestro ready on ${channel} — type a voice command:`);

for await (const [, message] of app.messages) {
  if (message.content.type !== 'text') continue;

  const command = message.content.text.trim();
  if (!command) continue;

  console.log(`[cmd] "${command}"`);

  // Handle concurrently so the message loop stays unblocked
  handleCommand(command, message).catch(console.error);
}

async function handleCommand(
  command: string,
  message: { reply: (text: string) => Promise<unknown> },
) {
  let jobIds: string[];
  try {
    const result = await convex.action(api.agent.dispatch, { command });
    jobIds = result.jobIds;
  } catch (err) {
    await message.reply(`Dispatch error: ${err}`);
    return;
  }

  await message.reply(`🎼 Dispatched ${jobIds.length} agent(s)…`);

  // Poll listJobs until all dispatched jobs settle
  const pending = new Set(jobIds);
  const reported = new Set<string>();
  const deadline = Date.now() + 120_000;
  let doneCount = 0;
  let blockedCount = 0;

  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(1500);

    const jobs = await convex.query(api.jobs.listJobs, {});
    for (const job of jobs) {
      if (!pending.has(job._id) || reported.has(job._id)) continue;
      if (job.status === 'done' || job.status === 'blocked') {
        reported.add(job._id);
        pending.delete(job._id);
        if (job.status === 'done') {
          doneCount++;
          await message.reply(`✓ [${job.agent}] ${job.result ?? '(no result)'}`);
        } else {
          blockedCount++;
          await message.reply(`⚠ [${job.agent}] BLOCKED: ${job.result ?? '(no detail)'}`);
        }
      }
    }
  }

  if (pending.size > 0) {
    await message.reply(`⏱ Timed out — ${pending.size} agent(s) still running.`);
    return;
  }

  const total = doneCount + blockedCount;
  if (blockedCount === 0) {
    await message.reply(`✅ All ${total} done.`);
  } else {
    await message.reply(`✅ ${doneCount}/${total} done, ${blockedCount} blocked.`);
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
