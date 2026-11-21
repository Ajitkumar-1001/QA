import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as lease from "./lease.ts";
import { LEASE_MS, START_WINDOW_MS, leaseExpiresAt, reapRun } from "./lease.ts";
import type { ReapableRun, ReapResult } from "./lease.ts";

const NOW_MS = Date.parse("2026-11-10T12:00:00.000Z");
const DAY_MS = 86_400_000;

function at(msFromNow: number): Date {
  return new Date(NOW_MS + msFromNow);
}

test("lease.ts exports exactly LEASE_MS, START_WINDOW_MS, leaseExpiresAt and reapRun", () => {
  assert.deepEqual(Object.keys(lease).sort(), [
    "LEASE_MS",
    "START_WINDOW_MS",
    "leaseExpiresAt",
    "reapRun",
  ]);
});

// FR-009, FR-025: the lease runs 300 s from the claim and the start window 5 minutes from creation.
test("the lease and the start window are both 300000 ms", () => {
  assert.equal(LEASE_MS, 300_000);
  assert.equal(START_WINDOW_MS, 300_000);
});

// FR-009: the claim sets the lease deadline.
test("leaseExpiresAt returns a new Date exactly LEASE_MS after the claim and leaves the claim unchanged", () => {
  const claimedAt = new Date("2026-11-10T11:58:20.123Z");
  const expires = leaseExpiresAt(claimedAt);
  assert.ok(expires instanceof Date);
  assert.notEqual(expires, claimedAt);
  assert.equal(expires.toISOString(), "2026-11-10T12:03:20.123Z");
  assert.equal(claimedAt.toISOString(), "2026-11-10T11:58:20.123Z");

  const lateClaim = new Date("2026-12-31T23:58:00.000Z");
  assert.equal(leaseExpiresAt(lateClaim).toISOString(), "2027-01-01T00:03:00.000Z");
  assert.equal(lateClaim.toISOString(), "2026-12-31T23:58:00.000Z");
});

// FR-009: the lease is 300 s of elapsed time, also when the local clock changes.
test("leaseExpiresAt adds 300 s of elapsed time across a daylight-saving change", () => {
  const savedTz = process.env.TZ;
  process.env.TZ = "America/New_York"; // clocks fall back at 2026-11-01T06:00:00Z
  try {
    assert.equal(
      leaseExpiresAt(new Date("2026-11-01T05:58:00.000Z")).toISOString(),
      "2026-11-01T06:03:00.000Z",
    );
  } finally {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  }
});

// FR-025: a running run whose lease deadline has passed ends INCONCLUSIVE with lease_expired.
test("a running run whose lease ends exactly now is closed INCONCLUSIVE with lease_expired", () => {
  const run: ReapableRun = {
    status: "running",
    claimToken: "claim-a",
    createdAt: at(-310_000),
    leaseExpiresAt: at(0),
  };
  const expected: ReapResult = {
    ok: true,
    run: {
      status: "done",
      claimToken: "claim-a",
      createdAt: at(-310_000),
      leaseExpiresAt: at(0),
      verdict: "INCONCLUSIVE",
      reasonCode: "lease_expired",
    },
  };
  assert.deepEqual(reapRun(run, at(0)), expected);
});

test("a running run whose lease ended before now is closed INCONCLUSIVE with lease_expired", () => {
  for (const leaseEnd of [-1, -DAY_MS]) {
    const run: ReapableRun = {
      status: "running",
      claimToken: "claim-a",
      createdAt: at(leaseEnd - 310_000),
      leaseExpiresAt: at(leaseEnd),
    };
    const expected: ReapResult = {
      ok: true,
      run: {
        status: "done",
        claimToken: "claim-a",
        createdAt: at(leaseEnd - 310_000),
        leaseExpiresAt: at(leaseEnd),
        verdict: "INCONCLUSIVE",
        reasonCode: "lease_expired",
      },
    };
    assert.deepEqual(reapRun(run, at(0)), expected, `lease ended ${-leaseEnd} ms ago`);
  }
});

// FR-025: every run can end, so a running run with no lease deadline is closed too.
test("a running run with no lease deadline is closed lease_expired, however new it is", () => {
  const run: ReapableRun = { status: "running", claimToken: "claim-a", createdAt: at(0) };
  const expected: ReapResult = {
    ok: true,
    run: {
      status: "done",
      claimToken: "claim-a",
      createdAt: at(0),
      verdict: "INCONCLUSIVE",
      reasonCode: "lease_expired",
    },
  };
  assert.deepEqual(reapRun(run, at(0)), expected);
});

