/**
 * What the form page and the result page show (FR-003, FR-004, FR-025, FR-028, FR-029).
 * Pure, with no next/* import, so it loads under `node --test`.
 */
import { z } from "zod";
import type { Logger } from "../log.ts";
import { checkRunCaps } from "./caps.ts";
import { progressText, type CapRefusal } from "./run-text.ts";
import type { ReasonCode, RunStatus } from "./status.ts";
import { computeVerdict } from "./verdict.ts";

/** A refused Start redirects to `/?refused=1`: a marker only, never the count, cap or date. */
const refusedMarker = z.object({ refused: z.literal("1") });

/** True only for `refused=1`; anything else in the address is ignored. */
export function hasRefusedMarker(searchParams: unknown): boolean {
  return refusedMarker.safeParse(searchParams).success;
}

export type FormStateInput = {
  runsInWindow: number;
  activeRuns: number;
  monthlyCap: number;
  concurrencyCap: number;
  now: Date;
  /** The address carries the refused marker. */
  startRefused: boolean;
};

/**
 * The monthly refusal always shows, so Start is disabled on load (FR-003). The
 * concurrency refusal is reported after a Start, not before it (FR-004), so it
 * shows only when the marker is present and the cap still holds.
 */
export function formState(input: FormStateInput): { runsUsed: number; refusal: CapRefusal | undefined } {
  const caps = checkRunCaps(input);
  const show = !caps.ok && (caps.reason === "monthly_cap" || input.startRefused);
  return { runsUsed: input.runsInWindow, refusal: !caps.ok && show ? caps : undefined };
}

export type ResultRun = { status: RunStatus; reasonCode: ReasonCode | null; createdAt: Date };

/** The result page's one line. Nothing in this slice claims a run, so a reaped run is the only finished kind. */
export function resultText(run: ResultRun, now: Date): string {
  if (run.status === "queued") return progressText({ status: "queued", createdAt: run.createdAt, now });
  if (run.status === "running") return "Running.";
  if (run.reasonCode === null) return progressText({ status: "done" });
  return computeVerdict({
    criteria: [],
    agent: { completed: false, reasonCode: run.reasonCode },
    capture: { ok: false },
  }).summary;
}

/**
 * Thrown when a page step fails. Its message is fixed and names only the step: the
 * original error goes to the log through the serializer, so a driver error that
 * quotes the connection string never reaches the framework's output.
 */
export class PageLoadError extends Error {
  readonly step: string;
  constructor(step: string) {
    super(`Loading the page failed at step "${step}". It can be retried.`);
    this.name = "PageLoadError";
    this.step = step;
  }
}

export async function loadStep<T>(log: Logger, step: string, run: () => T | Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    log.error("page_load_failed", { step }, error);
    throw new PageLoadError(step);
  }
}
