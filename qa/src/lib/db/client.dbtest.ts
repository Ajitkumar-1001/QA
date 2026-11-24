import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../log.ts";
import { databasePassword } from "./client.ts";

// pg reads PGPASSWORD, PGSSLNEGOTIATION and the other PG* variables when it builds a
// client, so an exported one changes or breaks these cases. Remove them for this file.
const savedEnv: Record<string, string | undefined> = {};
before(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("PG")) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }
});
after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) process.env[key] = value;
  }
});

// What `pg` itself resolves from each URL (probed against pg 8.23.1, and against the bytes
// it sends to a fake server). It is the exact value a driver error could quote, so it is
// the value to redact. `decodeURIComponent` throws on four of these and returns something
// else for two.
const CASES: ReadonlyArray<readonly [label: string, url: string, expected: string | undefined]> = [
  ["plain", "postgres://u:plain@h/db", "plain"],
  ["a valid escape", "postgres://u:p%41ss@h/db", "pAss"],
  ["an encoded @", "postgres://u:p%40ss@h/db", "p@ss"],
  ["a bare % before letters", "postgres://u:p%ss@h/db", "p%ss"],
  ["an invalid escape", "postgres://u:p%zz@h/db", "p%zz"],
  ["a trailing %", "postgres://u:pass%@h/db", "pass%"],
  ["a valid and an invalid escape", "postgres://u:a%41%zz@h/db", "aA%zz"],
  // pg re-encodes the whole URL when it holds a space, which leaves a hex-letter escape literal.
  ["a clean password and a space elsewhere in the URL", "postgres://u:a%2Fb@h/my db", "a%2Fb"],
  ["no password", "postgres://u@h/db", undefined],
  ["an empty password", "postgres://u:@h/db", undefined],
  // The pool connects with the trimmed value (parseDatabaseUrl), so these must match it.
  ["a leading space", " postgres://u:plain@h/db", "plain"],
  ["a leading space and a valid escape", " postgres://u:p%41ss@h/db", "pAss"],
  ["a trailing space and a hex-letter escape", "postgres://u:a%2Fb@h/db ", "a/b"],
  ["a trailing space and several hex-letter escapes", "postgres://u:Xy%2FQ%2B9%3D%3D@h/db  ", "Xy/Q+9=="],
  ["padding on both sides, with a bare %", "  postgres://u:p%ss@h/db\n", "p%ss"],
];

for (const [label, url, expected] of CASES) {
  test(`databasePassword returns the password pg resolves: ${label}`, () => {
    assert.equal(databasePassword(url), expected);
  });
}

test("databasePassword returns undefined and never throws for an unset or unusable URL", () => {
  const unusable = [
    undefined,
    "",
    "garbage",
    "postgres://",
    "://",
    // These make the pg Client constructor itself throw, so they reach the catch branch.
    "postgres://u:pw@h:99999/db",
    "postgres://u:pw@[::1/db",
    "postgres://u:pw@h/db?sslrootcert=/nonexistent/x.pem",
  ];
  for (const url of unusable) {
    assert.equal(databasePassword(url), undefined, `value: ${String(url)}`);
  }
});

test("databasePassword returns PGPASSWORD when the URL has no password, and the URL's password wins", () => {
  process.env.PGPASSWORD = "from-env";
  try {
    assert.equal(databasePassword("postgres://u@h/db"), "from-env");
    assert.equal(databasePassword("postgres://u:from-url@h/db"), "from-url");
  } finally {
    delete process.env.PGPASSWORD;
  }
});

test("a log line hides a password that decodeURIComponent cannot decode", () => {
  const url = "postgres://u:p%ss@h/db";
  const lines: string[] = [];
  const log = createLogger({ secrets: [url, databasePassword(url)], write: (line) => lines.push(line) });
  // A driver error can quote the password alone, without the URL around it.
  log.error("db_error", {}, new Error('password authentication failed for "p%ss"'));
  assert.equal(lines.length, 1);
  assert.ok(!lines[0]?.includes("p%ss"), "the password reached the log line");
});
