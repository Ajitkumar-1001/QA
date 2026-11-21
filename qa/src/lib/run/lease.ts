/** Lease and reaper rule (FR-009, FR-024, FR-025). */
import type { RunState } from "./status.ts";
import { canTransition } from "./status.ts";

export const LEASE_MS = 300_000;
export const START_WINDOW_MS = 300_000;

/** The lease deadline the claim sets (FR-009). */
export function leaseExpiresAt(claimedAt: Date): Date {
  return new Date(claimedAt.getTime() + LEASE_MS);
}

export type ReapableRun = RunState & {
  createdAt: Date;
  /** Set by the claim; absent while the run is queued. */
  leaseExpiresAt?: Date;
};

export type ReapResult =
  | { ok: true; run: ReapableRun }
  | { ok: false; error: "already_done" | "lease_active" | "start_window_open" };

/** Close a run whose lease expired or that never started (FR-025). */
export function reapRun(run: ReapableRun, now: Date): ReapResult {
  if (!canTransition(run.status, "done")) {
    return { ok: false, error: "already_done" };
  }

  if (run.status === "running") {
    if (
      run.leaseExpiresAt !== undefined &&
      run.leaseExpiresAt.getTime() > now.getTime()
    ) {
      return { ok: false, error: "lease_active" };
    }
    return {
      ok: true,
      run: {
        ...run,
        status: "done",
        verdict: "INCONCLUSIVE",
        reasonCode: "lease_expired",
      },
    };
  }

  if (now.getTime() - run.createdAt.getTime() < START_WINDOW_MS) {
    return { ok: false, error: "start_window_open" };
  }
  return {
    ok: true,
    run: {
      ...run,
      status: "done",
      verdict: "INCONCLUSIVE",
      reasonCode: "never_started",
    },
  };
}
