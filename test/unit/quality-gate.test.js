'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../lib/config.js');
const qualityGate = require('../../lib/quality-gate.js');
const { createWorkspace } = require('../helpers/workspace.js');

test('quality gate reads structured report artifacts and passes on threshold', async () => {
  const workspace = createWorkspace();
  const config = loadConfig(workspace.rootDir);
  process.env.PIPELINE_COVERAGE_PERCENT = '95';
  process.env.PIPELINE_MUTATION_PASSED = 'true';

  const result = qualityGate.run(config, {
    id: 'SL-100'
  });

  assert.equal(result.passed, true);
  assert.equal(result.coverage.percent, 95);
  assert.equal(result.mutation.passed, true);
});

test('quality gate fails when coverage or mutation threshold is missed', async () => {
  const workspace = createWorkspace();
  const config = loadConfig(workspace.rootDir);
  process.env.PIPELINE_COVERAGE_PERCENT = '88';
  process.env.PIPELINE_MUTATION_PASSED = 'false';

  const result = qualityGate.run(config, {
    id: 'SL-100'
  });

  assert.equal(result.passed, false);
  assert.equal(result.coverage.percent, 88);
  assert.equal(result.mutation.passed, false);
});
