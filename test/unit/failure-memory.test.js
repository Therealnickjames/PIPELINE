'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { PipelineService } = require('../../lib/service.js');
const failureMemory = require('../../lib/failure-memory.js');
const { getDb, resetDbCache } = require('../../lib/db.js');
const { createWorkspace, createGitAdapterStub, createGitHubAdapterStub } = require('../helpers/workspace.js');

test('failure memory lookup applies cached hypothesis notes', async (t) => {
  const workspace = createWorkspace(t);
  const service = new PipelineService(workspace.rootDir, {
    gitAdapter: createGitAdapterStub(),
    githubAdapter: createGitHubAdapterStub()
  });
  service.importFromFile(workspace.slicesPath, { requestId: 'import-1', actor: 'system' });
  const db = getDb(service.config);
  db.prepare(`
    INSERT INTO failure_patterns (slice_id, error_signature, successful_fix, timestamp, frequency)
    VALUES (?, ?, ?, ?, ?)
  `).run('SL-099', 'failed tests::tests failed for sl 100::README.md', 'Reuse the earlier minimal fixture update.', new Date().toISOString(), 3);

  service.startSlice('SL-100', 'sse', { requestId: 'start-1' });
  service.approveSlice('SL-100', 'ready', 'sse', { requestId: 'approve-1' });
  db.prepare(`
    UPDATE slices
    SET last_failure_type = ?, last_failure_reason = ?
    WHERE id = ?
  `).run('FAILED_TESTS', 'Tests failed for SL-100', 'SL-100');

  const slice = service.showSlice('SL-100').slice;
  const lookup = failureMemory.lookup(service.config, slice);
  const applied = failureMemory.applyCachedFix(service.config, slice, lookup);
  const hypothesisPath = path.resolve(service.config.paths.docsDir, 'fix-hypothesis.md');
  const content = fs.readFileSync(hypothesisPath, 'utf8');

  assert.equal(lookup.matched, true);
  assert.equal(applied.applied, true);
  assert.match(content, /Cached Winning Pattern/);
  resetDbCache();
});
