# QAForge

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

An owner-only Next.js app that creates QA runs against one configured public web page and grades them with host-side rules, never a model's say-so. The browser agent that would execute runs is not built yet.

## What it does today

The owner opens `/` and signs in with HTTP Basic authentication; the password is the owner secret (any user name is accepted). The page shows the configured target URL and objective, how many runs have been used this month, and a Start button. Start creates a queued run in Postgres, sends one start message, and opens `/runs/<id>`. That result page shows a one-line status.

Nothing executes runs yet: no worker consumes the start message, so queued runs close as INCONCLUSIVE with reason "never started" after five minutes.

## Status and scope

Built on `main`:

- Owner gate (HTTP Basic), same-origin check on mutating requests, and a no-framing response header
- `runs` table and a migrate command
- Start flow with monthly and concurrency caps
- Stale-run reaper
- Fixed-text error pages
- Secret-redacting logs
- Tested pure host logic for verdicts, criteria, run limits, tool allowlist, untrusted-content wrapping, evidence limits, measurements, and trace display
- Result and trace views written and tested but not mounted on routes

Not built:

- Run execution — no queue consumer, browser sandbox, model call, or Mastra agent
- PASS/FAIL runs end to end
- GitHub sign-in
- User-entered URLs — the target comes from server config only
- Deployment and CI

## How a run is graded

When a runner exists, host code computes the verdict from stored criteria and the final page capture. The agent's final message is ignored. A run may have up to five criteria of three kinds (`text_visible`, `text_absent`, `url_matches`), a five-step budget, and a 240-second deadline. An INCONCLUSIVE verdict requires a reason code (for example `never_started`, `lease_expired`, `criteria_unavailable`, `capture_failed`, `deadline_exceeded`, or `step_budget_exhausted`).

## Stack

Next.js 16.4.5, React 19.3.0, TypeScript, Tailwind CSS 4, Zod 4, Postgres via `pg`, `@vercel/queue` for the start message, PGlite for database tests, `node:test`, ESLint, and pnpm 11.15.1. `@mastra/core` is declared in `package.json` but unused in application code.

## Setup

Prerequisites: a current Node.js, pnpm, and a Postgres database.

```bash
cd qa && pnpm install
```

Put environment variables in `qa/.env.local` (gitignored). There is no shipped `.env.example`.

```bash
pnpm db:migrate:dry
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000 (the Next.js default) and sign in with any user name and the owner secret as the password.

Start sends via `@vercel/queue`; what that needs outside Vercel is not documented in this repository.

## Configuration

| Name | Required | Default | Rule |
| --- | --- | --- | --- |
| `QAFORGE_OWNER_SECRET` | yes | — | ≥32 characters after trim; also the Basic-auth password |
| `DATABASE_URL` | yes for pages, Start, and migrate | — | `postgres://` or `postgresql://` with a host |
| `QAFORGE_TARGET_URL` | no | `https://demo.playwright.dev/todomvc` | https, no credentials |
| `QAFORGE_OBJECTIVE` | no | `add two todos, complete one, and confirm the counter reads "1 item left"` | 1–1000 characters |
| `QAFORGE_MONTHLY_RUN_CAP` | no | `100` | non-negative integer; UTC calendar month |
| `QAFORGE_CONCURRENCY_CAP` | no | `2` | integer 0–8 |

## Scripts and tests

Run from `qa/`:

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Next.js development server |
| `pnpm build` | Production build |
| `pnpm start` | Start the production server |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (`node:test`, 26 `*.test.ts` files) |
| `pnpm test:db` | Database tests (2 `*.dbtest.ts` files against in-memory PGlite; no real database) |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:migrate:dry` | Dry-run migrations (roll back) |

## Project layout

```
qa/
  migrations/          # SQL migrations (runs table)
  scripts/migrate.ts   # migrate command
  src/
    proxy.ts           # owner-gate wrapper
    app/
      page.tsx         # home / Start form
      actions.ts       # Start server action
      runs/[id]/      # one-line result page
      _server/         # shared page and action context
      error.tsx
      global-error.tsx
    components/        # form, result, and trace views
    lib/
      access/          # Basic auth and gate
      agent/           # tool allowlist, untrusted wrapping, agent input
      db/              # pool, migrate, runs repo
      evidence/        # capture limits
      queue/           # start-message send
      run/             # status, verdict, caps, lease, limits, …
      trace/           # trace display model
      config.ts
      log.ts
```

## License

Apache-2.0. See [`LICENSE`](LICENSE).