'use strict';

const path = require('path');
const {
  getSlice,
  getRawSlice,
  getAllSlices,
  getSlicesByStatus,
  getDependencies,
  getNextPending,
  updateSlice,
  transitionState,
  markFailure,
  markNeedsSplit,
  logEvent,
  getEvents,
  importSlices,
  getFeatureGroups,
  updateFeatureGroup,
  getStatusSummary,
  getMetrics
} = require('./registry.js');
const gates = require('./gates.js');
const docs = require('./docs.js');
const codemap = require('./codemap.js');
const hooks = require('./hooks.js');
const tests = require('./tests.js');
const github = require('./github.js');
const dispatcher = require('./dispatcher.js');
const { notify } = require('./notifications.js');
const { loadConfig } = require('./config.js');
const { PipelineError } = require('./errors.js');
const { readJson } = require('./utils.js');
const { runFeatureSuite } = require('./feature-tests.js');
const failureMemory = require('./failure-memory.js');
const qualityGate = require('./quality-gate.js');
const { getDb } = require('./db.js');

class PipelineService {
  constructor(rootDir = path.resolve(__dirname, '..')) {
    this.config = loadConfig(rootDir);
    docs.scaffold(this.config);
    codemap.ensureCodemap(this.config);
  }

  configSnapshot() {
    return {
      rootDir: this.config.rootDir,
      repoPath: this.config.repoPath,
      defaultBranch: this.config.defaultBranch,
      branchPrefix: this.config.branchPrefix,
      dispatcher: this.config.dispatcher,
      failureMemory: this.config.failureMemory,
      qualityGate: this.config.qualityGate,
      autoFix: this.config.autoFix,
      notifications: this.config.notifications,
      paths: this.config.paths
    };
  }

  importFromFile(filePath) {
    const payload = readJson(path.resolve(filePath), null);
    if (!payload) {
      throw new PipelineError('IMPORT_INVALID', `Could not read JSON from ${filePath}`);
    }

    const result = importSlices(this.config, payload);
    docs.scaffold(this.config);
    codemap.ensureCodemap(this.config);
    docs.updateBacklog(this.config, getAllSlices(this.config));
    return {
      ...result,
      slices: getAllSlices(this.config),
      features: getFeatureGroups(this.config)
    };
  }

  getStatus(options = {}) {
    const payload = {
      status: 'ok',
      summary: getStatusSummary(this.config),
      features: getFeatureGroups(this.config)
    };

    if (options.validate) {
      payload.validation = this.validateSystem();
    }

    return payload;
  }

  validateSystem() {
    const db = getDb(this.config);
    const failurePatternColumns = db.prepare(`PRAGMA table_info('failure_patterns')`).all();
    const requiredColumns = ['slice_id', 'error_signature', 'successful_fix', 'timestamp', 'frequency'];
    const columnNames = new Set(failurePatternColumns.map((column) => column.name));
    const checks = [
      {
        name: 'failure_memory_lookup_hook',
        passed: Boolean(this.config.hooks.failure_memory_lookup && this.config.hooks.failure_memory_lookup.enabled !== false),
        detail: 'failure_memory_lookup hook is configured and enabled'
      },
      {
        name: 'quality_gate_hook',
        passed: Boolean(this.config.hooks.quality_gate && this.config.hooks.quality_gate.enabled !== false),
        detail: 'quality_gate hook is configured and enabled'
      },
      {
        name: 'quality_gate_minimum_coverage',
        passed: Number(this.config.qualityGate.minimumCoverage) >= 90,
        detail: `minimum coverage is ${this.config.qualityGate.minimumCoverage}`
      },
      {
        name: 'quality_gate_commands',
        passed: Boolean(this.config.qualityGate.coverageCommand) && Boolean(this.config.qualityGate.mutationCommand),
        detail: 'coverage and mutation commands are configured'
      },
      {
        name: 'failure_patterns_table',
        passed: requiredColumns.every((column) => columnNames.has(column)),
        detail: `failure_patterns columns present: ${requiredColumns.join(', ')}`
      }
    ];

    return {
      passed: checks.every((check) => check.passed),
      checks
    };
  }

  listSlices(status = null) {
    return {
      status: 'ok',
      slices: getSlicesByStatus(this.config, status)
    };
  }

  showSlice(id) {
    const slice = getSlice(this.config, id);
    if (!slice) {
      throw new PipelineError('SLICE_NOT_FOUND', `Unknown slice: ${id}`);
    }

    return {
      status: 'ok',
      slice
    };
  }

