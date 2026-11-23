import test from "node:test";
import assert from "node:assert/strict";
import { runIdSchema, startMessageSchema } from "./start-message.ts";

// A version-4 uuid, the shape the database's gen_random_uuid() produces.
const ID = "3f2b8c1e-5a47-4d6e-9b0c-7e1a2d4f6a88";

test("startMessageSchema accepts exactly one run id", () => {
  assert.deepEqual(startMessageSchema.parse({ runId: ID }), { runId: ID });
});

test("startMessageSchema refuses anything but a lone uuid run id", () => {
  const refused: unknown[] = [
    null,
    "",
    {},
    { runId: "" },
    { runId: "not-a-uuid" },
    { runId: "../etc/passwd" },
    { runId: `${ID}/x` },
    { runId: 7 },
    // FR-002: no target or objective can travel in the message.
    { runId: ID, targetUrl: "https://example.com" },
    { runId: ID, objective: "anything" },
  ];
  for (const value of refused) {
    assert.equal(startMessageSchema.safeParse(value).success, false, JSON.stringify(value));
  }
});

test("runIdSchema is the one rule the result page reuses", () => {
  assert.equal(runIdSchema.safeParse(ID).success, true);
  for (const value of [`${ID} `, ` ${ID}`, "%2e%2e", "undefined", ID.slice(1)]) {
    assert.equal(runIdSchema.safeParse(value).success, false, value);
  }
});
