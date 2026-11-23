/**
 * The lease and start-window cases of FR-025, with inclusive boundaries, shared by the
 * database tests so the SQL reaper and `reapRun` read one list. For `*.dbtest.ts` files only.
 */
import { START_WINDOW_MS } from "../run/lease.ts";
import type { RunStatus } from "../run/status.ts";

export const NOW = new Date("2026-11-20T12:00:00.000Z");
export const WINDOW_MS = START_WINDOW_MS;
export const HOUR_MS = 3_600_000;
export const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

export type Seed = {
  status: string;
  createdAt: Date;
  leaseExpiresAt?: Date | null;
  verdict?: string | null;
  reason?: string | null;
  finishedAt?: Date | null;
};

export type Fixture = {
  name: string;
  run: Seed & { status: RunStatus };
  becomes: "lease_expired" | "never_started" | null;
};

export const FIXTURES: Fixture[] = [
  { name: "running, lease after now, created inside the window", run: { status: "running", createdAt: at(-60_000), leaseExpiresAt: at(1) }, becomes: null },
  { name: "running, lease after now, created long before", run: { status: "running", createdAt: at(-HOUR_MS), leaseExpiresAt: at(1) }, becomes: null },
  { name: "running, lease ends exactly now", run: { status: "running", createdAt: at(-60_000), leaseExpiresAt: at(0) }, becomes: "lease_expired" },
  { name: "running, lease ended before now", run: { status: "running", createdAt: at(-HOUR_MS), leaseExpiresAt: at(-1) }, becomes: "lease_expired" },
  { name: "running, no lease, created inside the window", run: { status: "running", createdAt: at(-60_000) }, becomes: "lease_expired" },
  { name: "running, no lease, created long before", run: { status: "running", createdAt: at(-HOUR_MS) }, becomes: "lease_expired" },
  { name: "queued, created inside the window", run: { status: "queued", createdAt: at(-WINDOW_MS + 1) }, becomes: null },
  { name: "queued, inside the window, lease in the past", run: { status: "queued", createdAt: at(-60_000), leaseExpiresAt: at(-1000) }, becomes: null },
  { name: "queued, created after now", run: { status: "queued", createdAt: at(1) }, becomes: null },
  { name: "queued, created exactly at now minus the window", run: { status: "queued", createdAt: at(-WINDOW_MS) }, becomes: "never_started" },
  { name: "queued, created long before", run: { status: "queued", createdAt: at(-HOUR_MS) }, becomes: "never_started" },
  { name: "queued, created long before, lease in the future", run: { status: "queued", createdAt: at(-HOUR_MS), leaseExpiresAt: at(60_000) }, becomes: "never_started" },
  { name: "done, old created_at and an expired lease", run: { status: "done", createdAt: at(-HOUR_MS), leaseExpiresAt: at(-60_000), verdict: "PASS", finishedAt: at(-HOUR_MS / 2) }, becomes: null },
];
