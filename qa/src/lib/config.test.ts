import test from "node:test";
import assert from "node:assert/strict";
import { MAX_CONCURRENCY_CAP } from "./run/caps.ts";
import {
  DEFAULT_CONCURRENCY_CAP,
  DEFAULT_MONTHLY_RUN_CAP,
  DEFAULT_OBJECTIVE,
  DEFAULT_TARGET_URL,
  parseDatabaseUrl,
  parseOwnerSecret,
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
    if (secret !== "") {
      assert.equal(serialized.includes(secret), false);
    }
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

test("parseOwnerSecret applies the same rule as parseServerConfig and reads no other variable", () => {
  assert.deepEqual(parseOwnerSecret({ QAFORGE_OWNER_SECRET: `  ${VALID_SECRET}  ` }), {
    ok: true,
    secret: VALID_SECRET,
  });
  // A bad cap does not break the gate: only the secret is read.
  assert.equal(
    parseOwnerSecret({ QAFORGE_OWNER_SECRET: VALID_SECRET, QAFORGE_MONTHLY_RUN_CAP: "nope" }).ok,
    true,
  );
});

test("parseOwnerSecret refuses an unset, blank or short secret and never echoes it", () => {
  const short = "short-canary-secret";
  for (const value of [undefined, "", "   ", short, ` ${"b".repeat(31)} `]) {
    const result = parseOwnerSecret({ QAFORGE_OWNER_SECRET: value });
    assert.equal(result.ok, false, `accepted ${JSON.stringify(value)}`);
    assert.ok(!result.ok);
    assert.equal(result.error.variable, "QAFORGE_OWNER_SECRET");
    assert.equal(JSON.stringify(result).includes("canary"), false);
  }
  const unset = parseOwnerSecret({});
  assert.ok(!unset.ok);
  assert.equal(unset.error.problem, "required");
});

test("parseDatabaseUrl accepts a postgres or postgresql URL and trims it", () => {
  for (const url of [
    "postgres://user:pw@db.example.com/app",
    "postgresql://user:pw@db.example.com:5432/app?sslmode=require",
    "postgresql://localhost/app",
  ]) {
    assert.deepEqual(parseDatabaseUrl({ DATABASE_URL: `  ${url}\n` }), { ok: true, url });
  }
});

test("parseDatabaseUrl reads only DATABASE_URL, so the other settings cannot break it", () => {
  const env = {
    DATABASE_URL: "postgres://user:pw@db.example.com/app",
    QAFORGE_OWNER_SECRET: "short",
    QAFORGE_MONTHLY_RUN_CAP: "nope",
  };
  assert.equal(parseDatabaseUrl(env).ok, true);
  // ...and the server config does not read it.
  assert.equal(
    parseServerConfig({ QAFORGE_OWNER_SECRET: VALID_SECRET, DATABASE_URL: "garbage" }).ok,
    true,
  );
});

test("parseDatabaseUrl refuses an unset, blank, wrong-scheme or host-less value and never echoes it", () => {
  const canary = "canary-password";
  const refused: Array<string | undefined> = [
    undefined,
    "",
    "   ",
    `mysql://user:${canary}@db.example.com/app`,
    `https://user:${canary}@db.example.com/app`,
    `postgres://user:${canary}@/app`,
    // Parses as a URL but names no host: libpq would read it as a local socket.
    `postgres:///app?password=${canary}`,
    `user:${canary}@db.example.com/app`,
    `not a url ${canary}`,
  ];
  for (const value of refused) {
    const result = parseDatabaseUrl({ DATABASE_URL: value });
    assert.equal(result.ok, false, `accepted ${JSON.stringify(value)}`);
    assert.ok(!result.ok);
    assert.equal(result.error.variable, "DATABASE_URL");
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
  const unset = parseDatabaseUrl({});
  assert.ok(!unset.ok);
  assert.equal(unset.error.problem, "required");
  const wrong = parseDatabaseUrl({ DATABASE_URL: "mysql://u@h/db" });
  assert.ok(!wrong.ok);
  assert.equal(wrong.error.problem, "must be a postgres:// or postgresql:// URL");
});
