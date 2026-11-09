# Decisions

This log is append-only. A decision that is not written here does not exist. Every option gets a descriptive name, never a letter. To change a decision, add a new entry that supersedes the old one; don't edit the old entry.

Status values: **decided** (the owner chose it), **provisional** (it holds until the named check passes), **open**, **deferred**.

---

### DEC-001 · Fresh repo, old QA-forge repo kept as reference only
- **Date:** 2026-11-09
- **Status:** decided (owner)
- **Decision:** Build in a new repo at `~/dev/qaforge`. The old `QA-forge` repo, its two Vercel projects and its database are left untouched. The GitHub repo will be archived once this one deploys.
- **Why:** The old repo's wiring caused most of the confusion: 2 Vercel projects deploying production off one database, 24 worktrees, red CI, folder-scoped hooks, and gitignored specs. See the postmortem in the old repo, `vault-qa/QAForge-Postmortem.md`.
- **Rejected:** "Clean up in place". Wiping `main` would redeploy over the old production app and would keep the old hooks and memory.

### DEC-002 · Product: a harness-engineered QA agent, powered by Mastra
- **Date:** 2026-11-09
- **Status:** decided (owner)
- **Decision:** See [CHARTER.md](CHARTER.md). Sign-in is GitHub OAuth, for developers and engineering teams.

### DEC-003 · Demo login for non-developers
- **Date:** 2026-11-09
- **Status:** deferred (owner: "for now lets not think about the demo")

### DEC-004 · Run shape: one queue-triggered invocation per run
- **Date:** 2026-11-09
- **Status:** provisional, until walking-skeleton check 1 passes (N = 5 steps in under 240s on production)
- **Decision:** A Vercel Queue message starts the run, and the consumer claims the run row atomically. The bounded Mastra agent loop runs in that one invocation, with a 240s run deadline. If the deadline hits, the run ends INCONCLUSIVE.
- **Rejected:** splitting each step into its own invocation (rebuilds the agent loop by hand); using Workflow DevKit and Mastra snapshots together (two owners of run state); cron or `after()` as the trigger.
- **Evidence:** [spikes/2026-11-09-runtime.md](spikes/2026-11-09-runtime.md)

### DEC-005 · Browser host: agent-browser daemon in one Vercel Sandbox per run
- **Date:** 2026-11-09
- **Status:** provisional, until walking-skeleton checks 2, 3 and 5 pass
- **Decision:**
  - One `persistent: false` sandbox per run, with no exposed ports.
  - The tools call fixed binaries with argv arrays, and their arguments are Zod-validated on the host.
  - The egress deny-list is set at creation.
  - The model key never enters the VM.
- **Rejected:** exposed run-server or CDP port (public, unauthenticated URL); custom per-call Playwright scripts (lose page state between calls); the `@mastra/vercel` provider (deprecated runtime).
- **Evidence:** [spikes/2026-11-09-runtime.md](spikes/2026-11-09-runtime.md)

### DEC-006 · Hosting: Vercel Hobby
- **Date:** 2026-11-09
- **Status:** **open, owner's call**
- **Note:** DEC-004 and DEC-005 assume Hobby. Hobby is for non-commercial use only: a free portfolio app looks allowed, but that is a reading of the terms, not a ruling. On Pro, overage is billed, functions can run 800s and cron runs every minute; the single-invocation run shape still holds.

### DEC-007 · Model, step budget, per-step token ceiling
- **Date:** 2026-11-09
- **Status:** open, until walking-skeleton check 6 (tokens per step) gives a measured figure
