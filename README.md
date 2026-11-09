<div align="center"> <h1>QAForge</h1></div>

<p align="center">
  <img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-blue">
  <img alt="Mastra" src="https://img.shields.io/badge/agents-Mastra-6f42c1">
  <img alt="Vercel Sandbox" src="https://img.shields.io/badge/browser-Vercel%20Sandbox-black?logo=vercel">
</p>

<p align="center"><b>An AI QA agent that tests a live web app in a real browser, and never invents a verdict.</b></p>

---

A developer signs in with GitHub and gives QAForge two things: the URL of a public web app and a test objective in plain English. A Mastra agent then drives a real browser inside an isolated sandbox, held within a bounded harness of explicit run limits. Every run ends in **PASS**, **FAIL** or **INCONCLUSIVE**, backed by screenshots, console logs and network logs, and the full trace of every run is open to inspect.
( Only public URLs can be tested )

QAForge is built for engineers and hiring managers as a clear, honest demonstration of agentic AI done carefully: bounded, observable and truthful about what it found. Every number on screen comes from a real run.

## Repository layout

```
docs/        the product definition: charter, status, decisions, operations and spikes
LICENSE      Apache 2.0
```

The charter is the single definition of the product, and any change in scope is made by editing it. See **[`docs/CHARTER.md`](docs/CHARTER.md)** for what QAForge is, who it is for and the rules it holds to. Decisions are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Core principles

QAForge holds four non-negotiable rules:

1. **Real output only.** A run that cannot reach a verdict returns INCONCLUSIVE and never invents one.
2. **The model's API key never enters the sandbox.** No text written by the model ever reaches a shell.
3. **Public targets only.** Private, loopback and metadata addresses are refused, both on the host and by the sandbox firewall.
4. **No external writes without a human.** Any feature that writes outside QAForge, such as opening a GitHub issue, sits behind a human approval.

Every run is held inside a bounded harness: a step budget, a run deadline, a tool allowlist, a timeout on every model call and a monthly run cap.

## Status

The runtime is proven by a completed spike, and the charter and decision log are being finalized. The first milestone is the walking skeleton: one real run against one fixed public URL, completing on production, with its result and trace stored. The run form, the run result and the trace come first, and every other surface will follow once that skeleton passes. [`docs/STATUS.md`](docs/STATUS.md) always reflects where the project stands.

## License

Apache 2.0. See [`LICENSE`](LICENSE).