// FR-025: a lease that has not passed keeps the run open.
test("a running run whose lease ends after now is refused as lease_active, however old the run is and however far ahead the lease ends", () => {
  for (const createdAt of [at(-310_000), at(-DAY_MS)]) {
    for (const leaseEnd of [1, LEASE_MS + 1, DAY_MS]) {
      const run: ReapableRun = {
        status: "running",
        claimToken: "claim-a",
        createdAt,
        leaseExpiresAt: at(leaseEnd),
      };
      const before = structuredClone(run);
      const expected: ReapResult = { ok: false, error: "lease_active" };
      assert.deepEqual(reapRun(run, at(0)), expected, `lease ends in ${leaseEnd} ms`);
      assert.deepEqual(run, before);
    }
  }
});

// FR-025: the reaper needs no claim token, so a running run is judged by its lease alone.
test("a running run with no claim token is judged by its lease alone", () => {
  const noLease: ReapableRun = { status: "running", createdAt: at(0) };
  const expected: ReapResult = {
    ok: true,
    run: {
      status: "done",
      createdAt: at(0),
      verdict: "INCONCLUSIVE",
      reasonCode: "lease_expired",
    },
  };
  assert.deepEqual(reapRun(noLease, at(0)), expected);

  const activeLease: ReapableRun = { status: "running", createdAt: at(-DAY_MS), leaseExpiresAt: at(1) };
  assert.deepEqual(reapRun(activeLease, at(0)), { ok: false, error: "lease_active" });
});

// FR-009, FR-025: the lease the claim sets keeps a run open for exactly 300 s.
test("a run claimed at 12:00:00 is refused at 12:04:59.999 and closed lease_expired at 12:05:00", () => {
  const run: ReapableRun = {
    status: "running",
    claimToken: "claim-a",
    createdAt: new Date("2026-11-10T11:59:50.000Z"),
    leaseExpiresAt: leaseExpiresAt(new Date("2026-11-10T12:00:00.000Z")),
  };
  assert.deepEqual(reapRun(run, new Date("2026-11-10T12:04:59.999Z")), {
    ok: false,
    error: "lease_active",
  });
  const closed = reapRun(run, new Date("2026-11-10T12:05:00.000Z"));
  assert.ok(closed.ok);
  assert.equal(closed.run.status, "done");
  assert.equal(closed.run.verdict, "INCONCLUSIVE");
  assert.equal(closed.run.reasonCode, "lease_expired");
});

// FR-009, FR-025: both limits hold to the millisecond, whatever the milliseconds of now.
test("a lease and a start window that end at .250 are open at .249 and closed at .250, and now is unchanged", () => {
  const run: ReapableRun = {
    status: "running",
    claimToken: "claim-a",
    createdAt: new Date("2026-11-10T11:59:50.000Z"),
    leaseExpiresAt: leaseExpiresAt(new Date("2026-11-10T12:00:00.250Z")),
  };
  const leaseOpen = new Date("2026-11-10T12:05:00.249Z");
  assert.deepEqual(reapRun(run, leaseOpen), { ok: false, error: "lease_active" });
  assert.equal(leaseOpen.toISOString(), "2026-11-10T12:05:00.249Z");
  const leaseOver = new Date("2026-11-10T12:05:00.250Z");
  const closed = reapRun(run, leaseOver);
  assert.ok(closed.ok);
  assert.equal(closed.run.reasonCode, "lease_expired");
  assert.equal(leaseOver.toISOString(), "2026-11-10T12:05:00.250Z");

  const queued: ReapableRun = { status: "queued", createdAt: new Date("2026-11-10T11:55:00.250Z") };
  const windowOpen = new Date("2026-11-10T12:00:00.249Z");
  assert.deepEqual(reapRun(queued, windowOpen), { ok: false, error: "start_window_open" });
  assert.equal(windowOpen.toISOString(), "2026-11-10T12:00:00.249Z");
  const windowOver = new Date("2026-11-10T12:00:00.250Z");
  const abandoned = reapRun(queued, windowOver);
  assert.ok(abandoned.ok);
  assert.equal(abandoned.run.reasonCode, "never_started");
  assert.equal(windowOver.toISOString(), "2026-11-10T12:00:00.250Z");
});

