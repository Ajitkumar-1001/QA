/**
 * The connection pool for the app's own queries. It imports the driver, so only route
 * code, the `db:migrate` script and the `test:db` lane load it; `pnpm test` never does
 * (K4). The pool opens no connection until the first query.
 */
import { Client, Pool } from "pg";
import type { Logger } from "../log.ts";

/**
 * The password pg itself resolves for `url`: the exact value a driver error could quote,
 * so the value to redact. Decoding the URL's password by hand throws on a bare `%` and
 * differs from pg when the URL holds a space.
 *
 * It trims `url` like `parseDatabaseUrl` does, because the pool connects with the trimmed
 * value; a padded env value would otherwise hide the wrong string. pg falls back to
 * PGPASSWORD when the URL has no password, and that value is returned too. A pgpass file
 * is read only at connect time, so a password from it is not seen here.
 *
 * Never throws: a URL pg cannot parse has no password to hide beyond the URL, which
 * callers already treat as a secret.
 */
export function databasePassword(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    // ponytail: reads `Client.password`, which pg sets from its own parse; client.dbtest.ts pins it.
    return new Client({ connectionString: url.trim() }).password || undefined;
  } catch {
    return undefined;
  }
}

export function createPool(url: string, log: Logger): Pool {
  // ponytail: a small pool per instance; raise `max` if a measured load needs it.
  const pool = new Pool({ connectionString: url, max: 3 });
  // An idle client's error would otherwise crash the process, so it goes to the log, redacted.
  pool.on("error", (error) => log.error("db_pool_error", {}, error));
  return pool;
}
