import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_TEXT_MAX_BYTES, TRUNCATION_MARKER } from "../agent/untrusted.ts";
import {
  CONSOLE_LOG_MAX_ENTRIES,
  NETWORK_LOG_MAX_ENTRIES,
  SCREENSHOT_MAX_BYTES,
  applyCaptureLimits,
  assessCaptureAttempt,
  type ConsoleEntry,
  type EvidenceCapture,
  type NetworkEntry,
} from "./capture.ts";

function consoleEntries(n: number): ConsoleEntry[] {
  return Array.from({ length: n }, (_, i) => ({ level: "log", text: `line-${i}` }));
}

function networkEntries(n: number): NetworkEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    method: "GET",
    url: `https://example.com/${i}`,
    status: 200,
  }));
}

function baseCapture(overrides: Partial<EvidenceCapture> = {}): EvidenceCapture {
  return {
    finalUrl: "https://example.com/",
    pageText: "hello",
    screenshot: new Uint8Array(16),
    consoleLog: [],
    networkLog: [],
    ...overrides,
  };
}

test("applyCaptureLimits keeps exactly 500 console entries without dropping", () => {
  const result = applyCaptureLimits(
    baseCapture({ consoleLog: consoleEntries(CONSOLE_LOG_MAX_ENTRIES) }),
  );
  assert.equal(result.capture.consoleLog.length, CONSOLE_LOG_MAX_ENTRIES);
  assert.equal(result.truncated.consoleDropped, 0);
});

test("applyCaptureLimits keeps the first 500 console entries and records one drop at 501", () => {
  const result = applyCaptureLimits(
    baseCapture({ consoleLog: consoleEntries(CONSOLE_LOG_MAX_ENTRIES + 1) }),
  );
  assert.equal(result.capture.consoleLog.length, CONSOLE_LOG_MAX_ENTRIES);
  assert.equal(result.truncated.consoleDropped, 1);
  assert.equal(result.capture.consoleLog[0]?.text, "line-0");
  assert.equal(
    result.capture.consoleLog[CONSOLE_LOG_MAX_ENTRIES - 1]?.text,
    `line-${CONSOLE_LOG_MAX_ENTRIES - 1}`,
  );
});

test("applyCaptureLimits keeps exactly 500 network entries without dropping", () => {
  const result = applyCaptureLimits(
    baseCapture({ networkLog: networkEntries(NETWORK_LOG_MAX_ENTRIES) }),
  );
  assert.equal(result.capture.networkLog.length, NETWORK_LOG_MAX_ENTRIES);
  assert.equal(result.truncated.networkDropped, 0);
});

test("applyCaptureLimits keeps the first 500 network entries and records one drop at 501", () => {
  const result = applyCaptureLimits(
    baseCapture({ networkLog: networkEntries(NETWORK_LOG_MAX_ENTRIES + 1) }),
  );
  assert.equal(result.capture.networkLog.length, NETWORK_LOG_MAX_ENTRIES);
  assert.equal(result.truncated.networkDropped, 1);
  assert.equal(result.capture.networkLog[0]?.url, "https://example.com/0");
});

test("applyCaptureLimits keeps a screenshot of exactly 1 MB", () => {
  const screenshot = new Uint8Array(SCREENSHOT_MAX_BYTES);
  const result = applyCaptureLimits(baseCapture({ screenshot }));
  assert.equal(result.capture.screenshot.byteLength, SCREENSHOT_MAX_BYTES);
  assert.equal(result.capture.screenshot, screenshot);
});

test("assessCaptureAttempt rejects a screenshot over SCREENSHOT_MAX_BYTES before limits apply", () => {
  const result = assessCaptureAttempt({
    finalUrl: "https://example.com/",
    screenshot: new Uint8Array(SCREENSHOT_MAX_BYTES + 1),
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reasonCode, "capture_failed");
});

test("applyCaptureLimits truncates page text over the limit with the marker", () => {
  const pageText = "a".repeat(PAGE_TEXT_MAX_BYTES + 10);
  const result = applyCaptureLimits(baseCapture({ pageText }));
  assert.equal(result.truncated.pageText, true);
  assert.ok(result.capture.pageText.endsWith(TRUNCATION_MARKER));
  assert.equal(
    result.capture.pageText.slice(0, -TRUNCATION_MARKER.length),
    "a".repeat(PAGE_TEXT_MAX_BYTES),
  );
});

test("assessCaptureAttempt is usable when final URL and screenshot are present", () => {
  const result = assessCaptureAttempt({
    finalUrl: "https://example.com/",
    screenshot: new Uint8Array(4),
  });
  assert.equal(result.ok, true);
});

test("assessCaptureAttempt is capture_failed when the final URL is missing", () => {
  for (const finalUrl of [null, undefined, ""] as const) {
    const result = assessCaptureAttempt({
      finalUrl,
      screenshot: new Uint8Array(4),
    });
    assert.equal(result.ok, false, String(finalUrl));
    assert.ok(!result.ok);
    assert.equal(result.reasonCode, "capture_failed");
  }
});

test("assessCaptureAttempt is capture_failed when the screenshot is missing", () => {
  for (const screenshot of [null, undefined] as const) {
    const result = assessCaptureAttempt({
      finalUrl: "https://example.com/",
      screenshot,
    });
    assert.equal(result.ok, false, String(screenshot));
    assert.ok(!result.ok);
    assert.equal(result.reasonCode, "capture_failed");
  }
});

test("assessCaptureAttempt is capture_failed when the screenshot is zero-byte", () => {
  const result = assessCaptureAttempt({
    finalUrl: "https://example.com/",
    screenshot: new Uint8Array(0),
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reasonCode, "capture_failed");
});

test("assessCaptureAttempt is ok when the screenshot is exactly SCREENSHOT_MAX_BYTES", () => {
  const result = assessCaptureAttempt({
    finalUrl: "https://example.com/",
    screenshot: new Uint8Array(SCREENSHOT_MAX_BYTES),
  });
  assert.equal(result.ok, true);
});

