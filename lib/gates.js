'use strict';

function result(passed, reason) {
  return { passed, reason };
}

function canAdvanceToSSEReview(slice, dependencies) {
  if (slice.status !== 'PENDING') {
    return result(false, 'Slice must be PENDING to enter SSE_REVIEW');
  }

  const unresolved = dependencies.filter((dependency) => dependency.status !== 'MERGED');
  if (unresolved.length > 0) {
    return result(false, `Dependencies not merged: ${unresolved.map((dependency) => dependency.id).join(', ')}`);
  }

  return result(true, 'Dependencies satisfied');
}

function canApprove(slice) {
  return slice.status === 'SSE_REVIEW'
    ? result(true, 'Slice can be approved')
    : result(false, 'Slice must be in SSE_REVIEW');
}

function canDispatch(slice, context) {
  if (slice.status !== 'APPROVED') {
    return result(false, 'Slice must be APPROVED before dispatch');
  }

  if (context.hasActiveExecution) {
    return result(false, 'Another slice is already executing');
  }

  return result(true, 'Slice can be dispatched');
}

function canAdvanceToTesting(slice, signal) {
  if (!signal) {
    return result(false, 'Waiting for agent signal');
  }

  if (!signal.success && !signal.needs_split) {
    return result(false, signal.summary || 'Agent reported failure');
  }

  return result(true, 'Signal accepted');
}

function canOpenPR(slice) {
  if (slice.status !== 'TESTING') {
    return result(false, 'Slice must be in TESTING');
  }

  if (!slice.test_results || !slice.test_results.passed) {
    return result(false, 'Tests have not passed');
  }

  return result(true, 'Tests passed');
}

function canMerge(slice, prStatus) {
  if (slice.status !== 'PR_OPEN') {
    return result(false, 'Slice must be in PR_OPEN');
  }

  if (!prStatus || !prStatus.merged) {
    return result(false, 'PR has not been merged');
  }

  return result(true, 'PR merged');
}

function canCancel(slice) {
  return ['EXECUTING', 'AUTO_FIX'].includes(slice.status)
    ? result(true, 'Slice can be cancelled')
    : result(false, 'Only active executions can be cancelled');
}

function canBeginEditing(preflight) {
  if (!preflight.exists) {
    return result(false, 'docs/preflight.md does not exist');
  }

  if (!preflight.valid) {
    return result(false, 'docs/preflight.md is missing required sections');
  }

  return result(true, 'Preflight is valid');
}

module.exports = {
  canAdvanceToSSEReview,
  canApprove,
  canDispatch,
  canAdvanceToTesting,
  canOpenPR,
  canMerge,
  canCancel,
  canBeginEditing
};
