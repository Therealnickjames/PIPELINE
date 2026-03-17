'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const COVERAGE_SCRIPT = path.resolve(PROJECT_ROOT, 'scripts', 'pipeline-quality', 'write-coverage-report.js');
const MUTATION_SCRIPT = path.resolve(PROJECT_ROOT, 'scripts', 'pipeline-quality', 'write-mutation-report.js');
const BASIC_TEST_SCRIPT = path.resolve(PROJECT_ROOT, 'test', 'fixtures', 'run-basic-tests.js');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildConfig(rootDir, repoPath, overrides = {}) {
  const config = {
    schema_version: 2,
    repo_path: './target-repo',
    default_branch: 'main',
    branch_prefix: 'slice/',
    test_command: `node "${BASIC_TEST_SCRIPT}"`,
    scoped_test_command_template: '',
    db_path: './pipeline.db',
    signal_dir: './signals',
    artifacts_dir: './artifacts',
    dispatcher: {
      type: 'signal-file',
      timeout_minutes: 60,
      poll_interval_seconds: 1,
      command: {
        exec: [],
        timeout_seconds: 5,
        cwd: '.',
        env_allowlist: []
      }
    },
    runtime: {
      lease_ttl_seconds: 60,
      heartbeat_seconds: 5,
      command_output_limit_kb: 64,
      stale_execution_timeout_seconds: 10,
      command_timeout_seconds: 5
    },
    github: {
      remote: 'origin',
      timeout_seconds: 5,
      gh_exec: ['gh']
    },
    hooks: {
      failure_memory_lookup: { enabled: true, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] },
      post_edit: { enabled: false, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] },
      pre_commit: { enabled: false, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] },
      quality_gate: {
        enabled: true,
        minimum_coverage: 90,
        coverage: {
          exec: ['node', COVERAGE_SCRIPT],
          report_path: 'artifacts/quality-gates/reports/coverage.json',
          metric_path: 'coverage.percent',
          env_allowlist: ['PIPELINE_COVERAGE_PERCENT']
        },
        mutation: {
          exec: ['node', MUTATION_SCRIPT],
          report_path: 'artifacts/quality-gates/reports/mutation.json',
          pass_field: 'passed',
          env_allowlist: ['PIPELINE_MUTATION_PASSED']
        }
      },
      post_test: { enabled: false, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] },
      pre_pr: { enabled: false, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] },
      post_merge: { enabled: false, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] },
      on_failure: { enabled: false, exec: [], timeout_seconds: 5, cwd: '.', env_allowlist: [] }
    },
    auto_fix: {
      enabled: true,
      max_attempts: 1,
      agent_type: 'codex',
      timeout_minutes: 5
    },
    notifications: {
      enabled: false,
      provider: 'console',
      blocked_timeout_hours: 1
    },
    codemap: {
      path: 'codemap.json',
      conventions: ['CommonJS']
    }
  };

  return {
    ...config,
    ...overrides
  };
}

function createWorkspace(t, options = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
  const repoPath = path.resolve(rootDir, 'target-repo');
  ensureDir(repoPath);
  ensureDir(path.resolve(repoPath, 'docs'));
  ensureDir(path.resolve(repoPath, 'artifacts'));
  fs.writeFileSync(path.resolve(repoPath, 'README.md'), '# Test Repo\n', 'utf8');

  const config = buildConfig(rootDir, repoPath, options.configOverrides || {});
  fs.writeFileSync(path.resolve(rootDir, 'pipeline.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const slicesPayload = options.slicesPayload || {
    project: 'Test Pipeline',
    version: '1.0',
    slices: [
      {
        id: 'SL-100',
        title: 'Implement fixture path',
        description: 'Exercise the controller fixture path.',
        acceptance_criteria: ['Slice can move through the pipeline'],
        affected_files: ['README.md'],
        agent_type: 'codex',
        agent_instructions: 'Use the fixture repo only.',
        dependencies: []
      }
    ],
    features: [
      {
        id: 'FEAT-100',
        name: 'Fixture Feature',
        slices: ['SL-100'],
        test_suite: 'test/feature.spec.js'
      }
    ]
  };
  const slicesPath = path.resolve(rootDir, 'slices.json');
  fs.writeFileSync(slicesPath, `${JSON.stringify(slicesPayload, null, 2)}\n`, 'utf8');

  if (t && typeof t.after === 'function') {
    t.after(() => {
      fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    });
  }

  return {
    rootDir,
    repoPath,
    slicesPath,
    configPath: path.resolve(rootDir, 'pipeline.json'),
    dbPath: path.resolve(rootDir, 'pipeline.db')
  };
}

function writePreflight(repoPath) {
  const target = path.resolve(repoPath, 'docs', 'preflight.md');
  const content = [
    '# Preflight',
    '',
    '## Where we stand',
    'Fixture test baseline.',
    '',
    '## Why this slice',
    'Exercise the controller path.',
    '',
    '## Core path confirmation',
    'Signals and tests are deterministic.',
    '',
    '## Canon contradictions',
    'None.',
    '',
    '## Smallest implementation plan',
    'Make the fixture move one state at a time.'
  ].join('\n');
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, `${content}\n`, 'utf8');
}

function writeTestControl(repoPath, payload) {
  const target = path.resolve(repoPath, 'artifacts', 'test-control.json');
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeSignal(rootDir, sliceId, payload) {
  const target = path.resolve(rootDir, 'signals', `${sliceId}-done.json`);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

function createGitAdapterStub() {
  return {
    ensureGitRepo() {
      return true;
    },
    ensureBranch(branchName, baseBranch) {
      return { branch: branchName, base: baseBranch };
    },
    getRemoteStatus() {
      return { passed: true };
    },
    pushBranch(branchName) {
      return { branch: branchName };
    },
    getCurrentBranch() {
      return 'main';
    },
    ensureBaseBranchExists() {
      return { passed: true };
    },
    authDoctor() {
      return { passed: true };
    }
  };
}

function createGitHubAdapterStub(sequence = []) {
  const statuses = [...sequence];
  return {
    ensureAuth() {
      return { passed: true };
    },
    openPR(slice, branchName) {
      return {
        url: `https://example.test/${branchName}`,
        number: 42,
        command_run: null
      };
    },
    getPRStatus() {
      return statuses.length > 0
        ? statuses.shift()
        : { number: 42, state: 'MERGED', closed: true, merged: true, url: 'https://example.test/pr/42', command_run: null };
    }
  };
}

module.exports = {
  PROJECT_ROOT,
  createWorkspace,
  writePreflight,
  writeTestControl,
  writeSignal,
  createGitAdapterStub,
  createGitHubAdapterStub
};
