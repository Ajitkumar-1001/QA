# QAForge charter

This page is the one definition of the product. Any scope change is a pull request that edits this page. A scope decision that lives only in chat, memory or a vault note does not count.

## What it is

A developer signs in with GitHub and submits two things: the URL of a public web app, and a test objective in plain English. A Mastra agent then drives a real browser inside an isolated sandbox. It runs inside a bounded harness:

- a step budget
- a run deadline
- a tool allowlist
- a timeout on every model call
- a monthly run cap

The run returns **PASS**, **FAIL** or **INCONCLUSIVE**, with evidence: screenshots, console logs and network logs. The full trace of every run is visible.

## Why

To be a clear, honest demonstration of a harness-engineered agentic AI application, for engineers and hiring managers. Every number on screen comes from a real run, with no demo data.

## Who

Developers and engineering teams, signed in with GitHub OAuth. A demo login for non-developers is **deferred** and not decided.

## Hard rules

- Real output only. A run that cannot reach a verdict returns INCONCLUSIVE and never invents one.
- The model's API key never enters the sandbox. No text written by the model ever reaches a shell.
- Targets must be public URLs. Private, loopback and metadata addresses are refused, both on the host and by the sandbox firewall.
- The demo has no external writes. Later features that write externally, such as a GitHub issue, must sit behind a human approval.

## Out of scope until the walking skeleton passes

Every UI except the run form, the run result and the trace. That also rules out root-cause analysis, GitHub issue creation, quotas UI, workspaces, Slack, Linear, notifications, dashboards and motion.

## Milestone 0: walking skeleton

One real run against one fixed public URL, completing on production. The result and the trace are stored. Its acceptance checks are in [spikes/2026-11-09-runtime.md](spikes/2026-11-09-runtime.md#acceptance-checks-for-the-walking-skeleton).
