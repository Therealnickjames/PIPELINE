'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { nowIso, shellQuoteList, writeJson } = require('./utils.js');

function interpolate(template, context) {
  return String(template || '')
    .replace(/\{slice_id\}/g, context.sliceId || '')
    .replace(/\{repo_path\}/g, context.repoPath || '')
    .replace(/\{minimum_coverage\}/g, String(context.minimumCoverage || ''))
    .replace(/\{files\}/g, shellQuoteList(context.files || []))
    .trim();
}

function runCommand(command, cwd) {
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd,
    encoding: 'utf8',
    shell: true
  });

  return {
    command,
    exit_code: Number.isInteger(result.status) ? result.status : 1,
    passed: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    duration_ms: Date.now() - startedAt
  };
}

function parseCoverageOutput(output) {
  const text = String(output || '').trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const candidates = [
      parsed.coverage,
      parsed.percentage,
      parsed.percent,
      parsed.total && parsed.total.lines && parsed.total.lines.pct,
      parsed.total && parsed.total.statements && parsed.total.statements.pct,
      parsed.lines && parsed.lines.pct
    ].filter((value) => value !== undefined && value !== null);
    if (candidates.length > 0) {
      return Number(candidates[0]);
    }
  } catch (error) {
    // fall through to regex parsing
  }

  const totalMatch = text.match(/total[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  if (totalMatch) {
    return Number(totalMatch[1]);
  }

  const genericMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return genericMatch ? Number(genericMatch[1]) : null;
}

function parseMutationOutput(output, commandResult) {
  const text = String(output || '').trim();
  if (!text) {
    return {
      passed: commandResult.passed,
      summary: commandResult.passed ? 'Mutation command exited successfully.' : 'Mutation command failed without output.'
    };
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.passed === 'boolean') {
      return {
        passed: parsed.passed,
        summary: parsed.summary || text
      };
    }
  } catch (error) {
    // fall through to heuristic parsing
  }

  return {
    passed: commandResult.passed,
    summary: text
  };
}

function run(config, slice) {
  if (!config.qualityGate.enabled) {
    return {
      passed: true,
      skipped: true,
      minimum_coverage: config.qualityGate.minimumCoverage,
      created_at: nowIso()
    };
  }

  const coverageCommand = interpolate(config.qualityGate.coverageCommand, {
    sliceId: slice.id,
    repoPath: config.repoPath,
    minimumCoverage: config.qualityGate.minimumCoverage,
    files: slice.affected_files
  });
  const mutationCommand = interpolate(config.qualityGate.mutationCommand, {
    sliceId: slice.id,
    repoPath: config.repoPath,
    minimumCoverage: config.qualityGate.minimumCoverage,
    files: slice.affected_files
  });

  const coverageResult = runCommand(coverageCommand, config.repoPath);
  const coveragePercent = parseCoverageOutput(coverageResult.output);
  const mutationCommandResult = runCommand(mutationCommand, config.repoPath);
  const mutation = parseMutationOutput(mutationCommandResult.output, mutationCommandResult);
  const passed = coverageResult.passed
    && coveragePercent !== null
    && coveragePercent >= config.qualityGate.minimumCoverage
    && mutation.passed;

  const artifact = {
    slice_id: slice.id,
    passed,
    minimum_coverage: config.qualityGate.minimumCoverage,
    coverage: {
      command: coverageResult.command,
      exit_code: coverageResult.exit_code,
      passed: coverageResult.passed,
      percent: coveragePercent,
      output: coverageResult.output,
      duration_ms: coverageResult.duration_ms
    },
    mutation: {
      command: mutationCommandResult.command,
      exit_code: mutationCommandResult.exit_code,
      passed: mutation.passed,
      output: mutationCommandResult.output,
      summary: mutation.summary,
      duration_ms: mutationCommandResult.duration_ms
    },
    created_at: nowIso()
  };

  const target = path.resolve(config.paths.qualityGateDir, `${slice.id}-${Date.now()}.json`);
  writeJson(target, artifact);
  artifact.artifact_path = target;

  return artifact;
}

module.exports = {
  interpolate,
  parseCoverageOutput,
  parseMutationOutput,
  run
};
