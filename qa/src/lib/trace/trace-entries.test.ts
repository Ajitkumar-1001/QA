import test from "node:test";
import assert from "node:assert/strict";
import {
  TRACE_RESULT_SUMMARY_MAX_CHARS,
  listTraceEntries,
  type ModelCallRecord,
  type ToolCallRecord,
} from "./trace-entries.ts";

function model(
  partial: Omit<ModelCallRecord, "kind"> & { kind?: "model" },
): ModelCallRecord {
  return { kind: "model", ...partial };
}

function tool(
  partial: Omit<ToolCallRecord, "kind"> & { kind?: "tool" },
): ToolCallRecord {
  return { kind: "tool", ...partial };
}

test("empty input gives []", () => {
  assert.deepEqual(listTraceEntries([]), []);
});

test("4 model + 6 tool acceptance: shuffled input lists 10 entries in time order", () => {
  const records: (ModelCallRecord | ToolCallRecord)[] = [
    tool({
      id: "t6",
      startedAtMs: 900,
      endedAtMs: 950,
      toolName: "press_key",
      args: { key: "Enter" },
      result: { ok: true, content: "pressed" },
    }),
    model({
      id: "m3",
      startedAtMs: 500,
      endedAtMs: 580,
      output: "model-3-out",
      inputTokens: 30,
      outputTokens: 12,
    }),
    tool({
      id: "t1",
      startedAtMs: 100,
      endedAtMs: 150,
      toolName: "read_page",
      args: {},
      result: { ok: true, content: "page snapshot" },
    }),
    model({
      id: "m1",
      startedAtMs: 0,
      endedAtMs: 80,
      output: "model-1-out",
      inputTokens: 10,
      outputTokens: 5,
    }),
    tool({
      id: "t3",
      startedAtMs: 300,
      endedAtMs: 340,
      toolName: "fill_field",
      args: { ref: "e2", text: "hi" },
      result: { ok: true, content: "filled" },
    }),
    tool({
      id: "t5",
      startedAtMs: 700,
      endedAtMs: 760,
      toolName: "click_element",
      args: { ref: "e3" },
      result: { ok: false, content: "not found" },
    }),
    model({
      id: "m2",
      startedAtMs: 200,
      endedAtMs: 260,
      output: "model-2-out",
      inputTokens: 20,
      outputTokens: 8,
    }),
    tool({
      id: "t2",
      startedAtMs: 200,
      endedAtMs: 230,
      toolName: "click_element",
      args: { ref: "e1" },
      result: { ok: true, content: "clicked" },
    }),
    model({
      id: "m4",
      startedAtMs: 800,
      endedAtMs: 870,
      output: "model-4-out",
      inputTokens: 40,
      outputTokens: 15,
    }),
    tool({
      id: "t4",
      startedAtMs: 600,
      endedAtMs: 650,
      toolName: "read_page",
      args: {},
      result: { ok: true, content: "updated page" },
    }),
  ];

  const entries = listTraceEntries(records);
  assert.equal(entries.length, 10);
  assert.deepEqual(
    entries.map((e) => e.id),
    ["m1", "t1", "t2", "m2", "t3", "m3", "t4", "t5", "m4", "t6"],
  );
  assert.deepEqual(
    entries.map((e) => e.index),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(
    entries.map((e) => e.durationMs),
    [80, 50, 30, 60, 40, 80, 50, 60, 70, 50],
  );

  const m1 = entries[0]!;
  assert.equal(m1.kind, "model");
  if (m1.kind === "model") {
    assert.equal(m1.output, "model-1-out");
    assert.equal(m1.inputTokens, 10);
    assert.equal(m1.outputTokens, 5);
  }

  const t1 = entries[1]!;
  assert.equal(t1.kind, "tool");
  if (t1.kind === "tool") {
    assert.deepEqual(t1.args, {});
    assert.equal(t1.resultSummary, "ok page snapshot");
  }

  const t5 = entries[7]!;
  assert.equal(t5.kind, "tool");
  if (t5.kind === "tool") {
    assert.deepEqual(t5.args, { ref: "e3" });
    assert.equal(t5.resultSummary, "error not found");
  }

  const m4 = entries[8]!;
  assert.equal(m4.kind, "model");
  if (m4.kind === "model") {
    assert.equal(m4.output, "model-4-out");
    assert.equal(m4.inputTokens, 40);
    assert.equal(m4.outputTokens, 15);
  }
});

test("ties: same start sorted by end, then input order; input not mutated", () => {
  const a = model({
    id: "a",
    startedAtMs: 100,
    endedAtMs: 200,
    output: "a-out",
    inputTokens: 1,
    outputTokens: 1,
  });
  const b = tool({
    id: "b",
    startedAtMs: 100,
    endedAtMs: 150,
    toolName: "read_page",
    args: {},
    result: { ok: true, content: "b" },
  });
  const c = model({
    id: "c",
    startedAtMs: 100,
    endedAtMs: 200,
    output: "c-out",
    inputTokens: 2,
    outputTokens: 2,
  });
  const d = tool({
    id: "d",
    startedAtMs: 100,
    endedAtMs: 200,
    toolName: "click_element",
    args: { ref: "e1" },
    result: { ok: true, content: "d" },
  });

  const input: (ModelCallRecord | ToolCallRecord)[] = [a, b, c, d];
  const snapshot = structuredClone(input);

  const entries = listTraceEntries(input);
  assert.deepEqual(
    entries.map((e) => e.id),
    ["b", "a", "c", "d"],
  );
  assert.deepEqual(
    entries.map((e) => e.index),
    [1, 2, 3, 4],
  );
  assert.deepEqual(input, snapshot);
});

test("resultSummary collapses multi-line content", () => {
  const entries = listTraceEntries([
    tool({
      id: "t",
      startedAtMs: 0,
      endedAtMs: 1,
      toolName: "read_page",
      args: {},
      result: { ok: true, content: "line1\nline2\r\n  line3" },
    }),
  ]);
  assert.equal(entries[0]!.kind, "tool");
  if (entries[0]!.kind === "tool") {
    assert.equal(entries[0]!.resultSummary, "ok line1 line2 line3");
  }
});

test("resultSummary cuts long content to the limit with ellipsis", () => {
  const long = "x".repeat(TRACE_RESULT_SUMMARY_MAX_CHARS + 50);
  const entries = listTraceEntries([
    tool({
      id: "t",
      startedAtMs: 0,
      endedAtMs: 1,
      toolName: "read_page",
      args: {},
      result: { ok: true, content: long },
    }),
  ]);
  assert.equal(entries[0]!.kind, "tool");
  if (entries[0]!.kind === "tool") {
    const summary = entries[0]!.resultSummary;
    assert.ok(summary.startsWith("ok "));
    const body = summary.slice("ok ".length);
    assert.equal(body, "x".repeat(TRACE_RESULT_SUMMARY_MAX_CHARS) + "…");
    assert.equal([...body.slice(0, -1)].length, TRACE_RESULT_SUMMARY_MAX_CHARS);
  }
});

test("resultSummary does not split an emoji at the cut boundary", () => {
  const prefix = "a".repeat(TRACE_RESULT_SUMMARY_MAX_CHARS - 1);
  const content = prefix + "😀" + "tail";
  // Naive UTF-16 slice(0, MAX) would split the surrogate pair.
  assert.equal(content.length, TRACE_RESULT_SUMMARY_MAX_CHARS - 1 + 2 + 4);
  assert.equal(content.slice(0, TRACE_RESULT_SUMMARY_MAX_CHARS).endsWith("😀"), false);

  const entries = listTraceEntries([
    tool({
      id: "t",
      startedAtMs: 0,
      endedAtMs: 1,
      toolName: "read_page",
      args: {},
      result: { ok: true, content },
    }),
  ]);
  assert.equal(entries[0]!.kind, "tool");
  if (entries[0]!.kind === "tool") {
    const body = entries[0]!.resultSummary.slice("ok ".length);
    // Complete emoji still contains each UTF-16 unit; assert no orphan surrogates.
    assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(body), false);
    assert.equal(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(body), false);
    assert.equal(body, prefix + "😀" + "…");
  }
});

