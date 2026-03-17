'use strict';

const { getDb } = require('./db.js');
const docs = require('./docs.js');
const { getEvents, logEvent } = require('./registry.js');
const { nowIso, readText } = require('./utils.js');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean)
    .sort()
    .join('|');
}

function buildErrorSignature(input = {}) {
  const failureType = normalizeText(input.failureType || input.last_failure_type);
  const reason = normalizeText(input.reason || input.last_failure_reason);
  const files = normalizeFiles(input.files || input.affected_files);

  if (!failureType && !reason) {
    return null;
  }

  return [failureType || 'unknown', reason || 'unknown', files || 'any-files'].join('::');
}

function lookup(config, slice) {
  const signatures = [];
  const directSignature = buildErrorSignature(slice);
  if (directSignature) {
    signatures.push(directSignature);
  }

  const lookupResult = {
    enabled: config.failureMemory.enabled,
    matched: false,
    signatures
  };

  if (!config.failureMemory.enabled || signatures.length === 0) {
    logEvent(config, slice.id, 'failure_memory_lookup', 'system', {
      signatures,
      matched: false
    }, slice.status, slice.status);
    return lookupResult;
  }

  const db = getDb(config);
  const placeholders = signatures.map(() => '?').join(', ');
  const match = db.prepare(`
    SELECT slice_id, error_signature, successful_fix, timestamp, frequency
    FROM failure_patterns
    WHERE error_signature IN (${placeholders})
    ORDER BY frequency DESC, timestamp DESC
    LIMIT 1
  `).get(...signatures);

  lookupResult.matched = Boolean(match);
  lookupResult.match = match || null;

  logEvent(config, slice.id, 'failure_memory_lookup', 'system', {
    signatures,
    matched: Boolean(match),
    match: match || null
  }, slice.status, slice.status);

  return lookupResult;
}

function applyCachedFix(config, slice, lookupResult) {
  if (!lookupResult || !lookupResult.matched || !lookupResult.match) {
    docs.writeFixHypothesis(config, null);
    return {
      applied: false
    };
  }

  const match = lookupResult.match;
  const hypothesis = [
    '# Fix Hypothesis',
    '',
    '## Cached Winning Pattern',
    `- Source slice: ${match.slice_id}`,
    `- Error signature: ${match.error_signature}`,
    `- Previous wins: ${match.frequency || 1}`,
    `- Last recorded: ${match.timestamp}`,
    '',
    '## Minimal Hypothesis',
    match.successful_fix
  ].join('\n');

  docs.writeFixHypothesis(config, hypothesis);
  docs.appendCurrentSliceSection(config, 'Failure Memory Match', [
    `- Cached winning pattern found for \`${match.error_signature}\`.`,
    `- Start with the minimal hypothesis in \`docs/fix-hypothesis.md\` before broader edits.`,
    `- Source slice: ${match.slice_id}`
  ]);

  logEvent(config, slice.id, 'failure_memory_applied', 'system', {
    error_signature: match.error_signature,
    source_slice_id: match.slice_id,
    frequency: match.frequency || 1
  }, slice.status, slice.status);

  return {
    applied: true,
    error_signature: match.error_signature,
    source_slice_id: match.slice_id,
    successful_fix: match.successful_fix,
    frequency: match.frequency || 1,
    timestamp: match.timestamp
  };
}

function findRecoverableEvent(config, sliceId) {
  return getEvents(config, sliceId).find((event) =>
    event.event_type === 'auto_fix_requested' || event.event_type === 'failure'
  ) || null;
}

function buildSuccessfulFix(config, slice) {
  const hypothesis = readText(require('path').resolve(config.paths.docsDir, 'fix-hypothesis.md'), '').trim();
  const normalizedHypothesis = normalizeText(hypothesis);
  const sections = [];

  if (hypothesis && !normalizedHypothesis.includes('no cached or active hypothesis has been recorded yet')) {
    sections.push(hypothesis);
  }

  if (slice.last_signal && slice.last_signal.summary) {
    sections.push(`Execution summary:\n${slice.last_signal.summary}`);
  }

  if (slice.test_results && slice.test_results.quality_gate) {
    sections.push(
      `Quality gate cleared with ${slice.test_results.quality_gate.coverage.percent}% coverage and mutation status ${slice.test_results.quality_gate.mutation.passed ? 'passed' : 'failed'}.`
    );
  }

  return sections.join('\n\n').trim();
}

function recordSuccess(config, slice) {
  if (!config.failureMemory.enabled) {
    return null;
  }

  const recoverableEvent = findRecoverableEvent(config, slice.id);
  if (!recoverableEvent) {
    return null;
  }

  const errorSignature = buildErrorSignature({
    failureType: recoverableEvent.details.failureType,
    reason: recoverableEvent.details.reason,
    affected_files: Array.isArray(recoverableEvent.details.files) && recoverableEvent.details.files.length
      ? recoverableEvent.details.files
      : slice.affected_files
  });

  const successfulFix = buildSuccessfulFix(config, slice);
  if (!errorSignature || !successfulFix) {
    return null;
  }

  const db = getDb(config);
  const existing = db.prepare(`
    SELECT rowid, frequency
    FROM failure_patterns
    WHERE error_signature = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(errorSignature);

  const timestamp = nowIso();
  if (existing) {
    db.prepare(`
      UPDATE failure_patterns
      SET slice_id = ?,
          successful_fix = ?,
          timestamp = ?,
          frequency = ?
      WHERE rowid = ?
    `).run(slice.id, successfulFix, timestamp, Number(existing.frequency || 0) + 1, existing.rowid);
  } else {
    db.prepare(`
      INSERT INTO failure_patterns (slice_id, error_signature, successful_fix, timestamp, frequency)
      VALUES (?, ?, ?, ?, ?)
    `).run(slice.id, errorSignature, successfulFix, timestamp, 1);
  }

  logEvent(config, slice.id, 'failure_memory_updated', 'system', {
    error_signature: errorSignature,
    source_event: recoverableEvent.event_type
  }, slice.status, slice.status);

  return {
    slice_id: slice.id,
    error_signature: errorSignature,
    timestamp
  };
}

module.exports = {
  buildErrorSignature,
  lookup,
  applyCachedFix,
  recordSuccess
};
