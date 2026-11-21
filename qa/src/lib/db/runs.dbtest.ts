import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { createLogger } from "../log.ts";
import { REASON_CODES, RUN_STATUSES, VERDICTS } from "../run/status.ts";
import { reapRun } from "../run/lease.ts";
import { FIXTURES, HOUR_MS, NOW, WINDOW_MS, at, type Seed } from "./reaper-fixtures.ts";
import { createRunsRepo } from "./runs.ts";
import { freshDb } from "./test-db.ts";

let db: PGlite;
let lines: string[];
let repo: ReturnType<typeof createRunsRepo>;

before(async () => {
  db = await freshDb();
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.query("DELETE FROM runs");
  lines = [];
  repo = createRunsRepo({ db, log: createLogger({ secrets: [], write: (line) => lines.push(line) }) });
});

/** Inserts a row as given, bypassing the repository, so a test can build any state. */
async function seed(s: Seed): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO runs (target_url, objective, status, verdict, reason_code, created_at, lease_expires_at, finished_at)
     VALUES ('https://example.com', 'objective', $1, $2, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz)
     RETURNING id`,
    [
      s.status,
      s.verdict ?? null,
      s.reason ?? null,
      s.createdAt.toISOString(),
      s.leaseExpiresAt?.toISOString() ?? null,
      s.finishedAt?.toISOString() ?? null,
    ],
  );
  const row = rows[0];
  assert.ok(row);
  return row.id;
}

async function snapshot(id: string): Promise<unknown> {
  const { rows } = await db.query("SELECT * FROM runs WHERE id = $1", [id]);
  return rows[0];
}

test("insertQueuedRun stores a queued run with the given time and returns its id", async () => {
  const { id } = await repo.insertQueuedRun({
    targetUrl: "https://example.com/app",
    objective: "click save",
    createdAt: NOW,
  });
  assert.deepEqual(await repo.getRun(id), {
    id,
    targetUrl: "https://example.com/app",
    objective: "click save",
    status: "queued",
    verdict: null,
    reasonCode: null,
    createdAt: NOW,
    startedAt: null,
    leaseExpiresAt: null,
    finishedAt: null,
  });
});

test("getRun returns null for an unknown run and for an id that is not a uuid", async () => {
  assert.equal(await repo.getRun("00000000-0000-4000-8000-000000000000"), null);
  for (const id of ["not-a-uuid", "", "../x", "1; DROP TABLE runs"]) {
    assert.equal(await repo.getRun(id), null, id);
  }
});

test("countRunsSince counts runs created at or after the boundary", async () => {
  for (const offset of [-1000, 0, 1000]) {
    await repo.insertQueuedRun({ targetUrl: "https://example.com", objective: "o", createdAt: at(offset) });
  }
  assert.equal(await repo.countRunsSince(at(-2000)), 3);
  assert.equal(await repo.countRunsSince(at(0)), 2, "a run created exactly at the boundary counts");
  assert.equal(await repo.countRunsSince(at(1)), 1);
  assert.equal(await repo.countRunsSince(at(2000)), 0);
});

test("countActiveRuns counts queued and running runs, never done ones", async () => {
  assert.equal(await repo.countActiveRuns(), 0);
  await seed({ status: "queued", createdAt: NOW });
  await seed({ status: "running", createdAt: NOW, leaseExpiresAt: at(60_000) });
  await seed({ status: "done", createdAt: NOW, verdict: "PASS", finishedAt: NOW });
  assert.equal(await repo.countActiveRuns(), 2);
});

test("the table refuses a verdict, reason or finish time that does not match the status", async () => {
  const refused: Array<[string, Seed]> = [
    ["done without a verdict", { status: "done", createdAt: NOW, finishedAt: NOW }],
    ["a verdict on a queued run", { status: "queued", createdAt: NOW, verdict: "PASS" }],
    ["a reason on a PASS", { status: "done", createdAt: NOW, verdict: "PASS", reason: "model_error", finishedAt: NOW }],
    ["INCONCLUSIVE without a reason", { status: "done", createdAt: NOW, verdict: "INCONCLUSIVE", finishedAt: NOW }],
    ["a reason on a running run", { status: "running", createdAt: NOW, reason: "model_error" }],
    ["done without a finish time", { status: "done", createdAt: NOW, verdict: "PASS" }],
    ["a finish time on a queued run", { status: "queued", createdAt: NOW, finishedAt: NOW }],
    ["an unknown status", { status: "paused", createdAt: NOW }],
    ["an unknown reason", { status: "done", createdAt: NOW, verdict: "INCONCLUSIVE", reason: "unknown_code", finishedAt: NOW }],
  ];
  for (const [name, row] of refused) {
    await assert.rejects(seed(row), name);
  }
  assert.equal(await repo.countActiveRuns(), 0);
});

test("the table's allowed lists are exactly the lists in status.ts", async () => {
  const { rows } = await db.query<{ def: string }>(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'runs'::regclass AND contype = 'c'",
  );
  const allowed = (column: string): string[] => {
    const def = rows.map((row) => row.def).find((d) => d.startsWith(`CHECK ((${column} = ANY`));
    assert.ok(def, `no list constraint on ${column}`);
    return [...def.matchAll(/'([^']+)'::text/g)].map((match) => match[1] ?? "").sort();
  };
  assert.deepEqual(allowed("status"), [...RUN_STATUSES].sort());
  assert.deepEqual(allowed("verdict"), [...VERDICTS].sort());
  assert.deepEqual(allowed("reason_code"), [...REASON_CODES].sort());
});

test("reapStaleRuns ends exactly the runs FR-025 says it ends, and leaves every other row untouched", async () => {
  const ids = new Map<string, string>();
  const before = new Map<string, unknown>();
  for (const fixture of FIXTURES) {
    const id = await seed(fixture.run);
    ids.set(fixture.name, id);
    before.set(fixture.name, await snapshot(id));
  }

  const result = await repo.reapStaleRuns(NOW, WINDOW_MS);

  assert.deepEqual(result, {
    leaseExpired: FIXTURES.filter((f) => f.becomes === "lease_expired").length,
    neverStarted: FIXTURES.filter((f) => f.becomes === "never_started").length,
  });
  for (const fixture of FIXTURES) {
    const id = ids.get(fixture.name);
    assert.ok(id);
    const after = await repo.getRun(id);
    assert.ok(after);
    if (fixture.becomes === null) {
      assert.deepEqual(await snapshot(id), before.get(fixture.name), `${fixture.name} must be unchanged`);
    } else {
      assert.equal(after.status, "done", fixture.name);
      assert.equal(after.verdict, "INCONCLUSIVE", fixture.name);
      assert.equal(after.reasonCode, fixture.becomes, fixture.name);
      assert.deepEqual(after.finishedAt, NOW, fixture.name);
    }
  }
});

test("the SQL reaper agrees with reapRun on every fixture, and leaves a row reapRun refuses unchanged", async () => {
  const seeded = new Map<string, { id: string; before: unknown }>();
  for (const fixture of FIXTURES) {
    const id = await seed(fixture.run);
    seeded.set(fixture.name, { id, before: await snapshot(id) });
  }

  await repo.reapStaleRuns(NOW, WINDOW_MS);

  let reaped = 0;
  let refused = 0;
  for (const fixture of FIXTURES) {
    const entry = seeded.get(fixture.name);
    assert.ok(entry);
    const expected = reapRun(
      { status: fixture.run.status, createdAt: fixture.run.createdAt, leaseExpiresAt: fixture.run.leaseExpiresAt ?? undefined },
      NOW,
    );
    if (expected.ok) {
      reaped += 1;
      const row = await repo.getRun(entry.id);
      assert.ok(row);
      assert.equal(row.status, expected.run.status, fixture.name);
      assert.equal(row.verdict, expected.run.verdict, fixture.name);
      assert.equal(row.reasonCode, expected.run.reasonCode, fixture.name);
    } else {
      refused += 1;
      assert.deepEqual(await snapshot(entry.id), entry.before, `${fixture.name}: reapRun refuses it, so the row must not change`);
    }
  }
  assert.ok(reaped > 0 && refused > 0, "both outcomes must occur, or the comparison proves nothing");
});

test("reapStaleRuns logs run_reaped with the reason and the age, and a second pass does nothing", async () => {
  const stale = await seed({ status: "queued", createdAt: at(-HOUR_MS) });
  const lapsed = await seed({ status: "running", createdAt: at(-90_000), leaseExpiresAt: at(-1) });
  await repo.reapStaleRuns(NOW, WINDOW_MS);
  const logged = lines.map((line) => JSON.parse(line));
  assert.deepEqual(
    logged.sort((a, b) => String(a.runId).localeCompare(String(b.runId))),
    [
      { runId: stale, reason: "never_started", ageMs: HOUR_MS, level: "info", event: "run_reaped" },
      { runId: lapsed, reason: "lease_expired", ageMs: 90_000, level: "info", event: "run_reaped" },
    ].sort((a, b) => a.runId.localeCompare(b.runId)),
  );

  lines.length = 0;
  assert.deepEqual(await repo.reapStaleRuns(NOW, WINDOW_MS), { leaseExpired: 0, neverStarted: 0 });
  assert.deepEqual(lines, []);
});
