/**
 * Applies the committed SQL files in order, each once, all in one transaction.
 * Never runs on app start or during `next build`: only `scripts/migrate.ts` calls it.
 * `db` must be a single connection, since the transaction spans several queries.
 */
import { readdirSync, readFileSync } from "node:fs";
import type { Queryable } from "./queryable.ts";

export type Migration = { name: string; sql: string };
export type MigrateResult = { applied: string[]; skipped: string[]; dryRun: boolean };

const MIGRATIONS_DIR = new URL("../../../migrations/", import.meta.url);

/** The `.sql` files in the migrations folder, in name order. */
export function loadMigrations(dir: URL = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, dir), "utf8") }));
}

/**
 * A dry run applies everything inside the transaction and rolls it back, so it
 * proves the SQL runs against this database and leaves nothing behind.
 */
export async function migrate(
  db: Queryable,
  migrations: readonly Migration[],
  options: { dryRun: boolean },
): Promise<MigrateResult> {
  await db.query("BEGIN");
  try {
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await db.query("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((row) => String(row.name)));
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const migration of migrations) {
      if (done.has(migration.name)) {
        skipped.push(migration.name);
        continue;
      }
      await (db.exec ? db.exec(migration.sql) : db.query(migration.sql));
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      applied.push(migration.name);
    }
    await db.query(options.dryRun ? "ROLLBACK" : "COMMIT");
    return { applied, skipped, dryRun: options.dryRun };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
