import { readFileSync } from 'fs';
import { Spectrum } from 'spectrum-ts';
import { terminal } from 'spectrum-ts/providers/terminal';
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

// Swap providers: replace terminal.config() with imessage.config() on-site
const app = await Spectrum({ providers: [terminal.config()] });

console.log('Maestro ready — type a voice command:');

for await (const [, message] of app.messages) {
  if (message.content.type !== 'text') continue;

  const command = message.content.text.trim();
  if (!command) continue;

  console.log(`[cmd] "${command}"`);

  // Handle each command concurrently so the message loop stays unblocked
  handleCommand(command, message).catch(console.error);
}

async function handleCommand(
  command: string,
  message: { reply: (text: string) => Promise<unknown> },
) {
  // Dispatch — api.agent will be typed once Lane A pushes agent.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatchFn = (api as any).agent?.dispatch;
  if (!dispatchFn) {
    await message.reply('Lane A not ready yet — agent.dispatch not found in generated API.');
    return;
  }

  let jobIds: string[];
  try {
    const result = await convex.action(dispatchFn, { command });
    jobIds = (result as { jobIds: string[] }).jobIds;
  } catch (err) {
    await message.reply(`Dispatch error: ${err}`);
    return;
  }

  await message.reply(`Dispatched ${jobIds.length} agent(s) — watching results…`);

  // Poll listJobs until all dispatched jobs are settled
  const pending = new Set(jobIds);
  const reported = new Set<string>();
  const deadline = Date.now() + 120_000;

  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(1500);

    const jobs = await convex.query(api.jobs.listJobs, {});
    for (const job of jobs) {
      if (!pending.has(job._id) || reported.has(job._id)) continue;
      if (job.status === 'done' || job.status === 'blocked') {
        reported.add(job._id);
        pending.delete(job._id);
        const icon = job.status === 'done' ? '✓' : '⚠';
        await message.reply(`${icon} [${job.agent}] ${job.result ?? '(no result)'}`);
      }
    }
  }

  if (pending.size > 0) {
    await message.reply(`⏱ Timed out — ${pending.size} agent(s) still running.`);
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
