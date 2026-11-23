import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate, type Migration } from "./migrate.ts";

const first: Migration = { name: "0001_a.sql", sql: "CREATE TABLE a (id int)" };
// Two statements in one file, so the multi-statement path runs too.
const second: Migration = { name: "0002_b.sql", sql: "CREATE TABLE b (id int); CREATE TABLE c (id int)" };

async function tables(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
  );
  return rows.map((row) => row.table_name);
}

test("a dry run applies the SQL, reports it, and leaves nothing behind", async () => {
  const db = await PGlite.create();
  const result = await migrate(db, [first, second], { dryRun: true });
  assert.deepEqual(result, { applied: [first.name, second.name], skipped: [], dryRun: true });
  assert.deepEqual(await tables(db), []);
});

test("an applied migration is recorded, and a second run skips it", async () => {
  const db = await PGlite.create();
  await migrate(db, [first], { dryRun: false });
  const result = await migrate(db, [first, second], { dryRun: false });
  assert.deepEqual(result, { applied: [second.name], skipped: [first.name], dryRun: false });
  assert.deepEqual(await tables(db), ["a", "b", "c", "schema_migrations"]);
});

test("a failing migration rolls back the whole run, earlier files included, and rethrows", async () => {
  const db = await PGlite.create();
  const clash: Migration = { name: "0002_clash.sql", sql: "CREATE TABLE a (id int)" };
  await assert.rejects(migrate(db, [first, clash], { dryRun: false }));
  assert.deepEqual(await tables(db), []);
  // The connection is still usable, and the first file applies cleanly afterwards.
  assert.deepEqual((await migrate(db, [first], { dryRun: false })).applied, [first.name]);
});
