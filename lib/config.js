'use strict';

const path = require('path');
const fs = require('fs');
const { PipelineError } = require('./errors.js');
const { ensureDir, readJson, resolveFrom } = require('./utils.js');
const { legacyShellExec } = require('./command-runner.js');

const HOOK_NAMES = [
  'failure_memory_lookup',
  'post_edit',
  'pre_commit',
  'post_test',
  'pre_pr',
  'post_merge',
  'on_failure'
];

function resolveFromRoot(rootDir, value) {
  return resolveFrom(rootDir, value);
}

function normalizeExec(execValue, legacyCommand, warnings, warningLabel) {
  if (Array.isArray(execValue) && execValue.length > 0) {
    return execValue.map((token) => String(token));
  }

  if (typeof legacyCommand === 'string' && legacyCommand.trim()) {
    warnings.push({
      code: 'LEGACY_COMMAND_CONFIG',
      message: `${warningLabel} uses deprecated string command config`
    });
    return legacyShellExec(legacyCommand.trim());
  }

  return [];
}

function normalizeHook(configHook = {}, hookName, warnings) {
  return {
    enabled: configHook.enabled !== false,
    exec: normalizeExec(configHook.exec, configHook.command, warnings, `hooks.${hookName}`),
    timeoutSeconds: Number(configHook.timeout_seconds || configHook.timeoutSeconds || 30),
    cwd: configHook.cwd || '.',
    envAllowlist: Array.isArray(configHook.env_allowlist || configHook.envAllowlist)
      ? [...(configHook.env_allowlist || configHook.envAllowlist)]
      : [],
    actions: Array.isArray(configHook.actions) ? [...configHook.actions] : [],
    legacyCommand: typeof configHook.command === 'string' ? configHook.command : ''
  };
}

