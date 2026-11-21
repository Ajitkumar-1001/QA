<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules — Next.js

Doc paths are relative to `qa/`. Run each check from the repository root.

### NX-001 · hard · scope: qa/src/app/**
**Rule:** Run the owner check on the request's `Authorization` header at the top of every page and every Server Action, before reading input, config-derived content or data; never rely on the proxy alone.
**Why:** Server Functions are POST requests to the route that uses them, so a matcher change or a moved action silently drops proxy coverage, and render-time gating is not a security boundary.
**Source:** node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md lines 249–251; node_modules/next/dist/docs/01-app/02-guides/production-checklist.md line 102; node_modules/next/dist/docs/01-app/02-guides/server-actions.md line 89; user decision D4, 2026-11-19
**Check:** review: does every `page.tsx`, and every exported function in a `"use server"` file, run the owner check before any other `await`?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-002 · hard · scope: qa/src/lib/**, qa/src/components/**
**Rule:** Import nothing from `next` or `next/*`, and not `server-only`, in any module that `node --test` loads; keep those imports in route files under `qa/src/app/`.
**Why:** Under `node --test` both fail with `ERR_MODULE_NOT_FOUND`, which breaks the test gate for both lanes.
**Source:** qa/package.json `test` script; probe on 2026-11-19 with Node 22.23.4 (`next/link` and `server-only` both fail with `ERR_MODULE_NOT_FOUND`)
**Check:** `git grep --untracked -nE "(from|import)[ (]*['\"](next(/[^'\"]*)?|server-only)['\"]" -- qa/src/lib qa/src/components` prints nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-003 · hard · scope: qa/src/app/**
**Rule:** Call `headers()` only inside a component wrapped in `<Suspense>` (or in a segment that exports `instant = false`), and render content from config or the database only inside the component that ran the owner check, never in a plain `use cache` scope or other markup outside it.
**Why:** With Cache Components, everything outside the boundary, including `use cache` output, prerenders into the static shell, which is sent before the page's own check runs.
**Source:** node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md line 49; node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md lines 45 and 117; node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md line 144
**Check:** review: in each gated page, is every value from config or the database rendered inside the component that awaited the owner check?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: cacheComponents

### NX-004 · hard · scope: qa/src/**
**Rule:** Never read `headers()` inside a plain `use cache` scope, and never pass the owner secret, the `Authorization` value or any credential as an argument to a `use cache` function or as a `cacheTag` value.
**Why:** A plain `use cache` scope throws on `headers()`, and cache arguments and tags are stored in plain text.
**Source:** node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md lines 311–312
**Check:** `git grep --untracked -n "use cache" -- qa/src` lists every scope; review: does any of them read `headers()` or take a credential as an argument or tag?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: cacheComponents

### NX-005 · hard · scope: qa/**
**Rule:** Never give `QAFORGE_*`, `DATABASE_URL`, `TEST_DATABASE_URL` or a queue credential the `NEXT_PUBLIC_` prefix, and keep every `.env*` file except `.env.example` out of git.
**Why:** `NEXT_PUBLIC_` values are inlined into the browser bundle at build time.
**Source:** node_modules/next/dist/docs/01-app/02-guides/environment-variables.md lines 156–164; node_modules/next/dist/docs/01-app/02-guides/production-checklist.md line 106; .gitignore line 1
**Check:** `git grep --untracked -n "NEXT_PUBLIC_" -- qa ':!qa/AGENTS.md'` and `git ls-files | grep -E '(^|/)[.]env' | grep -v '[.]env[.]example$'` both print nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-006 · hard · scope: qa/src/proxy.ts
**Rule:** Name the proxy `qa/src/proxy.ts` (beside `app/`), give it a constant `matcher` that excludes only `_next/static`, `_next/image` and metadata files, and never export `runtime` from it.
**Why:** Proxy runs on the Node.js runtime and setting `runtime` throws; a non-constant matcher is ignored, and a matcher that excludes a path also skips the Server Function calls on it.
**Source:** node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md lines 23, 75, 136, 249 and 255
**Check:** `ls qa/src/middleware.ts qa/middleware.ts 2>/dev/null; grep -n "export const runtime" qa/src/proxy.ts 2>/dev/null` prints nothing; review: does the matcher exclude anything beyond static assets?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-007 · hard · scope: qa/src/app/**
**Rule:** Don't export `dynamic`, `revalidate` or `fetchCache` from any route segment; use `use cache` with `cacheLife` for cached data and `<Suspense>` for request-time data.
**Why:** With `cacheComponents` on, a segment that still exports one of these configs errors.
**Source:** node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md lines 16 and 74
**Check:** `git grep --untracked -nE "export const (dynamic|revalidate|fetchCache)[^A-Za-z]" -- qa/src/app` prints nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: cacheComponents

### NX-008 · default · scope: qa/src/app/**
**Rule:** Keep components Server Components by default and put `"use client"` on the lowest component that needs interactivity.
**Why:** A higher boundary ships more JavaScript to the browser.
**Source:** node_modules/next/dist/docs/01-app/02-guides/production-checklist.md line 46
**Check:** `git grep --untracked -n '"use client"' -- qa/src/app`; review: is each file the lowest interactive component?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-009 · default · scope: qa/src/app/**
**Rule:** Server Components read data directly and never call this app's own Route Handlers.
**Why:** Calling a Route Handler from a Server Component adds a second server request.
**Source:** node_modules/next/dist/docs/01-app/02-guides/production-checklist.md line 65
**Check:** `git grep --untracked -nE "fetch\([\"'\`]/" -- qa/src/app` prints nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-010 · default · scope: qa/src/app/**
**Rule:** Use `<Link>` from `next/link` for internal navigation in route files, not a raw `<a href="/…">`; a tested module under `qa/src/components/` takes the link element as a prop instead (NX-002).
**Why:** `<Link>` gives client-side navigation and prefetching.
**Source:** node_modules/next/dist/docs/01-app/02-guides/production-checklist.md line 44
**Check:** `git grep --untracked -nE "<a [^>]*href=[\"']/" -- qa/src/app` prints nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-011 · default · scope: qa/src/app/**
**Rule:** Provide `qa/src/app/global-error.tsx` as the fallback for uncaught errors.
**Why:** Without it, an uncaught error shows no accessible recovery UI.
**Source:** node_modules/next/dist/docs/01-app/02-guides/production-checklist.md line 87
**Check:** `test -f qa/src/app/global-error.tsx`
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-014 · default · scope: qa/src/app/**
**Rule:** Start independent data reads together (`Promise.all`) and put slow parts of a page behind `<Suspense>` or a `loading` file.
**Why:** Sequential reads add a network round trip each, and an unwrapped slow read blocks the whole route.
**Source:** node_modules/next/dist/docs/01-app/02-guides/production-checklist.md lines 66–67
**Check:** review: does a page `await` one read before starting another that does not depend on it?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: cacheComponents

### NX-015 · default · scope: qa/src/app/**
**Rule:** Load fonts with `next/font`, images with `<Image>` from `next/image` and third-party scripts with `<Script>` from `next/script`, never raw `<img>`, `<script>` or font links.
**Why:** The framework components self-host fonts, optimize images and defer scripts, which avoids layout shift and main-thread blocking.
**Source:** node_modules/next/dist/docs/01-app/02-guides/production-checklist.md lines 92–94
**Check:** `git grep --untracked -nE "<(img|script)[ >]|fonts[.]googleapis[.]com" -- qa/src/app` prints nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-012 · project · scope: qa/src/lib/**, qa/src/components/**
**Rule:** Write modules that `node --test` loads as `.ts` files that build elements with `createElement` (no `.tsx`), use relative imports that end in `.ts`, and use `import type` for type-only imports.
**Why:** Node strips types without a build step, so it has no JSX transform and no `@/` alias, and the test gate fails.
**Source:** qa/src/components/captured-text.ts; probe on 2026-11-19 with Node 22.23.4 (a `.tsx` file fails with `ERR_UNKNOWN_FILE_EXTENSION`)
**Check:** `git ls-files --cached --others --exclude-standard -- 'qa/src/lib/*.tsx' 'qa/src/components/*.tsx'` prints nothing
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

### NX-013 · project · scope: all
**Rule:** In a fresh checkout or worktree, run `pnpm --dir qa exec next typegen` before `pnpm --dir qa exec tsc --noEmit`.
**Why:** Without the generated route types, `tsc` fails on `LayoutProps` in `src/app/layout.tsx`.
**Source:** probe on 2026-11-19 (without `.next/`, `tsc` reports TS2304 at `src/app/layout.tsx:20`); the gate in `QF-M0-C01.md`
**Check:** review: does every gate list `next typegen` before `tsc --noEmit`?
**Added:** 2026-11-19 · next@16.4.5 · cache-model: n/a

Last validated: 2026-11-19 against next@16.4.5