  logSlice(id) {
    this.requireSlice(id);
    return {
      status: 'ok',
      events: getEvents(this.config, id)
    };
  }

  getFeatures() {
    return {
      status: 'ok',
      features: getFeatureGroups(this.config)
    };
  }

  nextSlice() {
    return {
      status: 'ok',
      slice: getNextPending(this.config)
    };
  }

  metrics(filters = {}) {
    return {
      status: 'ok',
      metrics: getMetrics(this.config, filters)
    };
  }

  startSlice(id, actor = 'sse') {
    const slice = this.requireSlice(id);
    const gate = gates.canAdvanceToSSEReview(slice, getDependencies(this.config, id));
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    const next = transitionState(this.config, id, 'SSE_REVIEW', actor, { reason: 'manual_start' });
    return { status: 'ok', slice: next, message: gate.reason };
  }

  approveSlice(id, notes = '', actor = 'sse') {
    const slice = this.requireSlice(id);
    const gate = gates.canApprove(slice);
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    updateSlice(this.config, id, {
      sse_reviewer: actor,
      sse_notes: notes || null
    });
    const next = transitionState(this.config, id, 'APPROVED', actor, { notes });
    notify(this.config, 'SSE_APPROVED', { sliceId: id, notes });
    return { status: 'ok', slice: next };
  }

  rejectSlice(id, reason, actor = 'sse') {
    if (!reason) {
      throw new PipelineError('REJECT_REASON_REQUIRED', 'Reject requires a reason');
    }

    const slice = this.requireSlice(id);
    if (slice.status !== 'SSE_REVIEW') {
      throw new PipelineError('INVALID_TRANSITION', 'Only SSE_REVIEW slices can be rejected');
    }

    updateSlice(this.config, id, {
      sse_reviewer: actor,
      sse_notes: reason
    });
    const next = transitionState(this.config, id, 'PENDING', actor, { reason });
    return { status: 'ok', slice: next };
  }

  dispatchSlice(id, actor = 'sse') {
    const slice = this.requireSlice(id);
    const activeExecution = getAllSlices(this.config).some((candidate) => ['EXECUTING', 'AUTO_FIX'].includes(candidate.status));
    const gate = gates.canDispatch(slice, { hasActiveExecution: activeExecution });
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    docs.scaffold(this.config);
    const branchName = slice.branch_name || `${this.config.branchPrefix}${slice.id.toLowerCase()}`;
    github.createBranch(this.config, branchName, this.config.defaultBranch);
    docs.writeCurrentSlice(this.config, slice);
    docs.writeFixHypothesis(this.config, null);
    const handoff = docs.readHandoff(this.config);
    const currentCodemap = codemap.getCodemap(this.config);
    const memoryLookup = failureMemory.lookup(this.config, slice);
    const memoryContext = failureMemory.applyCachedFix(this.config, slice, memoryLookup);
    const dispatchResult = dispatcher.dispatch(this.config, slice, {
      handoff,
      codemap: currentCodemap,
      failureMemory: memoryContext
    });
    const next = require('./registry.js').resetForDispatch(
      this.config,
      id,
      branchName,
      dispatchResult.sessionId,
      actor,
      {
        context_path: dispatchResult.contextPath,
        failure_memory: memoryContext.applied ? memoryContext : null
      }
    );

    return {
      status: 'ok',
      slice: next,
      dispatch: dispatchResult,
      failure_memory: memoryContext
    };
  }

  cancelSlice(id, actor = 'sse') {
    const slice = this.requireSlice(id);
    const gate = gates.canCancel(slice);
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    updateSlice(this.config, id, { agent_session_id: null });
    const next = transitionState(this.config, id, 'APPROVED', actor, { reason: 'cancelled' });
    return { status: 'ok', slice: next };
  }

  createPr(id) {
    const slice = this.requireSlice(id);
    return this.openPrForSlice(slice);
  }

  syncSlice(id) {
    const slice = this.requireSlice(id);
    return this.syncPr(slice);
  }

  processSignals(sliceId = null) {
    const slices = sliceId
      ? [this.requireSlice(sliceId)]
      : getAllSlices(this.config).filter((slice) => ['EXECUTING', 'AUTO_FIX'].includes(slice.status));

    return slices.map((slice) => this.processExecution(slice)).filter(Boolean);
  }

