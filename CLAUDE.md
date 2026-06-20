# Maestro 🎼
**Conduct your AI coding agents by voice — they report back on iMessage.**

Hackathon build (Voice Coding Mini-Hackathon, 3 hrs). Hosts/tools: Voice Cursor, Convex, Respan, Photon.
(Repo dir is `voice-agent` — kept so the running `npx convex dev` isn't disturbed. App name = "Maestro".)

## What it does
One voice command fans out to 3–4 AI coding agents that run in parallel. Each agent does its task,
texts its result back to you on iMessage, and shows live status on a board. Every agent's reasoning is
traced in Respan so you can trust what ran unattended. Solves: babysitting agents, parallel-agent chaos,
prompting friction, and trust — all hands-free.

## Demo flow (the target)
1. Dispatch by **voice** (Voice Cursor): "Add tests to auth, update the README, and audit N+1 queries."
2. Dispatcher splits into 3 jobs → **Convex** stores them → live board shows 3 rows `running`.
3. Agents run in **parallel**, each calling the LLM via the **Respan** gateway (traced).
4. As each finishes, it texts its result to **iMessage** (Photon) + its board row flips to `done`.
5. Reply by **voice** to steer/ship. Open Respan to show the audit trail.

## Architecture
```
Voice (Voice Cursor dictation into terminal/iMessage)
   │  text command
   ▼
runner.ts (Spectrum app)  ──┐
   │ ConvexHttpClient        │  reads inbound msgs, sends replies
   ▼                         │
Convex: dispatch() ──fan-out──▶ processJob() ×N  (parallel, Promise.all)
   │  creates N job rows           │ LLM via Respan (MOCK_MODE fallback)
   ▼                               ▼
jobs table  ◀──updateJob── writes result + trace, status=done
   │ reactive                      │
   ▼                               ▼
panel/index.html (live board)   runner sends each result → iMessage
```

## Tool roles (all load-bearing — keep them visible in the demo)
- **Voice Cursor**: dispatch + steer hands-free. (OS-level dictation into the input field — not a code integration.)
- **Convex**: job state, reactive board, parallel fan-out, (stretch) scheduler.
- **Respan**: LLM gateway + trace = the trust/audit layer for unattended agents.
- **Photon/iMessage**: agents reach you; you reply from anywhere. (Reuse engram bot.ts pattern.)

## Project layout
```
voice-agent/                  # dir name stays (convex dev is running here); app = "Maestro"
├── convex/
│   ├── schema.ts             # jobs table              ── LANE A
│   ├── jobs.ts               # createJob, updateJob, listJobs ── LANE A
│   └── agent.ts              # dispatch(), processJob() (Respan + MOCK_MODE) ── LANE A
├── runner.ts                 # Spectrum app: inbound→dispatch, results→reply ── LANE B
├── lib/respan.ts             # Respan gateway client (OpenAI-compatible) ── LANE A
├── panel/index.html          # live board (reactive/poll)               ── LANE C
├── .env                      # see §Env
└── CLAUDE.md
```

## §6 INTERFACE CONTRACT (do not change without telling other lanes)
Job shape:
```ts
type Job = {
  _id: Id<"jobs">;
  task: string;             // the subtask text
  agent: string;            // label e.g. "agent-1"
  status: "running" | "done" | "blocked";
  result?: string;          // what the agent produced
  trace?: string;           // respan trace id / reasoning summary
  createdAt: number;
};
```
Convex functions (the boundary between Lane A and Lane B):
- `mutation jobs.createJob({ task, agent }) -> Id`
- `mutation jobs.updateJob({ id, status, result?, trace? }) -> null`
- `query  jobs.listJobs() -> Job[]`            // reactive; panel subscribes
- `action agent.dispatch({ command }) -> { jobIds: Id[] }`   // splits command → N jobs → kicks processJob each
- `action agent.processJob({ id }) -> null`    // runs LLM via Respan, writes result, status=done

Lane B (runner) only calls `dispatch` and `listJobs`; it never writes jobs directly.

## Env (.env)
```
CONVEX_URL=<from .env.local>
RESPAN_API_KEY=<have it>
RESPAN_BASE_URL=<get exact base from respan.ai/docs or their table>
RESPAN_MODEL=<pick a model id active in your Respan account>
MOCK_MODE=true                # flip to false when Respan credits land
# On-site (Photon iMessage):
PHOTON_PROJECT_ID=<exists in engram .env>
PHOTON_PROJECT_SECRET=<get on-site>
```

## Conventions & golden rules
- TypeScript, ES modules (`"type": "module"`). Run runner with `npx tsx runner.ts`.
- **MOCK_MODE first**: every lane must work with mocked LLM output before real calls. No blocking on credits.
- **Build on `terminal` provider first** (`spectrum-ts/providers/terminal`, no creds). Swap to `imessage` on-site — ONE import + ONE config line.
- spectrum-ts is **v5** here (engram used v1.18) — verify `message.content` / `message.reply` shape early.
- Keep it demoable over clever. If a stretch risks the core loop, skip it.
- Don't change the §6 contract without updating this file + pinging the other lanes.

## Build lanes (assign one per session)
- **LANE A — Convex backend**: schema.ts, jobs.ts, agent.ts (dispatch+processJob), lib/respan.ts. Owns the contract.
- **LANE B — Spectrum runner**: runner.ts. Inbound msg → `dispatch`, poll/subscribe `listJobs`, send each result as a reply. Terminal provider now, iMessage swap. Reuse engram bot.ts.
- **LANE C — Live board**: panel/index.html. Subscribe to `listJobs`, render rows running→done with result. Reuse engram panel pattern.

## Verification
- Lane A: call `dispatch` from Convex dashboard → see N job rows → each flips to `done` with mock result.
- Lane B: `npx tsx runner.ts` (terminal) → type a command → see N replies stream back.
- Lane C: open panel → rows update live as jobs complete.
- Integration: terminal command → board fills → replies stream. Then swap to iMessage on-site.

## Reuse references
- Spectrum loop + reply: `/Users/samratmalisetti/Dev/engram/photon-test/bot.ts`
- Live panel pattern: `/Users/samratmalisetti/Dev/engram/panel/index.html`
- PHOTON_PROJECT_ID: `/Users/samratmalisetti/Dev/engram/.env`
