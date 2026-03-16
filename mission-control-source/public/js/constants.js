// Mission Control v3 - Browser Constants
// Server-only paths are NOT in this file — they stay in shared/constants.js

// UI Theme Colors (Tailwind classes)
const COLORS = {
  primary: 'claw-500',
  background: 'gray-900',
  card: 'gray-800',
  border: 'gray-700',
  text: 'gray-100',
  textMuted: 'gray-500',
  success: 'green-400',
  warning: 'yellow-400',
  error: 'red-400',
  info: 'blue-400'
};

// Agent Color Mapping — includes both factory pipeline and HiveDeck product agents
const AGENT_COLORS = {
  // Factory pipeline agents (internal)
  main: 'text-yellow-400',
  axis: 'text-yellow-300',
  nexus: 'text-purple-400',
  qa: 'text-green-400',
  leaddev: 'text-cyan-400',
  weblead: 'text-teal-400',
  frontend: 'text-pink-400',
  backend: 'text-indigo-400',
  realtime: 'text-orange-400',
  graphics: 'text-violet-400',
  mobilelead: 'text-sky-400',
  ios: 'text-blue-400',
  android: 'text-emerald-400',
  sentinel: 'text-red-400',
  // HiveDeck product agents
  'hd-sentinel': 'text-red-400',
  'hd-auditor': 'text-orange-400',
  'hd-closer': 'text-pink-400',
  'hd-ranker': 'text-green-400',
  'hd-scout': 'text-purple-400',
  'hd-prism': 'text-violet-400',
  'hd-forge': 'text-cyan-400',
  'hd-shield': 'text-blue-400',
  'hd-ledger': 'text-emerald-400',
  'hd-scribe': 'text-yellow-300',
  'hd-chief-of-staff': 'text-amber-400',
};

// Task Status Color Mapping
const STATUS_COLORS = {
  draft: 'bg-gray-600',
  queued: 'bg-blue-600',
  active: 'bg-green-600',
  review: 'bg-yellow-600',
  done: 'bg-emerald-700',
  blocked: 'bg-red-600',
  escalated: 'bg-orange-600',
  cancelled: 'bg-gray-700',
  planning: 'bg-blue-600',
  completed: 'bg-emerald-700'
};

const PIPELINE_STATUS_COLORS = {
  PENDING: 'bg-gray-600',
  SSE_REVIEW: 'bg-yellow-600',
  APPROVED: 'bg-cyan-600',
  EXECUTING: 'bg-blue-600',
  TESTING: 'bg-blue-500',
  AUTO_FIX: 'bg-purple-600',
  PR_OPEN: 'bg-violet-600',
  MERGED: 'bg-emerald-700',
  NEEDS_SPLIT: 'bg-orange-600',
  BLOCKED: 'bg-red-700',
  FAILED_EXECUTION: 'bg-red-600',
  FAILED_TESTS: 'bg-red-600',
  FAILED_PR: 'bg-red-600'
};

const PIPELINE_COLUMNS = [
  { id: 'attention', label: 'Attention Required' },
  { id: 'pending', label: 'Pending' },
  { id: 'review', label: 'SSE Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'pr_open', label: 'PR Open' },
  { id: 'merged', label: 'Merged' }
];

// Refresh Settings
const REFRESH = {
  AUTO_INTERVAL: 30000,
  HEALTHCHECK_TIMEOUT: 5000
};

// API Endpoint List
const API_ENDPOINTS = [
  '/api/gateway',
  '/api/agents',
  '/api/ollama',
  '/api/tasks',
  '/api/decisions',
  '/api/pinned',
  '/api/health',
  '/api/crons',
  '/api/tasks/finished',
  '/api/tasks/log',
  '/api/hierarchy',
  'POST /api/whiteboard'
];

// Agent roster for display
const AGENT_LIST = [
  'main', 'axis', 'nexus', 'qa', 'leaddev',
  'weblead', 'frontend', 'backend', 'realtime', 'graphics',
  'mobilelead', 'ios', 'android', 'sentinel'
];

// HiveDeck product agent definitions (for showcase/catalog view)
const HIVEDECK_AGENTS = [
  { id: 'hd-sentinel',        name: 'Sentinel',       role: 'Security Officer',       price: '$19.99', color: 'text-red-400',     desc: 'Monitors, audits, and enforces security policy across your entire agent pipeline.' },
  { id: 'hd-auditor',         name: 'Auditor',        role: 'Production Code Review', price: '$19.99', color: 'text-orange-400',  desc: 'Line-by-line production code audit. 100+ issue categories. Ships a prioritized fix list.' },
  { id: 'hd-closer',          name: 'Closer',         role: 'Sales & Marketing',      price: '$19.99', color: 'text-pink-400',    desc: 'Cold emails, landing pages, email sequences, and conversion copy on demand.' },
  { id: 'hd-ranker',          name: 'Ranker',         role: 'SEO Command',            price: '$14.99', color: 'text-green-400',   desc: 'Full SEO pipeline: audit, plan, write, optimize, and monitor.' },
  { id: 'hd-scout',           name: 'Scout',          role: 'Research Analyst',       price: '$14.99', color: 'text-purple-400',  desc: 'Deep competitive analysis, technology evaluation, and market research.' },
  { id: 'hd-prism',           name: 'Prism',          role: 'Brand Strategist',       price: '$14.99', color: 'text-violet-400',  desc: 'Positioning, messaging, and brand voice built from your market.' },
  { id: 'hd-forge',           name: 'Forge',          role: 'DevOps Engineer',        price: '$19.99', color: 'text-cyan-400',    desc: 'CI/CD pipelines, infrastructure automation, and deployment workflows.' },
  { id: 'hd-shield',          name: 'Shield',         role: 'Compliance Officer',     price: '$14.99', color: 'text-blue-400',    desc: 'Policy enforcement, compliance checks, and audit trail management.' },
  { id: 'hd-ledger',          name: 'Ledger',         role: 'Financial Analyst',      price: '$14.99', color: 'text-emerald-400', desc: 'Financial modeling, cost analysis, and budget tracking for AI operations.' },
  { id: 'hd-scribe',          name: 'Scribe',         role: 'Technical Writer',       price: '$14.99', color: 'text-yellow-300',  desc: 'API docs, runbooks, SOPs, and decision logs — clear and versioned.' },
  { id: 'hd-chief-of-staff',  name: 'Chief of Staff', role: 'Task Router',            price: '$39.99', color: 'text-amber-400',   desc: 'Autonomous task routing and WIP enforcement for multi-agent setups.' },
];

// Export as globals
window.MISSION_CONTROL_CONSTANTS = {
  COLORS,
  AGENT_COLORS,
  STATUS_COLORS,
  REFRESH,
  API_ENDPOINTS,
  AGENT_LIST,
  HIVEDECK_AGENTS,
  PIPELINE_STATUS_COLORS,
  PIPELINE_COLUMNS
};
