/**
 * Run-creation caps (FR-003, FR-004).
 * Pure checks: the caller supplies counts read from stored runs.
 */

/** Hobby allows 10 concurrent sandboxes; the spike sets a ceiling of 8. */
export const MAX_CONCURRENCY_CAP = 8;

/** The cap window is the calendar month in UTC. */
export function capWindow(now: Date): { start: Date; resetsAt: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    resetsAt: new Date(Date.UTC(year, month + 1, 1)),
  };
}

export type CapInput = {
  /** Runs created in the current cap window. */
  runsInWindow: number;
  /** Runs in `queued` or `running`. */
  activeRuns: number;
  monthlyCap: number;
  concurrencyCap: number;
  now: Date;
};

export type CapResult =
  | { ok: true }
  | {
      ok: false;
      code: "RATE_LIMITED";
      reason: "monthly_cap" | "concurrency_cap";
      count: number;
      cap: number;
      resetsAt: Date;
    };

export function checkRunCaps(input: CapInput): CapResult {
  if (input.concurrencyCap > MAX_CONCURRENCY_CAP) {
    throw new RangeError(`concurrencyCap must not exceed ${MAX_CONCURRENCY_CAP}`);
  }
  const { resetsAt } = capWindow(input.now);
  if (input.runsInWindow >= input.monthlyCap) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      reason: "monthly_cap",
      count: input.runsInWindow,
      cap: input.monthlyCap,
      resetsAt,
    };
  }
  if (input.activeRuns >= input.concurrencyCap) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      reason: "concurrency_cap",
      count: input.activeRuns,
      cap: input.concurrencyCap,
      resetsAt,
    };
  }
  return { ok: true };
}
