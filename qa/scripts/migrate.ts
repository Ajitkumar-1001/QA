/**
 * The migration command: `pnpm db:migrate:dry` rolls back, `pnpm db:migrate` applies.
 * It runs only when someone runs it, never on app start or during `next build`.
 * It reads DATABASE_URL from the environment and prints migration names, never the URL.
 */
import { Client } from "pg";
import { parseDatabaseUrl } from "../src/lib/config.ts";
import { databasePassword } from "../src/lib/db/client.ts";
import { loadMigrations, migrate } from "../src/lib/db/migrate.ts";
import { createLogger } from "../src/lib/log.ts";

const dryRun = process.argv.includes("--dry-run");

const parsed = parseDatabaseUrl(process.env);
if (!parsed.ok) {
  console.error(`${parsed.error.variable}: ${parsed.error.problem}`);
  process.exit(1);
}

// A driver error can quote the password alone, so it is a secret of its own.
const log = createLogger({
  secrets: [parsed.url, databasePassword(parsed.url)],
  write: (line) => console.error(line),
});
const client = new Client({ connectionString: parsed.url });

try {
  await client.connect();
  const result = await migrate(client, loadMigrations(), { dryRun });
  const list = (names: string[]) => (names.length > 0 ? names.join(", ") : "none");
  console.log(
    `${dryRun ? "Dry run, rolled back" : "Applied"}: ${list(result.applied)}. Already applied: ${list(result.skipped)}.`,
  );
} catch (error) {
  log.error("migration_failed", { dryRun }, error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
