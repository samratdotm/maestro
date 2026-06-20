# Maestro — Session Coordination Board

> 3 parallel Claude Code sessions. **Edit ONLY your own lane's section.** Commit after each working step.
> Conductor (human) relays cross-lane signals. Re-read CLAUDE.md §6 before touching the contract.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done · 🚧 blocked

---

## Lane A — Convex Backend   `status: not started`
Owns: `convex/schema.ts`, `convex/jobs.ts`, `convex/agent.ts`, `lib/respan.ts`, **the §6 contract**, `package.json`, `.env`.
- [ ] `schema.ts` — jobs table
- [ ] `jobs.ts` — createJob / updateJob / listJobs
- [ ] `lib/respan.ts` — Respan client + MOCK_MODE
- [ ] `agent.ts` — `dispatch()` fan-out + `processJob()`
- [ ] smoke test: `npx convex run agent:dispatch '{"command":"..."}'` → N rows appear
- CONTRACT: **unchanged** ✅
- SIGNALS OUT: _(post here when dispatch/listJobs are live for B & C)_

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
- _e.g. "A: dispatch live, signature unchanged" → tell B + C_

## Shared-resource rules
- Only **Lane A** runs `npm install` / edits `.env` + `package.json`.
- Only **one** `npx convex dev` running (already up).
- Need a package? Note it here; Lane A installs it.
