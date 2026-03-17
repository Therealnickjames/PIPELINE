'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PipelineService } = require('../../lib/service.js');
const { getDb, resetDbCache } = require('../../lib/db.js');
const {
  createWorkspace,
  writePreflight,
  writeTestControl,
  writeSignal,
  createGitAdapterStub,
  createGitHubAdapterStub
} = require('../helpers/workspace.js');

test('happy path moves a slice from import to merged', async (t) => {
  const workspace = createWorkspace(t);
  const service = new PipelineService(workspace.rootDir, {
    gitAdapter: createGitAdapterStub(),
    githubAdapter: createGitHubAdapterStub([
      { number: 42, state: 'MERGED', closed: true, merged: true, url: 'https://example.test/pr/42', command_run: null }
    ])
  });

  service.importFromFile(workspace.slicesPath, { requestId: 'import-happy', actor: 'system' });
  service.startSlice('SL-100', 'sse', { requestId: 'start-happy' });
  service.approveSlice('SL-100', 'approved', 'sse', { requestId: 'approve-happy' });
  service.dispatchSlice('SL-100', 'sse', { requestId: 'dispatch-happy' });

  writePreflight(workspace.repoPath);
  writeSignal(workspace.rootDir, 'SL-100', {
    slice_id: 'SL-100',
    success: true,
    status: 'done',
    summary: 'Implemented fixture path',
    files_changed: ['README.md'],
    handoff_notes: 'Ready for tests',
    known_issues: [],
    tests: { summary: 'pending' },
    preflight_summary: 'all sections complete',
    completed_at: new Date().toISOString(),
    codemap_updates: []
  });
  service.processSignals('SL-100', 'system', { requestId: 'signals-happy' });

  writeTestControl(workspace.repoPath, { passed: true, passCount: 4, failCount: 0 });
  process.env.PIPELINE_COVERAGE_PERCENT = '96';
  process.env.PIPELINE_MUTATION_PASSED = 'true';
  service.runTestsForSlice('SL-100', 'system', { request_id: 'tests-happy' });

  service.createPr('SL-100', 'system', { requestId: 'pr-happy' });
  service.syncSlice('SL-100', 'system', { requestId: 'sync-happy' });

  const slice = service.showSlice('SL-100').slice;
  const features = service.getFeatures().features;
  assert.equal(slice.status, 'MERGED');
  assert.equal(slice.test_results.passed, true);
  assert.equal(slice.test_results.quality_gate.passed, true);
  assert.equal(features[0].status, 'FEATURE_COMPLETE');
  resetDbCache();
});

test('basic test failure routes through AUTO_FIX and recovers', async (t) => {
  const workspace = createWorkspace(t);
  const service = new PipelineService(workspace.rootDir, {
    gitAdapter: createGitAdapterStub(),
    githubAdapter: createGitHubAdapterStub()
  });

  service.importFromFile(workspace.slicesPath, { requestId: 'import-fix', actor: 'system' });
  service.startSlice('SL-100', 'sse', { requestId: 'start-fix' });
  service.approveSlice('SL-100', 'approved', 'sse', { requestId: 'approve-fix' });
  service.dispatchSlice('SL-100', 'sse', { requestId: 'dispatch-fix' });

  writePreflight(workspace.repoPath);
  writeSignal(workspace.rootDir, 'SL-100', {
    slice_id: 'SL-100',
    success: true,
    status: 'done',
    summary: 'Initial attempt complete',
    files_changed: ['README.md'],
    handoff_notes: 'Tests failing',
    known_issues: ['Fixture test should fail once'],
    tests: { summary: 'pending' },
    preflight_summary: 'all sections complete',
    completed_at: new Date().toISOString(),
    codemap_updates: []
  });
  service.processSignals('SL-100', 'system', { requestId: 'signals-fix' });

  writeTestControl(workspace.repoPath, { passed: false, passCount: 1, failCount: 1 });
  process.env.PIPELINE_COVERAGE_PERCENT = '95';
  process.env.PIPELINE_MUTATION_PASSED = 'true';
  service.runTestsForSlice('SL-100', 'system', { request_id: 'tests-fail' });
  assert.equal(service.showSlice('SL-100').slice.status, 'AUTO_FIX');

  writeSignal(workspace.rootDir, 'SL-100', {
    slice_id: 'SL-100',
    success: true,
    status: 'done',
    summary: 'Applied minimal fix',
    files_changed: ['README.md'],
    handoff_notes: 'Retry tests',
    known_issues: [],
    tests: { summary: 'pending' },
    preflight_summary: 'not required in auto-fix',
    completed_at: new Date().toISOString(),
    codemap_updates: []
  });
  service.processSignals('SL-100', 'system', { requestId: 'signals-fix-2' });

  writeTestControl(workspace.repoPath, { passed: true, passCount: 3, failCount: 0 });
  service.runTestsForSlice('SL-100', 'system', { request_id: 'tests-pass' });

  const slice = service.showSlice('SL-100').slice;
  assert.equal(slice.status, 'TESTING');
  assert.equal(slice.fix_attempts, 1);
  assert.equal(slice.test_results.passed, true);
  resetDbCache();
});

