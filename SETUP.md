# Setup And Wiring Guide

This guide shows how to wire PIPELINE into a real repository and, optionally, into the bundled Mission Control dashboard.

If you have not read them yet, skim [README.md](README.md) first for the product overview and [STATUS.md](STATUS.md) for the current maturity and expectations. This document is the practical installation path.

## Prerequisites

- Node.js 22 or newer for the controller
- Git
- GitHub CLI (`gh`) authenticated for the target repository
- A repository you want the controller to manage
- Optional: a worker/agent that can consume context files and write signal files

For the bundled Mission Control backend, assume a **Linux/OpenClaw-style environment** unless you are only using the pipeline tab in isolation. Several non-pipeline endpoints rely on Linux commands and `HOME`-based paths.

## 1. Install Dependencies

From the repo root:

```bash
npm install
```

If you also want the dashboard:

```bash
cd mission-control-source
npm install
cd ..
```

## 2. Decide What Repo The Controller Should Manage

The checked-in `pipeline.json` currently uses:

```json
{
  "repo_path": "."
}
```

That means the controller is pointed at the controller repo itself.

For real usage, change `repo_path` to your target repository, for example:

```json
{
  "repo_path": "./mission-control-source"
}
```

Or point it at a sibling checkout:

```json
{
  "repo_path": "../your-product-repo"
}
```

## 3. Replace The Scaffolded Test And Quality Commands

The current checked-in quality-gate commands are fixtures. They write fake coverage/mutation reports from environment variables and are good for tests, but not for real release control.

Use real commands in `pipeline.json` instead.

Example shape:

```json
{
  "test_command": "npm test",
  "hooks": {
    "quality_gate": {
      "enabled": true,
      "minimum_coverage": 90,
      "coverage": {
        "exec": ["npm", "run", "coverage"],
        "report_path": "coverage/coverage-summary.json",
        "metric_path": "total.lines.pct"
      },
      "mutation": {
        "exec": ["npm", "run", "mutation"],
        "report_path": "reports/mutation.json",
        "pass_field": "passed"
      }
    }
  }
}
```

Important:

- those scripts must exist in the target repo
- the report paths are resolved relative to `repo_path`
- the metric path must match the JSON structure your coverage tool emits

## 4. Choose A Dispatch Mode

### Option A: `signal-file` mode

Use this when an external worker or agent reads context files and reports back later.

This repo is already configured that way:

```json
{
  "dispatcher": {
    "type": "signal-file"
  }
}
```

Dispatch will create:

- `artifacts/contexts/<slice>-dispatch.md`
- `artifacts/contexts/<slice>-dispatch.json`

Your worker must eventually write:

- `signals/<slice>-done.json`

### Option B: `command` mode

Use this when the controller should launch the worker itself.

Example shape:

```json
{
  "dispatcher": {
    "type": "command",
    "command": {
      "exec": ["node", "path/to/worker.js", "{context_path}"],
      "timeout_seconds": 60,
      "cwd": ".",
      "env_allowlist": ["OPENAI_API_KEY"]
    }
  }
}
```

`{context_path}` and `{slice_id}` are substituted by the dispatcher.

## 5. Authenticate GitHub CLI

The controller uses `gh` for PR creation and PR status checks.

```bash
gh auth login
gh auth status
```

Then validate the environment:

```bash
node bin/pipeline.js doctor
node bin/pipeline.js status --validate --json
node bin/pipeline.js smoke --json
```

## 6. Import A Backlog

Use the bundled example as a template:

```bash
node bin/pipeline.js import slices/example-slices.json
node bin/pipeline.js list
node bin/pipeline.js feature-status
```

Backlog JSON must contain a top-level `slices` array, and may also include `features`.

## 7. Run The Manual Workflow Once

```bash
node bin/pipeline.js start SL-001
node bin/pipeline.js approve SL-001 --notes "Ready to execute"
node bin/pipeline.js dispatch SL-001
```

