"use server";

import { redirect } from "next/navigation";
import { sendStartMessage } from "../lib/queue/send.ts";
import { START_WINDOW_MS } from "../lib/run/lease.ts";
import { startRun } from "../lib/run/start-run.ts";
import { getConfig, getLog, getRepo, isOwner } from "./_server/context.ts";

/**
 * The form's Start action (FR-001 to FR-005). It takes no input: the target and objective
 * come from server config only (FR-002). The owner check runs first, on this POST's own
 * credentials and origin, and the core's first step consumes it, so a refusal calls no
 * data dependency. A refused Start redirects with a marker only; the page rebuilds the
 * refusal from stored runs.
 */
export async function startRunAction(): Promise<void> {
  const owner = await isOwner("POST");
  const config = getConfig();
  const repo = getRepo();
  const result = await startRun({
    checkOwner: () => owner,
    reapStaleRuns: (now) => repo.reapStaleRuns(now, START_WINDOW_MS),
    countRunsSince: (since) => repo.countRunsSince(since),
    countActiveRuns: () => repo.countActiveRuns(),
    insertQueuedRun: (run) => repo.insertQueuedRun(run),
    sendStartMessage,
    config: {
      targetUrl: config.targetUrl,
      objective: config.objective,
      monthlyRunCap: config.monthlyRunCap,
      concurrencyCap: config.concurrencyCap,
    },
    now: () => new Date(),
    log: getLog(),
  });
  // redirect() throws, so it stays outside any try.
  if (result.ok) redirect(result.resultPath);
  if ("code" in result) throw new Error("Not authorized.");
  redirect("/?refused=1");
}
