'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  getSlice,
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
  getMetrics,
  resetForDispatch
} = require('./registry.js');
const gates = require('./gates.js');
const docs = require('./docs.js');
const codemap = require('./codemap.js');
const hooks = require('./hooks.js');
const tests = require('./tests.js');
const dispatcher = require('./dispatcher.js');
const { notify } = require('./notifications.js');
const { loadConfig } = require('./config.js');
const { PipelineError } = require('./errors.js');
const { readJson, commandExists, fileExists, randomId } = require('./utils.js');
const { runFeatureSuite } = require('./feature-tests.js');
const failureMemory = require('./failure-memory.js');
const qualityGate = require('./quality-gate.js');
const { getDb, resetDbCache } = require('./db.js');
const { applyMigrations, getAppliedMigrationIds } = require('./migrations.js');
const {
  withOperation,
  startSliceRun,
  completeSliceRun,
  getSliceRuns,
  getCommandRuns,
  acquireLease,
  heartbeatLease,
  releaseLease,
  getLease
} = require('./runtime-store.js');
const { createGitAdapter } = require('./git.js');
const { createGitHubAdapter } = require('./github.js');
const { writeStructuredLog } = require('./logging.js');
const { CONTROLLER_LEASE_KEY } = require('./constants.js');

class PipelineService {
  constructor(rootDir = path.resolve(__dirname, '..'), overrides = {}) {
    this.config = loadConfig(rootDir);
    this.ownerId = overrides.ownerId || `${os.hostname()}:${process.pid}`;
    this.git = overrides.gitAdapter || createGitAdapter(this.config);
    this.github = overrides.githubAdapter || createGitHubAdapter(this.config, this.git);
    this.dispatcherAdapter = overrides.dispatcherAdapter || dispatcher;
    docs.scaffold(this.config);
    codemap.ensureCodemap(this.config);
    getDb(this.config);
  }

  configSnapshot() {
    return {
      rootDir: this.config.rootDir,
      repoPath: this.config.repoPath,
      defaultBranch: this.config.defaultBranch,
      branchPrefix: this.config.branchPrefix,
      schemaVersion: this.config.schemaVersion,
      dispatcher: this.config.dispatcher,
      runtime: this.config.runtime,
      github: this.config.github,
      hooks: this.config.hooks,
      qualityGate: this.config.qualityGate,
      autoFix: this.config.autoFix,
      notifications: this.config.notifications,
      warnings: this.config.warnings,
      paths: this.config.paths
    };
  }

  importFromFile(filePath, options = {}) {
    return this.executeMutable('import', path.resolve(filePath), options.actor || 'system', options, (meta) => {
      const payload = readJson(path.resolve(filePath), null);
      if (!payload) {
        throw new PipelineError('IMPORT_INVALID', `Could not read JSON from ${filePath}`);
      }

      const result = importSlices(this.config, payload);
      docs.scaffold(this.config);
      codemap.ensureCodemap(this.config);
      docs.updateBacklog(this.config, getAllSlices(this.config));
      writeStructuredLog(this.config, 'import', {
        file: path.resolve(filePath),
        slice_count: result.slice_count,
        feature_count: result.feature_count,
        request_id: meta.request_id
      });
      return {
        status: 'ok',
        ...result,
        slices: getAllSlices(this.config),
        features: getFeatureGroups(this.config),
        meta
      };
    });
  }

  getStatus(options = {}) {
    const summary = getStatusSummary(this.config);
    const lease = getLease(this.config, CONTROLLER_LEASE_KEY);
    const payload = {
      status: 'ok',
      summary,
      features: getFeatureGroups(this.config),
      runtime: {
        lease,
        warnings: this.config.warnings,
        stale_slices: this.getStaleSlices()
      }
    };

    if (options.validate) {
      payload.validation = this.validateSystem();
    }

    return payload;
  }