// FR-025: a run still queued after the start window ends INCONCLUSIVE with never_started.
test("a queued run created exactly START_WINDOW_MS before now is closed INCONCLUSIVE with never_started", () => {
  const run: ReapableRun = { status: "queued", createdAt: at(-START_WINDOW_MS) };
  const expected: ReapResult = {
    ok: true,
    run: {
      status: "done",
      createdAt: at(-START_WINDOW_MS),
      verdict: "INCONCLUSIVE",
      reasonCode: "never_started",
    },
  };
  assert.deepEqual(reapRun(run, at(0)), expected);
});

test("a queued run older than the start window is closed INCONCLUSIVE with never_started", () => {
  for (const age of [START_WINDOW_MS + 1, DAY_MS]) {
    const run: ReapableRun = { status: "queued", createdAt: at(-age) };
    const expected: ReapResult = {
      ok: true,
      run: {
        status: "done",
        createdAt: at(-age),
        verdict: "INCONCLUSIVE",
        reasonCode: "never_started",
      },
    };
    assert.deepEqual(reapRun(run, at(0)), expected, `created ${age} ms ago`);
  }
});

// FR-025: a queued run inside the start window stays open.
test("a queued run younger than START_WINDOW_MS is refused as start_window_open", () => {
  for (const age of [START_WINDOW_MS - 1, 0]) {
    const run: ReapableRun = { status: "queued", createdAt: at(-age) };
    const before = structuredClone(run);
    const expected: ReapResult = { ok: false, error: "start_window_open" };
    assert.deepEqual(reapRun(run, at(0)), expected, `created ${age} ms ago`);
    assert.deepEqual(run, before);
  }
});

// FR-025: a queued run created after now, for example under clock skew, is inside its start window.
test("a queued run whose createdAt is after now is refused as start_window_open", () => {
  for (const ahead of [START_WINDOW_MS, DAY_MS]) {
    const run: ReapableRun = { status: "queued", createdAt: at(ahead) };
    const expected: ReapResult = { ok: false, error: "start_window_open" };
    assert.deepEqual(reapRun(run, at(0)), expected, `created ${ahead} ms after now`);
  }
});

// FR-025: a running run is judged by its lease, a queued run by its start window.
test("the status alone decides whether the lease or the start window applies", () => {
  const youngRunning: ReapableRun = {
    status: "running",
    claimToken: "claim-a",
    createdAt: at(-1_000),
    leaseExpiresAt: at(0),
  };
  const closedRunning = reapRun(youngRunning, at(0));
  assert.ok(closedRunning.ok);
  assert.equal(closedRunning.run.reasonCode, "lease_expired");

  const youngQueued: ReapableRun = {
    status: "queued",
    createdAt: at(-1_000),
    leaseExpiresAt: at(-1),
  };
  assert.deepEqual(reapRun(youngQueued, at(0)), { ok: false, error: "start_window_open" });

  const oldQueued: ReapableRun = {
    status: "queued",
    createdAt: at(-START_WINDOW_MS),
    leaseExpiresAt: at(1),
  };
  const expected: ReapResult = {
    ok: true,
    run: {
      status: "done",
      createdAt: at(-START_WINDOW_MS),
      leaseExpiresAt: at(1),
      verdict: "INCONCLUSIVE",
      reasonCode: "never_started",
    },
  };
  assert.deepEqual(reapRun(oldQueued, at(0)), expected);
});

// FR-024: a run in done never changes.
test("a done run is refused as already_done and left unchanged, whatever its dates", () => {
  const dates: Pick<ReapableRun, "createdAt" | "leaseExpiresAt">[] = [
    { createdAt: at(0) },
    { createdAt: at(-DAY_MS) },
    { createdAt: at(-1_000), leaseExpiresAt: at(299_000) },
    { createdAt: at(-START_WINDOW_MS), leaseExpiresAt: at(0) },
    { createdAt: at(-DAY_MS), leaseExpiresAt: at(-DAY_MS + 310_000) },
  ];
  for (const d of dates) {
    const run: ReapableRun = { status: "done", claimToken: "claim-a", verdict: "FAIL", ...d };
    const before = structuredClone(run);
    const expected: ReapResult = { ok: false, error: "already_done" };
    assert.deepEqual(reapRun(run, at(0)), expected);
    assert.deepEqual(run, before);
  }
});

