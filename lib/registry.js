'use strict';

const { getDb } = require('./db.js');
const {
  REAL_SLICE_STATES,
  FEATURE_STATES,
  DISPLAY_FAILURE_STATES,
  ATTENTION_DISPLAY_STATES,
  SLICE_TRANSITIONS
} = require('./constants.js');
const { PipelineError } = require('./errors.js');
const {
  nowIso,
  parseStoredJson,
  toStoredJson,
  durationSeconds
} = require('./utils.js');

function parseSliceRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    acceptance_criteria: parseStoredJson(row.acceptance_criteria, []),
    affected_files: parseStoredJson(row.affected_files, []),
    dependencies: parseStoredJson(row.dependencies, []),
    feature_ids: parseStoredJson(row.feature_ids, []),
    test_results: parseStoredJson(row.test_results, null),
    last_signal: parseStoredJson(row.last_signal, null),
    needs_split: Boolean(row.needs_split)
  };
}

function parseFeatureRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    slice_ids: parseStoredJson(row.slice_ids, []),
    last_result: parseStoredJson(row.last_result, null)
  };
}

function serializeSliceInput(sliceData) {
  return {
    id: sliceData.id,
    title: sliceData.title,
    description: sliceData.description,
    acceptance_criteria: toStoredJson(sliceData.acceptance_criteria || []),
    affected_files: toStoredJson(sliceData.affected_files || []),
    agent_type: sliceData.agent_type,
    agent_instructions: sliceData.agent_instructions || '',
    dependencies: toStoredJson(sliceData.dependencies || []),
    feature_ids: toStoredJson(sliceData.feature_ids || []),
    complexity: sliceData.complexity || 'medium'
  };
}

function ensureValidState(state) {
  if (!REAL_SLICE_STATES.includes(state)) {
    throw new PipelineError('INVALID_STATE', `Unknown slice state: ${state}`);
  }
}

function ensureValidFeatureState(state) {
  if (!FEATURE_STATES.includes(state)) {
    throw new PipelineError('INVALID_FEATURE_STATE', `Unknown feature state: ${state}`);
  }
}

