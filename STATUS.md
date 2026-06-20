# Maestro — Session Coordination Board

> 3 parallel Claude Code sessions. **Edit ONLY your own lane's section.** Commit after each working step.
> Conductor (human) relays cross-lane signals. Re-read CLAUDE.md §6 before touching the contract.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done · 🚧 blocked

---

## Lane A — Convex Backend   `status: done ✅`
Owns: `convex/schema.ts`, `convex/jobs.ts`, `convex/agent.ts`, `lib/respan.ts`, **the §6 contract**, `package.json`, `.env`.
- [x] `schema.ts` — jobs table
- [x] `jobs.ts` — createJob / updateJob / listJobs
- [x] `lib/respan.ts` — Respan client + MOCK_MODE (ready for real Respan credentials)
- [x] `agent.ts` — `dispatch()` fan-out + `processJob()` (default Convex runtime, MOCK_MODE=true)
- [x] smoke test: `npx convex run agent:dispatch '{"command":"Add tests to auth, update the README, and audit N+1 queries"}'` → 3 jobs, all status=done with mock results
- CONTRACT: **unchanged** ✅
- SIGNALS OUT: **dispatch + listJobs + processJob LIVE** — B unblocked. CONVEX_URL=http://127.0.0.1:3210, MOCK_MODE=true set via `npx convex env set`

## Lane B — Spectrum Runner   `status: done ✅`
Owns: `runner.ts`. Depends on: Lane A `dispatch` + `listJobs`.
- [x] terminal-provider smoke test — spectrum-ts v5 confirmed: `message.content.text`, `message.reply()`, async message loop
- [x] inbound message → `agent.dispatch({command})` — gracefully skips if agent.ts not yet generated
- [x] poll `listJobs` every 1.5s → `message.reply()` per settled job, 120s timeout guard
- [ ] (on-site) swap `terminal` → `imessage` provider — ONE line: `terminal.config()` → `imessage.config()`
- BLOCKED ON: Lane A `agent.ts` — `api.agent.dispatch` missing from generated types; runner detects this at runtime and reports it. Wire up once A signals dispatch is live.

## Lane C — Live Board   `status: done ✅`
Owns: `panel/index.html`. Depends on: Lane A `listJobs`.
- [x] static board layout (rows: agent / task / status / result)
- [x] live `listJobs` 2s poll via `POST /api/query` → `jobs:listJobs`
- [x] running (amber pulse) → done (green) → blocked (red) visual states
- [x] summary bar: running / done / blocked counts
- [x] trace ID displayed under result when present
- BLOCKED ON: nothing — panel is complete, open `panel/index.html` in browser
- CONVEX_URL used: `http://127.0.0.1:3210`

---

## Cross-lane signals (conductor relays these)
- **A→B,C**: `agent:dispatch` and `agent:processJob` deployed and verified. Contract unchanged. MOCK_MODE=true. B: your runner.ts should now resolve `api.agent.dispatch` — retest the full flow.

## Shared-resource rules
- Only **Lane A** runs `npm install` / edits `.env` + `package.json`.
- Only **one** `npx convex dev` running (already up).
- Need a package? Note it here; Lane A installs it.
