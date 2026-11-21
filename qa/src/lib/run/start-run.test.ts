import test from "node:test";
import assert from "node:assert/strict";
import { capWindow, checkRunCaps } from "./caps.ts";
import { createLogger } from "../log.ts";
import {
  StartRunError,
  resultPathFor,
  startRun,
  type StartRunConfig,
  type StartRunDeps,
  type StartRunStep,
} from "./start-run.ts";

const OWNER_SECRET = "canary-owner-secret-0123456789abcdef";
const AUTH_HEADER = `Basic canary-header-${OWNER_SECRET}`;
const DB_URL = "postgres://app:canary-db-password@db.example/qa";
const NOW = new Date("2026-11-19T12:00:00.000Z");

type FakeRun = {
  id: string;
  status: "queued" | "running" | "done";
  targetUrl: string;
  objective: string;
  createdAt: Date;
};

type DepName =
  | "checkOwner"
  | "reapStaleRuns"
  | "countRunsSince"
  | "countActiveRuns"
  | "insertQueuedRun"
  | "sendStartMessage";

type WorldOptions = {
  owner?: boolean;
  runs?: Omit<FakeRun, "targetUrl" | "objective">[];
  config?: Partial<StartRunConfig>;
  fail?: Partial<Record<DepName, unknown>>;
  reap?: (runs: FakeRun[], now: Date) => void;
};

function world(options: WorldOptions = {}) {
  const calls: DepName[] = [];
  const args: Partial<Record<DepName, unknown>> = {};
  const runs: FakeRun[] = (options.runs ?? []).map((run) => ({
    ...run,
    targetUrl: "https://old.example",
    objective: "old",
  }));
  const messages: { runId: string }[] = [];
  const lines: string[] = [];
  let clockReads = 0;
  let nextId = 1;

  async function enter(name: DepName, arg?: unknown): Promise<void> {
    calls.push(name);
    args[name] = arg;
    if (options.fail && name in options.fail) throw options.fail[name];
  }

  const config: StartRunConfig = {
    targetUrl: "https://demo.playwright.dev/todomvc",
    objective: "add two todos",
    monthlyRunCap: 100,
    concurrencyCap: 2,
    ...options.config,
  };

  const deps: StartRunDeps = {
    async checkOwner() {
      await enter("checkOwner");
      // A real check reads the header; this fake only closes over one.
      return options.owner ?? AUTH_HEADER.length > 0;
    },
    async reapStaleRuns(now) {
      await enter("reapStaleRuns", now);
      options.reap?.(runs, now);
    },
    async countRunsSince(since) {
      await enter("countRunsSince", since);
      return runs.filter((run) => run.createdAt >= since).length;
    },
    async countActiveRuns() {
      await enter("countActiveRuns");
      return runs.filter((run) => run.status !== "done").length;
    },
    async insertQueuedRun(row) {
      await enter("insertQueuedRun", row);
      const run: FakeRun = { id: `run-${nextId++}`, status: "queued", ...row };
      runs.push(run);
      return { id: run.id };
    },
    async sendStartMessage(message) {
      await enter("sendStartMessage", message);
      messages.push(message);
    },
    config,
    now() {
      clockReads += 1;
      return NOW;
    },
    log: createLogger({
      secrets: [OWNER_SECRET, AUTH_HEADER, DB_URL],
      write: (line) => lines.push(line),
    }),
  };

  return {
    deps,
    calls,
    args,
    runs,
    messages,
    lines,
    events: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    clockReads: () => clockReads,
  };
}

function assertNoCanary(text: string): void {
  assert.equal(text.includes("canary"), false, `leaked a canary: ${text}`);
}

function leakyError(): Error {
  return new Error(`failed with ${OWNER_SECRET} via ${DB_URL}`, {
    cause: new Error(`header was ${AUTH_HEADER}`),
  });
}

test("FR-001: a refused owner check stops before any other step and stores nothing", async () => {
  const w = world({ owner: false });
  assert.deepEqual(await startRun(w.deps), { ok: false, code: "UNAUTHORIZED" });
  assert.deepEqual(w.calls, ["checkOwner"]);
  assert.equal(w.runs.length, 0);
  assert.equal(w.messages.length, 0);
  assert.equal(w.clockReads(), 0);
  assert.deepEqual(w.events(), [{ reason: "gate", level: "info", event: "run_refused" }]);
  for (const line of w.lines) assertNoCanary(line);
});

