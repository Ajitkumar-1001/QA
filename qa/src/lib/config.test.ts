import test from "node:test";
import assert from "node:assert/strict";
import { MAX_CONCURRENCY_CAP } from "./run/caps.ts";
import {
  DEFAULT_CONCURRENCY_CAP,
  DEFAULT_MONTHLY_RUN_CAP,
  DEFAULT_OBJECTIVE,
  DEFAULT_TARGET_URL,
  parseServerConfig,
  resolveRunTarget,
} from "./config.ts";

const VALID_SECRET = "a".repeat(32);

function validEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    QAFORGE_OWNER_SECRET: VALID_SECRET,
    ...overrides,
  };
}

test("parseServerConfig accepts required secret and applies defaults", () => {
  const result = parseServerConfig(validEnv());
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.config, {
    ownerSecret: VALID_SECRET,
    targetUrl: DEFAULT_TARGET_URL,
    objective: DEFAULT_OBJECTIVE,
    monthlyRunCap: DEFAULT_MONTHLY_RUN_CAP,
    concurrencyCap: DEFAULT_CONCURRENCY_CAP,
  });
});

test("parseServerConfig accepts explicit valid overrides", () => {
  const result = parseServerConfig(
    validEnv({
      QAFORGE_TARGET_URL: "https://example.com/app",
      QAFORGE_OBJECTIVE: "click the save button",
      QAFORGE_MONTHLY_RUN_CAP: "0",
      QAFORGE_CONCURRENCY_CAP: String(MAX_CONCURRENCY_CAP),
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.config.targetUrl, "https://example.com/app");
  assert.equal(result.config.objective, "click the save button");
  assert.equal(result.config.monthlyRunCap, 0);
  assert.equal(result.config.concurrencyCap, MAX_CONCURRENCY_CAP);
});

test("parseServerConfig rejects whitespace-only owner secret", () => {
  for (const secret of ["", "   ", "\t\n"]) {
    const result = parseServerConfig(validEnv({ QAFORGE_OWNER_SECRET: secret }));
    assert.equal(result.ok, false, JSON.stringify(secret));
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.variable === "QAFORGE_OWNER_SECRET"));
    const serialized = JSON.stringify(result.errors);
    assert.equal(serialized.includes(secret.trim() ? secret : "   "), false);
  }
});

test("parseServerConfig rejects owner secret that is long but under 32 after trim", () => {
  const padded = `  ${"a".repeat(30)}  `;
  assert.ok(padded.trim().length < 32);
  const result = parseServerConfig(validEnv({ QAFORGE_OWNER_SECRET: padded }));
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.ok(result.errors.some((e) => e.variable === "QAFORGE_OWNER_SECRET"));
  const serialized = JSON.stringify(result.errors);
  assert.equal(serialized.includes(padded), false);
  assert.equal(serialized.includes("a".repeat(30)), false);
});

test("parseServerConfig stores trimmed owner secret when padding surrounds a valid secret", () => {
  const secret = `  ${VALID_SECRET}  `;
  const result = parseServerConfig(validEnv({ QAFORGE_OWNER_SECRET: secret }));
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.config.ownerSecret, VALID_SECRET);
});

test("parseServerConfig rejects leading-zero cap integers 08 and 007", () => {
  for (const bad of ["08", "007"]) {
    const monthly = parseServerConfig(validEnv({ QAFORGE_MONTHLY_RUN_CAP: bad }));
    assert.equal(monthly.ok, false, `monthly:${bad}`);
    assert.ok(!monthly.ok);
    assert.ok(monthly.errors.some((e) => e.variable === "QAFORGE_MONTHLY_RUN_CAP"));

    const concurrency = parseServerConfig(validEnv({ QAFORGE_CONCURRENCY_CAP: bad }));
    assert.equal(concurrency.ok, false, `concurrency:${bad}`);
    assert.ok(!concurrency.ok);
    assert.ok(
      concurrency.errors.some((e) => e.variable === "QAFORGE_CONCURRENCY_CAP"),
    );
  }
});

test("parseServerConfig accepts cap value zero", () => {
  const result = parseServerConfig(
    validEnv({
      QAFORGE_MONTHLY_RUN_CAP: "0",
      QAFORGE_CONCURRENCY_CAP: "0",
    }),
  );
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.config.monthlyRunCap, 0);
  assert.equal(result.config.concurrencyCap, 0);
});

test("parseServerConfig requires a secret of at least 32 characters", () => {
  const missing = parseServerConfig({});
  assert.equal(missing.ok, false);
  assert.ok(!missing.ok);
  assert.ok(missing.errors.some((e) => e.variable === "QAFORGE_OWNER_SECRET"));

  const short = parseServerConfig(validEnv({ QAFORGE_OWNER_SECRET: "too-short" }));
  assert.equal(short.ok, false);
  assert.ok(!short.ok);
  assert.ok(short.errors.some((e) => e.variable === "QAFORGE_OWNER_SECRET"));
});

