# QAForge

A developer gives QAForge the URL of a public web app and a test objective in plain English. An AI agent drives a real browser in an isolated sandbox and returns a verdict with evidence.

It is built for engineers and hiring managers as a clear, honest demonstration of an agentic AI application. Every number on screen comes from a real run, with no demo data.

## How it works

1. The developer signs in with GitHub.
2. They submit the URL of a public web app and a test objective in plain English.
3. A queue message starts the run, and a single invocation claims it.
4. A Mastra agent drives a real browser inside an isolated sandbox created for that run, within a bounded harness.
5. The run ends with a verdict and its evidence, and the full trace is visible.

## Verdicts and evidence

Every run ends with one of three verdicts:

- **PASS**
- **FAIL**
- **INCONCLUSIVE**, when the run cannot reach a verdict

Each verdict comes with evidence:

- screenshots
- console logs
- network logs
- the full trace of the run

## Guardrails

Each run is held inside a bounded harness:

- a step budget
- a run deadline (provisionally 240 seconds; a run that hits it ends INCONCLUSIVE)
- a tool allowlist
- a timeout on every model call
- a monthly run cap

Hard rules:

- **Real output only.** A run that cannot reach a verdict returns INCONCLUSIVE and never invents one.
- **The model's API key never enters the sandbox.** No text written by the model ever reaches a shell. Browser tools call fixed binaries with validated arguments.
- **Public targets only.** Private, loopback and metadata addresses are refused, both on the host and by the sandbox firewall.
- **No external writes without human approval.** The demo writes nothing externally. Later features that do, such as opening a GitHub issue, will sit behind a human approval.

## Status

As of 2026-11-09:

- The charter and decision log are in progress.
- The runtime spike is done.
- There is no app code yet.

The current milestone is the walking skeleton: one real run against one fixed public URL, completing on production, with the result and the trace stored. Its spec is being written and needs review before any code is written.

Until the walking skeleton passes, the only planned UI is the run form, the run result and the trace. Other features will come after it.

## Documentation

- [Charter](docs/CHARTER.md): what the product is, who it is for, and its hard rules.
- [Status](docs/STATUS.md): where the project stands.
- [Decisions](docs/DECISIONS.md): the decision log.
- [Operations](docs/OPERATIONS.md): environment and deploy state.
- [Runtime spike](docs/spikes/2026-11-09-runtime.md): the runtime spike and the walking-skeleton acceptance checks.