test("error results are prefixed error", () => {
  const entries = listTraceEntries([
    tool({
      id: "t",
      startedAtMs: 0,
      endedAtMs: 1,
      toolName: "click_element",
      args: { ref: "e9" },
      result: { ok: false, content: "timeout" },
    }),
  ]);
  assert.equal(entries[0]!.kind, "tool");
  if (entries[0]!.kind === "tool") {
    assert.equal(entries[0]!.resultSummary, "error timeout");
  }
});

test("rejects non-finite or negative timestamps and names the id only", () => {
  const secret = "SECRET_OUTPUT_SHOULD_NOT_APPEAR";
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
    assert.throws(
      () =>
        listTraceEntries([
          model({
            id: "bad-start",
            startedAtMs: bad,
            endedAtMs: 10,
            output: secret,
            inputTokens: 0,
            outputTokens: 0,
          }),
        ]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("bad-start"));
        assert.equal(err.message.includes(secret), false);
        return true;
      },
    );
    assert.throws(
      () =>
        listTraceEntries([
          tool({
            id: "bad-end",
            startedAtMs: 0,
            endedAtMs: bad,
            toolName: "read_page",
            args: {},
            result: { ok: true, content: secret },
          }),
        ]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("bad-end"));
        assert.equal(err.message.includes(secret), false);
        return true;
      },
    );
  }
});

test("rejects endedAtMs < startedAtMs and names the id only", () => {
  const secret = "SECRET_RANGE_CONTENT";
  assert.throws(
    () =>
      listTraceEntries([
        model({
          id: "range-bad",
          startedAtMs: 50,
          endedAtMs: 49,
          output: secret,
          inputTokens: 0,
          outputTokens: 0,
        }),
      ]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("range-bad"));
      assert.equal(err.message.includes(secret), false);
      return true;
    },
  );
});

test("rejects negative or non-integer token counts and names the id only", () => {
  const secret = "SECRET_TOKEN_OUTPUT";
  for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () =>
        listTraceEntries([
          model({
            id: "tok-in",
            startedAtMs: 0,
            endedAtMs: 1,
            output: secret,
            inputTokens: bad,
            outputTokens: 0,
          }),
        ]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("tok-in"));
        assert.equal(err.message.includes(secret), false);
        return true;
      },
    );
    assert.throws(
      () =>
        listTraceEntries([
          model({
            id: "tok-out",
            startedAtMs: 0,
            endedAtMs: 1,
            output: secret,
            inputTokens: 0,
            outputTokens: bad,
          }),
        ]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("tok-out"));
        assert.equal(err.message.includes(secret), false);
        return true;
      },
    );
  }
});

test("rejects duplicate ids and names the id only", () => {
  const secret = "SECRET_DUP_CONTENT";
  assert.throws(
    () =>
      listTraceEntries([
        model({
          id: "dup",
          startedAtMs: 0,
          endedAtMs: 1,
          output: secret,
          inputTokens: 0,
          outputTokens: 0,
        }),
        tool({
          id: "dup",
          startedAtMs: 2,
          endedAtMs: 3,
          toolName: "read_page",
          args: {},
          result: { ok: true, content: secret },
        }),
      ]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("dup"));
      assert.equal(err.message.includes(secret), false);
      return true;
    },
  );
});