  validateSystem() {
    const db = getDb(this.config);
    const tableChecks = {
      failure_patterns: ['slice_id', 'error_signature', 'successful_fix', 'timestamp', 'frequency'],
      schema_migrations: ['id', 'applied_at'],
      controller_lease: ['lease_key', 'owner_id', 'lease_token', 'acquired_at', 'heartbeat_at'],
      operations: ['request_id', 'operation_name', 'status', 'response_json', 'error_json'],
      slice_runs: ['run_id', 'slice_id', 'phase', 'status', 'started_at', 'completed_at'],
      command_runs: ['command_name', 'slice_id', 'run_id', 'request_id', 'status', 'created_at']
    };

    const checks = [
      {
        name: 'schema_version',
        passed: this.config.schemaVersion >= 2,
        detail: `schema_version=${this.config.schemaVersion}`
      },
      {
        name: 'runtime_config',
        passed: this.config.runtime.leaseTtlSeconds > 0
          && this.config.runtime.heartbeatSeconds > 0
          && this.config.runtime.commandOutputLimitKb > 0
          && this.config.runtime.staleExecutionTimeoutSeconds > 0,
        detail: 'runtime controls are configured'
      },
      {
        name: 'quality_gate_structure',
        passed: this.config.qualityGate.coverage.exec.length > 0
          && Boolean(this.config.qualityGate.coverage.reportPath)
          && Boolean(this.config.qualityGate.coverage.metricPath)
          && this.config.qualityGate.mutation.exec.length > 0
          && Boolean(this.config.qualityGate.mutation.reportPath)
          && Boolean(this.config.qualityGate.mutation.passField),
        detail: 'quality gate uses structured exec/report configuration'
      },
      {
        name: 'github_exec',
        passed: this.config.github.ghExec.length > 0,
        detail: `gh_exec=${this.config.github.ghExec.join(' ')}`
      },
      {
        name: 'hook_shapes',
        passed: Object.values(this.config.hooks).every((hook) => Array.isArray(hook.exec)),
        detail: 'all hooks normalize to array-based exec'
      }
    ];

    Object.entries(tableChecks).forEach(([tableName, columns]) => {
      const present = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
      checks.push({
        name: `${tableName}_table`,
        passed: columns.every((column) => present.includes(column)),
        detail: `${tableName} columns present`
      });
    });

    const doctor = this.doctor({ validateOnly: true });
    const warnings = [...this.config.warnings, ...(doctor.warnings || [])];
    return {
      passed: checks.every((check) => check.passed) && doctor.passed,
      checks,
      warnings,
      doctor
    };
  }

  listSlices(status = null) {
    return {
      status: 'ok',
      slices: getSlicesByStatus(this.config, status)
    };
  }

