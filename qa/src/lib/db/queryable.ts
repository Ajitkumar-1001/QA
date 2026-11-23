/**
 * The one database call the repository and the migrator need. pg's Pool and Client
 * and PGlite all fit it, so the same code runs on Neon and in the database tests.
 */
export type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** PGlite runs several statements through `exec`; pg's `query` already accepts them. */
  exec?(sql: string): Promise<unknown>;
};
