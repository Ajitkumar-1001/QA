<div align="center">

# QAForge

**QA runs you can trust: the verdict will come from host rules, never from a model's say-so.**

<br>

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
![Next.js 16.4.5](https://img.shields.io/badge/Next.js-16.4.5-black?style=flat-square&logo=nextdotjs)
![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Postgres via pg](https://img.shields.io/badge/Postgres-via%20pg-336791?style=flat-square&logo=postgresql&logoColor=white)
![Run execution: not built yet](https://img.shields.io/badge/run%20execution-not%20built%20yet-orange?style=flat-square)

<br>

[What it does today](#what-it-does-today) · [Status](#status) · [Grading](#how-a-run-is-graded) · [Setup](#setup) · [Configuration](#configuration) · [Layout](#project-layout) · [Where it's headed](#where-its-headed)

</div>

<br>

QAForge is an owner-only Next.js app that creates QA runs against one configured web page. It is an early build: the app creates and tracks runs today. The browser agent that will execute them is not built yet, and neither is the grading that will decide their verdicts. The verdict logic exists as tested code, but nothing runs it on a real run.

> [!NOTE]
> **Honest by design.** This README separates what the code does today from what is planned. Anything planned is either written in the future tense or listed as not built yet.

## What it does today

```mermaid
flowchart LR
    A(["Owner opens /"]) --> B["Owner gate<br/>HTTP Basic"]
    B --> C["Start<br/>reaps stale runs,<br/>checks caps"]
    C --> D[("Postgres<br/>queued run")]
    D --> E[["Start message<br/>via @vercel/queue"]]
    E --> F["Result page<br/>one-line status"]
    E -.-> G["Runner<br/>browser agent"]
    G -.-> H["Host verdict<br/>logic built, not wired in"]
    classDef todo fill:transparent,stroke-dasharray:5 5
    class G,H todo
```

<sub>Solid boxes are built. Dashed boxes are not built yet, or not wired in yet.</sub>

1. **Sign in.** The owner opens `/` and signs in with HTTP Basic authentication. The password is the owner secret, and any user name is accepted.
2. **See the run.** The page shows the configured target URL and objective, how many runs have been used this month, and a **Start** button.
3. **Start it.** Start creates a queued run in Postgres, tries to send one start message, and opens `/runs/<id>`. If the send fails, the failure is logged and the run stays queued.
4. **Read the result.** The result page shows a one-line status.

> [!WARNING]
> Nothing executes runs yet. No worker consumes the start message, so a queued run is closed as INCONCLUSIVE (`never_started`) once it is five minutes old. That happens the next time its result page loads or a Start runs.

## Status

**✅ Built**

- Owner gate (HTTP Basic), same-origin check on mutating requests, and a no-framing response header
- `runs` table and a migrate command
- Start flow with monthly and concurrency caps
- Stale-run reaper
- Fixed-text error pages
- Secret-redacting logs (a password that `pg` reads only from a pgpass file is not covered)
- Tested pure host logic for verdicts, criteria, run limits, the tool allowlist, untrusted-content wrapping, evidence limits, measurements, and trace display
- Result and trace views, written and tested but not mounted on routes

**🚧 Not built yet**

- Run execution: no queue consumer, browser sandbox, model call, or Mastra agent
- PASS and FAIL runs, end to end
- GitHub sign-in
- User-entered URLs: the target comes from server config only
- A guard on the target URL against private, loopback and metadata addresses: today the config only requires https and no credentials
- Deployment and CI

## How a run is graded

This is the planned design. The verdict logic and the limits below exist as tested code, but no runner uses them yet. Once a runner exists, host code will compute the verdict from the run's criteria and the final page capture, and will ignore the agent's final message.

| Limit | Defined in code as |
| --- | --- |
| Criteria per run | up to 5 |
| Criterion kinds | `text_visible` · `text_absent` · `url_matches` |
| Step budget | 5 steps |
| Run deadline | 240 seconds |

A run will end **PASS**, **FAIL** or **INCONCLUSIVE**. Today only INCONCLUSIVE happens, when the stale-run reaper closes a run. An INCONCLUSIVE verdict must carry a reason code, for example `never_started`, `lease_expired`, `criteria_unavailable`, `capture_failed`, `deadline_exceeded` or `step_budget_exhausted`.

## Setup

**You need:** Node.js 22 (tested on 22.23.4), pnpm (the repo pins 11.15.1), and a Postgres database.

**1. Install**

```bash
cd qa && pnpm install
```

**2. Configure.** Create `qa/.env.local`, which is gitignored. There is no shipped `.env.example`. Two variables are required:

```bash
QAFORGE_OWNER_SECRET=<at least 32 characters>
DATABASE_URL=postgres://user:password@localhost:5432/qaforge
```

**3. Migrate.** The dry run applies the migrations and rolls them back.

```bash
pnpm db:migrate:dry
pnpm db:migrate
```

**4. Run**

```bash
pnpm dev
```

Open <http://localhost:3000> and sign in with any user name and the owner secret as the password.

> [!NOTE]
> Start sends through `@vercel/queue`. What that needs outside Vercel is not documented in this repository.

## Configuration

| Name | Required | Default | Rule |
| --- | --- | --- | --- |
| `QAFORGE_OWNER_SECRET` | yes | — | at least 32 characters after trim; also the Basic-auth password |
| `DATABASE_URL` | yes, for pages, Start and migrate | — | `postgres://` or `postgresql://` with a host |
| `QAFORGE_TARGET_URL` | no | `https://demo.playwright.dev/todomvc` | https, no credentials |
| `QAFORGE_OBJECTIVE` | no | `add two todos, complete one, and confirm the counter reads "1 item left"` | 1–1000 characters |
| `QAFORGE_MONTHLY_RUN_CAP` | no | `100` | non-negative integer; UTC calendar month |
| `QAFORGE_CONCURRENCY_CAP` | no | `2` | integer from 0 to 8 |

## Scripts and tests

Run these from `qa/`.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next.js development server |
| `pnpm build` | Production build |
| `pnpm start` | Start the production server |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (`node:test`) |
| `pnpm test:db` | Database-lane tests (`*.dbtest.ts`); no real database is needed, and tests that need one use in-memory PGlite |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:migrate:dry` | Dry-run the migrations (rolled back) |

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16.4.5, React 19.3.0, TypeScript |
| Styling and validation | Tailwind CSS 4, Zod 4 |
| Data | Postgres through `pg` |
| Queue | `@vercel/queue` (the start message) |
| Tests and lint | `node:test`, PGlite, ESLint |
| Package manager | pnpm 11.15.1 |

`@mastra/core` is declared in `package.json` but is not used in application code yet.

## Project layout

<details>
<summary>Show the source tree</summary>

```
qa/
  migrations/          SQL migrations (runs table)
  scripts/migrate.ts   migrate command
  src/
    proxy.ts           owner-gate wrapper
    app/
      page.tsx         home page and Start form
      actions.ts       Start server action
      runs/[id]/       one-line result page
      _server/         shared page and action context
      error.tsx
      global-error.tsx
    components/        form, result and trace views
    lib/
      access/          Basic auth and the gate
      agent/           tool allowlist, untrusted wrapping, agent input
      db/              pool, migrate, runs repository
      evidence/        capture limits
      queue/           start-message send
      run/             status, verdict, caps, lease, limits, …
      trace/           trace display model
      config.ts
      log.ts
```

</details>

## Where it's headed

QAForge is meant to become a QA agent whose verdicts you can check. None of the following exists yet.

- **A real browser run.** A Mastra agent will drive an actual browser in an isolated sandbox, held to the step budget, deadline and tool allowlist above.
- **Evidence.** Each verdict will come with screenshots plus the browser's console and network logs.
- **Guardrails.** The model's API key will stay out of the sandbox. Targets will be limited to public addresses, checked by the app and again at the sandbox's network edge. Anything that writes outside QAForge, such as opening a GitHub issue, will wait for a human approval.

## License

Apache 2.0. See [`LICENSE`](LICENSE).