  showSlice(id) {
    const slice = this.requireSlice(id);
    return {
      status: 'ok',
      slice: {
        ...slice,
        recent_runs: getSliceRuns(this.config, id),
        recent_commands: getCommandRuns(this.config, { sliceId: id }),
        quality_gate_evidence: slice.test_results && slice.test_results.quality_gate ? slice.test_results.quality_gate : null,
        stale_execution: this.isStaleSlice(slice)
      }
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

  doctor(options = {}) {
    const checks = [];
    const warnings = [...this.config.warnings];
    const repoExists = fs.existsSync(this.config.repoPath);

    checks.push({
      name: 'repo_path_exists',
      passed: repoExists,
      detail: this.config.repoPath
    });
    checks.push({
      name: 'schema_version_supported',
      passed: this.config.schemaVersion >= 2,
      detail: `schema_version=${this.config.schemaVersion}`
    });
    checks.push({
      name: 'docs_dir_writable',
      passed: this.ensureWritable(this.config.paths.docsDir),
      detail: this.config.paths.docsDir
    });
    checks.push({
      name: 'artifacts_dir_writable',
      passed: this.ensureWritable(this.config.paths.artifactsDir),
      detail: this.config.paths.artifactsDir
    });
    checks.push({
      name: 'quality_gate_reports_parent',
      passed: this.ensureWritable(this.config.paths.qualityGateReportsDir),
      detail: this.config.paths.qualityGateReportsDir
    });

    if (repoExists) {
      const gitRepo = this.safeCheck(() => this.git.ensureGitRepo(), 'Target repo is a git worktree');
      checks.push({ name: 'git_repo', ...gitRepo });

      const baseBranch = this.git.ensureBaseBranchExists(this.config.defaultBranch);
      checks.push({
        name: 'default_branch',
        passed: baseBranch.passed,
        detail: baseBranch.error || this.config.defaultBranch
      });

      const remote = this.git.getRemoteStatus();
      checks.push({
        name: 'git_remote',
        passed: remote.passed,
        detail: remote.error || this.config.github.remote
      });
    }

    const ghAuth = this.github.ensureAuth();
    checks.push({
      name: 'gh_auth',
      passed: ghAuth.passed,
      detail: ghAuth.error || 'gh auth status ok'
    });
    checks.push({
      name: 'gh_binary',
      passed: commandExists(this.config.github.ghExec[0]),
      detail: this.config.github.ghExec[0]
    });
    checks.push({
      name: 'coverage_report_config',
      passed: Boolean(this.config.qualityGate.coverage.reportPath) && Boolean(this.config.qualityGate.coverage.metricPath),
      detail: this.config.qualityGate.coverage.reportPath || 'missing'
    });
    checks.push({
      name: 'mutation_report_config',
      passed: Boolean(this.config.qualityGate.mutation.reportPath) && Boolean(this.config.qualityGate.mutation.passField),
      detail: this.config.qualityGate.mutation.reportPath || 'missing'
    });
    checks.push({
      name: 'coverage_exec',
      passed: this.config.qualityGate.coverage.exec.length > 0,
      detail: this.config.qualityGate.coverage.exec.join(' ')
    });
    checks.push({
      name: 'mutation_exec',
      passed: this.config.qualityGate.mutation.exec.length > 0,
      detail: this.config.qualityGate.mutation.exec.join(' ')
    });

    if (!options.validateOnly && this.config.warnings.length > 0) {
      warnings.push({
        code: 'LEGACY_CONFIG_PRESENT',
        message: 'Legacy config fields were normalized at load time and should be migrated'
      });
    }

    return {
      status: 'ok',
      passed: checks.every((check) => check.passed),
      checks,
      warnings
    };
  }

  migrate(options = {}) {
    return this.executeMutable('migrate', 'pipeline.db', options.actor || 'system', options, (meta) => {
      resetDbCache();
      const db = getDb(this.config);
      const result = applyMigrations(db, {
        dbPath: this.config.paths.dbPath,
        backupsDir: this.config.paths.backupsDir
      });
      return {
        status: 'ok',
        migrations: getAppliedMigrationIds(db),
        applied: result.applied,
        backup_path: result.backup_path,
        meta
      };
    });
  }

  smoke(options = {}) {
    const doctor = this.doctor({ validateOnly: true });
    const validation = this.validateSystem();
    const exampleSlices = path.resolve(this.config.rootDir, 'slices', 'example-slices.json');
    return {
      status: 'ok',
      passed: doctor.passed && validation.passed && fileExists(exampleSlices),
      doctor,
      validation,
      examples: {
        example_slices: exampleSlices,
        exists: fileExists(exampleSlices)
      },
      meta: {
        request_id: options.requestId || null
      }
    };
  }

  reconcile(options = {}) {
    return this.executeMutable('reconcile', 'runtime', options.actor || 'system', options, (meta) =>
      this.withLease(meta, () => {
        const staleSlices = this.getStaleSlices();
        const reconciled = [];

        staleSlices.forEach((slice) => {
          const failed = markFailure(
            this.config,
            slice.id,
            slice.status === 'PR_OPEN' ? 'FAILED_PR' : 'FAILED_EXECUTION',
            `Reconciled stale slice in ${slice.status}`,
            'system',
            slice.status,
            { request_id: meta.request_id }
          );
          reconciled.push(failed);
        });

        const db = getDb(this.config);
        db.prepare(`
          UPDATE command_runs
          SET status = 'ABANDONED',
              updated_at = ?
          WHERE status IN ('RUNNING', 'LAUNCHING', 'LAUNCHED')
            AND created_at < ?
        `).run(new Date().toISOString(), new Date(Date.now() - (this.config.runtime.staleExecutionTimeoutSeconds * 1000)).toISOString());

        getAllSlices(this.config)
          .filter((slice) => !['EXECUTING', 'AUTO_FIX'].includes(slice.status))
          .forEach((slice) => {
            try {
              this.dispatcherAdapter.clearSignal(this.config, slice.id);
            } catch (error) {
              // Ignore orphaned signal cleanup failures.
            }
          });

        docs.updateBacklog(this.config, getAllSlices(this.config));
        return {
          status: 'ok',
          reconciled_slices: reconciled,
          stale_slices: staleSlices,
          meta
        };
      })
    );
  }

  startSlice(id, actor = 'sse', options = {}) {
    return this.executeMutable('start', id, actor, options, (meta) => ({
      status: 'ok',
      slice: this.startSliceInternal(id, actor, meta),
      meta
    }));
  }

  approveSlice(id, notes = '', actor = 'sse', options = {}) {
    return this.executeMutable('approve', id, actor, options, (meta) => ({
      status: 'ok',
      slice: this.approveSliceInternal(id, notes, actor, meta),
      meta
    }));
  }

  rejectSlice(id, reason, actor = 'sse', options = {}) {
    return this.executeMutable('reject', id, actor, options, (meta) => ({
      status: 'ok',
      slice: this.rejectSliceInternal(id, reason, actor, meta),
      meta
    }));
  }

  dispatchSlice(id, actor = 'sse', options = {}) {
    return this.executeMutable('dispatch', id, actor, options, (meta) => {
      const { slice, dispatch, failure_memory } = this.dispatchSliceInternal(id, actor, meta);
      return {
        status: 'ok',
        slice,
        dispatch,
        failure_memory,
        meta
      };
    });
  }

  cancelSlice(id, actor = 'sse', options = {}) {
    return this.executeMutable('cancel', id, actor, options, (meta) => ({
      status: 'ok',
      slice: this.cancelSliceInternal(id, actor, meta),
      meta
    }));
  }

  createPr(id, actor = 'system', options = {}) {
    return this.executeMutable('pr', id, actor, options, (meta) => this.openPrForSlice(id, actor, meta));
  }

  syncSlice(id, actor = 'system', options = {}) {
    return this.executeMutable('sync', id, actor, options, (meta) => this.syncPr(id, actor, meta));
  }

  processSignals(sliceId = null, actor = 'system', options = {}) {
    return this.executeMutable('process-signals', sliceId || 'all', actor, options, (meta) =>
      this.withLease(meta, () => ({
        status: 'ok',
        results: this.processSignalsInternal(sliceId, actor, meta),
        meta
      }))
    );
  }

  runCycle(actor = 'system', options = {}) {
    return this.executeMutable('run', 'pipeline', actor, options, (meta) =>
      this.withLease(meta, () => {
        const changes = [];
        const features = getFeatureGroups(this.config);
        const hasFeatureFailure = features.some((feature) => feature.status === 'FEATURE_FAILED');

        const nextReady = getNextPending(this.config);
        if (nextReady && !hasFeatureFailure) {
          changes.push({
            stage: 'start',
            result: {
              status: 'ok',
              slice: this.startSliceInternal(nextReady.id, actor, {
                ...meta,
                request_id: `${meta.request_id}:start:${nextReady.id}`
              })
            }
          });
        }

        const activeExecution = getAllSlices(this.config).some((slice) => ['EXECUTING', 'AUTO_FIX'].includes(slice.status));
        if (!activeExecution && !hasFeatureFailure) {
          const approved = getAllSlices(this.config).find((slice) => slice.status === 'APPROVED');
          if (approved) {
            changes.push({
              stage: 'dispatch',
              result: this.dispatchSliceInternal(approved.id, actor, {
                ...meta,
                request_id: `${meta.request_id}:dispatch:${approved.id}`
              })
            });
          }
        }

        this.processSignalsInternal(null, actor, {
          ...meta,
          request_id: `${meta.request_id}:signals`
        }).forEach((result) => {
          changes.push({ stage: 'signal', result });
        });

        getAllSlices(this.config)
          .filter((slice) => slice.status === 'TESTING')
          .forEach((slice) => {
            const result = this.runTestsForSlice(slice, actor, {
              ...meta,
              request_id: `${meta.request_id}:test:${slice.id}`
            });
            if (result) {
              changes.push({ stage: 'test', result });
            }
          });

        getAllSlices(this.config)
          .filter((slice) => slice.status === 'TESTING' && slice.test_results && slice.test_results.passed && slice.test_results.quality_gate && slice.test_results.quality_gate.passed)
          .forEach((slice) => {
            const result = this.openPrForSlice(slice.id, actor, {
              ...meta,
              request_id: `${meta.request_id}:pr:${slice.id}`
            });
            if (result) {
              changes.push({ stage: 'pr', result });
            }
          });

        getAllSlices(this.config)
          .filter((slice) => slice.status === 'PR_OPEN')
          .forEach((slice) => {
            const result = this.syncPr(slice.id, actor, {
              ...meta,
              request_id: `${meta.request_id}:sync:${slice.id}`
            });
            if (result) {
              changes.push({ stage: 'sync', result });
            }
          });

        docs.updateBacklog(this.config, getAllSlices(this.config));
        return {
          status: 'ok',
          changes,
          summary: getStatusSummary(this.config),
          meta
        };
      })
    );
  }

  startSliceInternal(id, actor, meta = {}) {
    const slice = this.requireSlice(id);
    const gate = gates.canAdvanceToSSEReview(slice, getDependencies(this.config, id));
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    return transitionState(this.config, id, 'SSE_REVIEW', actor, {
      reason: 'manual_start',
      request_id: meta.request_id || null
    });
  }

  approveSliceInternal(id, notes, actor, meta = {}) {
    const slice = this.requireSlice(id);
    const gate = gates.canApprove(slice);
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    updateSlice(this.config, id, {
      sse_reviewer: actor,
      sse_notes: notes || null
    });
    const next = transitionState(this.config, id, 'APPROVED', actor, {
      notes,
      request_id: meta.request_id || null
    });
    notify(this.config, 'SSE_APPROVED', { sliceId: id, notes, request_id: meta.request_id || null });
    return next;
  }

  rejectSliceInternal(id, reason, actor, meta = {}) {
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
    return transitionState(this.config, id, 'PENDING', actor, {
      reason,
      request_id: meta.request_id || null
    });
  }

  dispatchSliceInternal(id, actor, meta = {}) {
    const slice = this.requireSlice(id);
    const activeExecution = getAllSlices(this.config).some((candidate) => ['EXECUTING', 'AUTO_FIX'].includes(candidate.status));
    const gate = gates.canDispatch(slice, { hasActiveExecution: activeExecution });
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    this.git.ensureGitRepo({ requestId: meta.request_id || null, sliceId: id, phase: 'DISPATCH' });
    const branchName = slice.branch_name || `${this.config.branchPrefix}${slice.id.toLowerCase()}`;
    this.git.ensureBranch(branchName, this.config.defaultBranch, {
      requestId: meta.request_id || null,
      sliceId: id,
      phase: 'DISPATCH'
    });

    docs.scaffold(this.config);
    docs.writeCurrentSlice(this.config, slice);
    docs.writeFixHypothesis(this.config, null);
    const handoff = docs.readHandoff(this.config);
    const currentCodemap = codemap.getCodemap(this.config);
    const memoryLookup = failureMemory.lookup(this.config, slice);
    const memoryContext = failureMemory.applyCachedFix(this.config, slice, memoryLookup);

    if (this.config.hooks.failure_memory_lookup.enabled && this.config.hooks.failure_memory_lookup.exec.length > 0) {
      hooks.runHook(this.config, 'failure_memory_lookup', {
        sliceId: slice.id,
        repoPath: this.config.repoPath,
        files: slice.affected_files,
        requestId: meta.request_id || null,
        match: memoryContext.error_signature || null
      });
    }

    const runId = startSliceRun(this.config, {
      sliceId: slice.id,
      phase: 'EXECUTING',
      requestId: meta.request_id || null,
      actor,
      details: {
        branch_name: branchName
      }
    });
    const dispatchResult = this.dispatcherAdapter.dispatch(this.config, slice, {
      handoff,
      codemap: currentCodemap,
      failureMemory: memoryContext,
      mode: 'EXECUTING'
    }, {
      requestId: meta.request_id || null,
      runId,
      sliceId: slice.id
    });
    const next = resetForDispatch(this.config, id, branchName, dispatchResult.sessionId, actor, {
      context_path: dispatchResult.contextPath,
      failure_memory: memoryContext.applied ? memoryContext : null,
      request_id: meta.request_id || null,
      run_id: runId
    });

    return {
      status: 'ok',
      slice: next,
      dispatch: dispatchResult,
      failure_memory: memoryContext
    };
  }

  cancelSliceInternal(id, actor, meta = {}) {
    const slice = this.requireSlice(id);
    const gate = gates.canCancel(slice);
    if (!gate.passed) {
      throw new PipelineError('GATE_FAILED', gate.reason);
    }

    updateSlice(this.config, id, { agent_session_id: null });
    return transitionState(this.config, id, 'APPROVED', actor, {
      reason: 'cancelled',
      request_id: meta.request_id || null
    });
  }

  processSignalsInternal(sliceId = null, actor = 'system', meta = {}) {
    const slices = sliceId
      ? [this.requireSlice(sliceId)]
      : getAllSlices(this.config).filter((slice) => ['EXECUTING', 'AUTO_FIX'].includes(slice.status));

    const results = [];
    slices.forEach((slice) => {
      const result = this.processExecution(slice, actor, meta);
      if (result) {
        results.push(result);
      }
    });
    return results;
  }

  processExecution(slice, actor = 'system', meta = {}) {
    const timeoutMinutes = slice.status === 'AUTO_FIX'
      ? this.config.autoFix.timeoutMinutes
      : this.config.dispatcher.timeoutMinutes;

    if (this.dispatcherAdapter.timedOut(this.config, slice, timeoutMinutes)) {
      const failed = markFailure(
        this.config,
        slice.id,
        'FAILED_EXECUTION',
        `Execution timed out after ${timeoutMinutes} minutes`,
        actor,
        slice.status,
        { request_id: meta.request_id || null }
      );
      notify(this.config, 'FAILED_EXECUTION', { sliceId: slice.id, timeoutMinutes, request_id: meta.request_id || null });
      return {
        status: 'ok',
        slice: failed
      };
    }

    if (slice.status === 'EXECUTING') {
      const preflight = docs.validatePreflight(this.config);
      const preflightGate = gates.canBeginEditing(preflight);
      if (!preflightGate.passed) {
        logEvent(this.config, slice.id, 'gate_check', actor, preflight, slice.status, slice.status, {
          requestId: meta.request_id || null
        });
        return {
          status: 'ok',
          slice: this.requireSlice(slice.id),
          waiting_on_preflight: true,
          preflight
        };
      }
    }

    const signal = this.dispatcherAdapter.readSignal(this.config, slice.id);
    if (!signal || signal.status === 'active') {
      return null;
    }

    if (signal.needs_split || signal.status === 'needs_split') {
      const next = markNeedsSplit(this.config, slice.id, 'agent', signal.split_reason || 'Agent requested slice split', signal);
      this.dispatcherAdapter.clearSignal(this.config, slice.id);
      notify(this.config, 'NEEDS_SPLIT', { sliceId: slice.id, signal, request_id: meta.request_id || null });
      completeSliceRun(this.config, slice.last_run_id || randomId('run'), 'NEEDS_SPLIT', { signal });
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
        { signal, request_id: meta.request_id || null }
      );
      this.dispatcherAdapter.clearSignal(this.config, slice.id);
      notify(this.config, 'FAILED_EXECUTION', { sliceId: slice.id, signal, request_id: meta.request_id || null });
      completeSliceRun(this.config, slice.last_run_id || randomId('run'), 'FAILED', { signal });
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
        files: signal.files_changed || slice.affected_files,
        requestId: meta.request_id || null
      });
      hooks.runHook(this.config, 'pre_commit', {
        sliceId: slice.id,
        repoPath: this.config.repoPath,
        files: signal.files_changed || slice.affected_files,
        requestId: meta.request_id || null
      });
    } catch (error) {
      const failed = markFailure(
        this.config,
        slice.id,
        'FAILED_EXECUTION',
        error.message,
        actor,
        slice.status,
        { signal, hook_error: error.details || null, request_id: meta.request_id || null }
      );
      this.dispatcherAdapter.clearSignal(this.config, slice.id);
      notify(this.config, 'FAILED_EXECUTION', { sliceId: slice.id, error: error.message, request_id: meta.request_id || null });
      completeSliceRun(this.config, slice.last_run_id || randomId('run'), 'FAILED', { error: error.message });
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
      agent_session_id: null,
      request_id: meta.request_id || null,
      run_id: slice.last_run_id || null
    });
    this.dispatcherAdapter.clearSignal(this.config, slice.id);
    completeSliceRun(this.config, slice.last_run_id || randomId('run'), 'COMPLETED', { signal });
    return {
      status: 'ok',
      slice: next,
      signal
    };
  }

  runTestsForSlice(slice, actor = 'system', meta = {}) {
    const current = typeof slice === 'string' ? this.requireSlice(slice) : this.requireSlice(slice.id);
    if (current.status !== 'TESTING') {
      return null;
    }

    const runId = startSliceRun(this.config, {
      sliceId: current.id,
      phase: 'TESTING',
      requestId: meta.request_id || null,
      actor
    });
    const testResult = tests.run(this.config, current, {
      requestId: meta.request_id || null,
      runId
    });
    const combinedResults = { ...testResult };
    updateSlice(this.config, current.id, {
      test_results: JSON.stringify(combinedResults),
      last_run_id: runId,
      last_request_id: meta.request_id || null
    });
    logEvent(this.config, current.id, 'test_result', actor, testResult, 'TESTING', 'TESTING', {
      runId,
      requestId: meta.request_id || null
    });

    if (!testResult.passed) {
      completeSliceRun(this.config, runId, 'FAILED', testResult);
      return this.handleTestFailure(current, 'FAILED_TESTS', `Tests failed for ${current.id}`, {
        source: 'basic_tests',
        test_result: testResult,
        files: current.affected_files,
        request_id: meta.request_id || null,
        run_id: runId
      });
    }

    const qualityResult = qualityGate.run(this.config, current, {
      requestId: meta.request_id || null,
      runId
    });
    combinedResults.quality_gate = qualityResult;
    updateSlice(this.config, current.id, {
      test_results: JSON.stringify(combinedResults),
      last_run_id: runId,
      last_request_id: meta.request_id || null
    });
    logEvent(this.config, current.id, 'quality_gate_result', actor, qualityResult, 'TESTING', 'TESTING', {
      runId,
      requestId: meta.request_id || null
    });

    if (!qualityResult.passed) {
      completeSliceRun(this.config, runId, 'FAILED', combinedResults);
      return this.handleTestFailure(current, 'FAILED_TESTS', `Quality gate failed for ${current.id}`, {
        source: 'quality_gate',
        test_result: combinedResults,
        quality_gate: qualityResult,
        files: current.affected_files,
        request_id: meta.request_id || null,
        run_id: runId
      });
    }

    try {
      hooks.runHook(this.config, 'post_test', {
        sliceId: current.id,
        repoPath: this.config.repoPath,
        files: current.affected_files,
        requestId: meta.request_id || null
      });
    } catch (error) {
      completeSliceRun(this.config, runId, 'FAILED', { hook_error: error.message });
      const failed = markFailure(
        this.config,
        current.id,
        'FAILED_TESTS',
        error.message,
        actor,
        'TESTING',
        {
          test_result: combinedResults,
          hook_error: error.details || null,
          request_id: meta.request_id || null,
          run_id: runId
        }
      );
      notify(this.config, 'FAILED_TESTS', { sliceId: current.id, error: error.message, request_id: meta.request_id || null });
      return {
        status: 'ok',
        slice: failed,
        test_result: combinedResults
      };
    }

    completeSliceRun(this.config, runId, 'COMPLETED', combinedResults);
    return {
      status: 'ok',
      slice: this.requireSlice(current.id),
      test_result: combinedResults
    };
  }

  handleTestFailure(slice, failureType, reason, details = {}) {
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
    }, 'TESTING', 'AUTO_FIX', {
      runId: details.run_id || null,
      requestId: details.request_id || null
    });
    docs.writeFixHypothesis(this.config, null);

    const runId = startSliceRun(this.config, {
      sliceId: slice.id,
      phase: 'AUTO_FIX',
      requestId: details.request_id || null,
      actor: 'system',
      details: {
        failureType,
        reason
      }
    });
    const dispatchResult = this.dispatcherAdapter.dispatch(this.config, slice, {
      handoff: docs.readHandoff(this.config),
      codemap: codemap.getCodemap(this.config),
      mode: 'AUTO_FIX',
      failureContext: reason
    }, {
      requestId: details.request_id || null,
      runId,
      sliceId: slice.id
    });
    updateSlice(this.config, slice.id, {
      agent_session_id: dispatchResult.sessionId,
      last_run_id: runId,
      last_request_id: details.request_id || null
    });
    const next = transitionState(this.config, slice.id, 'AUTO_FIX', 'system', {
      context_path: dispatchResult.contextPath,
      agent_session_id: dispatchResult.sessionId,
      failure_type: failureType,
      failure_reason: reason,
      request_id: details.request_id || null,
      run_id: runId
    });
    return {
      status: 'ok',
      slice: next,
      auto_fix: dispatchResult,
      test_result: details.test_result || null
    };
  }

  openPrForSlice(slice, actor = 'system', meta = {}) {
    const current = typeof slice === 'string' ? this.requireSlice(slice) : this.requireSlice(slice.id);
    const gate = gates.canOpenPR(current);
    if (!gate.passed) {
      return null;
    }

    try {
      hooks.runHook(this.config, 'pre_pr', {
        sliceId: current.id,
        repoPath: this.config.repoPath,
        files: current.affected_files,
        requestId: meta.request_id || null
      });
    } catch (error) {
      const failed = markFailure(this.config, current.id, 'FAILED_PR', error.message, actor, 'TESTING', {
        hook_error: error.details || null,
        request_id: meta.request_id || null
      });
      notify(this.config, 'FAILED_PR', { sliceId: current.id, error: error.message, request_id: meta.request_id || null });
      return {
        status: 'ok',
        slice: failed,
        error: error.message,
        meta
      };
    }

    const runId = startSliceRun(this.config, {
      sliceId: current.id,
      phase: 'PR_OPEN',
      requestId: meta.request_id || null,
      actor
    });

    try {
      const pr = this.github.openPR(current, current.branch_name, {
        requestId: meta.request_id || null,
        runId,
        sliceId: current.id,
        phase: 'PR_OPEN'
      });
      updateSlice(this.config, current.id, {
        pr_url: pr.url,
        pr_number: pr.number,
        last_run_id: runId,
        last_request_id: meta.request_id || null
      });
      const next = transitionState(this.config, current.id, 'PR_OPEN', actor, {
        ...pr,
        request_id: meta.request_id || null,
        run_id: runId
      });
      completeSliceRun(this.config, runId, 'COMPLETED', pr);
      return {
        status: 'ok',
        slice: next,
        pr,
        meta
      };
    } catch (error) {
      completeSliceRun(this.config, runId, 'FAILED', error.details || null);
      const failed = markFailure(this.config, current.id, 'FAILED_PR', error.message, actor, 'TESTING', {
        error: error.details || null,
        request_id: meta.request_id || null,
        run_id: runId
      });
      notify(this.config, 'FAILED_PR', { sliceId: current.id, error: error.message, request_id: meta.request_id || null });
      return {
        status: 'ok',
        slice: failed,
        error: error.message,
        meta
      };
    }
  }

  syncPr(slice, actor = 'system', meta = {}) {
    const current = typeof slice === 'string' ? this.requireSlice(slice) : this.requireSlice(slice.id);
    if (current.status !== 'PR_OPEN' || !current.pr_number) {
      return null;
    }

    try {
      const status = this.github.getPRStatus(current.pr_number, {
        requestId: meta.request_id || null,
        runId: current.last_run_id || null,
        sliceId: current.id,
        phase: 'PR_OPEN'
      });
      if (status.merged) {
        transitionState(this.config, current.id, 'MERGED', 'github', {
          ...status,
          request_id: meta.request_id || null,
          run_id: current.last_run_id || null
        });
        try {
          hooks.runHook(this.config, 'post_merge', {
            sliceId: current.id,
            repoPath: this.config.repoPath,
            files: current.affected_files,
            requestId: meta.request_id || null
          });
        } catch (error) {
          logEvent(this.config, current.id, 'hook_warning', actor, {
            hook: 'post_merge',
            error: error.message,
            details: error.details || null
          }, 'MERGED', 'MERGED', {
            requestId: meta.request_id || null
          });
        }

        const mergedSlice = this.requireSlice(current.id);
        if (mergedSlice.last_signal) {
          codemap.updateFromSignal(this.config, mergedSlice, mergedSlice.last_signal);
          docs.writeHandoff(this.config, mergedSlice, mergedSlice.last_signal);
          docs.updateKnownIssues(this.config, mergedSlice.last_signal);
          docs.updateArchitecture(this.config, mergedSlice.last_signal);
        }
        docs.updateBacklog(this.config, getAllSlices(this.config));
        const failurePattern = failureMemory.recordSuccess(this.config, mergedSlice);
        const featureUpdates = this.evaluateFeatureGroups(meta);
        return {
          status: 'ok',
          slice: this.requireSlice(current.id),
          pr_status: status,
          feature_updates: featureUpdates,
          failure_memory: failurePattern,
          meta
        };
      }

      if (status.closed && !status.merged) {
        const failed = markFailure(this.config, current.id, 'FAILED_PR', 'PR closed without merge', 'github', 'PR_OPEN', {
          ...status,
          request_id: meta.request_id || null
        });
        notify(this.config, 'FAILED_PR', { sliceId: current.id, prStatus: status, request_id: meta.request_id || null });
        return {
          status: 'ok',
          slice: failed,
          pr_status: status,
          meta
        };
      }

      return {
        status: 'ok',
        slice: current,
        pr_status: status,
        meta
      };
    } catch (error) {
      return {
        status: 'ok',
        slice: current,
        error: error.message,
        meta
      };
    }
  }

  evaluateFeatureGroups(meta = {}) {
    const features = getFeatureGroups(this.config);
    const updates = [];

    features.forEach((feature) => {
      if (feature.status === 'FEATURE_COMPLETE' || feature.status === 'FEATURE_FAILED') {
        return;
      }

      if (feature.slices.length === 0 || feature.slices.some((slice) => slice.status !== 'MERGED')) {
        return;
      }

      const result = runFeatureSuite(this.config, feature, {
        requestId: meta.request_id || null
      });
      const updated = updateFeatureGroup(this.config, feature.id, {
        status: result.status,
        last_result: result.results,
        completed_at: result.status === 'FEATURE_COMPLETE' ? new Date().toISOString() : null
      });
      updates.push(updated);

      if (result.status === 'FEATURE_FAILED') {
        notify(this.config, 'FEATURE_FAILED', {
          featureId: feature.id,
          results: result.results,
          request_id: meta.request_id || null
        });
      }
    });

    return updates;
  }

  executeMutable(operationName, targetId, actor, options, callback) {
    return withOperation(this.config, {
      requestId: options.requestId || options.request_id || null,
      operationName,
      targetId,
      actor
    }, (requestId) => callback({
      actor,
      request_id: requestId,
      correlation_id: requestId
    }));
  }

  withLease(meta, callback) {
    acquireLease(this.config, CONTROLLER_LEASE_KEY, this.ownerId);
    heartbeatLease(this.config, CONTROLLER_LEASE_KEY, this.ownerId);
    try {
      return callback();
    } finally {
      releaseLease(this.config, CONTROLLER_LEASE_KEY, this.ownerId);
    }
  }

  safeCheck(fn, successDetail) {
    try {
      fn();
      return {
        passed: true,
        detail: successDetail
      };
    } catch (error) {
      return {
        passed: false,
        detail: error.message
      };
    }
  }

  ensureWritable(targetDir) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      const probe = path.resolve(targetDir, `.pipeline-write-check-${process.pid}.tmp`);
      fs.writeFileSync(probe, 'ok', 'utf8');
      fs.unlinkSync(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  isStaleSlice(slice) {
    if (!['EXECUTING', 'AUTO_FIX', 'TESTING', 'PR_OPEN'].includes(slice.status)) {
      return false;
    }

    const reference = slice.updated_at || slice.dispatched_at || slice.created_at;
    if (!reference) {
      return false;
    }

    return (Date.now() - Date.parse(reference)) > (this.config.runtime.staleExecutionTimeoutSeconds * 1000);
  }

  getStaleSlices() {
    return getAllSlices(this.config).filter((slice) => this.isStaleSlice(slice));
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
