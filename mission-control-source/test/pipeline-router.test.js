'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const request = require('supertest');
const childProcess = require('child_process');

function loadRouter() {
  const routerPath = path.resolve(__dirname, '..', 'src', 'routes', 'pipeline.js');
  const constantsPath = path.resolve(__dirname, '..', 'shared', 'constants.js');
  delete require.cache[routerPath];
  delete require.cache[constantsPath];
  return require(routerPath);
}

test('pipeline router returns not_initialized when CLI is missing', async () => {
  process.env.PIPELINE_ROOT = path.resolve(__dirname, '..', 'missing-pipeline-root');
  process.env.PIPELINE_CLI = path.resolve(__dirname, '..', 'missing-pipeline-root', 'bin', 'pipeline.js');

  const app = express();
  app.use('/api/pipeline', loadRouter());
  const response = await request(app).get('/api/pipeline/status');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'pipeline_not_initialized');
});

test('pipeline router proxies controller status successfully', async () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  process.env.PIPELINE_ROOT = repoRoot;
  process.env.PIPELINE_CLI = path.resolve(repoRoot, 'bin', 'pipeline.js');
  const originalSpawnSync = childProcess.spawnSync;
  childProcess.spawnSync = () => ({
    status: 0,
    stdout: JSON.stringify({
      status: 'ok',
      summary: {
        counts: { APPROVED: 1 },
        display_counts: { APPROVED: 1 },
        active_slice: null,
        next_ready_slice: 'slice-001',
        merged_count: 0,
        total_slices: 1,
        attention_count: 0,
        feature_counts: {}
      }
    }),
    stderr: ''
  });

  try {
    const app = express();
    app.use('/api/pipeline', loadRouter());
    const response = await request(app).get('/api/pipeline/status');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.ok(response.body.summary);
    assert.equal(response.body.summary.next_ready_slice, 'slice-001');
  } finally {
    childProcess.spawnSync = originalSpawnSync;
  }
});
