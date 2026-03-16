// Mission Control v2 - Shared Constants
// DO NOT MODIFY WITHOUT WEB LEAD APPROVAL
// Synchronized between Frontend and Backend

const path = require('path');

// Server Configuration
const SERVER_CONFIG = {
  PORT: 3000,
  BIND_ADDRESS: '127.0.0.1',
  API_PREFIX: '/api',
  STATIC_DIR: 'public'
};

// Data Source Paths
const PATHS = {
  OPENCLAW_ROOT: process.env.HOME + '/.openclaw',
  WORKSPACE_ROOT: process.env.HOME + '/.openclaw/workspace',
  TASKS_DB: process.env.HOME + '/.openclaw/tasks/tasks.db',
  TASKS_FINISHED: process.env.HOME + '/.openclaw/tasks/finished',
  CONFIG_FILE: process.env.HOME + '/.openclaw/openclaw.json',
  HEALTHCHECK_LOG: process.env.HOME + '/.openclaw/tools/healthcheck.log',
  HEALTHCHECK_SCRIPT: process.env.HOME + '/.openclaw/tools/agent-healthcheck.sh',
  PIPELINE_ROOT: process.env.PIPELINE_ROOT || path.resolve(__dirname, '..', '..'),
  PIPELINE_CLI: process.env.PIPELINE_CLI || path.resolve(process.env.PIPELINE_ROOT || path.resolve(__dirname, '..', '..'), 'bin', 'pipeline.js'),
  PIPELINE_DB: process.env.PIPELINE_DB || path.resolve(process.env.PIPELINE_ROOT || path.resolve(__dirname, '..', '..'), 'pipeline.db')
};

const PIPELINE_COMMAND = {
  TIMEOUT_MS: 60000
};

// Agent Workspace Mapping
const AGENT_WORKSPACES = [
  { id: 'main', path: PATHS.WORKSPACE_ROOT },
  { id: 'denny', path: PATHS.WORKSPACE_ROOT + '-denny' },
  { id: 'nexus', path: PATHS.WORKSPACE_ROOT + '-nexus' },
  { id: 'qa', path: PATHS.WORKSPACE_ROOT + '-qa' },
  { id: 'leaddev', path: PATHS.WORKSPACE_ROOT + '-leaddev' },
  { id: 'weblead', path: PATHS.WORKSPACE_ROOT + '-weblead' },
  { id: 'frontend', path: PATHS.WORKSPACE_ROOT + '-frontend' },
  { id: 'backend', path: PATHS.WORKSPACE_ROOT + '-backend' },
  { id: 'realtime', path: PATHS.WORKSPACE_ROOT + '-realtime' },
  { id: 'graphics', path: PATHS.WORKSPACE_ROOT + '-graphics' },
  { id: 'sentinel', path: PATHS.WORKSPACE_ROOT + '-sentinel' },
  { id: 'mobilelead', path: PATHS.WORKSPACE_ROOT + '-mobilelead' },
  { id: 'ios', path: PATHS.WORKSPACE_ROOT + '-ios' },
  { id: 'android', path: PATHS.WORKSPACE_ROOT + '-android' },
];

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

// Agent Color Mapping
const AGENT_COLORS = {
  main: 'text-claw-500',
  denny: 'text-blue-400',
  nexus: 'text-purple-400',
  qa: 'text-green-400',
  leaddev: 'text-cyan-400',
  weblead: 'text-teal-400',
  frontend: 'text-pink-400',
  backend: 'text-indigo-400',
  realtime: 'text-orange-400',
  graphics: 'text-violet-400',
  sentinel: 'text-red-400',
  mobilelead: 'text-amber-400',
  ios: 'text-sky-400',
  android: 'text-lime-400',
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

module.exports = {
  SERVER_CONFIG,
  PATHS,
  AGENT_WORKSPACES,
  COLORS,
  AGENT_COLORS,
  STATUS_COLORS,
  REFRESH,
  API_ENDPOINTS,
  PIPELINE_COMMAND
};
