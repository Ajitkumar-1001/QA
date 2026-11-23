/**
 * Stored runs (FR-002, FR-003, FR-004, FR-007, FR-025). The shapes of the methods
 * match the dependencies `startRun` takes. One clock: the caller's `now` sets
 * `created_at` and drives the reaper, so both read the same time.
 */
import { z } from "zod";
import type { Logger } from "../log.ts";
import { runIdSchema } from "../queue/start-message.ts";
import {
  REASON_CODES,
  RUN_STATUSES,
  VERDICTS,
  type ReasonCode,
  type RunStatus,
  type Verdict,
} from "../run/status.ts";
import type { Queryable } from "./queryable.ts";

const COLUMNS =
  "id, target_url, objective, status, verdict, reason_code, created_at, started_at, lease_expires_at, finished_at";

const rowSchema = z.object({
  id: runIdSchema,
  target_url: z.string(),
  objective: z.string(),
  status: z.enum(RUN_STATUSES),
  verdict: z.enum(VERDICTS).nullable(),
  reason_code: z.enum(REASON_CODES).nullable(),
  created_at: z.date(),
  started_at: z.date().nullable(),
  lease_expires_at: z.date().nullable(),
  finished_at: z.date().nullable(),
});

export type StoredRun = {
  id: string;
  targetUrl: string;
  objective: string;
  status: RunStatus;
  verdict: Verdict | null;
  reasonCode: ReasonCode | null;
  createdAt: Date;
  startedAt: Date | null;
  leaseExpiresAt: Date | null;
  finishedAt: Date | null;
};

export type ReapResult = { leaseExpired: number; neverStarted: number };

const countSchema = z.object({ n: z.number().int().nonnegative() });
const insertedSchema = z.object({ id: runIdSchema });
const reapedSchema = z.object({ id: runIdSchema, created_at: z.date() });

// A running run whose lease ended at or before now, or that has none, is closed whatever its age.
const REAP_LEASE_EXPIRED = `UPDATE runs
  SET status = 'done', verdict = 'INCONCLUSIVE', reason_code = 'lease_expired', finished_at = $1::timestamptz
  WHERE status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= $1::timestamptz)
  RETURNING id, created_at`;

// A queued run created at or before now minus the start window never started, whatever its lease.
const REAP_NEVER_STARTED = `UPDATE runs
  SET status = 'done', verdict = 'INCONCLUSIVE', reason_code = 'never_started', finished_at = $1::timestamptz
  WHERE status = 'queued' AND created_at <= $2::timestamptz
  RETURNING id, created_at`;

export function createRunsRepo(deps: { db: Queryable; log: Logger }) {
  const { db, log } = deps;

  async function count(text: string, params: unknown[] = []): Promise<number> {
    const { rows } = await db.query(text, params);
    return countSchema.parse(rows[0]).n;
  }

  async function reap(
    text: string,
    params: unknown[],
    reason: ReasonCode,
    now: Date,
  ): Promise<number> {
    const { rows } = await db.query(text, params);
    for (const row of rows) {
      const run = reapedSchema.parse(row);
      log.info("run_reaped", { runId: run.id, reason, ageMs: now.getTime() - run.created_at.getTime() });
    }
    return rows.length;
  }

  return {
    async insertQueuedRun(run: {
      targetUrl: string;
      objective: string;
      createdAt: Date;
    }): Promise<{ id: string }> {
      const { rows } = await db.query(
        "INSERT INTO runs (target_url, objective, status, created_at) VALUES ($1, $2, 'queued', $3::timestamptz) RETURNING id",
        [run.targetUrl, run.objective, run.createdAt.toISOString()],
      );
      return insertedSchema.parse(rows[0]);
    },

    /** Runs created at or after `since`. */
    countRunsSince: (since: Date): Promise<number> =>
      count("SELECT count(*)::int AS n FROM runs WHERE created_at >= $1::timestamptz", [
        since.toISOString(),
      ]),

    /** Runs in `queued` or `running`. */
    countActiveRuns: (): Promise<number> =>
      count("SELECT count(*)::int AS n FROM runs WHERE status IN ('queued', 'running')"),

    /** Null for an unknown run and for an id that is not a uuid; a database error still throws. */
    async getRun(id: string): Promise<StoredRun | null> {
      if (!runIdSchema.safeParse(id).success) return null;
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM runs WHERE id = $1`, [id]);
      const found = rows[0];
      if (found === undefined) return null;
      const row = rowSchema.parse(found);
      return {
        id: row.id,
        targetUrl: row.target_url,
        objective: row.objective,
        status: row.status,
        verdict: row.verdict,
        reasonCode: row.reason_code,
        createdAt: row.created_at,
        startedAt: row.started_at,
        leaseExpiresAt: row.lease_expires_at,
        finishedAt: row.finished_at,
      };
    },

    /** Ends stale runs as of `now`; a `done` run never changes (FR-024, FR-025). */
    async reapStaleRuns(now: Date, startWindowMs: number): Promise<ReapResult> {
      const cutoff = new Date(now.getTime() - startWindowMs);
      return {
        leaseExpired: await reap(REAP_LEASE_EXPIRED, [now.toISOString()], "lease_expired", now),
        neverStarted: await reap(
          REAP_NEVER_STARTED,
          [now.toISOString(), cutoff.toISOString()],
          "never_started",
          now,
        ),
      };
    },
  };
}

export type RunsRepo = ReturnType<typeof createRunsRepo>;
