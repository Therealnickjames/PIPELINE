'use strict';

const { getDb } = require('./db.js');
const { nowIso, parseStoredJson, randomId, toStoredJson } = require('./utils.js');
const { PipelineError } = require('./errors.js');

function getOperation(config, requestId) {
  if (!requestId) {
    return null;
  }

  const row = getDb(config).prepare(`
    SELECT *
    FROM operations
    WHERE request_id = ?
  `).get(requestId);

  if (!row) {
    return null;
  }

  return {
    ...row,
    response_json: parseStoredJson(row.response_json, null),
    error_json: parseStoredJson(row.error_json, null)
  };
}

function beginOperation(config, { requestId, operationName, targetId = null, actor = 'system' }) {
  const id = requestId || randomId('req');
  const existing = getOperation(config, id);
  if (existing) {
    return {
      request_id: id,
      duplicate: true,
      operation: existing
    };
  }

  const timestamp = nowIso();
  getDb(config).prepare(`
    INSERT INTO operations (
      request_id, operation_name, target_id, actor, status, response_json, error_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'RUNNING', NULL, NULL, ?, ?)
  `).run(id, operationName, targetId, actor, timestamp, timestamp);

  return {
    request_id: id,
    duplicate: false,
    operation: getOperation(config, id)
  };
}

function completeOperation(config, requestId, response) {
  const timestamp = nowIso();
  getDb(config).prepare(`
    UPDATE operations
    SET status = 'COMPLETED',
        response_json = ?,
        updated_at = ?
    WHERE request_id = ?
  `).run(toStoredJson(response), timestamp, requestId);
  return getOperation(config, requestId);
}

function failOperation(config, requestId, error) {
  const timestamp = nowIso();
  getDb(config).prepare(`
    UPDATE operations
    SET status = 'FAILED',
        error_json = ?,
        updated_at = ?
    WHERE request_id = ?
  `).run(toStoredJson(error), timestamp, requestId);
  return getOperation(config, requestId);
}

function withOperation(config, options, callback) {
  const started = beginOperation(config, options);
  if (started.duplicate) {
    const existing = started.operation;
    if (existing.status === 'COMPLETED' && existing.response_json) {
      return {
        ...existing.response_json,
        meta: {
          ...(existing.response_json.meta || {}),
          request_id: started.request_id,
          duplicate: true
        }
      };
    }

    throw new PipelineError('DUPLICATE_OPERATION', `Operation ${options.operationName} is already running for request ${started.request_id}`, existing);
  }

  try {
    const payload = callback(started.request_id);
    const withMeta = {
      ...payload,
      meta: {
        ...(payload.meta || {}),
        request_id: started.request_id
      }
    };
    completeOperation(config, started.request_id, withMeta);
    return withMeta;
  } catch (error) {
    failOperation(config, started.request_id, {
      code: error.code || 'UNKNOWN',
      message: error.message,
      details: error.details || null
    });
    throw error;
  }
}

