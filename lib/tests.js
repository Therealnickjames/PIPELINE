'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { nowIso, shellQuoteList, writeJson } = require('./utils.js');

function buildCommand(config, slice) {
  if (config.scopedTestCommandTemplate && slice.affected_files.length > 0) {
    return config.scopedTestCommandTemplate.replace(/\{files\}/g, shellQuoteList(slice.affected_files));
  }

  return config.testCommand;
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

function run(config, slice) {
  const command = buildCommand(config, slice);
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd: config.repoPath,
    encoding: 'utf8',
    shell: true
  });
  const duration = Date.now() - startedAt;
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const parsed = parseOutput(output);
  const passed = result.status === 0;
  const artifact = {
    slice_id: slice.id,
    command,
    passed,
    output,
    duration_ms: duration,
    passCount: parsed.passCount,
    failCount: parsed.failCount,
    skippedCount: parsed.skippedCount,
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
