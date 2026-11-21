import test from "node:test";
import assert from "node:assert/strict";
import {
  BASIC_CHALLENGE,
  basicPassword,
  checkBasicAuth,
  checkOrigin,
  refusalResponse,
} from "./basic-auth.ts";

const SECRET = "canary-owner-secret-0123456789abcdef";
const ENV = { QAFORGE_OWNER_SECRET: SECRET };

function basic(userAndPassword: string, scheme = "Basic"): string {
  return `${scheme} ${Buffer.from(userAndPassword, "utf8").toString("base64")}`;
}

test("the right secret passes, whatever the user name", () => {
  assert.deepEqual(checkBasicAuth(basic(`owner:${SECRET}`), ENV), { ok: true });
  assert.deepEqual(checkBasicAuth(basic(`:${SECRET}`), ENV), { ok: true }, "empty user name");
  assert.deepEqual(checkBasicAuth(basic(`someone-else:${SECRET}`), ENV), { ok: true });
});

test("the configured secret is compared trimmed, as config parses it", () => {
  assert.deepEqual(checkBasicAuth(basic(`u:${SECRET}`), { QAFORGE_OWNER_SECRET: ` ${SECRET} ` }), { ok: true });
});

test("the scheme name matches in any case", () => {
  assert.deepEqual(checkBasicAuth(basic(`u:${SECRET}`, "basic"), ENV), { ok: true });
  assert.deepEqual(checkBasicAuth(basic(`u:${SECRET}`, "BASIC"), ENV), { ok: true });
});

test("the password is everything after the first colon, so a secret may contain colons", () => {
  const withColons = "abc:def:0123456789abcdef0123456789";
  assert.equal(basicPassword(basic(`user:${withColons}`)), withColons);
  assert.deepEqual(checkBasicAuth(basic(`user:${withColons}`), { QAFORGE_OWNER_SECRET: withColons }), { ok: true });
});

test("a missing credential is refused as missing", () => {
  assert.deepEqual(checkBasicAuth(null, ENV), { ok: false, reason: "missing" });
  assert.deepEqual(checkBasicAuth(undefined, ENV), { ok: false, reason: "missing" });
  assert.deepEqual(checkBasicAuth("", ENV), { ok: false, reason: "missing" });
});

test("a wrong secret is refused as wrong, including near misses", () => {
  for (const password of ["wrong", `${SECRET}x`, SECRET.slice(0, -1), "", ` ${SECRET}`]) {
    assert.deepEqual(checkBasicAuth(basic(`u:${password}`), ENV), { ok: false, reason: "wrong_secret" });
  }
});

test("malformed values are refused as malformed", () => {
  const token = Buffer.from(`u:${SECRET}`).toString("base64");
  assert.ok(token.endsWith("="), "the fixture needs a padded token");
  const cases = {
    "another scheme": `Bearer ${token}`,
    "no token": "Basic",
    "scheme only with space": "Basic ",
    "bare token": token,
    "two tokens": `Basic ${token} ${token}`,
    "no colon in payload": basic(SECRET),
    "invalid base64 characters": "Basic dXNlcjpw*XNz",
    "base64 without its padding": `Basic ${token.replace(/=+$/, "")}`,
    "padding in the middle": `Basic ${token.slice(0, 4)}=${token.slice(5)}`,
    "invalid UTF-8": `Basic ${Buffer.from([0x75, 0x3a, 0xff, 0xfe, 0xfd]).toString("base64")}`,
  };
  for (const [name, value] of Object.entries(cases)) {
    assert.deepEqual(checkBasicAuth(value, ENV), { ok: false, reason: "malformed" }, name);
  }
});

test("an unset or invalid configured secret refuses every request and names only the variable", () => {
  for (const env of [{}, { QAFORGE_OWNER_SECRET: "" }, { QAFORGE_OWNER_SECRET: "short-canary" }]) {
    const result = checkBasicAuth(basic(`u:${env.QAFORGE_OWNER_SECRET ?? ""}`), env);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.reason === "not_configured");
    assert.equal(result.error.variable, "QAFORGE_OWNER_SECRET");
    assert.equal(JSON.stringify(result).includes("canary"), false);
  }
});

test("refusalResponse lets a passed check through", () => {
  assert.equal(refusalResponse({ ok: true }), undefined);
});

