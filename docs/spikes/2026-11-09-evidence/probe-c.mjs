// THROWAWAY spike probe C: suspend a Mastra workflow in one process, resume it by runId in another.
// usage: node probe-c.mjs start | resume <runId> | status <runId>
import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { PostgresStore } from "@mastra/pg";
import { z } from "zod";

const step1 = createStep({
  id: "browser-step",
  inputSchema: z.object({ url: z.string() }),
  outputSchema: z.object({ url: z.string(), observed: z.string(), pidStart: z.number(), pidResume: z.number() }),
  resumeSchema: z.object({ observed: z.string() }),
  suspendSchema: z.object({ waitingFor: z.string(), pid: z.number() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData) return await suspend({ waitingFor: "browser result", pid: process.pid });
    return { url: inputData.url, observed: resumeData.observed, pidStart: -1, pidResume: process.pid };
  },
});
const step2 = createStep({
  id: "verdict",
  inputSchema: step1.outputSchema,
  outputSchema: z.object({ verdict: z.string(), pid: z.number() }),
  execute: async ({ inputData }) => ({ verdict: inputData.observed.includes("Example") ? "PASS" : "FAIL", pid: process.pid }),
});
const wf = createWorkflow({
  id: "spike-run",
  inputSchema: z.object({ url: z.string() }),
  outputSchema: z.object({ verdict: z.string(), pid: z.number() }),
}).then(step1).then(step2).commit();

const mastra = new Mastra({
  workflows: { wf },
  storage: new PostgresStore({ id: "spike", connectionString: "postgres://postgres:spike@localhost:55432/postgres" }),
  logger: false,
});

const [mode, runId] = process.argv.slice(2);
const w = mastra.getWorkflow("wf");
if (mode === "start") {
  const run = await w.createRun();
  const r = await run.start({ inputData: { url: "https://example.com" } });
  console.log(JSON.stringify({ pid: process.pid, runId: run.runId, status: r.status, suspended: r.suspended, payload: r.steps?.["browser-step"]?.suspendPayload }));
} else if (mode === "resume") {
  const run = await w.createRun({ runId });
  const r = await run.resume({ step: "browser-step", resumeData: { observed: "Example Domain" } });
  console.log(JSON.stringify({ pid: process.pid, status: r.status, result: r.result, error: r.error?.message ?? r.error }));
} else {
  const s = await w.getWorkflowRunById(runId);
  console.log(JSON.stringify({ pid: process.pid, status: s?.status, keys: s ? Object.keys(s) : null }));
}
process.exit(0);