  runCycle() {
    const changes = [];
    const features = getFeatureGroups(this.config);
    const hasFeatureFailure = features.some((feature) => feature.status === 'FEATURE_FAILED');

    const nextReady = getNextPending(this.config);
    if (nextReady && !hasFeatureFailure) {
      changes.push(this.startSlice(nextReady.id, 'system'));
    }

    let activeExecution = getAllSlices(this.config).some((slice) => ['EXECUTING', 'AUTO_FIX'].includes(slice.status));
    if (!activeExecution && !hasFeatureFailure) {
      const approvedSlice = getAllSlices(this.config).find((slice) => slice.status === 'APPROVED');
      if (approvedSlice) {
        changes.push(this.dispatchSlice(approvedSlice.id, 'system'));
        activeExecution = true;
      }
    }

    this.processSignals().forEach((change) => changes.push(change));

    getAllSlices(this.config)
      .filter((slice) => slice.status === 'TESTING')
      .forEach((slice) => {
        const result = this.runTestsForSlice(slice);
        if (result) {
          changes.push(result);
        }
      });

    getAllSlices(this.config)
      .filter((slice) => slice.status === 'TESTING' && slice.test_results && slice.test_results.passed)
      .forEach((slice) => {
        const result = this.openPrForSlice(slice);
        if (result) {
          changes.push(result);
        }
      });

    getAllSlices(this.config)
      .filter((slice) => slice.status === 'PR_OPEN')
      .forEach((slice) => {
        const result = this.syncPr(slice);
        if (result) {
          changes.push(result);
        }
      });

    docs.updateBacklog(this.config, getAllSlices(this.config));
    return {
      status: 'ok',
      changes,
      summary: getStatusSummary(this.config)
    };
  }

  runTestsForSlice(slice) {
    if (slice.status !== 'TESTING') {
      return null;
    }

    const testResult = tests.run(this.config, slice);
    const combinedResults = {
      ...testResult
    };
    updateSlice(this.config, slice.id, {
      test_results: JSON.stringify(combinedResults)
    });
    logEvent(this.config, slice.id, 'test_result', 'system', testResult, 'TESTING', 'TESTING');

    if (!testResult.passed) {
      return this.handleTestFailure(slice, 'FAILED_TESTS', `Tests failed for ${slice.id}`, {
        source: 'basic_tests',
        test_result: testResult,
        files: slice.affected_files
      });
    }

    const qualityResult = qualityGate.run(this.config, slice);
    combinedResults.quality_gate = qualityResult;
    updateSlice(this.config, slice.id, {
      test_results: JSON.stringify(combinedResults)
    });
    logEvent(this.config, slice.id, 'quality_gate_result', 'system', qualityResult, 'TESTING', 'TESTING');

    if (!qualityResult.passed) {
      return this.handleTestFailure(
        slice,
        'FAILED_TESTS',
        `Quality gate failed for ${slice.id}`,
        {
          source: 'quality_gate',
          test_result: combinedResults,
          quality_gate: qualityResult,
          files: slice.affected_files
        }
      );
    }

    try {
      hooks.runHook(this.config, 'post_test', {
        sliceId: slice.id,
        repoPath: this.config.repoPath,
        files: slice.affected_files
      });
    } catch (error) {
      const failed = markFailure(
        this.config,
        slice.id,
        'FAILED_TESTS',
        error.message,
        'system',
        'TESTING',
        { test_result: combinedResults, hook_error: error.details || null }
      );
      notify(this.config, 'FAILED_TESTS', { sliceId: slice.id, error: error.message });
      return {
        status: 'ok',
        slice: failed,
        test_result: combinedResults
      };
    }

    return {
      status: 'ok',
      slice: getSlice(this.config, slice.id),
      test_result: combinedResults
    };
  }

  handleTestFailure(slice, failureType, reason, details) {
    const current = this.requireSlice(slice.id);
    if (this.config.autoFix.enabled && current.fix_attempts < this.config.autoFix.maxAttempts) {
      return this.startAutoFix(current, failureType, reason, details);
    }

    const failed = markFailure(
      this.config,
      current.id,
      failureType,
      reason,
      'system',
      'TESTING',
      details
    );
    notify(this.config, failureType, { sliceId: current.id, details });
    return {
      status: 'ok',
      slice: failed,
      test_result: details.test_result || null
    };
  }

