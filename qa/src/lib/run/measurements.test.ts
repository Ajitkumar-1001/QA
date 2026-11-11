import test from "node:test";
import assert from "node:assert/strict";
import {
  finishMeasurements,
  recordBrowserInstall,
  recordModelCall,
  recordSandboxActiveCpu,
  recordSandboxStart,
  recordStepDuration,
  startMeasurements,
  summarizeMeasurements,
  type RunMeasurements,
} from "./measurements.ts";

function started(modelId = "test-model-2026-01-01"): RunMeasurements {
  const result = startMeasurements(modelId);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  return result.measurements;
}

function snapshot(m: RunMeasurements): RunMeasurements {
  return structuredClone(m);
}

test("startMeasurements requires a non-empty model identifier", () => {
  assert.deepEqual(startMeasurements(""), { ok: false, error: "invalid_model_id" });
  assert.deepEqual(startMeasurements("   "), { ok: false, error: "invalid_model_id" });
  assert.deepEqual(startMeasurements("\t\n"), { ok: false, error: "invalid_model_id" });
  const ok = startMeasurements("test-model-2026-01-01");
  assert.equal(ok.ok, true);
  assert.ok(ok.ok);
  assert.equal(ok.measurements.modelId, "test-model-2026-01-01");
  assert.deepEqual(ok.measurements.stepDurationsMs, []);
  assert.deepEqual(ok.measurements.modelCalls, []);
});

test("recorders never mutate their input", () => {
  const base = started();
  const before = snapshot(base);

  assert.ok(recordSandboxStart(base, 1_200).ok);
  assert.ok(recordBrowserInstall(base, 8_000).ok);
  assert.ok(recordStepDuration(base, 3_000).ok);
  assert.ok(recordModelCall(base, "agent", 100, 50).ok);
  assert.ok(recordSandboxActiveCpu(base, 49_000).ok);
  assert.ok(finishMeasurements(base, 60_000).ok);

  assert.deepEqual(base, before);
});

test("rejects negative, NaN and Infinity durations", () => {
  const m = started();
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(recordSandboxStart(m, bad), { ok: false, error: "invalid_duration" });
    assert.deepEqual(recordBrowserInstall(m, bad), { ok: false, error: "invalid_duration" });
    assert.deepEqual(recordStepDuration(m, bad), { ok: false, error: "invalid_duration" });
    assert.deepEqual(recordSandboxActiveCpu(m, bad), { ok: false, error: "invalid_duration" });
    assert.deepEqual(finishMeasurements(m, bad), { ok: false, error: "invalid_duration" });
  }
});

test("rejects non-integer, negative, NaN and Infinity token counts", () => {
  const m = started();
  for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(recordModelCall(m, "criteria", bad, 0), {
      ok: false,
      error: "invalid_token_count",
    });
    assert.deepEqual(recordModelCall(m, "agent", 0, bad), {
      ok: false,
      error: "invalid_token_count",
    });
  }
});

test("summarizeMeasurements totals tokens and step durations", () => {
  const s1 = recordSandboxStart(started(), 100);
  assert.ok(s1.ok);
  const b1 = recordBrowserInstall(s1.measurements, 2_000);
  assert.ok(b1.ok);
  const step1 = recordStepDuration(b1.measurements, 1_000);
  assert.ok(step1.ok);
  const step2 = recordStepDuration(step1.measurements, 2_500);
  assert.ok(step2.ok);
  const call1 = recordModelCall(step2.measurements, "criteria", 200, 80);
  assert.ok(call1.ok);
  const call2 = recordModelCall(call1.measurements, "agent", 150, 40);
  assert.ok(call2.ok);
  const call3 = recordModelCall(call2.measurements, "agent", 50, 10);
  assert.ok(call3.ok);
  const done = finishMeasurements(call3.measurements, 45_000);
  assert.ok(done.ok);

  assert.deepEqual(summarizeMeasurements(done.measurements), {
    totalInputTokens: 400,
    totalOutputTokens: 130,
    stepCount: 2,
    stepDurationsMsSum: 3_500,
    complete: true,
    missing: [],
  });
});

