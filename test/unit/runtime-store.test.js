'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../lib/config.js');
const { getDb, resetDbCache } = require('../../lib/db.js');
const { withOperation, acquireLease } = require('../../lib/runtime-store.js');
const { createWorkspace } = require('../helpers/workspace.js');

test('withOperation deduplicates repeated request ids', async (t) => {
  const workspace = createWorkspace(t);
  const config = loadConfig(workspace.rootDir);
  getDb(config);

  const first = withOperation(config, {
    requestId: 'req-123',
    operationName: 'approve',
    targetId: 'SL-100',
    actor: 'sse'
  }, () => ({
    status: 'ok',
    meta: {
      request_id: 'req-123'
    }
  }));

  const second = withOperation(config, {
    requestId: 'req-123',
    operationName: 'approve',
    targetId: 'SL-100',
    actor: 'sse'
  }, () => {
    throw new Error('should not run duplicate callback');
  });

  assert.equal(first.status, 'ok');
  assert.equal(second.meta.request_id, 'req-123');
  assert.equal(second.meta.duplicate, true);
  resetDbCache();
});

test('acquireLease blocks a second active owner', async (t) => {
  const workspace = createWorkspace(t);
  const config = loadConfig(workspace.rootDir);
  getDb(config);

  acquireLease(config, 'pipeline-runner', 'owner-a');
  assert.throws(() => acquireLease(config, 'pipeline-runner', 'owner-b'), /Lease pipeline-runner is held by owner-a/);
  resetDbCache();
});
