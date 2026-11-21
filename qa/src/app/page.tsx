import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RunForm } from "../components/run-form.ts";
import { capWindow } from "../lib/run/caps.ts";
import { formState, hasRefusedMarker, loadStep } from "../lib/run/page-state.ts";
import { startRunAction } from "./actions.ts";
import { getConfig, getLog, getRepo, isOwner } from "./_server/context.ts";

export default function Page(props: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-xl font-semibold">QAForge</h1>
      {/* Everything from config or the database renders inside the gated component (NX-003). */}
      <Suspense fallback={<p>Loading…</p>}>
        <FormContent searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function FormContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  if (!(await isOwner("GET"))) notFound();

  const config = getConfig();
  const repo = getRepo();
  const now = new Date();
  const [[runsInWindow, activeRuns], params] = await Promise.all([
    loadStep(getLog(), "count", () =>
      Promise.all([repo.countRunsSince(capWindow(now).start), repo.countActiveRuns()]),
    ),
    searchParams,
  ]);
  const { runsUsed, refusal } = formState({
    runsInWindow,
    activeRuns,
    monthlyCap: config.monthlyRunCap,
    concurrencyCap: config.concurrencyCap,
    now,
    startRefused: hasRefusedMarker(params),
  });

  return (
    <div className="[&_button:disabled]:opacity-50 [&_button]:mt-4 [&_button]:rounded [&_button]:border [&_button]:border-current [&_button]:px-4 [&_button]:py-2 [&_dd]:mb-3 [&_dd]:break-words [&_dt]:font-medium [&_p]:mt-3">
      <RunForm
        targetUrl={config.targetUrl}
        objective={config.objective}
        runsUsed={runsUsed}
        monthlyCap={config.monthlyRunCap}
        refusal={refusal}
        action={startRunAction}
      />
    </div>
  );
}
