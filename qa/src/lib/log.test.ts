import test from "node:test";
import assert from "node:assert/strict";
import { REDACTED, createLogger, redact, serializeError } from "./log.ts";

const SECRET = "canary-owner-secret-0123456789abcdef";
const DB_URL = "postgres://user:canary-db-password@host/db";

function assertNoCanary(text: string): void {
  assert.equal(text.includes("canary"), false, `leaked a canary: ${text}`);
}

test("serializeError redacts the message, the stack and the whole cause chain", () => {
  const cause = new Error(`connect failed for ${DB_URL}`);
  const error = new Error(`owner check failed with ${SECRET}`, { cause });
  const out = serializeError(error, [SECRET, DB_URL]);
  assert.equal(out.name, "Error");
  assert.equal(out.message, `owner check failed with ${REDACTED}`);
  assert.ok(out.stack?.includes("log.test.ts"), "keeps the stack frames");
  assert.equal(out.cause?.message, `connect failed for ${REDACTED}`);
  assertNoCanary(JSON.stringify(out));
});

test("serializeError keeps only name, code, message, stack and cause", () => {
  const error = Object.assign(new Error("boom"), {
    code: "ECONNREFUSED",
    config: { password: SECRET },
    headers: { authorization: `Basic ${SECRET}` },
  });
  const out = serializeError(error, []);
  assert.deepEqual(Object.keys(out).sort(), ["code", "message", "name", "stack"]);
  assert.equal(out.code, "ECONNREFUSED");
  assertNoCanary(JSON.stringify(out));
});

test("serializeError handles thrown values that are not errors", () => {
  assert.deepEqual(serializeError(`raw ${SECRET}`, [SECRET]), {
    name: "NonError",
    message: `raw ${REDACTED}`,
  });
  assert.equal(serializeError({ a: 1 }, []).message, "[object Object]");
  const hostile = {
    toString() {
      throw new Error("nope");
    },
  };
  assert.equal(serializeError(hostile, []).message, "[unprintable]");
});

test("serializeError stops on a cause cycle", () => {
  const error = new Error("loop");
  (error as { cause?: unknown }).cause = error;
  let depth = 0;
  let node = serializeError(error, []);
  while (node.cause) {
    node = node.cause;
    depth += 1;
  }
  assert.equal(depth, 5);
});

test("redact skips empty and unset secrets and replaces the longest first", () => {
  assert.equal(redact("nothing to hide", ["", undefined, null]), "nothing to hide");
  assert.equal(redact("abc-abcdef", ["abc", "abcdef"]), `${REDACTED}-${REDACTED}`);
});

test("the logger writes one JSON line per event, redacting string fields", () => {
  const lines: string[] = [];
  const log = createLogger({ secrets: [SECRET, undefined], write: (line) => lines.push(line) });
  log.info("run_requested", { runId: "r-1", note: `x ${SECRET}` });
  log.info("plain");
  log.error("run_send_failed", { runId: "r-1" }, new Error(`send failed ${SECRET}`));
  assert.equal(lines.length, 3);
  const [first, second, third] = lines.map((line) => JSON.parse(line));
  assert.deepEqual(first, { runId: "r-1", note: `x ${REDACTED}`, level: "info", event: "run_requested" });
  assert.deepEqual(second, { level: "info", event: "plain" });
  assert.equal(third.level, "error");
  assert.equal(third.runId, "r-1");
  assert.equal(third.error.message, `send failed ${REDACTED}`);
  assert.ok(third.error.stack.includes("log.test.ts"));
  for (const line of lines) assertNoCanary(line);
});

test("an error line without a thrown value has no error key", () => {
  const lines: string[] = [];
  const log = createLogger({ secrets: [], write: (line) => lines.push(line) });
  log.error("owner_gate_config_error", { variable: "QAFORGE_OWNER_SECRET" });
  assert.deepEqual(JSON.parse(lines[0]), {
    variable: "QAFORGE_OWNER_SECRET",
    level: "error",
    event: "owner_gate_config_error",
  });
});

test("a field cannot overwrite the level or the event", () => {
  const lines: string[] = [];
  const log = createLogger({ secrets: [], write: (line) => lines.push(line) });
  log.info("run_requested", { level: "error", event: "forged" });
  assert.deepEqual(JSON.parse(lines[0]), { level: "info", event: "run_requested" });
});