test("a done run with no verdict or claim token is refused as already_done and left unchanged", () => {
  for (const createdAt of [at(0), at(-DAY_MS)]) {
    const run: ReapableRun = { status: "done", createdAt };
    const before = structuredClone(run);
    const expected: ReapResult = { ok: false, error: "already_done" };
    assert.deepEqual(reapRun(run, at(0)), expected);
    assert.deepEqual(run, before);
  }
});

// FR-024: once the reaper has closed a run, reaping it again changes nothing.
test("reaping a run the reaper already closed is refused as already_done", () => {
  const expired = reapRun(
    { status: "running", claimToken: "claim-a", createdAt: at(-400_000), leaseExpiresAt: at(-100_000) },
    at(0),
  );
  assert.ok(expired.ok);
  assert.deepEqual(reapRun(expired.run, at(1)), { ok: false, error: "already_done" });

  const abandoned = reapRun({ status: "queued", createdAt: at(-START_WINDOW_MS) }, at(0));
  assert.ok(abandoned.ok);
  assert.deepEqual(reapRun(abandoned.run, at(1)), { ok: false, error: "already_done" });
});

// FR-025: closing a run returns a new run and leaves its input as it was.
test("a closed run is a new object that keeps every other field, and neither input is mutated", () => {
  const rows: (ReapableRun & { id: string })[] = [
    {
      id: "run-1",
      status: "running",
      claimToken: "claim-a",
      createdAt: at(-400_000),
      leaseExpiresAt: at(-100_000),
    },
    { id: "run-2", status: "queued", createdAt: at(-START_WINDOW_MS - 60_000) },
  ];
  for (const row of rows) {
    const before = structuredClone(row);
    const now = at(0);
    const result = reapRun(row, now);
    assert.deepEqual(row, before);
    assert.equal(now.getTime(), NOW_MS);
    assert.ok(result.ok);
    assert.notEqual(result.run, row);
    assert.deepEqual(result.run, {
      ...before,
      status: "done",
      verdict: "INCONCLUSIVE",
      reasonCode: before.status === "running" ? "lease_expired" : "never_started",
    });
  }
});

// FR-025: the reaper's verdict and reason replace whatever the run held.
test("closing a run sets verdict INCONCLUSIVE and the reaper's reason over any the run held", () => {
  const running: ReapableRun = {
    status: "running",
    claimToken: "claim-a",
    createdAt: at(-400_000),
    leaseExpiresAt: at(-100_000),
    verdict: "PASS",
    reasonCode: "model_error",
  };
  const closedRunning: ReapResult = {
    ok: true,
    run: { ...running, status: "done", verdict: "INCONCLUSIVE", reasonCode: "lease_expired" },
  };
  assert.deepEqual(reapRun(running, at(0)), closedRunning);

  const queued: ReapableRun = { status: "queued", createdAt: at(-START_WINDOW_MS), verdict: "FAIL" };
  const closedQueued: ReapResult = {
    ok: true,
    run: { ...queued, status: "done", verdict: "INCONCLUSIVE", reasonCode: "never_started" },
  };
  assert.deepEqual(reapRun(queued, at(0)), closedQueued);
});

function leaseCode(): string {
  return readFileSync(new URL("./lease.ts", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    "",
  );
}

// FR-024, FR-025: the allowed status changes are defined only in status.ts.
test("lease.ts checks the transition with canTransition from status.ts and defines no transitions of its own", () => {
  const code = leaseCode();
  assert.match(code, /\bimport\s*\{[^}]*\bcanTransition\b[^}]*\}\s*from\s*["']\.\/status\.ts["']/);
  assert.match(code, /\bcanTransition\s*\(/);
  assert.doesNotMatch(code, /\b(?:function|const|let|var|class)\s+canTransition\b/);
});

// FR-024: whether a run may still change is decided by canTransition, not by a comparison with "done".
test("lease.ts never compares a status with done itself", () => {
  assert.doesNotMatch(leaseCode(), /[!=]==?\s*["']done["']|["']done["']\s*[!=]==?/);
});