function startSliceRun(config, { runId = randomId('run'), sliceId, phase, requestId = null, actor = 'system', status = 'RUNNING', details = null }) {
  getDb(config).prepare(`
    INSERT INTO slice_runs (run_id, slice_id, phase, request_id, actor, status, details, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(runId, sliceId, phase, requestId, actor, status, toStoredJson(details), nowIso());

  return runId;
}

function completeSliceRun(config, runId, status = 'COMPLETED', details = null) {
  getDb(config).prepare(`
    UPDATE slice_runs
    SET status = ?,
        details = COALESCE(?, details),
        completed_at = ?
    WHERE run_id = ?
  `).run(status, details === null ? null : toStoredJson(details), nowIso(), runId);
}

function getSliceRuns(config, sliceId, limit = 20) {
  return getDb(config).prepare(`
    SELECT *
    FROM slice_runs
    WHERE slice_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(sliceId, limit).map((row) => ({
    ...row,
    details: parseStoredJson(row.details, null)
  }));
}

function createCommandRun(config, payload) {
  const timestamp = nowIso();
  const info = {
    command_name: payload.commandName,
    slice_id: payload.sliceId || null,
    run_id: payload.runId || null,
    request_id: payload.requestId || null,
    phase: payload.phase || null,
    cwd: payload.cwd,
    exec_json: toStoredJson(payload.exec),
    env_keys_json: toStoredJson(payload.envKeys || []),
    status: payload.status || 'RUNNING',
    exit_code: payload.exitCode === undefined ? null : payload.exitCode,
    duration_ms: payload.durationMs === undefined ? null : payload.durationMs,
    stdout_excerpt: payload.stdoutExcerpt || '',
    stderr_excerpt: payload.stderrExcerpt || '',
    created_at: timestamp,
    updated_at: timestamp
  };

  const result = getDb(config).prepare(`
    INSERT INTO command_runs (
      command_name, slice_id, run_id, request_id, phase, cwd, exec_json, env_keys_json,
      status, exit_code, duration_ms, stdout_excerpt, stderr_excerpt, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    info.command_name,
    info.slice_id,
    info.run_id,
    info.request_id,
    info.phase,
    info.cwd,
    info.exec_json,
    info.env_keys_json,
    info.status,
    info.exit_code,
    info.duration_ms,
    info.stdout_excerpt,
    info.stderr_excerpt,
    info.created_at,
    info.updated_at
  );

  return Number(result.lastInsertRowid);
}

function updateCommandRun(config, id, payload) {
  const assignments = [];
  const values = [];
  Object.entries(payload).forEach(([key, value]) => {
    assignments.push(`${key} = ?`);
    values.push(value);
  });
  assignments.push('updated_at = ?');
  values.push(nowIso());
  values.push(id);
  getDb(config).prepare(`
    UPDATE command_runs
    SET ${assignments.join(', ')}
    WHERE id = ?
  `).run(...values);
}

function getCommandRuns(config, filters = {}, limit = 20) {
  const clauses = [];
  const values = [];
  if (filters.sliceId) {
    clauses.push('slice_id = ?');
    values.push(filters.sliceId);
  }
  if (filters.runId) {
    clauses.push('run_id = ?');
    values.push(filters.runId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  values.push(limit);
  return getDb(config).prepare(`
    SELECT *
    FROM command_runs
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(...values).map((row) => ({
    ...row,
    exec_json: parseStoredJson(row.exec_json, []),
    env_keys_json: parseStoredJson(row.env_keys_json, [])
  }));
}

function acquireLease(config, leaseKey, ownerId) {
  const db = getDb(config);
  const ttlSeconds = config.runtime.leaseTtlSeconds;
  const now = nowIso();
  const current = db.prepare(`
    SELECT *
    FROM controller_lease
    WHERE lease_key = ?
  `).get(leaseKey);

  const isStale = current
    ? (Date.now() - Date.parse(current.heartbeat_at)) > (ttlSeconds * 1000)
    : true;

  if (!current) {
    const leaseToken = randomId('lease');
    db.prepare(`
      INSERT INTO controller_lease (lease_key, owner_id, lease_token, acquired_at, heartbeat_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(leaseKey, ownerId, leaseToken, now, now);
    return { lease_key: leaseKey, owner_id: ownerId, lease_token: leaseToken, acquired_at: now, heartbeat_at: now };
  }

  if (current.owner_id === ownerId || isStale) {
    const leaseToken = randomId('lease');
    db.prepare(`
      UPDATE controller_lease
      SET owner_id = ?, lease_token = ?, acquired_at = ?, heartbeat_at = ?
      WHERE lease_key = ?
    `).run(ownerId, leaseToken, now, now, leaseKey);
    return { lease_key: leaseKey, owner_id: ownerId, lease_token: leaseToken, acquired_at: now, heartbeat_at: now };
  }

  throw new PipelineError('LEASE_BUSY', `Lease ${leaseKey} is held by ${current.owner_id}`, current);
}

function heartbeatLease(config, leaseKey, ownerId) {
  getDb(config).prepare(`
    UPDATE controller_lease
    SET heartbeat_at = ?
    WHERE lease_key = ? AND owner_id = ?
  `).run(nowIso(), leaseKey, ownerId);
}

function releaseLease(config, leaseKey, ownerId) {
  getDb(config).prepare(`
    DELETE FROM controller_lease
    WHERE lease_key = ? AND owner_id = ?
  `).run(leaseKey, ownerId);
}

function getLease(config, leaseKey) {
  return getDb(config).prepare(`
    SELECT *
    FROM controller_lease
    WHERE lease_key = ?
  `).get(leaseKey) || null;
}

module.exports = {
  getOperation,
  beginOperation,
  completeOperation,
  failOperation,
  withOperation,
  startSliceRun,
  completeSliceRun,
  getSliceRuns,
  createCommandRun,
  updateCommandRun,
  getCommandRuns,
  acquireLease,
  heartbeatLease,
  releaseLease,
  getLease
};
