# Status

This document is the plain-English release posture for PIPELINE.

It answers a simple question: if someone lands on this repository, how close is it to being trustworthy in a real engineering environment?

## Current Position

PIPELINE is in a **pilot-ready** state.

That means the core architecture is implemented, the main workflows are tested, and the repository is healthy enough to evaluate in a real environment. It does **not** mean every repo can adopt it with zero wiring or that every operational edge case has already been proven in production.

## What Is Proven

- The controller is implemented and lives at the repo root.
- Mission Control integration is implemented in [`mission-control-source/`](mission-control-source).
- The accuracy gates are part of the main workflow, not an experimental branch:
  - failure-memory lookup before work begins
  - coverage + mutation quality gate after basic tests pass
- The repo has green GitHub Actions for:
  - controller CI
  - Mission Control CI
  - nightly soak
- The controller has automated coverage for:
  - happy-path slice flow
  - `AUTO_FIX` recovery flow
  - `NEEDS_SPLIT` flow
  - lease and idempotency behavior
  - quality-gate parsing
  - failure-memory reuse
  - reconciliation of stale active slices

## What Still Needs Real-World Proof

- A pilot target repository using real coverage and mutation tooling.
- A live worker environment that consumes context files or runs via the command dispatcher.
- Repeated end-to-end PR flows against the actual GitHub repository you want to automate.
- Operational experience around timeouts, flaky external tools, and environment drift.

## What A New Adopter Should Expect To Change

You should expect to edit [`pipeline.json`](pipeline.json) before this is useful in a real project.

At minimum:

- set `repo_path` to the actual repo you want to orchestrate
- replace the fixture quality-gate commands with real project commands
- verify the dispatcher mode matches your worker setup
- make sure `gh auth status` succeeds in the same environment where PIPELINE runs

## What Is Intentionally Honest In This Repo

This repository does **not** pretend the defaults are production-ready:

- the checked-in `repo_path` is scaffolded
- the default quality-gate scripts are fixtures for testing the controller
- the Mission Control dashboard is an optional wrapper, not the source of truth
- the CLI remains the full interface for the whole workflow

That honesty is deliberate. The goal is to make the real operational contract obvious instead of hiding it behind demo defaults.

## Recommended Next Validation

If you want to prove PIPELINE on your own stack, run this sequence:

1. Point [`pipeline.json`](pipeline.json) at a real target repo.
2. Wire in real test, coverage, and mutation commands.
3. Run `node bin/pipeline.js doctor`.
4. Run `node bin/pipeline.js smoke --json`.
5. Execute three real slices:
   - one happy path
   - one test failure that routes through `AUTO_FIX`
   - one slice that returns `NEEDS_SPLIT`

That is the fastest path from "interesting repo" to "trusted workflow."
