import test from "node:test";
import assert from "node:assert/strict";
import { isOwnerSecret } from "./owner-gate.ts";

// FR-001 / §13 Security: owner secret compared in constant time.
test("accepts only the exact configured secret", () => {
  assert.equal(isOwnerSecret("s3cret-value", "s3cret-value"), true);
  assert.equal(isOwnerSecret("s3cret-valuX", "s3cret-value"), false);
  assert.equal(isOwnerSecret("s3cret", "s3cret-value"), false);
  assert.equal(isOwnerSecret("", "s3cret-value"), false);
  assert.equal(isOwnerSecret(null, "s3cret-value"), false);
  assert.equal(isOwnerSecret(undefined, "s3cret-value"), false);
});

test("rejects everything when no secret is configured", () => {
  assert.equal(isOwnerSecret("", ""), false);
  assert.equal(isOwnerSecret("anything", undefined), false);
});
