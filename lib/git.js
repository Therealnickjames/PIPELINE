'use strict';

const { PipelineError } = require('./errors.js');
const { runCommand } = require('./command-runner.js');

function createGitAdapter(config) {
  function runGit(args, metadata = {}) {
    return runCommand(
      config,
      {
        name: `git:${args[0]}`,
        exec: ['git', ...args],
        cwd: config.repoPath,
        timeoutSeconds: config.github.timeoutSeconds,
        envAllowlist: []
      },
      metadata
    );
  }

  function ensureGitRepo(metadata = {}) {
    runGit(['rev-parse', '--is-inside-work-tree'], metadata);
    return true;
  }

  function ensureBranch(branchName, baseBranch, metadata = {}) {
    ensureGitRepo(metadata);
    const existing = runGit(['branch', '--list', branchName], metadata);
    if (existing.stdout.trim()) {
      runGit(['checkout', branchName], metadata);
    } else {
      runGit(['checkout', baseBranch], metadata);
      runGit(['checkout', '-b', branchName], metadata);
    }

    return { branch: branchName, base: baseBranch };
  }

  function getRemoteStatus(metadata = {}) {
    try {
      runGit(['ls-remote', config.github.remote], metadata);
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        details: error.details || null
      };
    }
  }

  function pushBranch(branchName, metadata = {}) {
    return runGit(['push', '-u', config.github.remote, branchName], metadata);
  }

  function getCurrentBranch(metadata = {}) {
    const result = runGit(['branch', '--show-current'], metadata);
    return result.stdout.trim();
  }

  function ensureBaseBranchExists(baseBranch, metadata = {}) {
    try {
      runGit(['rev-parse', '--verify', baseBranch], metadata);
      return { passed: true };
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  function authDoctor(metadata = {}) {
    try {
      runGit(['rev-parse', '--is-inside-work-tree'], metadata);
      return { passed: true };
    } catch (error) {
      throw new PipelineError('GIT_COMMAND_FAILED', error.message, error.details || null);
    }
  }

  return {
    ensureGitRepo,
    ensureBranch,
    getRemoteStatus,
    pushBranch,
    getCurrentBranch,
    ensureBaseBranchExists,
    authDoctor
  };
}

module.exports = {
  createGitAdapter
};
