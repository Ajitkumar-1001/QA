/**
 * Host final-capture bundle checks (FR-022).
 * Applies evidence size limits and decides whether a capture attempt is usable.
 * Pure: no I/O, no sandbox calls, no storage.
 */
import { PAGE_TEXT_MAX_BYTES, truncatePageText } from "../agent/untrusted.ts";
import type { ReasonCode } from "../run/status.ts";

/** Screenshot soft limit; over-limit bytes are dropped (a cut image is useless). */
export const SCREENSHOT_MAX_BYTES = 1 * 1024 * 1024;

/** Max console log entries kept per run. */
export const CONSOLE_LOG_MAX_ENTRIES = 500;

/** Max network log entries kept per run. */
export const NETWORK_LOG_MAX_ENTRIES = 500;

export type ConsoleEntry = {
  level: string;
  text: string;
};

export type NetworkEntry = {
  method: string;
  url: string;
  status: number | null;
};

/** Host-captured final evidence for a run. */
export type EvidenceCapture = {
  finalUrl: string;
  pageText: string;
  screenshot: Uint8Array;
  consoleLog: ConsoleEntry[];
  networkLog: NetworkEntry[];
};

/** Which parts of a capture were truncated or dropped when limits were applied. */
export type CaptureTruncation = {
  pageText: boolean;
  /** Console entries dropped after the first CONSOLE_LOG_MAX_ENTRIES (the marker). */
  consoleDropped: number;
  /** Network entries dropped after the first NETWORK_LOG_MAX_ENTRIES (the marker). */
  networkDropped: number;
  /** True when the screenshot exceeded SCREENSHOT_MAX_BYTES and was dropped. */
  screenshotOverLimit: boolean;
};

export type BoundedCapture = {
  capture: EvidenceCapture;
  truncated: CaptureTruncation;
};

/**
 * Apply evidence size limits to a final capture.
 * Page text is cut via truncatePageText; console and network keep the first
 * 500 entries; a screenshot over 1 MB is dropped rather than cut.
 * Callers must assessCaptureAttempt before applying limits.
 */
export function applyCaptureLimits(capture: EvidenceCapture): BoundedCapture {
  const pageText = truncatePageText(capture.pageText, PAGE_TEXT_MAX_BYTES);
  const consoleDropped = Math.max(0, capture.consoleLog.length - CONSOLE_LOG_MAX_ENTRIES);
  const networkDropped = Math.max(0, capture.networkLog.length - NETWORK_LOG_MAX_ENTRIES);
  const screenshotOverLimit = capture.screenshot.byteLength > SCREENSHOT_MAX_BYTES;

  return {
    capture: {
      finalUrl: capture.finalUrl,
      pageText,
      screenshot: screenshotOverLimit ? new Uint8Array(0) : capture.screenshot,
      consoleLog: capture.consoleLog.slice(0, CONSOLE_LOG_MAX_ENTRIES),
      networkLog: capture.networkLog.slice(0, NETWORK_LOG_MAX_ENTRIES),
    },
    truncated: {
      pageText: pageText !== capture.pageText,
      consoleDropped,
      networkDropped,
      screenshotOverLimit,
    },
  };
}

export type CaptureAttempt = {
  finalUrl?: string | null;
  screenshot?: Uint8Array | null;
};

export type CaptureAttemptResult =
  | { ok: true }
  | { ok: false; reasonCode: Extract<ReasonCode, "capture_failed"> };

/**
 * Whether a capture attempt produced a usable final URL and screenshot.
 * Missing either yields capture_failed (INCONCLUSIVE).
 * Also fails for empty URL, zero-byte screenshot, or screenshot over SCREENSHOT_MAX_BYTES.
 */
export function assessCaptureAttempt(attempt: CaptureAttempt): CaptureAttemptResult {
  if (
    attempt.finalUrl == null ||
    attempt.finalUrl === "" ||
    attempt.screenshot == null ||
    attempt.screenshot.byteLength === 0 ||
    attempt.screenshot.byteLength > SCREENSHOT_MAX_BYTES
  ) {
    return { ok: false, reasonCode: "capture_failed" };
  }
  return { ok: true };
}
