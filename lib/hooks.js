'use strict';

const { execSync } = require('child_process');
const { shellQuoteList } = require('./utils.js');
const { PipelineError } = require('./errors.js');

function interpolate(template, context) {
  return String(template || '')
    .replace(/\{slice_id\}/g, context.sliceId || '')
    .replace(/\{repo_path\}/g, context.repoPath || '')
    .replace(/\{file\}/g, context.singleFile || '')
    .replace(/\{files\}/g, shellQuoteList(context.files || []))
    .replace(/\{changed_files\}/g, shellQuoteList(context.files || []))
    .trim();
}

function runHook(config, hookName, context = {}) {
  const hook = config.hooks[hookName];
  if (!hook || hook.enabled === false) {
    return { skipped: true, hook: hookName };
  }

  if (hook.command) {
    const command = interpolate(hook.command, context);
    if (!command) {
      return { skipped: true, hook: hookName };
    }

    try {
      const output = execSync(command, {
        cwd: config.repoPath,
        encoding: 'utf8',
        shell: true,
        stdio: 'pipe'
      }).trim();
      return { skipped: false, hook: hookName, output, passed: true };
    } catch (error) {
      throw new PipelineError(
        'HOOK_FAILED',
        `Hook ${hookName} failed: ${error.message}`,
        {
          hook: hookName,
          stdout: error.stdout ? String(error.stdout) : '',
          stderr: error.stderr ? String(error.stderr) : ''
        }
      );
    }
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