After dispatch:

- read `artifacts/contexts/SL-001-dispatch.md`
- do the work in the target repo
- write `signals/SL-001-done.json`
- process the signal

```bash
node bin/pipeline.js process-signals --slice SL-001
```

Then continue:

```bash
node bin/pipeline.js show SL-001
node bin/pipeline.js pr SL-001
node bin/pipeline.js sync SL-001
```

## 8. Signal File Contract

The completion signal is the core integration contract for `signal-file` mode.

Minimum useful example:

```json
{
  "slice_id": "SL-001",
  "success": true,
  "status": "done",
  "summary": "Implemented the requested change.",
  "files_changed": ["src/example.js"],
  "handoff_notes": "Ready for validation.",
  "known_issues": [],
  "needs_split": false,
  "split_reason": "",
  "tests": {
    "summary": "Unit tests run by worker"
  },
  "preflight_summary": "All required preflight sections were written.",
  "completed_at": "2026-03-24T12:00:00.000Z",
  "codemap_updates": [],
  "architecture_notes": "Optional architecture notes for runtime docs."
}
```

If the worker decides the slice is too large:

- set `needs_split` to `true`
- use `status: "needs_split"`
- provide `split_reason`

## 9. Use The Automated Loop

Once the basics work, you can let the controller perform one orchestration cycle at a time:

```bash
node bin/pipeline.js run
```

One cycle can:

- start the next ready slice
- dispatch an approved slice
- process finished signals
- run tests for slices in `TESTING`
- open PRs for passing slices
- sync merge status for open PRs

For unattended operation, schedule `node bin/pipeline.js run`.

## 10. Wire In Mission Control

The dashboard expects the controller CLI to be reachable through `PIPELINE_ROOT` and `PIPELINE_CLI`.

### PowerShell

```powershell
$env:PIPELINE_ROOT = "C:\path\to\PIPELINE"
$env:PIPELINE_CLI = "C:\path\to\PIPELINE\bin\pipeline.js"
cd mission-control-source
npm start
```

### Bash

```bash
export PIPELINE_ROOT=/path/to/PIPELINE
export PIPELINE_CLI=/path/to/PIPELINE/bin/pipeline.js
cd mission-control-source
npm start
```

By default, if `mission-control-source` lives inside this repo, those variables are optional because the shared constants already resolve back to the repo root.

Open:

- [http://127.0.0.1:3000](http://127.0.0.1:3000)

The pipeline tab will proxy actions through `mission-control-source/src/routes/pipeline.js`.

## 11. Know The Current Operator Limitations

Today, the Mission Control pipeline tab supports:

- approve
- reject
- dispatch
- cancel
- slice detail inspection
- event inspection

It does **not** currently expose:

- `start`
- `import`
- `process-signals`
- `run`
- `pr`
- `sync`

That means the CLI is still required for a full end-to-end workflow.

## 12. Files To Expect During A Healthy Run

| Path | Meaning |
| --- | --- |
| `pipeline.db` | controller state database |
| `artifacts/contexts/` | generated worker context files |
| `artifacts/test-results/` | stored test results |
| `artifacts/quality-gates/` | stored quality gate evidence |
| `artifacts/logs/` | structured controller logs |
| `signals/` | inbox for worker completion signals |
| `docs/current-slice.md` | current active slice handoff |
| `docs/session-handoff.md` | latest completion handoff |
| `docs/fix-hypothesis.md` | active or cached recovery hint |

## 13. Common Gotchas

- `repo_path` defaults to `"."`, which is probably not what you want for a real product pipeline.
- The bundled quality-gate scripts are fixtures. Replace them before relying on gate enforcement.
- `gh auth status` must pass or `doctor`/`smoke` will not fully pass.
- The full Mission Control backend is Linux-oriented outside the pipeline tab.
- The runtime files under `docs/` are controller-managed and may be rewritten during execution.
