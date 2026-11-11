/**
 * Pure ordering and display model for a run's trace entries (FR-030).
 * No I/O, no storage, no routes.
 */

import type { ToolName } from "../agent/tools.ts";

/** Max code points of collapsed result content kept in a tool result summary. */
export const TRACE_RESULT_SUMMARY_MAX_CHARS = 200;

export type ModelCallRecord = {
  kind: "model";
  id: string;
  startedAtMs: number;
  endedAtMs: number;
  output: string;
  inputTokens: number;
  outputTokens: number;
};

export type ToolCallRecord = {
  kind: "tool";
  id: string;
  startedAtMs: number;
  endedAtMs: number;
  toolName: ToolName;
  /** Already validated tool arguments. */
  args: Record<string, unknown>;
  result: { ok: boolean; content: string };
};

export type ModelTraceEntry = {
  index: number;
  kind: "model";
  id: string;
  startedAtMs: number;
  durationMs: number;
  output: string;
  inputTokens: number;
  outputTokens: number;
};

export type ToolTraceEntry = {
  index: number;
  kind: "tool";
  id: string;
  startedAtMs: number;
  durationMs: number;
  toolName: ToolName;
  args: Record<string, unknown>;
  resultSummary: string;
};

export type TraceEntry = ModelTraceEntry | ToolTraceEntry;

function isNonNegFinite(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function isNonNegInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

function assertValidTimestamps(id: string, startedAtMs: number, endedAtMs: number): void {
  if (!isNonNegFinite(startedAtMs) || !isNonNegFinite(endedAtMs)) {
    throw new Error(`Invalid timestamps for record "${id}"`);
  }
  if (endedAtMs < startedAtMs) {
    throw new Error(`Invalid time range for record "${id}"`);
  }
}

function collapseToOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Cut to max code points without splitting a surrogate pair; append "…" when cut. */
function truncateSummaryContent(text: string, maxChars: number): string {
  let count = 0;
  let end = 0;
  for (const char of text) {
    if (count >= maxChars) {
      return text.slice(0, end) + "…";
    }
    count += 1;
    end += char.length;
  }
  return text;
}

function resultSummary(result: { ok: boolean; content: string }): string {
  const prefix = result.ok ? "ok" : "error";
  const collapsed = collapseToOneLine(result.content);
  const truncated = truncateSummaryContent(collapsed, TRACE_RESULT_SUMMARY_MAX_CHARS);
  return truncated.length === 0 ? prefix : `${prefix} ${truncated}`;
}

function toEntry(
  record: ModelCallRecord | ToolCallRecord,
  index: number,
): TraceEntry {
  const base = {
    index,
    id: record.id,
    startedAtMs: record.startedAtMs,
    durationMs: record.endedAtMs - record.startedAtMs,
  };
  if (record.kind === "model") {
    return {
      ...base,
      kind: "model",
      output: record.output,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
    };
  }
  return {
    ...base,
    kind: "tool",
    toolName: record.toolName,
    args: { ...record.args },
    resultSummary: resultSummary(record.result),
  };
}

/**
 * One display entry per record, sorted by startedAtMs ascending;
 * ties by endedAtMs then original input order. Does not mutate `records`.
 */
export function listTraceEntries(
  records: readonly (ModelCallRecord | ToolCallRecord)[],
): TraceEntry[] {
  const seen = new Set<string>();
  const indexed: { record: ModelCallRecord | ToolCallRecord; order: number }[] = [];

  for (let order = 0; order < records.length; order++) {
    const record = records[order]!;
    const { id } = record;

    if (seen.has(id)) {
      throw new Error(`Duplicate record id "${id}"`);
    }
    seen.add(id);

    assertValidTimestamps(id, record.startedAtMs, record.endedAtMs);

    if (record.kind === "model") {
      if (!isNonNegInt(record.inputTokens) || !isNonNegInt(record.outputTokens)) {
        throw new Error(`Invalid token counts for record "${id}"`);
      }
    }

    indexed.push({ record, order });
  }

  indexed.sort((a, b) => {
    if (a.record.startedAtMs !== b.record.startedAtMs) {
      return a.record.startedAtMs - b.record.startedAtMs;
    }
    if (a.record.endedAtMs !== b.record.endedAtMs) {
      return a.record.endedAtMs - b.record.endedAtMs;
    }
    return a.order - b.order;
  });

  return indexed.map((item, i) => toEntry(item.record, i + 1));
}
