/** Result view (FR-026, FR-028, FR-029, FR-031). */
import { createElement, type ReactElement } from "react";
import type { CaptureTruncation, ConsoleEntry, NetworkEntry } from "../lib/evidence/capture.ts";
import { summarizeMeasurements, type RunMeasurements } from "../lib/run/measurements.ts";
import { criterionText, progressText, type RunPhase } from "../lib/run/run-text.ts";
import type { VerdictResult } from "../lib/run/verdict.ts";
import { CapturedText } from "./captured-text.ts";

export type ResultScreenshot = { src: string; width: number; height: number };

export type ResultEvidence = {
  finalUrl?: string;
  pageText?: string;
  consoleLog?: readonly ConsoleEntry[];
  networkLog?: readonly NetworkEntry[];
  screenshot?: ResultScreenshot;
  truncated?: CaptureTruncation;
};

export type RunResultProps =
  | { status: "queued"; createdAt: Date; now: Date }
  | { status: "running"; phase: RunPhase }
  | { status: "done"; verdict: VerdictResult; evidence: ResultEvidence; measurements?: RunMeasurements };

function ms(x: number | undefined): string {
  return x === undefined ? "not recorded" : `${Math.round(x)} ms`;
}

function renderEvidence(evidence: ResultEvidence): ReactElement {
  const { finalUrl, screenshot, pageText, consoleLog, networkLog, truncated } = evidence;
  const hasPart =
    finalUrl !== undefined ||
    screenshot !== undefined ||
    pageText !== undefined ||
    consoleLog !== undefined ||
    networkLog !== undefined;

  const body: ReactElement[] = [];
  if (!hasPart) {
    body.push(createElement("p", null, "No evidence was captured."));
  } else {
    if (finalUrl !== undefined) {
      body.push(createElement("p", null, `Final URL: ${finalUrl}`));
    }
    if (screenshot !== undefined) {
      body.push(
        createElement("img", {
          src: screenshot.src,
          width: screenshot.width,
          height: screenshot.height,
          alt: "Screenshot of the final page",
          className: "h-auto max-w-full",
        }),
      );
    }
    if (pageText !== undefined) {
      body.push(createElement(CapturedText, { kind: "page_text", content: pageText }));
      if (truncated?.pageText) {
        body.push(createElement("p", null, "Page text was cut to its size limit."));
      }
    }
    if (consoleLog !== undefined) {
      body.push(createElement(CapturedText, { kind: "console", content: consoleLog }));
      const consoleDropped = truncated?.consoleDropped ?? 0;
      if (consoleDropped > 0) {
        body.push(
          createElement(
            "p",
            null,
            consoleDropped === 1
              ? "1 console entry was dropped."
              : `${consoleDropped} console entries were dropped.`,
          ),
        );
      }
    }
    if (networkLog !== undefined) {
      body.push(createElement(CapturedText, { kind: "network", content: networkLog }));
      const networkDropped = truncated?.networkDropped ?? 0;
      if (networkDropped > 0) {
        body.push(
          createElement(
            "p",
            null,
            networkDropped === 1
              ? "1 network entry was dropped."
              : `${networkDropped} network entries were dropped.`,
          ),
        );
      }
    }
  }

  return createElement(
    "section",
    { "aria-labelledby": "result-evidence" },
    createElement("h3", { id: "result-evidence" }, "Evidence"),
    ...body,
  );
}

function renderMeasurements(measurements: RunMeasurements | undefined): ReactElement {
  if (measurements === undefined) {
    return createElement(
      "section",
      { "aria-labelledby": "result-measurements" },
      createElement("h3", { id: "result-measurements" }, "Measurements"),
      createElement("p", null, "No measurements were recorded."),
    );
  }

  const { totalInputTokens, totalOutputTokens } = summarizeMeasurements(measurements);
  const rows: ReactElement[] = [
    createElement("dt", null, "Model"),
    createElement("dd", null, measurements.modelId),
    createElement("dt", null, "Sandbox start"),
    createElement("dd", null, ms(measurements.sandboxStartMs)),
    createElement("dt", null, "Browser install"),
    createElement("dd", null, ms(measurements.browserInstallMs)),
    createElement("dt", null, "Agent steps"),
  ];

  if (measurements.stepDurationsMs.length === 0) {
    rows.push(createElement("dd", null, "not recorded"));
  } else {
    for (let i = 0; i < measurements.stepDurationsMs.length; i++) {
      rows.push(
        createElement("dd", null, `Step ${i + 1}: ${ms(measurements.stepDurationsMs[i])}`),
      );
    }
  }

  rows.push(createElement("dt", null, "Model calls"));
  if (measurements.modelCalls.length === 0) {
    rows.push(createElement("dd", null, "not recorded"));
  } else {
    for (const call of measurements.modelCalls) {
      const label = call.kind === "criteria" ? "Criteria call" : "Agent call";
      rows.push(
        createElement(
          "dd",
          null,
          `${label}: ${call.inputTokens} in, ${call.outputTokens} out`,
        ),
      );
    }
  }

  rows.push(
    createElement("dt", null, "Total tokens"),
    createElement("dd", null, `${totalInputTokens} in, ${totalOutputTokens} out`),
    createElement("dt", null, "Total duration"),
    createElement("dd", null, ms(measurements.totalDurationMs)),
  );

  if (measurements.sandboxActiveCpuMs !== undefined) {
    rows.push(
      createElement("dt", null, "Sandbox active CPU"),
      createElement("dd", null, ms(measurements.sandboxActiveCpuMs)),
    );
  }

  return createElement(
    "section",
    { "aria-labelledby": "result-measurements" },
    createElement("h3", { id: "result-measurements" }, "Measurements"),
    createElement("dl", null, ...rows),
  );
}

export function RunResult(props: RunResultProps): ReactElement {
  if (props.status === "queued") {
    return createElement(
      "div",
      null,
      createElement(
        "p",
        null,
        progressText({ status: "queued", createdAt: props.createdAt, now: props.now }),
      ),
    );
  }

  if (props.status === "running") {
    return createElement(
      "div",
      null,
      createElement("p", null, progressText({ status: "running", phase: props.phase })),
    );
  }

  const { verdict, evidence, measurements } = props;
  const children: ReactElement[] = [
    createElement("p", null, progressText({ status: "done" })),
    createElement("h2", null, verdict.summary),
  ];

  if (verdict.results.length > 0) {
    children.push(
      createElement(
        "section",
        { "aria-labelledby": "result-checks" },
        createElement("h3", { id: "result-checks" }, "Checks"),
        createElement(
          "ul",
          null,
          ...verdict.results.map((result) =>
            createElement(
              "li",
              null,
              createElement(
                "p",
                null,
                `${criterionText(result)}: ${result.held ? "held" : "not held"}`,
              ),
              createElement("p", null, `Observed: ${result.observed}`),
            ),
          ),
        ),
      ),
    );
  }

  children.push(renderEvidence(evidence));
  children.push(renderMeasurements(measurements));

  return createElement("div", null, ...children);
}
