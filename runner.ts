import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { Spectrum } from 'spectrum-ts';
import { terminal } from 'spectrum-ts/providers/terminal';
import { imessage } from 'spectrum-ts/providers/imessage';
import { telegram } from 'spectrum-ts/providers/telegram';
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

// REAL_EDITS=true → agents actually write files in REPO_PATH and we text the git diff.
const REAL_EDITS = process.env.REAL_EDITS === 'true';
const REPO_PATH = process.env.REPO_PATH ?? '';

// Human-in-the-loop: after agents propose edits, we wait for "approve"/"reject".
let pendingReview = false;

// CHANNEL=imessage switches to Photon iMessage; default is terminal (no creds needed)
const channel = (process.env.CHANNEL ?? 'terminal').toLowerCase();

let app;
if (channel === 'imessage') {
  app = await Spectrum({
    projectId: process.env.PHOTON_PROJECT_ID!,
    projectSecret: process.env.PHOTON_PROJECT_SECRET!,
    providers: [imessage.config()],
  });
} else if (channel === 'telegram') {
  // Inbound rides Photon's Fusor webhook (cloud mode auto-registers it);
  // outbound goes DIRECT to Telegram's Bot API → no shared-line congestion.
  app = await Spectrum({
    projectId: process.env.PHOTON_PROJECT_ID!,
    projectSecret: process.env.PHOTON_PROJECT_SECRET!,
    providers: [telegram.config({ botToken: process.env.TELEGRAM_BOT_TOKEN! })],
  });
} else {
  app = await Spectrum({ providers: [terminal.config()] });
}

console.log(`Maestro ready on ${channel} — type a voice command:`);

for await (const [, message] of app.messages) {
  if (message.content.type !== 'text') continue;

  const text = message.content.text.trim();
  if (!text) continue;

  // If agents are awaiting a verdict and this looks like one, act on it.
  if (pendingReview && isDecision(text)) {
    console.log(`[decision] "${text}"`);
    handleDecision(text, message).catch(console.error);
  } else {
    console.log(`[cmd] "${text}"`);
    // Handle concurrently so the message loop stays unblocked
    handleCommand(text, message).catch(console.error);
  }
}

async function handleCommand(
  command: string,
  message: { reply: (text: string) => Promise<unknown> },
) {
  // Start each run from the repo's clean baseline so diffs are repeatable.
  if (REAL_EDITS) resetRepo();

  let jobIds: string[];
  try {
    const result = await convex.action(api.agent.dispatch, { command });
    jobIds = result.jobIds;
  } catch (err) {
    await safeReply(message,`Dispatch error: ${err}`);
    return;
  }

  await safeReply(message,`🎼 Dispatched ${jobIds.length} agent(s)…`);

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
          if (REAL_EDITS && REPO_PATH && job.file) {
            const diff = applyEdit(job.file, job.result ?? '');
            const snippet = diff.length > 1200 ? diff.slice(0, 1200) + '\n…(truncated)' : diff;
            await safeReply(message, `✏️ [${job.agent}] edited ${job.file}\n\n${snippet || '(no changes)'}`);
          } else {
            await safeReply(message,`✓ [${job.agent}] ${job.result ?? '(no result)'}`);
          }
        } else {
          blockedCount++;
          await safeReply(message,`⚠ [${job.agent}] BLOCKED: ${job.result ?? '(no detail)'}`);
        }
      }
    }
  }

  if (pending.size > 0) {
    await safeReply(message,`⏱ Timed out — ${pending.size} agent(s) still running.`);
    return;
  }

  const total = doneCount + blockedCount;
  if (blockedCount === 0) {
    await safeReply(message,`✅ All ${total} agents done.`);
  } else {
    await safeReply(message,`✅ ${doneCount}/${total} done, ${blockedCount} blocked.`);
  }

  // Human-in-the-loop: agents only PROPOSED edits — you decide.
  if (REAL_EDITS && REPO_PATH && doneCount > 0) {
    pendingReview = true;
    await safeReply(message, `🧑‍⚖️ Review the diffs above. Reply "approve" to commit, or "reject" to revert.`);
  }
}

// Photon's gRPC stream can drop transiently ("[upstream] Connection dropped");
// Spectrum marks the send non-retryable, so retry it ourselves before giving up.
async function safeReply(
  message: { reply: (text: string) => Promise<unknown> },
  text: string,
) {
  const MAX = 5;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      await message.reply(text);
      await sleep(450); // pace sends so we don't burst Photon ("temporarily unavailable")
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[send] attempt ${attempt}/${MAX} failed: ${msg}`);
      if (attempt < MAX) await sleep(1000 * attempt);
    }
  }
  console.error(`[send] gave up after ${MAX} attempts: "${text.slice(0, 60)}"`);
}

// Restore the sandbox repo to the 'baseline' tag so each demo run starts identical,
// even after a previous run was approved & committed.
function resetRepo() {
  if (!REAL_EDITS || !REPO_PATH) return;
  try {
    execSync('git reset --hard baseline && git clean -fd', { cwd: REPO_PATH });
  } catch {
    try { execSync('git checkout -- .', { cwd: REPO_PATH }); } catch (err) {
      console.error('[repo] reset failed:', err);
    }
  }
}

// Does this message read as an approve/reject verdict?
function isDecision(text: string): boolean {
  return /^\s*(approve|approved|yes|ship|lgtm|👍|reject|rejected|no|revert|discard|👎)\b/i.test(text);
}

// Commit (approve) or revert (reject) the pending agent edits.
async function handleDecision(
  text: string,
  message: { reply: (text: string) => Promise<unknown> },
) {
  pendingReview = false;
  const approve = /^\s*(approve|approved|yes|ship|lgtm|👍)\b/i.test(text);
  if (!REAL_EDITS || !REPO_PATH) { await safeReply(message, 'Nothing to act on.'); return; }
  try {
    if (approve) {
      execSync('git add -A', { cwd: REPO_PATH });
      execSync(
        'git -c user.email=demo@maestro.dev -c user.name=Maestro commit -m "Maestro: apply approved agent edits"',
        { cwd: REPO_PATH },
      );
      const sha = execSync('git rev-parse --short HEAD', { cwd: REPO_PATH, encoding: 'utf8' }).trim();
      await safeReply(message, `✅ Approved — committed to the repo (${sha}). The agents' work is shipped.`);
    } else {
      execSync('git reset --hard baseline && git clean -fd', { cwd: REPO_PATH });
      await safeReply(message, `↩️ Rejected — reverted all edits. Repo is back to clean.`);
    }
  } catch (err) {
    await safeReply(message, `Decision failed: ${err}`);
  }
}

// Write the agent's generated content to its file and return the git diff.
function applyEdit(file: string, content: string): string {
  const full = join(REPO_PATH, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  try {
    return execSync(`git diff --no-color -- "${file}"`, { cwd: REPO_PATH, encoding: 'utf8' }).trim();
  } catch (err) {
    return `(diff failed: ${err})`;
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
