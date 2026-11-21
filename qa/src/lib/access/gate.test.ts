import test from "node:test";
import assert from "node:assert/strict";
import { BASIC_CHALLENGE } from "./basic-auth.ts";
import { FRAME_GUARD_HEADERS, decideRequest, type GateDecision } from "./gate.ts";

const SECRET = "canary-owner-secret-0123456789abcdef";
const GUARD = "frame-ancestors 'none'";

function basic(password: string): string {
  return `Basic ${Buffer.from(`owner:${password}`).toString("base64")}`;
}

function decide(
  init: {
    method?: string;
    headers?: Record<string, string>;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const raw: string[] = [];
  const decision = decideRequest(
    { method: init.method ?? "GET", headers: new Headers(init.headers) },
    init.env ?? { QAFORGE_OWNER_SECRET: SECRET },
    (line) => raw.push(line),
  );
  return { decision, raw, logs: raw.map((line) => JSON.parse(line)) };
}

function refusal(decision: GateDecision): Response {
  assert.ok(decision.kind === "refuse", "expected a refusal");
  return decision.response;
}

test("the right credential passes with the framing guard and logs nothing", () => {
  const { decision, raw } = decide({ headers: { authorization: basic(SECRET) } });
  assert.deepEqual(decision, { kind: "pass", headers: FRAME_GUARD_HEADERS });
  assert.equal(FRAME_GUARD_HEADERS["Content-Security-Policy"], GUARD);
  assert.deepEqual(raw, []);
});

test("a POST from the app's own origin passes", () => {
  const { decision, raw } = decide({
    method: "POST",
    headers: { authorization: basic(SECRET), origin: "https://qaforge.example", host: "qaforge.example" },
  });
  assert.equal(decision.kind, "pass");
  assert.deepEqual(raw, []);
});

test("a missing and a wrong credential each get the challenge and their own log line", () => {
  const bad: Array<Record<string, string>> = [{}, { authorization: basic("canary-wrong-guess") }];
  for (const headers of bad) {
    const response = refusal(decide({ headers }).decision);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("WWW-Authenticate"), BASIC_CHALLENGE);
  }
  const missing = decide();
  const wrong = decide({ headers: { authorization: basic("canary-wrong-guess") } });
  assert.deepEqual(missing.logs, [{ reason: "missing", level: "info", event: "owner_gate_refused" }]);
  assert.deepEqual(wrong.logs, [{ reason: "wrong_secret", level: "info", event: "owner_gate_refused" }]);
  assert.equal(wrong.raw.join("").includes("canary"), false);
});

test("an unset secret refuses every request with a 500 and logs only the variable", () => {
  const { decision, logs } = decide({ env: {}, headers: { authorization: basic(SECRET) } });
  const response = refusal(decision);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("WWW-Authenticate"), null);
  assert.deepEqual(logs, [
    { variable: "QAFORGE_OWNER_SECRET", problem: "required", level: "error", event: "owner_gate_config_error" },
  ]);
});

test("valid credentials with a missing, null or foreign Origin on a POST get a 403 and a reason", () => {
  const cases: Array<[Record<string, string>, string]> = [
    [{}, "origin_missing"],
    [{ origin: "null" }, "origin_null"],
    [{ origin: "https://evil.example" }, "origin_foreign"],
  ];
  for (const [extra, reason] of cases) {
    const { decision, logs, raw } = decide({
      method: "POST",
      headers: { authorization: basic(SECRET), host: "qaforge.example", ...extra },
    });
    const response = refusal(decision);
    assert.equal(response.status, 403, reason);
    assert.equal(response.headers.get("WWW-Authenticate"), null, "no challenge: the credentials were fine");
    assert.deepEqual(logs, [{ reason, level: "info", event: "owner_gate_refused" }]);
    assert.equal(raw.join("").includes("canary"), false);
  }
});

test("credentials are checked before the origin, so no credentials and a foreign Origin get the challenge", () => {
  const { decision, logs } = decide({
    method: "POST",
    headers: { origin: "https://evil.example", host: "qaforge.example" },
  });
  assert.equal(refusal(decision).status, 401);
  assert.deepEqual(logs, [{ reason: "missing", level: "info", event: "owner_gate_refused" }]);
});

test("every refusal carries the framing guard", () => {
  const refusals = [
    decide().decision,
    decide({ env: {} }).decision,
    decide({ method: "POST", headers: { authorization: basic(SECRET) } }).decision,
  ];
  assert.deepEqual(refusals.map((decision) => refusal(decision).status), [401, 500, 403]);
  for (const decision of refusals) {
    assert.equal(refusal(decision).headers.get("Content-Security-Policy"), GUARD);
  }
});
