/**
 * A fresh in-memory Postgres (PGlite) with every committed migration applied.
 * For `*.dbtest.ts` files only: it never reaches a real database.
 */
import { PGlite } from "@electric-sql/pglite";
import { loadMigrations, migrate } from "./migrate.ts";

export async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create();
  await migrate(db, loadMigrations(), { dryRun: false });
  return db;
}