function logEvent(config, sliceId, eventType, actor, details = {}, fromState = null, toState = null) {
  const db = getDb(config);
  db.prepare(`
    INSERT INTO events (slice_id, event_type, from_state, to_state, actor, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sliceId,
    eventType,
    fromState,
    toState,
    actor,
    toStoredJson(details),
    nowIso()
  );
}

function startTiming(config, sliceId, state, enteredAt = nowIso()) {
  const db = getDb(config);
  db.prepare(`
    INSERT INTO slice_timing (slice_id, state, entered_at)
    VALUES (?, ?, ?)
  `).run(sliceId, state, enteredAt);
}

function closeTiming(config, sliceId, state, exitedAt = nowIso()) {
  const db = getDb(config);
  const row = db.prepare(`
    SELECT id, entered_at
    FROM slice_timing
    WHERE slice_id = ? AND state = ? AND exited_at IS NULL
    ORDER BY entered_at DESC
    LIMIT 1
  `).get(sliceId, state);

  if (!row) {
    return;
  }

  db.prepare(`
    UPDATE slice_timing
    SET exited_at = ?, duration_seconds = ?
    WHERE id = ?
  `).run(exitedAt, durationSeconds(row.entered_at, exitedAt), row.id);
}

function clearLastFailure(config, sliceId) {
  const db = getDb(config);
  db.prepare(`
    UPDATE slices
    SET last_failure_type = NULL,
        last_failure_reason = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(nowIso(), sliceId);
}

function updateSlice(config, id, fields) {
  const db = getDb(config);
  const assignments = [];
  const values = [];

  Object.entries(fields).forEach(([key, value]) => {
    assignments.push(`${key} = ?`);
    values.push(value);
  });

  assignments.push('updated_at = ?');
  values.push(nowIso());
  values.push(id);

  db.prepare(`UPDATE slices SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
  return getSlice(config, id);
}

function deriveDisplayStatus(slice, dependencySlices = []) {
  const unresolved = dependencySlices.filter((dependency) => dependency.status !== 'MERGED');
  const blockedReason = unresolved.length > 0
    ? `Waiting on ${unresolved.map((dependency) => dependency.id).join(', ')}`
    : null;

  let displayStatus = slice.status;
  if (slice.status === 'PENDING' && blockedReason) {
    displayStatus = 'BLOCKED';
  } else if (slice.status === 'APPROVED' && slice.last_failure_type) {
    displayStatus = slice.last_failure_type;
  } else if (slice.status === 'APPROVED' && blockedReason) {
    displayStatus = 'BLOCKED';
  }

  const nextActionMap = {
    PENDING: blockedReason ? 'wait_for_dependencies' : 'start_review',
    BLOCKED: 'wait_for_dependencies',
    SSE_REVIEW: 'approve_or_reject',
    APPROVED: 'dispatch',
    EXECUTING: 'wait_for_signal',
    AUTO_FIX: 'wait_for_fix_signal',
    TESTING: 'run_tests',
    PR_OPEN: 'sync_pr',
    MERGED: 'none',
    NEEDS_SPLIT: 'split_slice',
    FAILED_EXECUTION: 'dispatch',
    FAILED_TESTS: 'dispatch',
    FAILED_PR: 'dispatch'
  };

  return {
    ...slice,
    display_status: displayStatus,
    blocked_reason: blockedReason,
    last_failure: slice.last_failure_type
      ? {
          type: slice.last_failure_type,
          reason: slice.last_failure_reason
        }
      : null,
    attention_required: ATTENTION_DISPLAY_STATES.includes(displayStatus),
    next_action: nextActionMap[displayStatus] || 'inspect'
  };
}

function getRawSlice(config, id) {
  const db = getDb(config);
  return parseSliceRow(db.prepare('SELECT * FROM slices WHERE id = ?').get(id));
}

function getDependencies(config, sliceId) {
  const slice = getRawSlice(config, sliceId);
  if (!slice || slice.dependencies.length === 0) {
    return [];
  }

  const db = getDb(config);
  const placeholders = slice.dependencies.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT * FROM slices WHERE id IN (${placeholders})`).all(...slice.dependencies);
  const mapped = new Map(rows.map((row) => [row.id, parseSliceRow(row)]));
  return slice.dependencies
    .map((dependencyId) => mapped.get(dependencyId))
    .filter(Boolean)
    .map((dependency) => deriveDisplayStatus(dependency, []));
}

function getSlice(config, id) {
  const slice = getRawSlice(config, id);
  if (!slice) {
    return null;
  }

  const dependencies = getDependencies(config, id);
  return {
    ...deriveDisplayStatus(slice, dependencies),
    dependency_details: dependencies
  };
}

function areDependenciesMet(config, sliceId) {
  return getDependencies(config, sliceId).every((dependency) => dependency.status === 'MERGED');
}

function getAllSlices(config) {
  const db = getDb(config);
  const rows = db.prepare('SELECT * FROM slices ORDER BY id').all();
  const parsed = rows.map(parseSliceRow);
  const byId = new Map(parsed.map((slice) => [slice.id, slice]));
  return parsed.map((slice) => {
    const dependencies = slice.dependencies.map((id) => byId.get(id)).filter(Boolean);
    return {
      ...deriveDisplayStatus(slice, dependencies),
      dependency_details: dependencies.map((dependency) => deriveDisplayStatus(dependency, []))
    };
  });
}

function getSlicesByStatus(config, status) {
  if (!status) {
    return getAllSlices(config);
  }

  return getAllSlices(config).filter((slice) => slice.status === status || slice.display_status === status);
}

function getNextPending(config) {
  const featureFailure = getFeatureGroups(config).find((feature) => feature.status === 'FEATURE_FAILED');
  if (featureFailure) {
    return null;
  }

  return getAllSlices(config).find(
    (slice) => slice.status === 'PENDING' && slice.blocked_reason === null
  ) || null;
}

function createSlice(config, sliceData) {
  const db = getDb(config);
  const now = nowIso();
  const data = serializeSliceInput(sliceData);

  db.prepare(`
    INSERT INTO slices (
      id, title, description, acceptance_criteria, affected_files,
      agent_type, agent_instructions, dependencies, feature_ids,
      status, complexity, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
  `).run(
    data.id,
    data.title,
    data.description,
    data.acceptance_criteria,
    data.affected_files,
    data.agent_type,
    data.agent_instructions,
    data.dependencies,
    data.feature_ids,
    data.complexity,
    now,
    now
  );

  logEvent(config, data.id, 'slice_created', 'system', { title: data.title });
  startTiming(config, data.id, 'PENDING', now);
  return getSlice(config, data.id);
}

function upsertSlice(config, sliceData) {
  const existing = getRawSlice(config, sliceData.id);
  if (!existing) {
    return createSlice(config, sliceData);
  }

  const data = serializeSliceInput(sliceData);
  updateSlice(config, sliceData.id, {
    title: data.title,
    description: data.description,
    acceptance_criteria: data.acceptance_criteria,
    affected_files: data.affected_files,
    agent_type: data.agent_type,
    agent_instructions: data.agent_instructions,
    dependencies: data.dependencies,
    feature_ids: data.feature_ids,
    complexity: data.complexity
  });
  logEvent(config, sliceData.id, 'slice_updated', 'system', { title: data.title });
  return getSlice(config, sliceData.id);
}

function transitionState(config, id, toState, actor, details = {}) {
  ensureValidState(toState);
  const db = getDb(config);
  const slice = getRawSlice(config, id);
  if (!slice) {
    throw new PipelineError('SLICE_NOT_FOUND', `Unknown slice: ${id}`);
  }

  const allowed = SLICE_TRANSITIONS[slice.status] || [];
  if (!allowed.includes(toState)) {
    throw new PipelineError(
      'INVALID_TRANSITION',
      `Cannot transition ${id} from ${slice.status} to ${toState}`,
      { sliceId: id, from: slice.status, to: toState }
    );
  }

  const now = nowIso();
  const transaction = db.transaction(() => {
    closeTiming(config, id, slice.status, now);

    const updateFields = {
      status: toState,
      agent_session_id: details.agent_session_id === undefined ? slice.agent_session_id : details.agent_session_id,
      branch_name: details.branch_name === undefined ? slice.branch_name : details.branch_name,
      last_signal: details.last_signal === undefined ? slice.last_signal ? toStoredJson(slice.last_signal) : null : toStoredJson(details.last_signal),
      needs_split: details.needs_split ? 1 : 0,
      split_reason: details.split_reason || null
    };

    if (toState === 'APPROVED') {
      updateFields.approved_at = slice.approved_at || now;
    }

    if (toState === 'EXECUTING' || toState === 'AUTO_FIX') {
      updateFields.dispatched_at = now;
    }

    if (toState === 'MERGED') {
      updateFields.merged_at = now;
    }

    updateSlice(config, id, updateFields);
    startTiming(config, id, toState, now);
    logEvent(config, id, 'state_change', actor, details, slice.status, toState);
  });

  transaction();
  return getSlice(config, id);
}

function markFailure(config, id, failureType, reason, actor, fromState, details = {}) {
  if (!DISPLAY_FAILURE_STATES.includes(failureType)) {
    throw new PipelineError('INVALID_FAILURE_STATE', `Unknown failure state: ${failureType}`);
  }

  const slice = getRawSlice(config, id);
  if (!slice) {
    throw new PipelineError('SLICE_NOT_FOUND', `Unknown slice: ${id}`);
  }

  let current = slice;
  if (fromState && slice.status === fromState) {
    current = transitionState(config, id, 'APPROVED', actor, details);
  }

  updateSlice(config, id, {
    last_failure_type: failureType,
    last_failure_reason: reason,
    agent_session_id: null
  });

  logEvent(config, id, 'failure', actor, { failureType, reason, ...details }, slice.status, current.status);
  return getSlice(config, id);
}

function resetForDispatch(config, id, branchName, sessionId, actor, details = {}) {
  clearLastFailure(config, id);
  const current = getRawSlice(config, id);
  const nextDispatchAttempts = (current.dispatch_attempts || 0) + 1;
  updateSlice(config, id, {
    branch_name: branchName,
    agent_session_id: sessionId,
    dispatch_attempts: nextDispatchAttempts,
    needs_split: 0,
    split_reason: null
  });
  return transitionState(config, id, 'EXECUTING', actor, {
    ...details,
    branch_name: branchName,
    agent_session_id: sessionId
  });
}

function markNeedsSplit(config, id, actor, reason, signal) {
  updateSlice(config, id, {
    needs_split: 1,
    split_reason: reason,
    last_signal: toStoredJson(signal || null)
  });
  return transitionState(config, id, 'NEEDS_SPLIT', actor, {
    needs_split: true,
    split_reason: reason,
    last_signal: signal || null
  });
}

function getEvents(config, sliceId) {
  const db = getDb(config);
  const rows = db.prepare(`
    SELECT *
    FROM events
    WHERE slice_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(sliceId);

  return rows.map((row) => ({
    ...row,
    details: parseStoredJson(row.details, {})
  }));
}

function validateImportPayload(payload) {
  if (!payload || !Array.isArray(payload.slices)) {
    throw new PipelineError('IMPORT_INVALID', 'Import file must contain a top-level slices array');
  }

  const ids = new Set();
  payload.slices.forEach((slice) => {
    if (!slice.id || !slice.title || !slice.description || !slice.agent_type) {
      throw new PipelineError('IMPORT_INVALID', `Slice ${slice.id || '(missing-id)'} is missing required fields`);
    }

    if (ids.has(slice.id)) {
      throw new PipelineError('IMPORT_INVALID', `Duplicate slice id: ${slice.id}`);
    }
    ids.add(slice.id);

    if (!Array.isArray(slice.acceptance_criteria) || !Array.isArray(slice.affected_files) || !Array.isArray(slice.dependencies)) {
      throw new PipelineError('IMPORT_INVALID', `Slice ${slice.id} must use arrays for acceptance_criteria, affected_files, and dependencies`);
    }
  });

  payload.slices.forEach((slice) => {
    slice.dependencies.forEach((dependencyId) => {
      if (!ids.has(dependencyId)) {
        throw new PipelineError('IMPORT_INVALID', `Slice ${slice.id} depends on unknown slice ${dependencyId}`);
      }
    });
  });

  const graph = new Map(payload.slices.map((slice) => [slice.id, slice.dependencies]));
  const visiting = new Set();
  const visited = new Set();

  function walk(node) {
    if (visiting.has(node)) {
      throw new PipelineError('IMPORT_INVALID', `Dependency cycle detected at ${node}`);
    }

    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    (graph.get(node) || []).forEach(walk);
    visiting.delete(node);
    visited.add(node);
  }

  payload.slices.forEach((slice) => walk(slice.id));

  if (payload.features) {
    const featureIds = new Set();
    payload.features.forEach((feature) => {
      if (!feature.id || !feature.name || !Array.isArray(feature.slices)) {
        throw new PipelineError('IMPORT_INVALID', `Feature ${(feature && feature.id) || '(missing-id)'} is missing required fields`);
      }

      if (featureIds.has(feature.id)) {
        throw new PipelineError('IMPORT_INVALID', `Duplicate feature id: ${feature.id}`);
      }
      featureIds.add(feature.id);

      feature.slices.forEach((sliceId) => {
        if (!ids.has(sliceId)) {
          throw new PipelineError('IMPORT_INVALID', `Feature ${feature.id} references unknown slice ${sliceId}`);
        }
      });
    });
  }
}

function importSlices(config, payload) {
  validateImportPayload(payload);
  const db = getDb(config);
  const featureMembership = new Map();

  (payload.features || []).forEach((feature) => {
    feature.slices.forEach((sliceId) => {
      const featureIds = featureMembership.get(sliceId) || [];
      featureIds.push(feature.id);
      featureMembership.set(sliceId, featureIds);
    });
  });

  const transaction = db.transaction(() => {
    payload.slices.forEach((slice) => {
      upsertSlice(config, {
        ...slice,
        feature_ids: featureMembership.get(slice.id) || []
      });
    });

    (payload.features || []).forEach((feature) => {
      const existing = getFeatureGroup(config, feature.id);
      const now = nowIso();
      if (!existing) {
        db.prepare(`
          INSERT INTO feature_groups (id, name, slice_ids, test_suite, status, last_result, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'PENDING', NULL, ?, ?)
        `).run(
          feature.id,
          feature.name,
          toStoredJson(feature.slices),
          feature.test_suite || null,
          now,
          now
        );
      } else {
        db.prepare(`
          UPDATE feature_groups
          SET name = ?, slice_ids = ?, test_suite = ?, updated_at = ?
          WHERE id = ?
        `).run(
          feature.name,
          toStoredJson(feature.slices),
          feature.test_suite || null,
          now,
          feature.id
        );
      }
    });
  });

  transaction();
  return {
    project: payload.project || 'Unnamed Project',
    version: payload.version || '1.0',
    slice_count: payload.slices.length,
    feature_count: Array.isArray(payload.features) ? payload.features.length : 0
  };
}

function getFeatureGroup(config, id) {
  const db = getDb(config);
  return parseFeatureRow(db.prepare('SELECT * FROM feature_groups WHERE id = ?').get(id));
}

function getFeatureGroups(config) {
  const db = getDb(config);
  const slices = getAllSlices(config);
  const byId = new Map(slices.map((slice) => [slice.id, slice]));
  return db.prepare('SELECT * FROM feature_groups ORDER BY id').all().map(parseFeatureRow).map((feature) => {
    const featureSlices = feature.slice_ids.map((sliceId) => byId.get(sliceId)).filter(Boolean);
    return {
      ...feature,
      slices: featureSlices,
      merged_count: featureSlices.filter((slice) => slice.status === 'MERGED').length,
      total_count: featureSlices.length
    };
  });
}

function updateFeatureGroup(config, id, fields) {
  ensureValidFeatureState(fields.status || getFeatureGroup(config, id)?.status || 'PENDING');
  const db = getDb(config);
  const assignments = [];
  const values = [];
  Object.entries(fields).forEach(([key, value]) => {
    assignments.push(`${key} = ?`);
    values.push(key === 'last_result' ? toStoredJson(value) : value);
  });
  assignments.push('updated_at = ?');
  values.push(nowIso());
  values.push(id);
  db.prepare(`UPDATE feature_groups SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
  return getFeatureGroup(config, id);
}

function getStatusSummary(config) {
  const slices = getAllSlices(config);
  const features = getFeatureGroups(config);
  const counts = slices.reduce((accumulator, slice) => {
    accumulator[slice.status] = (accumulator[slice.status] || 0) + 1;
    return accumulator;
  }, {});
  const displayCounts = slices.reduce((accumulator, slice) => {
    accumulator[slice.display_status] = (accumulator[slice.display_status] || 0) + 1;
    return accumulator;
  }, {});

  const activeSlice = slices.find((slice) => ['EXECUTING', 'AUTO_FIX', 'TESTING'].includes(slice.status)) || null;
  const nextReady = getNextPending(config);

  return {
    counts,
    display_counts: displayCounts,
    active_slice: activeSlice,
    next_ready_slice: nextReady,
    merged_count: slices.filter((slice) => slice.status === 'MERGED').length,
    total_slices: slices.length,
    attention_count: slices.filter((slice) => slice.attention_required).length,
    feature_counts: features.reduce((accumulator, feature) => {
      accumulator[feature.status] = (accumulator[feature.status] || 0) + 1;
      return accumulator;
    }, {})
  };
}

function getMetrics(config, filters = {}) {
  const db = getDb(config);
  const timings = db.prepare('SELECT * FROM slice_timing ORDER BY entered_at DESC').all();
  const slices = getAllSlices(config)
    .filter((slice) => !filters.agent || slice.agent_type === filters.agent)
    .filter((slice) => !filters.feature || slice.feature_ids.includes(filters.feature));

  const sliceIds = new Set(slices.map((slice) => slice.id));
  const relevantTimings = timings.filter((timing) => sliceIds.has(timing.slice_id));

  const avg = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const mergedDurations = slices
    .filter((slice) => slice.merged_at)
    .map((slice) => durationSeconds(slice.created_at, slice.merged_at));

  const executingDurations = relevantTimings
    .filter((timing) => timing.state === 'EXECUTING' && timing.duration_seconds)
    .map((timing) => timing.duration_seconds);

  const firstPassCount = slices.filter((slice) => slice.test_results && slice.test_results.passed && slice.fix_attempts === 0).length;
  const withTestsCount = slices.filter((slice) => slice.test_results).length;
  const autoFixSuccessCount = slices.filter((slice) => slice.fix_attempts > 0 && slice.test_results && slice.test_results.passed).length;
  const autoFixCount = slices.filter((slice) => slice.fix_attempts > 0).length;

  const byFailure = slices.reduce((accumulator, slice) => {
    if (slice.last_failure_type) {
      accumulator[slice.last_failure_type] = (accumulator[slice.last_failure_type] || 0) + 1;
    }
    return accumulator;
  }, {});

  return {
    slice_count: slices.length,
    average_pending_to_merged_seconds: avg(mergedDurations),
    average_executing_seconds: avg(executingDurations),
    first_pass_rate: withTestsCount ? Math.round((firstPassCount / withTestsCount) * 100) : 0,
    auto_fix_success_rate: autoFixCount ? Math.round((autoFixSuccessCount / autoFixCount) * 100) : 0,
    failures_by_type: byFailure
  };
}

module.exports = {
  getSlice,
  getRawSlice,
  getAllSlices,
  getSlicesByStatus,
  getDependencies,
  areDependenciesMet,
  getNextPending,
  createSlice,
  upsertSlice,
  updateSlice,
  transitionState,
  markFailure,
  markNeedsSplit,
  clearLastFailure,
  resetForDispatch,
  logEvent,
  getEvents,
  validateImportPayload,
  importSlices,
  getFeatureGroup,
  getFeatureGroups,
  updateFeatureGroup,
  getStatusSummary,
  getMetrics
};