test("an owner check that throws fails the request without a refusal event", async () => {
  const w = world({ fail: { checkOwner: new Error(`QAFORGE_OWNER_SECRET is not set (${OWNER_SECRET})`) } });
  await assert.rejects(startRun(w.deps), (error: unknown) => {
    assert.ok(error instanceof StartRunError);
    assert.equal(error.step, "owner_check");
    return true;
  });
  assert.deepEqual(w.calls, ["checkOwner"]);
  const events = w.events();
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "run_start_failed");
  assert.equal(events[0].step, "owner_check");
  for (const line of w.lines) assertNoCanary(line);
});

test("FR-002: the stored run holds the configured URL and objective, and the core takes no request input", async () => {
  const w = world({ config: { targetUrl: "https://configured.example/app", objective: "configured objective" } });
  const result = await startRun(w.deps);
  assert.equal(result.ok, true);
  assert.equal(startRun.length, 1, "startRun takes only its dependencies");
  assert.deepEqual(w.args.insertQueuedRun, {
    targetUrl: "https://configured.example/app",
    objective: "configured objective",
    createdAt: NOW,
  });
  assert.equal(w.runs[0].targetUrl, "https://configured.example/app");
  assert.equal(w.runs[0].objective, "configured objective");
});

test("FR-003: at the monthly cap the start is refused with the count and reset date, and the count stays N", async () => {
  const thisMonth = [1, 2, 3].map((n) => ({
    id: `old-${n}`,
    status: "done" as const,
    createdAt: new Date(`2026-11-0${n}T00:00:00.000Z`),
  }));
  const w = world({ runs: thisMonth, config: { monthlyRunCap: 3 } });
  const result = await startRun(w.deps);
  const expected = checkRunCaps({ runsInWindow: 3, activeRuns: 0, monthlyCap: 3, concurrencyCap: 2, now: NOW });
  assert.deepEqual(result, { ok: false, refusal: expected });
  assert.ok(!result.ok && "refusal" in result);
  assert.equal(result.refusal.reason, "monthly_cap");
  assert.equal(result.refusal.count, 3);
  assert.deepEqual(result.refusal.resetsAt, new Date("2026-12-01T00:00:00.000Z"));
  assert.equal(w.runs.length, 3);
  assert.equal(w.messages.length, 0);
  assert.deepEqual(w.events(), [
    { reason: "monthly_cap", count: 3, cap: 3, level: "info", event: "run_refused" },
  ]);
});

test("FR-003: runs from an earlier month do not count against this month's cap", async () => {
  const lastMonth = [1, 2, 3].map((n) => ({
    id: `old-${n}`,
    status: "done" as const,
    createdAt: new Date(`2026-10-2${n}T00:00:00.000Z`),
  }));
  const w = world({ runs: lastMonth, config: { monthlyRunCap: 3 } });
  assert.equal((await startRun(w.deps)).ok, true);
  assert.deepEqual(w.args.countRunsSince, capWindow(NOW).start);
});

test("FR-004: with 2 runs in progress the start is refused; once one is done the next is accepted", async () => {
  const w = world({
    runs: [
      { id: "a", status: "queued", createdAt: NOW },
      { id: "b", status: "running", createdAt: NOW },
    ],
  });
  const refused = await startRun(w.deps);
  assert.ok(!refused.ok && "refusal" in refused);
  assert.equal(refused.refusal.reason, "concurrency_cap");
  assert.equal(refused.refusal.count, 2);
  assert.equal(w.runs.length, 2);
  assert.equal(w.messages.length, 0);

  w.runs[1].status = "done";
  const accepted = await startRun(w.deps);
  assert.equal(accepted.ok, true);
  assert.equal(w.runs.length, 3);
});

test("FR-005: an accepted start stores one queued run, sends exactly one message and returns its result address", async () => {
  const w = world();
  const result = await startRun(w.deps);
  assert.deepEqual(result, { ok: true, runId: "run-1", resultPath: "/runs/run-1" });
  assert.equal(w.runs.length, 1);
  assert.equal(w.runs[0].status, "queued");
  assert.deepEqual(w.messages, [{ runId: "run-1" }]);
  // No model or sandbox dependency exists to call (FR-005).
  assert.deepEqual(Object.keys(w.deps).sort(), [
    "checkOwner",
    "config",
    "countActiveRuns",
    "countRunsSince",
    "insertQueuedRun",
    "log",
    "now",
    "reapStaleRuns",
    "sendStartMessage",
  ]);
  assert.deepEqual(w.events(), [{ runId: "run-1", level: "info", event: "run_requested" }]);
});

