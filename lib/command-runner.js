'use strict';

const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { commandExists, resolveFrom, truncateText } = require('./utils.js');
const { PipelineError } = require('./errors.js');
const { createCommandRun, updateCommandRun } = require('./runtime-store.js');
const { writeStructuredLog } = require('./logging.js');

const ALWAYS_ALLOWED_ENV_KEYS = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'CI'
];

function legacyShellExec(command) {
  if (!command) {
    return [];
  }

  return process.platform === 'win32'
    ? ['powershell', '-NoProfile', '-Command', command]
    : ['/bin/sh', '-lc', command];
}

function normalizeExec(spec) {
  if (!spec) {
    return [];
  }

  if (Array.isArray(spec.exec)) {
    return spec.exec.filter(Boolean).map((token) => String(token));
  }

  if (Array.isArray(spec)) {
    return spec.filter(Boolean).map((token) => String(token));
  }

  if (typeof spec.command === 'string' && spec.command.trim()) {
    return legacyShellExec(spec.command.trim());
  }

  if (typeof spec === 'string' && spec.trim()) {
    return legacyShellExec(spec.trim());
  }

  return [];
}

function buildEnv(spec, env = {}) {
  const allowlist = Array.from(new Set([...(spec.envAllowlist || []), ...(spec.env_allowlist || []), ...ALWAYS_ALLOWED_ENV_KEYS]));
  const base = {};
  allowlist.forEach((key) => {
    if (process.env[key] !== undefined) {
      base[key] = process.env[key];
    }
  });

  return {
    ...base,
    ...env
  };
}

function resolveCommandSpec(config, spec = {}, defaults = {}) {
  const exec = normalizeExec(spec);
  const cwd = resolveFrom(config.repoPath, spec.cwd || defaults.cwd || '.');
  const timeoutSeconds = Number(spec.timeoutSeconds || spec.timeout_seconds || defaults.timeoutSeconds || config.runtime.commandTimeoutSeconds || 60);
  const envAllowlist = Array.isArray(spec.envAllowlist || spec.env_allowlist)
    ? [...(spec.envAllowlist || spec.env_allowlist)]
    : [];

  return {
    name: spec.name || defaults.name || (exec[0] || 'command'),
    exec,
    cwd,
    timeoutSeconds,
    envAllowlist
  };
}

function ensureRunnable(spec) {
  if (!Array.isArray(spec.exec) || spec.exec.length === 0) {
    throw new PipelineError('COMMAND_NOT_CONFIGURED', `Command ${spec.name} is not configured`, spec);
  }

  if (!path.isAbsolute(spec.cwd)) {
    throw new PipelineError('COMMAND_INVALID_CWD', `Command ${spec.name} must resolve to an absolute cwd`, spec);
  }

  if (!commandExists(spec.exec[0]) && !path.isAbsolute(spec.exec[0])) {
    throw new PipelineError('COMMAND_NOT_FOUND', `Executable not found for ${spec.name}: ${spec.exec[0]}`, spec);
  }
}

function finalizeResult(config, commandRunId, metadata, spec, startedAt, result, envKeys) {
  const outputLimitBytes = config.runtime.commandOutputLimitKb * 1024;
  const stdout = truncateText(result.stdout || '', outputLimitBytes);
  const stderr = truncateText(result.stderr || '', outputLimitBytes);
  const durationMs = Date.now() - startedAt;
  const exitCode = result.status === null || result.status === undefined ? 1 : result.status;
  const status = result.error
    ? (result.error.code === 'ETIMEDOUT' ? 'TIMED_OUT' : 'FAILED')
    : (result.status === 0 ? 'COMPLETED' : 'FAILED');

  updateCommandRun(config, commandRunId, {
    status,
    exit_code: exitCode,
    duration_ms: durationMs,
    stdout_excerpt: stdout,
    stderr_excerpt: stderr
  });

  const payload = {
    commandRunId,
    commandName: spec.name,
    exec: spec.exec,
    cwd: spec.cwd,
    status,
    exitCode,
    durationMs,
    stdout,
    stderr,
    requestId: metadata.requestId || null,
    runId: metadata.runId || null,
    sliceId: metadata.sliceId || null,
    phase: metadata.phase || null,
    envKeys
  };

  writeStructuredLog(config, 'command_run', payload);
  return payload;
}

function runCommand(config, specInput, metadata = {}, options = {}) {
  const spec = resolveCommandSpec(config, specInput, options.defaults || {});
  ensureRunnable(spec);
  const env = buildEnv(spec, options.env || {});
  const envKeys = Object.keys(env).sort();
  const commandRunId = createCommandRun(config, {
    commandName: spec.name,
    sliceId: metadata.sliceId || null,
    runId: metadata.runId || null,
    requestId: metadata.requestId || null,
    phase: metadata.phase || null,
    cwd: spec.cwd,
    exec: spec.exec,
    envKeys,
    status: 'RUNNING'
  });

  const startedAt = Date.now();
  const result = spawnSync(spec.exec[0], spec.exec.slice(1), {
    cwd: spec.cwd,
    env,
    encoding: 'utf8',
    shell: false,
    timeout: spec.timeoutSeconds * 1000,
    windowsHide: true
  });

  const payload = finalizeResult(config, commandRunId, metadata, spec, startedAt, result, envKeys);
  if (result.error) {
    throw new PipelineError(
      payload.status === 'TIMED_OUT' ? 'COMMAND_TIMED_OUT' : 'COMMAND_FAILED',
      `${spec.name} failed: ${result.error.message}`,
      payload
    );
  }

  return payload;
}

function launchCommand(config, specInput, metadata = {}, options = {}) {
  const spec = resolveCommandSpec(config, specInput, options.defaults || {});
  ensureRunnable(spec);
  const env = buildEnv(spec, options.env || {});
  const envKeys = Object.keys(env).sort();
  const commandRunId = createCommandRun(config, {
    commandName: spec.name,
    sliceId: metadata.sliceId || null,
    runId: metadata.runId || null,
    requestId: metadata.requestId || null,
    phase: metadata.phase || null,
    cwd: spec.cwd,
    exec: spec.exec,
    envKeys,
    status: 'LAUNCHING'
  });

  const child = spawn(spec.exec[0], spec.exec.slice(1), {
    cwd: spec.cwd,
    env,
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  updateCommandRun(config, commandRunId, {
    status: 'LAUNCHED',
    stdout_excerpt: '',
    stderr_excerpt: '',
    duration_ms: 0,
    exit_code: 0
  });

  const payload = {
    commandRunId,
    commandName: spec.name,
    exec: spec.exec,
    cwd: spec.cwd,
    status: 'LAUNCHED',
    pid: child.pid,
    requestId: metadata.requestId || null,
    runId: metadata.runId || null,
    sliceId: metadata.sliceId || null,
    phase: metadata.phase || null,
    envKeys
  };
  writeStructuredLog(config, 'command_launch', payload);
  return payload;
}

module.exports = {
  legacyShellExec,
  normalizeExec,
  resolveCommandSpec,
  runCommand,
  launchCommand
};