function normalizeQualityGate(raw = {}, warnings) {
  const legacyCoverageCommand = raw.coverage_command || '';
  const legacyMutationCommand = raw.mutation_command || '';
  const coverage = raw.coverage || {};
  const mutation = raw.mutation || {};

  const normalizedCoverageExec = normalizeExec(
    coverage.exec,
    legacyCoverageCommand,
    warnings,
    'quality_gate.coverage'
  );
  const normalizedMutationExec = normalizeExec(
    mutation.exec,
    legacyMutationCommand,
    warnings,
    'quality_gate.mutation'
  );

  return {
    enabled: raw.enabled !== false,
    minimumCoverage: Number(raw.minimum_coverage || raw.minimumCoverage || 90),
    coverage: {
      exec: normalizedCoverageExec,
      reportPath: coverage.report_path || coverage.reportPath || '',
      metricPath: coverage.metric_path || coverage.metricPath || '',
      legacyCommand: legacyCoverageCommand || '',
      timeoutSeconds: Number(coverage.timeout_seconds || coverage.timeoutSeconds || 300),
      cwd: coverage.cwd || '.',
      envAllowlist: Array.isArray(coverage.env_allowlist || coverage.envAllowlist)
        ? [...(coverage.env_allowlist || coverage.envAllowlist)]
        : []
    },
    mutation: {
      exec: normalizedMutationExec,
      reportPath: mutation.report_path || mutation.reportPath || '',
      passField: mutation.pass_field || mutation.passField || '',
      legacyCommand: legacyMutationCommand || '',
      timeoutSeconds: Number(mutation.timeout_seconds || mutation.timeoutSeconds || 300),
      cwd: mutation.cwd || '.',
      envAllowlist: Array.isArray(mutation.env_allowlist || mutation.envAllowlist)
        ? [...(mutation.env_allowlist || mutation.envAllowlist)]
        : []
    }
  };
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

  const warnings = [];
  const repoPath = resolveFromRoot(rootDir, config.repo_path || '.');
  const dbPath = resolveFromRoot(rootDir, config.db_path || 'pipeline.db');
  const signalDir = resolveFromRoot(rootDir, config.signal_dir || 'signals');
  const artifactsDir = resolveFromRoot(rootDir, config.artifacts_dir || 'artifacts');
  const codemapPath = path.resolve(repoPath, config.codemap?.path || 'codemap.json');
  const docsDir = path.resolve(repoPath, 'docs');

  const dispatcherCommand = config.dispatcher?.command || {};
  const qualityGate = normalizeQualityGate(config.hooks?.quality_gate || config.quality_gate || {}, warnings);
  const hooks = HOOK_NAMES.reduce((accumulator, hookName) => {
    accumulator[hookName] = normalizeHook(config.hooks?.[hookName] || {}, hookName, warnings);
    return accumulator;
  }, {});
  hooks.quality_gate = {
    enabled: qualityGate.enabled,
    exec: [],
    timeoutSeconds: 0,
    cwd: '.',
    envAllowlist: [],
    actions: []
  };

  const normalized = {
    rootDir,
    configPath,
    schemaVersion: Number(config.schema_version || 1),
    repoPath,
    defaultBranch: config.default_branch || 'main',
    branchPrefix: config.branch_prefix || 'slice/',
    testCommand: config.test_command || 'npm test',
    scopedTestCommandTemplate: config.scoped_test_command_template || '',
    dispatcher: {
      type: config.dispatcher?.type || 'signal-file',
      timeoutMinutes: Number(config.dispatcher?.timeout_minutes || 60),
      pollIntervalSeconds: Number(config.dispatcher?.poll_interval_seconds || 30),
      command: {
        exec: normalizeExec(dispatcherCommand.exec, config.dispatcher?.command_template || '', warnings, 'dispatcher.command'),
        timeoutSeconds: Number(dispatcherCommand.timeout_seconds || dispatcherCommand.timeoutSeconds || 60),
        cwd: dispatcherCommand.cwd || '.',
        envAllowlist: Array.isArray(dispatcherCommand.env_allowlist || dispatcherCommand.envAllowlist)
          ? [...(dispatcherCommand.env_allowlist || dispatcherCommand.envAllowlist)]
          : [],
        legacyTemplate: config.dispatcher?.command_template || ''
      }
    },
    runtime: {
      leaseTtlSeconds: Number(config.runtime?.lease_ttl_seconds || config.runtime?.leaseTtlSeconds || 120),
      heartbeatSeconds: Number(config.runtime?.heartbeat_seconds || config.runtime?.heartbeatSeconds || 30),
      commandOutputLimitKb: Number(config.runtime?.command_output_limit_kb || config.runtime?.commandOutputLimitKb || 256),
      staleExecutionTimeoutSeconds: Number(config.runtime?.stale_execution_timeout_seconds || config.runtime?.staleExecutionTimeoutSeconds || 7200),
      commandTimeoutSeconds: Number(config.runtime?.command_timeout_seconds || config.runtime?.commandTimeoutSeconds || 60)
    },
    github: {
      remote: config.github?.remote || 'origin',
      timeoutSeconds: Number(config.github?.timeout_seconds || config.github?.timeoutSeconds || 60),
      ghExec: Array.isArray(config.github?.gh_exec) && config.github.gh_exec.length > 0
        ? config.github.gh_exec.map((token) => String(token))
        : ['gh']
    },
    hooks,
    qualityGate,
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
    warnings,
    paths: {
      dbPath,
      signalDir,
      artifactsDir,
      docsDir,
      codemapPath,
      backupsDir: path.resolve(artifactsDir, 'backups'),
      contextsDir: path.resolve(artifactsDir, 'contexts'),
      testResultsDir: path.resolve(artifactsDir, 'test-results'),
      qualityGateDir: path.resolve(artifactsDir, 'quality-gates'),
      qualityGateReportsDir: path.resolve(artifactsDir, 'quality-gates', 'reports'),
      notificationsDir: path.resolve(artifactsDir, 'notifications'),
      logsDir: path.resolve(artifactsDir, 'logs')
    }
  };

  ensureDir(path.dirname(dbPath));
  ensureDir(signalDir);
  ensureDir(artifactsDir);
  ensureDir(normalized.paths.backupsDir);
  ensureDir(normalized.paths.contextsDir);
  ensureDir(normalized.paths.testResultsDir);
  ensureDir(normalized.paths.qualityGateDir);
  ensureDir(normalized.paths.qualityGateReportsDir);
  ensureDir(normalized.paths.notificationsDir);
  ensureDir(normalized.paths.logsDir);

  normalized.failureMemory = {
    enabled: normalized.hooks.failure_memory_lookup.enabled
  };

  return normalized;
}

module.exports = {
  loadConfig,
  HOOK_NAMES
};
