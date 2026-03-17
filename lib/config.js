'use strict';

const path = require('path');
const fs = require('fs');
const { PipelineError } = require('./errors.js');
const { ensureDir, readJson } = require('./utils.js');

function resolveFromRoot(rootDir, value) {
  if (!value) {
    return rootDir;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(rootDir, value);
}

function loadConfig(rootDir = path.resolve(__dirname, '..')) {
  const configPath = path.resolve(rootDir, 'pipeline.json');
  if (!fs.existsSync(configPath)) {
    throw new PipelineError('CONFIG_MISSING', `Missing pipeline config at ${configPath}`);
  }

  const config = readJson(configPath, null);
  if (!config) {
    throw new PipelineError('CONFIG_INVALID', `Invalid JSON in ${configPath}`);
  }

  const repoPath = resolveFromRoot(rootDir, config.repo_path || '.');
  const dbPath = resolveFromRoot(rootDir, config.db_path || 'pipeline.db');
  const signalDir = resolveFromRoot(rootDir, config.signal_dir || 'signals');
  const artifactsDir = resolveFromRoot(rootDir, config.artifacts_dir || 'artifacts');
  const codemapPath = path.resolve(repoPath, config.codemap?.path || 'codemap.json');
  const docsDir = path.resolve(repoPath, 'docs');
  const failureMemoryHook = config.hooks?.failure_memory_lookup || {};
  const qualityGateHook = config.hooks?.quality_gate || {};

  const normalized = {
    rootDir,
    configPath,
    repoPath,
    defaultBranch: config.default_branch || 'main',
    branchPrefix: config.branch_prefix || 'slice/',
    testCommand: config.test_command || 'npm test',
    scopedTestCommandTemplate: config.scoped_test_command_template || '',
    dispatcher: {
      type: config.dispatcher?.type || 'signal-file',
      timeoutMinutes: Number(config.dispatcher?.timeout_minutes || 60),
      pollIntervalSeconds: Number(config.dispatcher?.poll_interval_seconds || 30),
      commandTemplate: config.dispatcher?.command_template || ''
    },
    hooks: config.hooks || {},
    failureMemory: {
      enabled: failureMemoryHook.enabled !== false
    },
    qualityGate: {
      enabled: qualityGateHook.enabled !== false,
      minimumCoverage: Number(qualityGateHook.minimum_coverage || 90),
      coverageCommand: qualityGateHook.coverage_command || 'npm run coverage',
      mutationCommand: qualityGateHook.mutation_command || 'npm run mutation'
    },
    autoFix: {
      enabled: config.auto_fix?.enabled !== false,
      maxAttempts: Number(config.auto_fix?.max_attempts || 1),
      agentType: config.auto_fix?.agent_type || 'codex',
      timeoutMinutes: Number(config.auto_fix?.timeout_minutes || 30)
    },
    notifications: {
      enabled: config.notifications?.enabled !== false,
      provider: config.notifications?.provider || 'console',
      blockedTimeoutHours: Number(config.notifications?.blocked_timeout_hours || 2)
    },
    codemap: {
      path: codemapPath,
      conventions: Array.isArray(config.codemap?.conventions) ? config.codemap.conventions : []
    },
    paths: {
      dbPath,
      signalDir,
      artifactsDir,
      docsDir,
      codemapPath,
      contextsDir: path.resolve(artifactsDir, 'contexts'),
      testResultsDir: path.resolve(artifactsDir, 'test-results'),
      qualityGateDir: path.resolve(artifactsDir, 'quality-gates'),
      notificationsDir: path.resolve(artifactsDir, 'notifications'),
      logsDir: path.resolve(artifactsDir, 'logs')
    }
  };

  ensureDir(path.dirname(dbPath));
  ensureDir(signalDir);
  ensureDir(artifactsDir);
  ensureDir(normalized.paths.contextsDir);
  ensureDir(normalized.paths.testResultsDir);
  ensureDir(normalized.paths.qualityGateDir);
  ensureDir(normalized.paths.notificationsDir);
  ensureDir(normalized.paths.logsDir);

  return normalized;
}

module.exports = {
  loadConfig
};