test("parseServerConfig never includes a bad secret value in errors", () => {
  const badSecret = "BAD_SECRET_LEAK_ME_VALUE";
  assert.ok(badSecret.length < 32);
  const result = parseServerConfig(validEnv({ QAFORGE_OWNER_SECRET: badSecret }));
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  const serialized = JSON.stringify(result.errors);
  assert.equal(serialized.includes(badSecret), false);
  assert.equal(serialized.includes("LEAK_ME"), false);
  for (const error of result.errors) {
    assert.equal(Object.keys(error).sort().join(","), "problem,variable");
    assert.equal(typeof error.variable, "string");
    assert.equal(typeof error.problem, "string");
  }
});
test("parseServerConfig requires an https target URL", () => {
  for (const url of ["http://example.com", "ftp://example.com", "not-a-url", ""]) {
    const result = parseServerConfig(validEnv({ QAFORGE_TARGET_URL: url }));
    assert.equal(result.ok, false, url);
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.variable === "QAFORGE_TARGET_URL"));
  }
});

test("parseServerConfig rejects target URLs that contain credentials", () => {
  for (const url of [
    "https://user:pass@example.com/app",
    "https://user@example.com/app",
  ]) {
    const result = parseServerConfig(validEnv({ QAFORGE_TARGET_URL: url }));
    assert.equal(result.ok, false, url);
    assert.ok(!result.ok);
    const targetErrors = result.errors.filter(
      (e) => e.variable === "QAFORGE_TARGET_URL",
    );
    assert.ok(targetErrors.length > 0, url);
    for (const error of targetErrors) {
      assert.equal(error.problem, "must not contain credentials");
    }
    const serialized = JSON.stringify(result.errors);
    assert.equal(serialized.includes(url), false);
    assert.equal(serialized.includes("user"), false);
    assert.equal(serialized.includes("pass"), false);
  }
});

test("parseServerConfig rejects objective outside 1..1000 characters", () => {
  assert.equal(parseServerConfig(validEnv({ QAFORGE_OBJECTIVE: "" })).ok, false);
  assert.equal(
    parseServerConfig(validEnv({ QAFORGE_OBJECTIVE: "x".repeat(1001) })).ok,
    false,
  );
});

test("parseServerConfig parses cap integers strictly", () => {
  for (const bad of ["2.5", "abc", " 3", "-1", "3e1", "+2"]) {
    assert.equal(
      parseServerConfig(validEnv({ QAFORGE_MONTHLY_RUN_CAP: bad })).ok,
      false,
      `monthly:${bad}`,
    );
    assert.equal(
      parseServerConfig(validEnv({ QAFORGE_CONCURRENCY_CAP: bad })).ok,
      false,
      `concurrency:${bad}`,
    );
  }

  const overCap = parseServerConfig(
    validEnv({ QAFORGE_CONCURRENCY_CAP: String(MAX_CONCURRENCY_CAP + 1) }),
  );
  assert.equal(overCap.ok, false);
  assert.ok(!overCap.ok);
  assert.ok(overCap.errors.some((e) => e.variable === "QAFORGE_CONCURRENCY_CAP"));
});

test("parseServerConfig rejects cap values above Number.MAX_SAFE_INTEGER", () => {
  const unsafe = "9007199254740993";
  const monthly = parseServerConfig(validEnv({ QAFORGE_MONTHLY_RUN_CAP: unsafe }));
  assert.equal(monthly.ok, false);
  assert.ok(!monthly.ok);
  assert.ok(
    monthly.errors.some(
      (e) =>
        e.variable === "QAFORGE_MONTHLY_RUN_CAP" &&
        e.problem === "must be a safe integer",
    ),
  );

  const concurrency = parseServerConfig(
    validEnv({ QAFORGE_CONCURRENCY_CAP: unsafe }),
  );
  assert.equal(concurrency.ok, false);
  assert.ok(!concurrency.ok);
  assert.ok(
    concurrency.errors.some(
      (e) =>
        e.variable === "QAFORGE_CONCURRENCY_CAP" &&
        e.problem === "must be a safe integer",
    ),
  );
});

// FR-002: client-supplied URL and objective are ignored.
test("resolveRunTarget returns only the configured target and objective", () => {
  const parsed = parseServerConfig(
    validEnv({
      QAFORGE_TARGET_URL: "https://example.com/app",
      QAFORGE_OBJECTIVE: "click the save button",
    }),
  );
  assert.ok(parsed.ok);
  const resolved = resolveRunTarget(parsed.config);
  assert.deepEqual(resolved, {
    targetUrl: "https://example.com/app",
    objective: "click the save button",
  });
});
