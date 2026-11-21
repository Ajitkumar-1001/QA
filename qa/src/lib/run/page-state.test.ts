import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../log.ts";
import { REASON_TEXT } from "./status.ts";
import { PageLoadError, formState, hasRefusedMarker, loadStep, resultText } from "./page-state.ts";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const base = { runsInWindow: 3, activeRuns: 0, monthlyCap: 100, concurrencyCap: 2, now: NOW };

test("the refused marker is accepted only as refused=1", () => {
  assert.equal(hasRefusedMarker({ refused: "1" }), true);
  assert.equal(hasRefusedMarker({ refused: "1", other: "x" }), true);
  for (const bad of [{}, { refused: "2" }, { refused: "" }, { refused: ["1", "1"] }, { refused: undefined }, null, "refused=1"]) {
    assert.equal(hasRefusedMarker(bad), false, JSON.stringify(bad));
  }
});

test("formState reports runs used and shows no refusal while under both caps", () => {
  assert.deepEqual(formState({ ...base, startRefused: false }), { runsUsed: 3, refusal: undefined });
});

test("at the monthly cap the refusal shows on load, marker or not (FR-003)", () => {
  for (const startRefused of [false, true]) {
    const state = formState({ ...base, runsInWindow: 100, startRefused });
    assert.equal(state.runsUsed, 100);
    assert.deepEqual(state.refusal, {
      ok: false,
      code: "RATE_LIMITED",
      reason: "monthly_cap",
      count: 100,
      cap: 100,
      resetsAt: new Date("2026-12-01T00:00:00.000Z"),
    });
  }
});

test("a monthly cap of 0 refuses on load", () => {
  assert.equal(formState({ ...base, runsInWindow: 0, monthlyCap: 0, startRefused: false }).refusal?.reason, "monthly_cap");
});

test("the concurrency refusal shows only after a refused Start (FR-004)", () => {
  const before = formState({ ...base, activeRuns: 2, startRefused: false });
  assert.equal(before.refusal, undefined);
  const after = formState({ ...base, activeRuns: 2, startRefused: true });
  assert.equal(after.refusal?.reason, "concurrency_cap");
  assert.equal(after.refusal?.count, 2);
  assert.equal(after.refusal?.cap, 2);
});

test("a marker with no refusal to rebuild shows nothing", () => {
  assert.equal(formState({ ...base, activeRuns: 1, startRefused: true }).refusal, undefined);
});

test("when both caps are hit the monthly refusal wins, as Start would have said", () => {
  const state = formState({ ...base, runsInWindow: 100, activeRuns: 2, startRefused: true });
  assert.equal(state.refusal?.reason, "monthly_cap");
});

const ago = (ms: number) => new Date(NOW.getTime() - ms);

test("resultText: a queued run says how long ago it was queued", () => {
  assert.equal(resultText({ status: "queued", reasonCode: null, createdAt: ago(5_000) }, NOW), "Queued 5s ago.");
  assert.equal(resultText({ status: "queued", reasonCode: null, createdAt: ago(130_000) }, NOW), "Queued 2 min ago.");
});

test("resultText: a running run says only that it is running", () => {
  assert.equal(resultText({ status: "running", reasonCode: null, createdAt: ago(1_000) }, NOW), "Running.");
});

test("resultText: a reaped run gets the INCONCLUSIVE summary with its reason", () => {
  for (const reasonCode of ["never_started", "lease_expired"] as const) {
    const text = resultText({ status: "done", reasonCode, createdAt: ago(600_000) }, NOW);
    assert.equal(text, `INCONCLUSIVE. No verdict: ${REASON_TEXT[reasonCode]}`);
  }
});

test("resultText: a done run with no reason code is not given an invented verdict", () => {
  assert.equal(resultText({ status: "done", reasonCode: null, createdAt: ago(600_000) }, NOW), "Done.");
});

const CANARY_URL = "postgres://app:canary-db-password@db.example/qa";
const CANARY_PASSWORD = "canary-db-password";

function recordingLog() {
  const lines: string[] = [];
  return { lines, log: createLogger({ secrets: [CANARY_URL, CANARY_PASSWORD], write: (line) => lines.push(line) }) };
}

test("loadStep returns the value of a step that succeeds, sync or async", async () => {
  const { log, lines } = recordingLog();
  assert.equal(await loadStep(log, "count", () => 7), 7);
  assert.equal(await loadStep(log, "count", async () => 8), 8);
  assert.deepEqual(lines, []);
});

test("loadStep turns a failure into a fixed error and logs the original without any secret", async () => {
  for (const fail of [
    () => {
      throw new Error(`connect failed for ${CANARY_URL}`, { cause: new Error(`password ${CANARY_PASSWORD} rejected`) });
    },
    () => Promise.reject(new Error(`connect failed for ${CANARY_URL}`)),
  ]) {
    const { log, lines } = recordingLog();
    const thrown = await loadStep(log, "read", fail).then(
      () => assert.fail("expected a failure"),
      (error: unknown) => error,
    );
    assert.ok(thrown instanceof PageLoadError);
    assert.equal(thrown.step, "read");
    assert.equal(thrown.message, 'Loading the page failed at step "read". It can be retried.');
    assert.equal(`${thrown.message}\n${thrown.stack}`.includes("canary"), false);
    assert.equal(lines.length, 1);
    const logged = JSON.parse(lines[0] ?? "");
    assert.equal(logged.event, "page_load_failed");
    assert.equal(logged.step, "read");
    assert.equal(logged.level, "error");
    assert.equal(lines[0]?.includes("canary"), false, "the log line must hold no canary");
  }
});
