# Current Slice: SL-001

**Title:** Bootstrap pipeline package
**Status:** APPROVED
**Agent:** codex
**Dependencies:** None

## Spec
Create the package metadata, config loader, and runtime directories.

## Acceptance Criteria
- package.json exists with the required dependencies
- pipeline.json loads successfully
- Runtime directories are created on startup

## Affected Files
- package.json
- pipeline.json
- lib/config.js

## Agent Instructions
Keep the implementation CommonJS-only and synchronous where possible.

## Do Not
- Do not refactor files outside the affected files list
- Do not add capabilities beyond this slice
- Do not redesign existing interfaces