  startAutoFix(slice, failureType, reason, details = {}) {
    updateSlice(this.config, slice.id, {
      fix_attempts: slice.fix_attempts + 1
    });
    logEvent(this.config, slice.id, 'auto_fix_requested', 'system', {
      failureType,
      reason,
      ...details
    }, 'TESTING', 'AUTO_FIX');
    docs.writeFixHypothesis(this.config, null);
    const dispatchResult = dispatcher.dispatch(this.config, slice, {
      handoff: docs.readHandoff(this.config),
      codemap: codemap.getCodemap(this.config),
      mode: 'AUTO_FIX',
      failureContext: reason
    });
    updateSlice(this.config, slice.id, {
      agent_session_id: dispatchResult.sessionId
    });
    const next = transitionState(this.config, slice.id, 'AUTO_FIX', 'system', {
      context_path: dispatchResult.contextPath,
      agent_session_id: dispatchResult.sessionId,
      failure_type: failureType,
      failure_reason: reason
    });
    return {
      status: 'ok',
      slice: next,
      auto_fix: dispatchResult,
      test_result: details.test_result || null
    };
  }

  openPrForSlice(slice) {
    const current = typeof slice === 'string' ? this.requireSlice(slice) : this.requireSlice(slice.id);
    const gate = gates.canOpenPR(current);
    if (!gate.passed) {
      return null;
    }

    try {
      hooks.runHook(this.config, 'pre_pr', {
        sliceId: current.id,
        repoPath: this.config.repoPath,
        files: current.affected_files
      });
    } catch (error) {
      const failed = markFailure(this.config, current.id, 'FAILED_PR', error.message, 'system', 'TESTING', {
        hook_error: error.details || null
      });
      notify(this.config, 'FAILED_PR', { sliceId: current.id, error: error.message });
      return {
        status: 'ok',
        slice: failed,
        error: error.message
      };
    }

    try {
      const pr = github.openPR(this.config, current, current.branch_name);
      updateSlice(this.config, current.id, {
        pr_url: pr.url,
        pr_number: pr.number
      });
      const next = transitionState(this.config, current.id, 'PR_OPEN', 'system', pr);
      return {
        status: 'ok',
        slice: next,
        pr
      };
    } catch (error) {
      const failed = markFailure(this.config, current.id, 'FAILED_PR', error.message, 'system', 'TESTING', {
        error: error.details || null
      });
      notify(this.config, 'FAILED_PR', { sliceId: current.id, error: error.message });
      return {
        status: 'ok',
        slice: failed,
        error: error.message
      };
    }
  }

  syncPr(slice) {
    const current = typeof slice === 'string' ? this.requireSlice(slice) : this.requireSlice(slice.id);
    if (current.status !== 'PR_OPEN' || !current.pr_number) {
      return null;
    }

    try {
      const status = github.getPRStatus(this.config, current.pr_number);
      if (status.merged) {
        const next = transitionState(this.config, current.id, 'MERGED', 'github', status);
        try {
          hooks.runHook(this.config, 'post_merge', {
            sliceId: current.id,
            repoPath: this.config.repoPath,
            files: current.affected_files
          });
        } catch (error) {
          logEvent(this.config, current.id, 'hook_warning', 'system', {
            hook: 'post_merge',
            error: error.message,
            details: error.details || null
          }, 'MERGED', 'MERGED');
        }
        if (current.last_signal) {
          codemap.updateFromSignal(this.config, next, current.last_signal);
        }
        docs.updateBacklog(this.config, getAllSlices(this.config));
        failureMemory.recordSuccess(this.config, getSlice(this.config, current.id));
        this.evaluateFeatureGroups();
        return {
          status: 'ok',
          slice: getSlice(this.config, current.id),
          pr_status: status
        };
      }

      if (status.closed && !status.merged) {
        const failed = markFailure(this.config, current.id, 'FAILED_PR', 'PR closed without merge', 'github', 'PR_OPEN', status);
        notify(this.config, 'FAILED_PR', { sliceId: current.id, prStatus: status });
        return {
          status: 'ok',
          slice: failed,
          pr_status: status
        };
      }

      return {
        status: 'ok',
        slice: current,
        pr_status: status
      };
    } catch (error) {
      return {
        status: 'ok',
        slice: current,
        error: error.message
      };
    }
  }

