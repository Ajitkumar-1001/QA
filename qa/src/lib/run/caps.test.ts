import test from "node:test";
import assert from "node:assert/strict";
import { capWindow, checkRunCaps } from "./caps.ts";

const now = new Date("2026-11-09T23:30:00Z");

test("cap window is the calendar month in UTC", () => {
  const w = capWindow(new Date("2026-12-31T23:59:59Z"));
  assert.equal(w.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(w.resetsAt.toISOString(), "2027-01-01T00:00:00.000Z");
});

// FR-003: refused at or above the monthly cap, with the count and the reset date.
test("refuses at the monthly cap with count and reset date", () => {
  const r = checkRunCaps({ runsInWindow: 100, activeRuns: 0, monthlyCap: 100, concurrencyCap: 2, now });
  assert.ok(!r.ok);
  assert.equal(r.reason, "monthly_cap");
  assert.equal(r.count, 100);
  assert.equal(r.resetsAt.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.ok(checkRunCaps({ runsInWindow: 99, activeRuns: 0, monthlyCap: 100, concurrencyCap: 2, now }).ok);
});

// FR-004: refused when queued + running is at or above the concurrency cap.
test("refuses at the concurrency cap and accepts once a run finishes", () => {
  const r = checkRunCaps({ runsInWindow: 5, activeRuns: 2, monthlyCap: 100, concurrencyCap: 2, now });
  assert.ok(!r.ok);
  assert.equal(r.reason, "concurrency_cap");
  assert.ok(checkRunCaps({ runsInWindow: 5, activeRuns: 1, monthlyCap: 100, concurrencyCap: 2, now }).ok);
});

// A monthly cap of zero stops all runs.
test("a monthly cap of zero refuses every run", () => {
  const r = checkRunCaps({ runsInWindow: 0, activeRuns: 0, monthlyCap: 0, concurrencyCap: 2, now });
  assert.ok(!r.ok);
  assert.equal(r.reason, "monthly_cap");
});

test("the concurrency cap never exceeds 8", () => {
  assert.throws(() =>
    checkRunCaps({ runsInWindow: 0, activeRuns: 0, monthlyCap: 100, concurrencyCap: 9, now }),
  );
});
