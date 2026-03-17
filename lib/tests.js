'use strict';

const path = require('path');
const { nowIso, writeJson } = require('./utils.js');
const { runCommand, legacyShellExec } = require('./command-runner.js');

function buildCommand(config, slice) {
  if (config.scopedTestCommandTemplate && slice.affected_files.length > 0) {
    return legacyShellExec(
      config.scopedTestCommandTemplate.replace(/\{files\}/g, slice.affected_files.map((item) => `"${item}"`).join(' '))
    );
  }

  return legacyShellExec(config.testCommand);
}

function parseOutput(raw) {
  const output = String(raw || '');
  const passMatch = output.match(/(\d+)\s+passing/i) || output.match(/(\d+)\s+passed/i);
  const failMatch = output.match(/(\d+)\s+failing/i) || output.match(/(\d+)\s+failed/i);
  const skippedMatch = output.match(/(\d+)\s+skipped/i);

  return {
    passCount: passMatch ? Number(passMatch[1]) : 0,
    failCount: failMatch ? Number(failMatch[1]) : 0,
    skippedCount: skippedMatch ? Number(skippedMatch[1]) : 0
  };
}

function run(config, slice, metadata = {}) {
  const exec = buildCommand(config, slice);
  const result = runCommand(
    config,
    {
      name: 'slice-tests',
      exec,
      cwd: config.repoPath,
      timeoutSeconds: config.runtime.commandTimeoutSeconds,
      envAllowlist: []
    },
    {
      ...metadata,
      sliceId: slice.id,
      phase: metadata.phase || 'TESTING'
    }
  );

  const parsed = parseOutput(`${result.stdout}\n${result.stderr}`);
  const artifact = {
    slice_id: slice.id,
    command: exec,
    passed: result.exitCode === 0,
    output: `${result.stdout}\n${result.stderr}`.trim(),
    duration_ms: result.durationMs,
    passCount: parsed.passCount,
    failCount: parsed.failCount,
    skippedCount: parsed.skippedCount,
    command_run_id: result.commandRunId || null,
    created_at: nowIso()
  };

  const target = path.resolve(config.paths.testResultsDir, `${slice.id}-${Date.now()}.json`);
  writeJson(target, artifact);

  return {
    ...artifact,
    artifact_path: target
  };
}

module.exports = {
  buildCommand,
  parseOutput,
  run
};