  evaluateFeatureGroups() {
    const features = getFeatureGroups(this.config);
    const updates = [];

    features.forEach((feature) => {
      if (feature.status === 'FEATURE_COMPLETE' || feature.status === 'FEATURE_FAILED') {
        return;
      }

      if (feature.slices.length === 0 || feature.slices.some((slice) => slice.status !== 'MERGED')) {
        return;
      }

      const result = runFeatureSuite(this.config, feature);
      const updated = updateFeatureGroup(this.config, feature.id, {
        status: result.status,
        last_result: result.results,
        completed_at: result.status === 'FEATURE_COMPLETE' ? new Date().toISOString() : null
      });
      updates.push(updated);

      if (result.status === 'FEATURE_FAILED') {
        notify(this.config, 'FEATURE_FAILED', { featureId: feature.id, results: result.results });
      }
    });

    return updates;
  }

  processExecution(slice) {
    const timeoutMinutes = slice.status === 'AUTO_FIX'
      ? this.config.autoFix.timeoutMinutes
      : this.config.dispatcher.timeoutMinutes;

    if (dispatcher.timedOut(this.config, slice, timeoutMinutes)) {
      const failed = markFailure(
        this.config,
        slice.id,
        'FAILED_EXECUTION',
        `Execution timed out after ${timeoutMinutes} minutes`,
        'system',
        slice.status,
        {}
      );
      notify(this.config, 'FAILED_EXECUTION', { sliceId: slice.id, timeoutMinutes });
      return {
        status: 'ok',
        slice: failed
      };
    }

    if (slice.status === 'EXECUTING') {
      const preflight = docs.validatePreflight(this.config);
      const preflightGate = gates.canBeginEditing(preflight);
      if (!preflightGate.passed) {
        logEvent(this.config, slice.id, 'gate_check', 'system', preflight, slice.status, slice.status);
        return {
          status: 'ok',
          slice: getSlice(this.config, slice.id),
          waiting_on_preflight: true,
          preflight
        };
      }
    }

    const signal = dispatcher.readSignal(this.config, slice.id);
    if (!signal) {
      return null;
    }

    if (signal.status === 'active') {
      return null;
    }

    if (signal.needs_split || signal.status === 'needs_split') {
      const next = markNeedsSplit(this.config, slice.id, 'agent', signal.split_reason || 'Agent requested slice split', signal);
      dispatcher.clearSignal(this.config, slice.id);
      notify(this.config, 'NEEDS_SPLIT', { sliceId: slice.id, signal });
      return {
        status: 'ok',
        slice: next,
        signal
      };
    }

    const signalGate = gates.canAdvanceToTesting(slice, signal);
    if (!signalGate.passed) {
      const failed = markFailure(
        this.config,
        slice.id,
        'FAILED_EXECUTION',
        signalGate.reason,
        'agent',
        slice.status,
        { signal }
      );
      dispatcher.clearSignal(this.config, slice.id);
      notify(this.config, 'FAILED_EXECUTION', { sliceId: slice.id, signal });
      return {
        status: 'ok',
        slice: failed,
        signal
      };
    }

    try {
      hooks.runHook(this.config, 'post_edit', {
        sliceId: slice.id,
        repoPath: this.config.repoPath,
        files: signal.files_changed || slice.affected_files
      });
      hooks.runHook(this.config, 'pre_commit', {
        sliceId: slice.id,
        repoPath: this.config.repoPath,
        files: signal.files_changed || slice.affected_files
      });
    } catch (error) {
      const failed = markFailure(
        this.config,
        slice.id,
        'FAILED_EXECUTION',
        error.message,
        'system',
        slice.status,
        { signal, hook_error: error.details || null }
      );
      dispatcher.clearSignal(this.config, slice.id);
      notify(this.config, 'FAILED_EXECUTION', { sliceId: slice.id, error: error.message });
      return {
        status: 'ok',
        slice: failed,
        signal
      };
    }

    docs.writeHandoff(this.config, slice, signal);
    docs.updateKnownIssues(this.config, signal);
    docs.updateArchitecture(this.config, signal);
    updateSlice(this.config, slice.id, {
      last_signal: JSON.stringify(signal),
      agent_session_id: null
    });
    const next = transitionState(this.config, slice.id, 'TESTING', 'agent', {
      summary: signal.summary,
      last_signal: signal,
      agent_session_id: null
    });
    dispatcher.clearSignal(this.config, slice.id);
    return {
      status: 'ok',
      slice: next,
      signal
    };
  }

  requireSlice(id) {
    const slice = getSlice(this.config, id);
    if (!slice) {
      throw new PipelineError('SLICE_NOT_FOUND', `Unknown slice: ${id}`);
    }
    return slice;
  }
}

module.exports = {
  PipelineService
};