test("refusalResponse challenges a missing, malformed or wrong credential with a 401", async () => {
  for (const reason of ["missing", "malformed", "wrong_secret"] as const) {
    const response = refusalResponse({ ok: false, reason });
    assert.ok(response);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("WWW-Authenticate"), BASIC_CHALLENGE);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(await response.text(), "Authentication required.");
  }
});

test("refusalResponse fails closed on a misconfigured secret without a challenge or detail", async () => {
  const response = refusalResponse({
    ok: false,
    reason: "not_configured",
    error: { variable: "QAFORGE_OWNER_SECRET", problem: "required" },
  });
  assert.ok(response);
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("WWW-Authenticate"), null);
  const body = await response.text();
  assert.equal(body.includes("QAFORGE"), false);
});

const refused = (reason: "origin_missing" | "origin_null" | "origin_foreign") => ({ ok: false, reason });

test("checkOrigin never refuses GET or HEAD, whatever the Origin", () => {
  for (const method of ["GET", "get", "HEAD"]) {
    assert.deepEqual(checkOrigin(method, new Headers()), { ok: true }, method);
    assert.deepEqual(checkOrigin(method, new Headers({ origin: "https://evil.example" })), { ok: true }, method);
  }
});

test("checkOrigin checks every other method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.deepEqual(checkOrigin(method, new Headers({ host: "qaforge.example" })), refused("origin_missing"), method);
  }
});

test("a POST with no, an empty or a null Origin is refused", () => {
  const host = { host: "qaforge.example" };
  assert.deepEqual(checkOrigin("POST", new Headers(host)), refused("origin_missing"));
  assert.deepEqual(checkOrigin("POST", new Headers({ ...host, origin: "" })), refused("origin_missing"));
  assert.deepEqual(checkOrigin("POST", new Headers({ ...host, origin: "null" })), refused("origin_null"));
});

test("a POST from the app's own origin passes, with or without a port and in any case", () => {
  const same: Array<[string, string]> = [
    ["https://qaforge.example", "qaforge.example"],
    ["http://localhost:3000", "localhost:3000"],
    ["https://QAFORGE.example", "qaforge.example"],
    ["https://qaforge.example", "QaForge.Example"],
  ];
  for (const [origin, host] of same) {
    assert.deepEqual(checkOrigin("POST", new Headers({ origin, host })), { ok: true }, `${origin} vs ${host}`);
  }
});

test("a POST from another host, another port or an unparseable Origin is refused", () => {
  const foreign: Array<[string, string]> = [
    ["https://evil.example", "qaforge.example"],
    ["http://localhost:3001", "localhost:3000"],
    ["https://qaforge.example.evil.example", "qaforge.example"],
    ["https://qaforge.example@evil.example", "qaforge.example"],
    ["not a url", "qaforge.example"],
  ];
  for (const [origin, host] of foreign) {
    assert.deepEqual(checkOrigin("POST", new Headers({ origin, host })), refused("origin_foreign"), `${origin} vs ${host}`);
  }
});

test("the app host is the first x-forwarded-host value, else host, and an unknown host refuses", () => {
  const origin = "https://qaforge.example";
  const ok = { ok: true };
  assert.deepEqual(
    checkOrigin("POST", new Headers({ origin, "x-forwarded-host": "qaforge.example, proxy.internal", host: "internal:3000" })),
    ok,
    "first forwarded value wins over host",
  );
  assert.deepEqual(
    checkOrigin("POST", new Headers({ origin, "x-forwarded-host": "evil.example", host: "qaforge.example" })),
    refused("origin_foreign"),
    "a forwarded host that differs from the Origin refuses even when host matches",
  );
  assert.deepEqual(
    checkOrigin("POST", new Headers({ origin, "x-forwarded-host": "", host: "qaforge.example" })),
    ok,
    "an empty forwarded value falls back to host",
  );
  assert.deepEqual(checkOrigin("POST", new Headers({ origin })), refused("origin_foreign"), "no host at all");
  // A host-less Origin and an unknown app host are both "", which must not count as a match.
  assert.deepEqual(
    checkOrigin("POST", new Headers({ origin: "file:///x" })),
    refused("origin_foreign"),
    "no host and a host-less origin",
  );
});
