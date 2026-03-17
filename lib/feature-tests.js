'use strict';

const { FEATURE_PHASES } = require('./constants.js');
const { runCommand, legacyShellExec } = require('./command-runner.js');

function buildCommand(config, feature, phase) {
  if (feature.test_suite) {
    if (config.scopedTestCommandTemplate) {
      return legacyShellExec(
        config.scopedTestCommandTemplate.replace(/\{files\}/g, `"${feature.test_suite}"`)
      );
    }

    if (/npm\s+test/i.test(config.testCommand)) {
      return legacyShellExec(`${config.testCommand} -- "${feature.test_suite}"`);
    }

    return legacyShellExec(`${config.testCommand} "${feature.test_suite}"`);
  }

  return legacyShellExec(config.testCommand);
}

function runPhase(config, feature, phase, metadata = {}) {
  const exec = buildCommand(config, feature, phase);
  const result = runCommand(
    config,
    {
      name: `feature:${phase.label}`,
      exec,
      cwd: config.repoPath,
      timeoutSeconds: config.runtime.commandTimeoutSeconds,
      envAllowlist: []
    },
    {
      ...metadata,
      phase: phase.state
    }
  );

  return {
    phase: phase.label,
    state: phase.state,
    command: exec,
    passed: result.exitCode === 0,
    output: `${result.stdout}\n${result.stderr}`.trim(),
    command_run: result
  };
}

function runFeatureSuite(config, feature, metadata = {}) {
  const results = [];

  for (const phase of FEATURE_PHASES) {
    const result = runPhase(config, feature, phase, metadata);
    results.push(result);
    if (!result.passed) {
      return {
        status: 'FEATURE_FAILED',
        results
      };
    }
  }

  return {
    status: 'FEATURE_COMPLETE',
    results
  };
}

module.exports = {
  runFeatureSuite
};
