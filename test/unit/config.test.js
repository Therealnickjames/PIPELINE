'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('../../lib/config.js');

test('loadConfig normalizes legacy command config and emits warnings', async (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-config-test-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  fs.mkdirSync(path.resolve(rootDir, 'repo'), { recursive: true });

  const config = {
    repo_path: './repo',
    hooks: {
      post_edit: {
        enabled: true,
        command: 'echo post-edit'
      },
      failure_memory_lookup: {
        enabled: true,
        exec: []
      },
      post_test: {
        enabled: false,
        exec: []
      },
      pre_pr: {
        enabled: false,
        exec: []
      },
      post_merge: {
        enabled: false,
        exec: []
      },
      on_failure: {
        enabled: false,
        exec: []
      }
    },
    quality_gate: {
      enabled: true,
      minimum_coverage: 90,
      coverage_command: 'npm run coverage',
      mutation_command: 'npm run mutation',
      coverage: {
        report_path: 'coverage.json',
        metric_path: 'coverage.percent'
      },
      mutation: {
        report_path: 'mutation.json',
        pass_field: 'passed'
      }
    }
  };

  fs.writeFileSync(path.resolve(rootDir, 'pipeline.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const loaded = loadConfig(rootDir);

  assert.equal(loaded.repoPath, path.resolve(rootDir, 'repo'));
  assert.ok(Array.isArray(loaded.hooks.post_edit.exec));
  assert.ok(Array.isArray(loaded.qualityGate.coverage.exec));
  assert.ok(Array.isArray(loaded.qualityGate.mutation.exec));
  assert.ok(loaded.warnings.length >= 2);
});
