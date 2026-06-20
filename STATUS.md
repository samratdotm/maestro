# Maestro — Session Coordination Board

> 3 parallel Claude Code sessions. **Edit ONLY your own lane's section.** Commit after each working step.
> Conductor (human) relays cross-lane signals. Re-read CLAUDE.md §6 before touching the contract.

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done · 🚧 blocked

---

## Lane A — Convex Backend   `status: done ✅ (round 2)`
Owns: `convex/schema.ts`, `convex/jobs.ts`, `convex/agent.ts`, `convex/reset.ts`, `lib/respan.ts`, **the §6 contract**, `package.json`, `.env`.
- [x] `schema.ts` — jobs table
- [x] `jobs.ts` — createJob / updateJob / listJobs
- [x] `lib/respan.ts` — Respan client + MOCK_MODE (ready for real Respan credentials)
- [x] `agent.ts` — `dispatch()` fan-out + `processJob()` (scheduler fire-and-return, MOCK_MODE=true)
- [x] `reset.ts` — `clearJobs` mutation (clean board between demo runs; tested: wiped 11 rows → [])
- [x] `callLLM` hardened: RESPAN_PATH env var, missing-creds guard, better system prompt, trims content, surfaces Respan error body
- [x] smoke test: dispatch → 3 jobs done; clearJobs → empty board
- CONTRACT: **unchanged** ✅
- SIGNALS OUT: **ALL functions LIVE**. CONVEX_URL=http://127.0.0.1:3210

### Go-live commands (run when Respan credits land)
```
npx convex env set RESPAN_BASE_URL=<from respan.ai/docs>
npx convex env set RESPAN_API_KEY=<your key>
npx convex env set RESPAN_MODEL=<active model id>
npx convex env set MOCK_MODE=false
# Optional — only if Respan's path differs from /chat/completions:
npx convex env set RESPAN_PATH=<actual path>
# Reset board before demo:
npx convex run reset:clearJobs
```

## Lane B — Spectrum Runner   `status: done ✅`
Owns: `runner.ts`. Depends on: Lane A `dispatch` + `listJobs`.
- [x] terminal-provider smoke test — spectrum-ts v5 confirmed: `message.content.text`, `message.reply()`, async message loop
- [x] inbound message → `agent.dispatch({command})` — gracefully skips if agent.ts not yet generated
- [x] poll `listJobs` every 1.5s → `message.reply()` per settled job, 120s timeout guard
- [ ] (on-site) swap `terminal` → `imessage` provider — ONE line: `terminal.config()` → `imessage.config()`
- BLOCKED ON: Lane A `agent.ts` — `api.agent.dispatch` missing from generated types; runner detects this at runtime and reports it. Wire up once A signals dispatch is live.

## Lane C — Live Board   `status: done ✅ (round 2 — demo-ready)`
Owns: `panel/index.html`. Depends on: Lane A `listJobs`.
- [x] static board layout (rows: agent / task / status / result)
- [x] live `listJobs` 2s poll via `POST /api/query` → `jobs:listJobs`
- [x] running (amber pulse) → done (green) → blocked (red) visual states
- [x] summary bar: running / done / blocked counts
- [x] trace ID displayed under result when present
- [x] **round 2** projector-legible fonts (1rem base, 1.7rem h1) + generous spacing
- [x] **round 2** Maestro header with tagline "Conduct your AI coding agents by voice."
- [x] **round 2** Latest Dispatch hero banner — batches jobs within 5s of newest createdAt
- [x] **round 2** running→done flash animation (green highlight, 1.8s fade-out)
- [x] **round 2** "🔍 Respan-traced" badge per row when `trace` field is set
- BLOCKED ON: nothing — open `panel/index.html` directly in browser
- CONVEX_URL used: `http://127.0.0.1:3210`

---

## Cross-lane signals (conductor relays these)
- **A→B,C**: `agent:dispatch` and `agent:processJob` deployed and verified. Contract unchanged. MOCK_MODE=true. B: your runner.ts should now resolve `api.agent.dispatch` — retest the full flow.

## Shared-resource rules
- Only **Lane A** runs `npm install` / edits `.env` + `package.json`.
- Only **one** `npx convex dev` running (already up).
- Need a package? Note it here; Lane A installs it.
