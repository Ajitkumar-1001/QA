/**
 * The connection pool for the app's own queries. It imports the driver, so only route
 * code loads it and no test does (K4). The pool opens no connection until the first query.
 */
import { Pool } from "pg";
import type { Logger } from "../log.ts";

export function createPool(url: string, log: Logger): Pool {
  // ponytail: a small pool per instance; raise `max` if a measured load needs it.
  const pool = new Pool({ connectionString: url, max: 3 });
  // An idle client's error would otherwise crash the process, so it goes to the log, redacted.
  pool.on("error", (error) => log.error("db_pool_error", {}, error));
  return pool;
}
