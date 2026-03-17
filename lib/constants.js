'use strict';

const REAL_SLICE_STATES = [
  'PENDING',
  'SSE_REVIEW',
  'APPROVED',
  'EXECUTING',
  'AUTO_FIX',
  'TESTING',
  'PR_OPEN',
  'MERGED',
  'NEEDS_SPLIT'
];

const FEATURE_STATES = [
  'PENDING',
  'SMOKE_TESTING',
  'BREAK_TESTING',
  'EDGE_TESTING',
  'FEATURE_COMPLETE',
  'FEATURE_FAILED'
];

const DISPLAY_FAILURE_STATES = [
  'FAILED_EXECUTION',
  'FAILED_TESTS',
  'FAILED_PR'
];

const ATTENTION_DISPLAY_STATES = [
  'BLOCKED',
  'FAILED_EXECUTION',
  'FAILED_TESTS',
  'FAILED_PR',
  'NEEDS_SPLIT'
];

const SLICE_TRANSITIONS = {
  PENDING: ['SSE_REVIEW'],
  SSE_REVIEW: ['APPROVED', 'PENDING'],
  APPROVED: ['EXECUTING'],
  EXECUTING: ['TESTING', 'APPROVED', 'NEEDS_SPLIT'],
  AUTO_FIX: ['TESTING', 'APPROVED'],
  TESTING: ['PR_OPEN', 'AUTO_FIX', 'APPROVED'],
  PR_OPEN: ['MERGED', 'APPROVED'],
  MERGED: [],
  NEEDS_SPLIT: ['PENDING']
};

const FEATURE_PHASES = [
  { state: 'SMOKE_TESTING', label: 'smoke' },
  { state: 'BREAK_TESTING', label: 'break' },
  { state: 'EDGE_TESTING', label: 'edge' }
];

const PREFLIGHT_SECTIONS = [
  'Where we stand',
  'Why this slice',
  'Core path confirmation',
  'Canon contradictions',
  'Smallest implementation plan'
];

const DEFAULT_ACTORS = {
  system: 'system',
  sse: 'sse',
  agent: 'agent',
  github: 'github'
};

const CONTROLLER_LEASE_KEY = 'pipeline-runner';

module.exports = {
  REAL_SLICE_STATES,
  FEATURE_STATES,
  DISPLAY_FAILURE_STATES,
  ATTENTION_DISPLAY_STATES,
  SLICE_TRANSITIONS,
  FEATURE_PHASES,
  PREFLIGHT_SECTIONS,
  DEFAULT_ACTORS,
  CONTROLLER_LEASE_KEY
};
