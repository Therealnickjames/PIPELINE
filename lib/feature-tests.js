'use strict';

const { spawnSync } = require('child_process');
const { FEATURE_PHASES } = require('./constants.js');

function buildCommand(config, feature, phase) {
  if (feature.test_suite) {
    if (config.scopedTestCommandTemplate) {
      return config.scopedTestCommandTemplate.replace(/\{files\}/g, `"${feature.test_suite}"`);
    }

    if (/npm\s+test/i.test(config.testCommand)) {
      return `${config.testCommand} -- "${feature.test_suite}"`;
    }

    return `${config.testCommand} "${feature.test_suite}"`;
  }

  return config.testCommand;
}

function runPhase(config, feature, phase) {
  const command = buildCommand(config, feature, phase);
  const result = spawnSync(command, {
    cwd: config.repoPath,
    encoding: 'utf8',
    shell: true
  });

  return {
    phase: phase.label,
    state: phase.state,
    command,
    passed: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
}

function runFeatureSuite(config, feature) {
  const results = [];

  for (const phase of FEATURE_PHASES) {
    const result = runPhase(config, feature, phase);
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
