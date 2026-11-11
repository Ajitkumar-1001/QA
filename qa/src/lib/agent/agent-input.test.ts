import test from "node:test";
import assert from "node:assert/strict";
import type { Criterion } from "../run/criteria.ts";
import {
  AGENT_INSTRUCTIONS,
  buildAgentInput,
  type AgentToolResult,
} from "./agent-input.ts";

// FR-012: agent input is only instructions, objective, and tool results.
test("buildAgentInput returns exactly instructions, objective, and toolResults", () => {
  const input = buildAgentInput({
    objective: "Add a todo named Buy milk",
    toolResults: [
      { callId: "call-1", toolName: "read_page", content: "page snapshot" },
    ],
  });
  assert.deepEqual(Object.keys(input).sort(), [
    "instructions",
    "objective",
    "toolResults",
  ]);
  assert.equal(input.instructions, AGENT_INSTRUCTIONS);
  assert.equal(input.objective, "Add a todo named Buy milk");
  assert.deepEqual(input.toolResults, [
    { callId: "call-1", toolName: "read_page", content: "page snapshot" },
  ]);
});

// FR-012: criteria and other run fields must never appear in the agent input.
test("buildAgentInput drops criteria and extra source fields so they cannot leak", () => {
  const distinctive: Criterion[] = [
    { kind: "text_visible", expected: "LEAK_VISIBLE_EXPECTED_7f3a" },
    { kind: "text_absent", expected: "LEAK_ABSENT_EXPECTED_9c2b" },
    { kind: "url_matches", expected: "LEAK_URL_EXPECTED_1d4e" },
  ];
  const source = {
    objective: "Complete the checkout flow",
    toolResults: [] as AgentToolResult[],
    criteria: distinctive,
    checkable: true,
    ownerSecret: "LEAK_OWNER_SECRET_zz99",
    finalCapture: { finalUrl: "https://leak.example/path", pageText: "LEAK_PAGE_TEXT" },
  } as {
    objective: string;
    toolResults?: readonly AgentToolResult[];
  };

  const serialized = JSON.stringify(buildAgentInput(source));

  for (const criterion of distinctive) {
    assert.equal(serialized.includes(criterion.expected), false, criterion.expected);
  }
  assert.equal(serialized.includes("LEAK_OWNER_SECRET_zz99"), false);
  assert.equal(serialized.includes("LEAK_PAGE_TEXT"), false);
  assert.equal(serialized.includes("https://leak.example/path"), false);
  assert.equal(serialized.includes("criteria"), false);
  assert.equal(serialized.includes("checkable"), false);
  assert.equal(serialized.includes("ownerSecret"), false);
});

test("buildAgentInput copies tool results field by field without extra properties", () => {
  const dirty = {
    callId: "call-2",
    toolName: "click_element",
    content: "clicked",
    criteria: "LEAK_TOOL_CRITERIA",
    expected: "LEAK_TOOL_EXPECTED",
    secret: true,
  } as AgentToolResult;

  const input = buildAgentInput({
    objective: "Click the submit button",
    toolResults: [dirty],
  });

  assert.equal(input.toolResults.length, 1);
  assert.deepEqual(Object.keys(input.toolResults[0]!).sort(), [
    "callId",
    "content",
    "toolName",
  ]);
  assert.deepEqual(input.toolResults[0], {
    callId: "call-2",
    toolName: "click_element",
    content: "clicked",
  });
  const serialized = JSON.stringify(input);
  assert.equal(serialized.includes("LEAK_TOOL_CRITERIA"), false);
  assert.equal(serialized.includes("LEAK_TOOL_EXPECTED"), false);
});

test("AGENT_INSTRUCTIONS mentions neither criteri nor verdict", () => {
  assert.equal(/criteri/i.test(AGENT_INSTRUCTIONS), false);
  assert.equal(/verdict/i.test(AGENT_INSTRUCTIONS), false);
});

test("buildAgentInput throws on a blank or whitespace-only objective", () => {
  for (const objective of ["", " ", "\t", "\n", "  \n\t  "]) {
    assert.throws(
      () => buildAgentInput({ objective }),
      (err: unknown) => err instanceof Error && err.name === "Error",
    );
  }
});
