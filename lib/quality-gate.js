'use strict';

const path = require('path');
const { deepGet, nowIso, readJson, resolveFrom, writeJson } = require('./utils.js');
const { runCommand } = require('./command-runner.js');

function resolveReportPath(config, relativePath) {
  return resolveFrom(config.repoPath, relativePath);
}

function parseLegacyCoverageOutput(output) {
  const text = String(output || '').trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return Number(parsed.coverage ?? parsed.percent ?? parsed.percentage ?? parsed.total?.lines?.pct ?? parsed.total?.statements?.pct);
  } catch (error) {
    const genericMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    return genericMatch ? Number(genericMatch[1]) : null;
  }
}

function runCoverage(config, slice, metadata) {
  const coverage = config.qualityGate.coverage;
  const commandRun = runCommand(
    config,
    {
      name: 'quality-gate:coverage',
      exec: coverage.exec,
      cwd: resolveFrom(config.repoPath, coverage.cwd),
      timeoutSeconds: coverage.timeoutSeconds,
      envAllowlist: coverage.envAllowlist
    },
    {
      ...metadata,
      sliceId: slice.id,
      phase: 'QUALITY_GATE'
    }
  );

  const reportPath = coverage.reportPath ? resolveReportPath(config, coverage.reportPath) : '';
  let report = reportPath ? readJson(reportPath, null) : null;
  let percent = report ? Number(deepGet(report, coverage.metricPath, null)) : null;

  if (percent === null || Number.isNaN(percent)) {
    percent = parseLegacyCoverageOutput(`${commandRun.stdout}\n${commandRun.stderr}`);
  }

  return {
    command_run: commandRun,
    report_path: reportPath || null,
    report,
    percent
  };
}

function runMutation(config, slice, metadata) {
  const mutation = config.qualityGate.mutation;
  const commandRun = runCommand(
    config,
    {
      name: 'quality-gate:mutation',
      exec: mutation.exec,
      cwd: resolveFrom(config.repoPath, mutation.cwd),
      timeoutSeconds: mutation.timeoutSeconds,
      envAllowlist: mutation.envAllowlist
    },
    {
      ...metadata,
      sliceId: slice.id,
      phase: 'QUALITY_GATE'
    }
  );

  const reportPath = mutation.reportPath ? resolveReportPath(config, mutation.reportPath) : '';
  let report = reportPath ? readJson(reportPath, null) : null;
  let passed = report ? Boolean(deepGet(report, mutation.passField, null)) : null;

  if (passed === null) {
    try {
      const parsed = JSON.parse(`${commandRun.stdout}\n${commandRun.stderr}`.trim());
      passed = Boolean(parsed.passed);
    } catch (error) {
      passed = commandRun.exitCode === 0;
    }
  }

  return {
    command_run: commandRun,
    report_path: reportPath || null,
    report,
    passed
  };
}

function run(config, slice, metadata = {}) {
  if (!config.qualityGate.enabled) {
    return {
      passed: true,
      skipped: true,
      minimum_coverage: config.qualityGate.minimumCoverage,
      created_at: nowIso()
    };
  }

  const coverage = runCoverage(config, slice, metadata);
  const mutation = runMutation(config, slice, metadata);
  const passed = coverage.command_run.exitCode === 0
    && coverage.percent !== null
    && coverage.percent >= config.qualityGate.minimumCoverage
    && mutation.command_run.exitCode === 0
    && mutation.passed === true;

  const artifact = {
    slice_id: slice.id,
    passed,
    minimum_coverage: config.qualityGate.minimumCoverage,
    coverage: {
      exec: config.qualityGate.coverage.exec,
      report_path: coverage.report_path,
      metric_path: config.qualityGate.coverage.metricPath,
      percent: coverage.percent,
      command_run: coverage.command_run
    },
    mutation: {
      exec: config.qualityGate.mutation.exec,
      report_path: mutation.report_path,
      pass_field: config.qualityGate.mutation.passField,
      passed: mutation.passed,
      command_run: mutation.command_run
    },
    created_at: nowIso()
  };

  const target = path.resolve(config.paths.qualityGateDir, `${slice.id}-${Date.now()}.json`);
  writeJson(target, artifact);
  artifact.artifact_path = target;
  return artifact;
}

module.exports = {
  run,
  runCoverage,
  runMutation
};