test("the steps run in order: owner check, reaper, counts, insert, send", async () => {
  const w = world();
  await startRun(w.deps);
  assert.equal(w.calls[0], "checkOwner");
  assert.equal(w.calls[1], "reapStaleRuns");
  assert.deepEqual(w.calls.slice(2, 4).sort(), ["countActiveRuns", "countRunsSince"]);
  assert.deepEqual(w.calls.slice(4), ["insertQueuedRun", "sendStartMessage"]);
});

test("one clock read drives the reaper, the cap window and created_at", async () => {
  const w = world();
  await startRun(w.deps);
  assert.equal(w.clockReads(), 1);
  assert.equal(w.args.reapStaleRuns, NOW);
  assert.deepEqual(w.args.countRunsSince, capWindow(NOW).start);
  assert.equal((w.args.insertQueuedRun as { createdAt: Date }).createdAt, NOW);
});

test("FR-025: the reaper runs before the counts, so a reaped run frees its place", async () => {
  const w = world({
    runs: [
      { id: "fresh", status: "queued", createdAt: NOW },
      { id: "stale", status: "queued", createdAt: new Date("2026-11-19T11:00:00.000Z") },
    ],
    reap: (runs, now) => {
      for (const run of runs) {
        if (run.status === "queued" && now.getTime() - run.createdAt.getTime() >= 300_000) run.status = "done";
      }
    },
  });
  const result = await startRun(w.deps);
  assert.equal(result.ok, true);
  assert.equal(w.runs.find((run) => run.id === "stale")?.status, "done");
});

test("a failed send still returns the result address and logs the run id", async () => {
  const w = world({ fail: { sendStartMessage: leakyError() } });
  const result = await startRun(w.deps);
  assert.deepEqual(result, { ok: true, runId: "run-1", resultPath: "/runs/run-1" });
  assert.equal(w.runs[0].status, "queued");
  const failure = w.events().find((event) => event.event === "run_send_failed");
  assert.ok(failure);
  assert.equal(failure.runId, "run-1");
  assert.equal(failure.level, "error");
  assert.match(String((failure.error as { stack?: string }).stack), /start-run\.test\.ts/);
  for (const line of w.lines) assertNoCanary(line);
});

const failingSteps: { dep: DepName; step: StartRunStep; later: DepName[] }[] = [
  { dep: "reapStaleRuns", step: "reap", later: ["countRunsSince", "countActiveRuns", "insertQueuedRun", "sendStartMessage"] },
  { dep: "countRunsSince", step: "count", later: ["insertQueuedRun", "sendStartMessage"] },
  { dep: "countActiveRuns", step: "count", later: ["insertQueuedRun", "sendStartMessage"] },
  { dep: "insertQueuedRun", step: "insert", later: ["sendStartMessage"] },
];

for (const { dep, step, later } of failingSteps) {
  test(`a failing ${dep} fails the request at "${step}", runs no later step and leaks no secret`, async () => {
    const w = world({ fail: { [dep]: leakyError() } });
    let thrown: unknown;
    await assert.rejects(startRun(w.deps), (error: unknown) => {
      thrown = error;
      return error instanceof StartRunError && error.step === step;
    });
    for (const name of later) assert.equal(w.calls.includes(name), false, `${name} ran after ${dep} failed`);
    assert.equal(w.messages.length, 0);
    assert.equal((thrown as Error).cause, undefined, "the thrown error carries no cause");
    assertNoCanary(`${(thrown as Error).message}\n${(thrown as Error).stack}`);

    const failure = w.events().find((event) => event.event === "run_start_failed");
    assert.ok(failure);
    assert.equal(failure.step, step);
    const error = failure.error as { message: string; stack: string; cause: { message: string } };
    assert.match(error.stack, /start-run\.test\.ts/);
    assert.match(error.cause.message, /\[redacted\]/);
    for (const line of w.lines) assertNoCanary(line);
  });
}

test("a dependency that throws a non-Error still fails with StartRunError", async () => {
  const w = world({ fail: { insertQueuedRun: `raw ${DB_URL}` } });
  await assert.rejects(startRun(w.deps), StartRunError);
  for (const line of w.lines) assertNoCanary(line);
});

test("resultPathFor encodes the run id", () => {
  assert.equal(resultPathFor("a/b?c"), "/runs/a%2Fb%3Fc");
});
