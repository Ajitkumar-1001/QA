-- One row per run (FR-002, FR-007).
-- The status, verdict and reason-code lists mirror src/lib/run/status.ts; a database test keeps them in step.
-- No index: the monthly cap bounds the table to a few hundred rows.
CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'done')),
  verdict text CHECK (verdict IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
  reason_code text CHECK (reason_code IN (
    'criteria_unavailable',
    'sandbox_failed',
    'target_unreachable',
    'model_error',
    'step_budget_exhausted',
    'deadline_exceeded',
    'capture_failed',
    'lease_expired',
    'never_started',
    'internal_error'
  )),
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT runs_verdict_exactly_when_done CHECK ((status = 'done') = (verdict IS NOT NULL)),
  CONSTRAINT runs_reason_exactly_when_inconclusive CHECK (((verdict = 'INCONCLUSIVE') IS TRUE) = (reason_code IS NOT NULL)),
  CONSTRAINT runs_finished_exactly_when_done CHECK ((status = 'done') = (finished_at IS NOT NULL))
)
