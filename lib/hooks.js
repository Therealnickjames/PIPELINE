'use strict';

const { resolveFrom } = require('./utils.js');
const { PipelineError } = require('./errors.js');
const { runCommand } = require('./command-runner.js');

function runHook(config, hookName, context = {}, metadata = {}) {
  const hook = config.hooks[hookName];
  if (!hook || hook.enabled === false) {
    return { skipped: true, hook: hookName };
  }

  if (hook.exec.length > 0) {
    const result = runCommand(
      config,
      {
        name: `hook:${hookName}`,
        exec: hook.exec,
        timeoutSeconds: hook.timeoutSeconds,
        cwd: resolveFrom(config.repoPath, hook.cwd),
        envAllowlist: hook.envAllowlist
      },
      metadata,
      {
        env: {
          PIPELINE_SLICE_ID: context.sliceId || '',
          PIPELINE_FILES: JSON.stringify(context.files || []),
          PIPELINE_REPO_PATH: context.repoPath || config.repoPath
        }
      }
    );

    if (result.exitCode !== 0) {
      throw new PipelineError('HOOK_FAILED', `Hook ${hookName} failed`, result);
    }

    return {
      skipped: false,
      hook: hookName,
      passed: true,
      command_run: result
    };
  }

  return {
    skipped: false,
    hook: hookName,
    passed: true,
    actions: Array.isArray(hook.actions) ? hook.actions : []
  };
}

module.exports = {
  runHook
};