test('needs_split path parks the slice and allows replacement import', async (t) => {
  const workspace = createWorkspace(t);
  const service = new PipelineService(workspace.rootDir, {
    gitAdapter: createGitAdapterStub(),
    githubAdapter: createGitHubAdapterStub()
  });

  service.importFromFile(workspace.slicesPath, { requestId: 'import-split', actor: 'system' });
  service.startSlice('SL-100', 'sse', { requestId: 'start-split' });
  service.approveSlice('SL-100', 'approved', 'sse', { requestId: 'approve-split' });
  service.dispatchSlice('SL-100', 'sse', { requestId: 'dispatch-split' });

  writePreflight(workspace.repoPath);
  writeSignal(workspace.rootDir, 'SL-100', {
    slice_id: 'SL-100',
    success: false,
    status: 'needs_split',
    needs_split: true,
    split_reason: 'Work is larger than one slice',
    summary: 'Split required',
    files_changed: ['README.md'],
    handoff_notes: 'Split into smaller slices',
    known_issues: [],
    tests: { summary: 'not run' },
    preflight_summary: 'all sections complete',
    completed_at: new Date().toISOString(),
    codemap_updates: []
  });
  service.processSignals('SL-100', 'system', { requestId: 'signals-split' });
  assert.equal(service.showSlice('SL-100').slice.status, 'NEEDS_SPLIT');

  const replacementPayload = {
    project: 'Replacement',
    version: '1.0',
    slices: [
      {
        id: 'SL-101',
        title: 'Split A',
        description: 'First replacement slice.',
        acceptance_criteria: ['A exists'],
        affected_files: ['README.md'],
        agent_type: 'codex',
        agent_instructions: 'Replacement A',
        dependencies: []
      },
      {
        id: 'SL-102',
        title: 'Split B',
        description: 'Second replacement slice.',
        acceptance_criteria: ['B exists'],
        affected_files: ['README.md'],
        agent_type: 'codex',
        agent_instructions: 'Replacement B',
        dependencies: ['SL-101']
      }
    ]
  };
  const replacementPath = `${workspace.rootDir}\\replacement.json`;
  require('fs').writeFileSync(replacementPath, `${JSON.stringify(replacementPayload, null, 2)}\n`, 'utf8');
  service.importFromFile(replacementPath, { requestId: 'import-replacement', actor: 'system' });

  const slices = service.listSlices().slices.map((slice) => slice.id);
  assert.ok(slices.includes('SL-101'));
  assert.ok(slices.includes('SL-102'));
  resetDbCache();
});

test('reconcile marks stale active slices back to approved failure state', async (t) => {
  const workspace = createWorkspace(t);
  const service = new PipelineService(workspace.rootDir, {
    gitAdapter: createGitAdapterStub(),
    githubAdapter: createGitHubAdapterStub()
  });

  service.importFromFile(workspace.slicesPath, { requestId: 'import-reconcile', actor: 'system' });
  service.startSlice('SL-100', 'sse', { requestId: 'start-reconcile' });
  service.approveSlice('SL-100', 'approved', 'sse', { requestId: 'approve-reconcile' });
  service.dispatchSlice('SL-100', 'sse', { requestId: 'dispatch-reconcile' });

  const db = getDb(service.config);
  db.prepare(`
    UPDATE slices
    SET updated_at = ?, dispatched_at = ?
    WHERE id = ?
  `).run('2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z', 'SL-100');

  service.reconcile({ requestId: 'reconcile-run', actor: 'system' });
  const slice = service.showSlice('SL-100').slice;
  assert.equal(slice.status, 'APPROVED');
  assert.equal(slice.display_status, 'FAILED_EXECUTION');
  resetDbCache();
});
