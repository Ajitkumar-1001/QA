/**
 * Per-run timing and token measurements (FR-026).
 * Pure record builders: the caller supplies measured values; nothing here times or stores.
 */
import type { ModelCallKind } from "./limits.ts";

export type ModelCallMeasurement = {
  kind: ModelCallKind;
  inputTokens: number;
  outputTokens: number;
};

export type RunMeasurements = {
  readonly modelId: string;
  readonly sandboxStartMs?: number;
  readonly browserInstallMs?: number;
  readonly stepDurationsMs: readonly number[];
  readonly modelCalls: readonly ModelCallMeasurement[];
  readonly sandboxActiveCpuMs?: number;
  readonly totalDurationMs?: number;
};

export type MeasurementError =
  | "invalid_model_id"
  | "invalid_duration"
  | "invalid_token_count";

export type MeasurementResult =
  | { ok: true; measurements: RunMeasurements }
  | { ok: false; error: MeasurementError };

export type MustMeasurement =
  | "sandboxStartMs"
  | "browserInstallMs"
  | "modelCall"
  | "stepDuration"
  | "totalDurationMs";

export type MeasurementSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  stepCount: number;
  stepDurationsMsSum: number;
  complete: boolean;
  missing: readonly MustMeasurement[];
};

function isNonNegFinite(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function isNonNegInt(n: number): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

function ok(measurements: RunMeasurements): MeasurementResult {
  return { ok: true, measurements };
}

function fail(error: MeasurementError): MeasurementResult {
  return { ok: false, error };
}

/** Start a measurements record with the run's model identifier. */
export function startMeasurements(modelId: string): MeasurementResult {
  if (typeof modelId !== "string" || modelId.trim().length === 0) {
    return fail("invalid_model_id");
  }
  return ok({
    modelId: modelId.trim(),
    stepDurationsMs: [],
    modelCalls: [],
  });
}

/** Record sandbox start time in milliseconds. */
export function recordSandboxStart(
  measurements: RunMeasurements,
  sandboxStartMs: number,
): MeasurementResult {
  if (!isNonNegFinite(sandboxStartMs)) return fail("invalid_duration");
  return ok({ ...measurements, sandboxStartMs });
}

/** Record browser install time in milliseconds. */
export function recordBrowserInstall(
  measurements: RunMeasurements,
  browserInstallMs: number,
): MeasurementResult {
  if (!isNonNegFinite(browserInstallMs)) return fail("invalid_duration");
  return ok({ ...measurements, browserInstallMs });
}

/** Append one agent step's duration in milliseconds. */
export function recordStepDuration(
  measurements: RunMeasurements,
  durationMs: number,
): MeasurementResult {
  if (!isNonNegFinite(durationMs)) return fail("invalid_duration");
  return ok({
    ...measurements,
    stepDurationsMs: [...measurements.stepDurationsMs, durationMs],
  });
}

/** Append one model call's input and output token counts. */
export function recordModelCall(
  measurements: RunMeasurements,
  kind: ModelCallKind,
  inputTokens: number,
  outputTokens: number,
): MeasurementResult {
  if (!isNonNegInt(inputTokens) || !isNonNegInt(outputTokens)) {
    return fail("invalid_token_count");
  }
  return ok({
    ...measurements,
    modelCalls: [...measurements.modelCalls, { kind, inputTokens, outputTokens }],
  });
}

/** Record sandbox active CPU in milliseconds when the platform reports it. */
export function recordSandboxActiveCpu(
  measurements: RunMeasurements,
  sandboxActiveCpuMs: number,
): MeasurementResult {
  if (!isNonNegFinite(sandboxActiveCpuMs)) return fail("invalid_duration");
  return ok({ ...measurements, sandboxActiveCpuMs });
}

/** Finish the record with the run's total duration in milliseconds. */
export function finishMeasurements(
  measurements: RunMeasurements,
  totalDurationMs: number,
): MeasurementResult {
  if (!isNonNegFinite(totalDurationMs)) return fail("invalid_duration");
  return ok({ ...measurements, totalDurationMs });
}

/** Totals and whether every MUST measurement is present. */
export function summarizeMeasurements(
  measurements: RunMeasurements,
): MeasurementSummary {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let agentCallCount = 0;
  for (const call of measurements.modelCalls) {
    totalInputTokens += call.inputTokens;
    totalOutputTokens += call.outputTokens;
    if (call.kind === "agent") agentCallCount += 1;
  }

  let stepDurationsMsSum = 0;
  for (const duration of measurements.stepDurationsMs) {
    stepDurationsMsSum += duration;
  }

  const missing: MustMeasurement[] = [];
  if (measurements.sandboxStartMs === undefined) missing.push("sandboxStartMs");
  if (measurements.browserInstallMs === undefined) missing.push("browserInstallMs");
  if (agentCallCount === 0) missing.push("modelCall");
  if (agentCallCount === 0 || agentCallCount !== measurements.stepDurationsMs.length) {
    missing.push("stepDuration");
  }
  if (measurements.totalDurationMs === undefined) missing.push("totalDurationMs");

  return {
    totalInputTokens,
    totalOutputTokens,
    stepCount: measurements.stepDurationsMs.length,
    stepDurationsMsSum,
    complete: missing.length === 0,
    missing,
  };
}
