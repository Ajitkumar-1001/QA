import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { runIdSchema } from "../../../lib/queue/start-message.ts";
import { START_WINDOW_MS } from "../../../lib/run/lease.ts";
import { loadStep, resultText } from "../../../lib/run/page-state.ts";
import { getLog, getRepo, isOwner } from "../../_server/context.ts";

export default function Page(props: PageProps<"/runs/[id]">) {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-xl font-semibold">QAForge</h1>
      {/* Everything from the database renders inside the gated component (NX-003). */}
      <Suspense fallback={<p>Loading…</p>}>
        <RunContent params={props.params} />
      </Suspense>
    </main>
  );
}

async function RunContent({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  if (!(await isOwner("GET"))) notFound();

  const { id } = await params;
  if (!runIdSchema.safeParse(id).success) notFound();

  const log = getLog();
  const repo = getRepo();
  const now = new Date();
  // FR-025's second trigger: a deliberate write during render (NX-017). It only ends runs
  // that the reaper rule already counts as stale, and never changes a done run.
  await loadStep(log, "reap", () => repo.reapStaleRuns(now, START_WINDOW_MS));
  const run = await loadStep(log, "read", () => repo.getRun(id));
  // A database error throws above and reaches the error boundary; only a missing row is not-found.
  if (run === null) notFound();

  return (
    <>
      <p>{resultText(run, now)}</p>
      <p className="mt-4">
        <Link className="underline" href="/">
          Back to the form
        </Link>
      </p>
    </>
  );
}