test("completeness is false until every MUST measurement is present", () => {
  const base = started();
  assert.deepEqual(summarizeMeasurements(base).missing, [
    "sandboxStartMs",
    "browserInstallMs",
    "modelCall",
    "stepDuration",
    "totalDurationMs",
  ]);
  assert.equal(summarizeMeasurements(base).complete, false);

  const withStart = recordSandboxStart(base, 10);
  assert.ok(withStart.ok);
  const withInstall = recordBrowserInstall(withStart.measurements, 20);
  assert.ok(withInstall.ok);
  assert.deepEqual(summarizeMeasurements(withInstall.measurements).missing, [
    "modelCall",
    "stepDuration",
    "totalDurationMs",
  ]);

  const withCall = recordModelCall(withInstall.measurements, "agent", 1, 2);
  assert.ok(withCall.ok);
  assert.deepEqual(summarizeMeasurements(withCall.measurements).missing, [
    "stepDuration",
    "totalDurationMs",
  ]);

  const withStep = recordStepDuration(withCall.measurements, 5);
  assert.ok(withStep.ok);
  assert.deepEqual(summarizeMeasurements(withStep.measurements).missing, ["totalDurationMs"]);

  const done = finishMeasurements(withStep.measurements, 30);
  assert.ok(done.ok);
  assert.equal(summarizeMeasurements(done.measurements).complete, true);
  assert.deepEqual(summarizeMeasurements(done.measurements).missing, []);
});

test("criteria-only run is incomplete without agent steps", () => {
  const s = recordSandboxStart(started(), 5);
  assert.ok(s.ok);
  const i = recordBrowserInstall(s.measurements, 6);
  assert.ok(i.ok);
  const c = recordModelCall(i.measurements, "criteria", 3, 4);
  assert.ok(c.ok);
  const done = finishMeasurements(c.measurements, 7);
  assert.ok(done.ok);

  const summary = summarizeMeasurements(done.measurements);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.missing, ["modelCall", "stepDuration"]);
});

test("mismatched agent calls and step durations is incomplete", () => {
  const s = recordSandboxStart(started(), 5);
  assert.ok(s.ok);
  const i = recordBrowserInstall(s.measurements, 6);
  assert.ok(i.ok);
  const a1 = recordModelCall(i.measurements, "agent", 1, 1);
  assert.ok(a1.ok);
  const a2 = recordModelCall(a1.measurements, "agent", 2, 2);
  assert.ok(a2.ok);
  const step = recordStepDuration(a2.measurements, 10);
  assert.ok(step.ok);
  const done = finishMeasurements(step.measurements, 7);
  assert.ok(done.ok);

  const summary = summarizeMeasurements(done.measurements);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.missing, ["stepDuration"]);
});

test("sandbox active CPU is optional and does not affect completeness", () => {
  const s = recordSandboxStart(started(), 5);
  assert.ok(s.ok);
  const i = recordBrowserInstall(s.measurements, 6);
  assert.ok(i.ok);
  const c = recordModelCall(i.measurements, "agent", 3, 4);
  assert.ok(c.ok);
  const step = recordStepDuration(c.measurements, 8);
  assert.ok(step.ok);
  const done = finishMeasurements(step.measurements, 7);
  assert.ok(done.ok);

  assert.equal(done.measurements.sandboxActiveCpuMs, undefined);
  assert.equal(summarizeMeasurements(done.measurements).complete, true);

  const withCpu = recordSandboxActiveCpu(done.measurements, 49_000);
  assert.ok(withCpu.ok);
  assert.equal(withCpu.measurements.sandboxActiveCpuMs, 49_000);
  assert.equal(summarizeMeasurements(withCpu.measurements).complete, true);
});
