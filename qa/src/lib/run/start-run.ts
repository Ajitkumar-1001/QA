/**
 * Start-run core (FR-001 to FR-005, FR-025).
 * Every side effect is a dependency, so this runs under `node --test` with fakes.
 * It takes no request input: the URL and objective come only from config (FR-002).
 */
import { capWindow, checkRunCaps, type CapResult } from "./caps.ts";
import type { Logger } from "../log.ts";

export type RunTarget = { targetUrl: string; objective: string };

/** The parts of ServerConfig the core reads; never the owner secret. */
export type StartRunConfig = RunTarget & { monthlyRunCap: number; concurrencyCap: number };

export type StartRunDeps = {
  /** True when the request carries the owner secret. May throw, e.g. on a configuration error. */
  checkOwner: () => boolean | Promise<boolean>;
  /** Ends stale runs as of `now` (FR-025). */
  reapStaleRuns: (now: Date) => Promise<unknown>;
  /** Runs created at or after `since`. */
  countRunsSince: (since: Date) => Promise<number>;
  /** Runs in `queued` or `running`. */
  countActiveRuns: () => Promise<number>;
  insertQueuedRun: (run: RunTarget & { createdAt: Date }) => Promise<{ id: string }>;
  sendStartMessage: (message: { runId: string }) => Promise<unknown>;
  config: StartRunConfig;
  now: () => Date;
  log: Logger;
};

export type CapRefusal = Extract<CapResult, { ok: false }>;

export type StartRunResult =
  | { ok: true; runId: string; resultPath: string }
  | { ok: false; code: "UNAUTHORIZED" }
  | { ok: false; refusal: CapRefusal };

export type StartRunStep = "owner_check" | "reap" | "count" | "insert";

/**
 * Thrown when a step fails. Its message is fixed and names only the step:
 * the original error goes to the log through the serializer, so nothing
 * from it (a connection string, say) reaches the framework's error output.
 */
export class StartRunError extends Error {
  readonly step: StartRunStep;
  constructor(step: StartRunStep) {
    super(`Starting a run failed at step "${step}". It can be retried.`);
    this.name = "StartRunError";
    this.step = step;
  }
}

export function resultPathFor(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

export async function startRun(deps: StartRunDeps): Promise<StartRunResult> {
  async function step<T>(name: StartRunStep, run: () => T | Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      deps.log.error("run_start_failed", { step: name }, error);
      throw new StartRunError(name);
    }
  }

  // 1. The owner check, before anything else (FR-001).
  if (!(await step("owner_check", deps.checkOwner))) {
    deps.log.info("run_refused", { reason: "gate" });
    return { ok: false, code: "UNAUTHORIZED" };
  }

  // One clock read: the reaper, the cap window and created_at agree.
  const now = deps.now();

  // 2. The reaper, so a reaped run frees its place under the concurrency cap (FR-025).
  await step("reap", () => deps.reapStaleRuns(now));

  // 3. The caps, counting runs since the start of this UTC month (FR-003, FR-004).
  const [runsInWindow, activeRuns] = await step("count", () =>
    Promise.all([deps.countRunsSince(capWindow(now).start), deps.countActiveRuns()]),
  );
  const caps = checkRunCaps({
    runsInWindow,
    activeRuns,
    monthlyCap: deps.config.monthlyRunCap,
    concurrencyCap: deps.config.concurrencyCap,
    now,
  });
  if (!caps.ok) {
    deps.log.info("run_refused", { reason: caps.reason, count: caps.count, cap: caps.cap });
    return { ok: false, refusal: caps };
  }

  // 4. Insert with the configured URL and objective only (FR-002).
  const { id: runId } = await step("insert", () =>
    deps.insertQueuedRun({
      targetUrl: deps.config.targetUrl,
      objective: deps.config.objective,
      createdAt: now,
    }),
  );
  deps.log.info("run_requested", { runId });

  // 5. Exactly one start message (FR-005). A failed send leaves the run to the reaper.
  try {
    await deps.sendStartMessage({ runId });
  } catch (error) {
    deps.log.error("run_send_failed", { runId }, error);
  }

  // 6. The run's result address.
  return { ok: true, runId, resultPath: resultPathFor(runId) };
}
