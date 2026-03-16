const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Import shared constants
const constants = require('../shared/constants.js');

let Database;
try { 
  Database = require('better-sqlite3'); 
} catch (error) { 
  console.warn('better-sqlite3 not available, will use CLI fallback:', error.message);
  Database = null; 
}

const app = express();
const { PORT, BIND_ADDRESS, API_PREFIX, STATIC_DIR } = constants.SERVER_CONFIG;
const { PATHS, AGENT_WORKSPACES } = constants;

// v3: File upload configuration for whiteboard
const upload = multer({
  dest: './whiteboards/temp/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG files allowed'));
    }
  }
});

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Middleware
app.use(express.static(STATIC_DIR, { etag: false, maxAge: 0, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.setHeader('Pragma', 'no-cache'); } }));
app.use('/whiteboards', express.static('./whiteboards'));

// Add timestamp to all responses
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function(obj) {
    if (obj && typeof obj === 'object' && !obj.timestamp) {
      obj.timestamp = new Date().toISOString();
    }
    return originalJson.call(this, obj);
  };
  next();
});

// Utility functions
function executeCommand(command, timeout = 5000) {
  try {
    return execSync(command, { 
      encoding: 'utf8', 
      timeout,
      stdio: 'pipe' 
    }).trim();
  } catch (error) {
    console.warn(`Command failed: ${command}`, error.message);
    return '';
  }
}

function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function loadConfig() {
  try {
    const configContent = fs.readFileSync(PATHS.CONFIG_FILE, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.warn('Failed to load config:', error.message);
    return null;
  }
}

// v3: Utility functions for new endpoints
function parseFinishedTask(content, filename) {
  try {
    // Extract key information from markdown content
    const lines = content.split('\n');
    let task = {
      id: '',
      title: '',
      owner: '',
      plan_title: '',
      completed_date: '',
      evidence_path: '',
      duration_hours: 0,
      complexity: 'simple'
    };
    
    // Try to extract task ID from filename (TSK-*)
    const taskIdMatch = filename.match(/TSK-[a-f0-9-]+/);
    if (taskIdMatch) {
      task.id = taskIdMatch[0];
    }
    
    // Parse content for metadata
    // Title comes from the first H1 only (e.g. "# Task: Integration Testing")
    const titleMatch = content.match(/^# (.+)/m);
    if (titleMatch) {
      task.title = titleMatch[1].replace(/^Task:\s*/i, '').trim();
    }

    // Parse markdown table rows: | Field | Value |
    for (const line of lines) {
      const tableMatch = line.match(/^\|\s*(\w[\w\s]*?)\s*\|\s*(.+?)\s*\|/);
      if (tableMatch) {
        const field = tableMatch[1].trim().toLowerCase();
        const value = tableMatch[2].trim();
        if (field === 'owner') task.owner = value;
        if (field === 'plan') task.plan_title = value.replace(/\s*\(PLN-[^)]+\)/, '');
        if (field === 'completed') task.completed_date = value;
        if (field === 'evidence') task.evidence_path = value;
        if (field === 'reviewer') task.reviewer = value;
        if (field === 'priority') task.priority = parseInt(value) || 0;
      }
      // Also support "Key: Value" format as fallback
      if (!task.owner && (line.includes('Owner:') || line.includes('owner:'))) {
        const ownerMatch = line.match(/owner:\s*(\w+)/i);
        if (ownerMatch) task.owner = ownerMatch[1];
      }
    }
    
    // Estimate complexity based on content length and keywords
    const contentLength = content.length;
    const complexityKeywords = ['architecture', 'integration', 'complex', 'multiple'];
    const hasComplexKeywords = complexityKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
    
    if (contentLength > 2000 || hasComplexKeywords) {
      task.complexity = 'complex';
    } else if (contentLength > 1000) {
      task.complexity = 'medium';
    }
    
    // Estimate duration (rough heuristic)
    task.duration_hours = Math.max(1, Math.round(contentLength / 500));
    
    // Use current timestamp if no completion date found
    if (!task.completed_date) {
      task.completed_date = new Date().toISOString();
    }
    
    return task;
  } catch (error) {
    console.warn('Error parsing finished task:', error.message);
    return null;
  }
}

function inferActionType(entry) {
  if (entry.new_status === 'done') return 'complete';
  if (entry.new_status === 'blocked') return 'block';
  if (entry.old_status === 'draft' && entry.new_status === 'queued') return 'create';
  if (entry.old_status && entry.new_status && entry.old_status !== entry.new_status) return 'update';
  return 'update';
}

function extractModelName(model) {
  if (typeof model === 'string') {
    return model.replace('anthropic/', '');
  } else if (model?.primary) {
    return model.primary.replace('anthropic/', '');
  }
  return 'default';
}

function getDisplayName(agentId) {
  const names = {
    bob: 'Bob (Board)',
    main: 'Jack (CEO)',
    denny: 'Denny (Chief of Staff)',
    nexus: 'Nexus (Research)',
    qa: 'QA Director',
    leaddev: 'Lead Dev',
    weblead: 'Web Lead',
    frontend: 'Frontend Dev',
    backend: 'Backend Dev',
    realtime: 'Realtime Dev',
    graphics: 'Graphics Dev'
  };
  return names[agentId] || agentId;
}

function getRole(agentId) {
  const roles = {
    bob: 'Board/Owner',
    main: 'CEO',
    denny: 'Chief of Staff',
    nexus: 'Research Specialist',
    qa: 'Quality Assurance',
    leaddev: 'Technical Authority',
    weblead: 'Web Team Lead',
    frontend: 'React/UI Specialist',
    backend: 'Server/API Specialist',
    realtime: 'WebSocket/Live Data',
    graphics: 'Visualization Specialist'
  };
  return roles[agentId] || 'Agent';
}

// Database query utility with fallback to sqlite3 CLI
function queryDatabase(query, params = []) {
  if (!fs.existsSync(PATHS.TASKS_DB)) {
    throw new Error('Task database not found');
  }
  
  // Try better-sqlite3 first
  if (Database) {
    try {
      const db = new Database(PATHS.TASKS_DB, { readonly: true });
      try {
        const stmt = db.prepare(query);
        return params.length > 0 ? stmt.all(params) : stmt.all();
      } finally {
        db.close();
      }
    } catch (err) {
      console.warn('better-sqlite3 failed, falling back to CLI:', err.message);
    }
  }
  
  // Fallback to sqlite3 CLI
  try {
    // For safety, only allow SELECT queries via CLI
    if (!query.trim().toLowerCase().startsWith('select')) {
      throw new Error('CLI fallback only supports SELECT queries');
    }
    
    // Clean up query - remove extra whitespace and normalize
    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    
    // Use temp file approach to avoid shell escaping issues
    const tempFile = `/tmp/query_${Date.now()}.sql`;
    fs.writeFileSync(tempFile, cleanQuery);
    
    try {
      const command = `sqlite3 -json "${PATHS.TASKS_DB}" < "${tempFile}"`;
      const output = executeCommand(command);
      
      if (!output.trim()) {
        return [];
      }
      
      try {
        return JSON.parse(output);
      } catch (parseErr) {
        console.warn('Failed to parse sqlite3 JSON output:', parseErr.message);
        return [];
      }
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
  } catch (err) {
    console.warn('sqlite3 CLI fallback failed:', err.message);
    throw new Error('Database query failed: ' + err.message);
  }
}

// API Endpoints

// Contract 1: Gateway Status
app.get(`${API_PREFIX}/gateway`, (req, res) => {
  try {
    const config = loadConfig();
    const port = config?.gateway?.port || 18789;
    const bind = config?.gateway?.bind || 'unknown';

    // Check if gateway process is running
    const pid = executeCommand(`pgrep -f "openclaw.*gateway" | head -1`) || null;
    const uptime = pid ? executeCommand(`ps -o etime= -p ${pid}`) || 'unknown' : 'stopped';
    
    // System information
    const nodeVersion = process.version || 'unknown';
    let openclawVersion = 'unknown';
    try {
      const pkgPath = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'openclaw', 'package.json');
      if (fs.existsSync(pkgPath)) {
        openclawVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || 'unknown';
      }
    } catch(e) { /* fallback */ }
    if (openclawVersion === 'unknown') {
      openclawVersion = executeCommand(`${path.dirname(process.execPath)}/openclaw --version 2>/dev/null`) || 'unknown';
    }
    
    // System stats
    const loadAvgRaw = executeCommand('cat /proc/loadavg 2>/dev/null') || '';
    const loadAvg = loadAvgRaw.split(' ').slice(0, 3).join(' ') || 'unknown';
    
    const memory = executeCommand("free -m 2>/dev/null | awk '/^Mem:/ {printf \"%d/%d MB (%.0f%%)\", $3, $2, $3/$2*100}'") || 'unknown';
    const disk = executeCommand("df -h / 2>/dev/null | awk 'NR==2 {printf \"%s/%s (%s)\", $3, $2, $5}'") || 'unknown';

    // Parse uptime string (HH:MM:SS or D-HH:MM:SS) to seconds
    let uptime_seconds = 0;
    if (uptime && uptime !== 'unknown' && uptime !== 'stopped') {
      const parts = uptime.trim().replace(/-/g, ':').split(':').reverse();
      uptime_seconds = (parseInt(parts[0])||0) + (parseInt(parts[1])||0)*60 + (parseInt(parts[2])||0)*3600 + (parseInt(parts[3])||0)*86400;
    }

    res.json({
      port,
      bind,
      pid,
      status: pid ? 'online' : 'offline',
      uptime,
      uptime_formatted: uptime,
      uptime_seconds,
      version: openclawVersion,
      nodeVersion,
      openclawVersion,
      loadAvg,
      memory,
      disk,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'GATEWAY_STATUS_FAILED'
    });
  }
});

// Contract 2: Agent Registry
app.get(`${API_PREFIX}/agents`, (req, res) => {
  try {
    const config = loadConfig();
    if (!config || !config.agents) {
      return res.status(500).json({ 
        error: 'Cannot read agent configuration',
        code: 'CONFIG_LOAD_FAILED' 
      });
    }

    const agents = config.agents.list || [];
    const result = agents.map(agent => {
      const id = agent.id;
      const name = agent.name || id;
      const workspace = agent.workspace || config.agents.defaults?.workspace || '';
      const agentDir = agent.agentDir || '';
      
      // Handle model field (can be string or object)
      let model = 'default';
      if (typeof agent.model === 'string') {
        model = agent.model;
      } else if (agent.model?.primary) {
        model = agent.model.primary;
      } else if (config.agents.defaults?.model?.primary) {
        model = config.agents.defaults.model.primary;
      }
      
      // Strip anthropic/ prefix from model name
      model = model.replace('anthropic/', '');

      // Check filesystem presence
      const wsExists = workspace ? fs.existsSync(workspace) : false;
      const soulExists = workspace ? fs.existsSync(path.join(workspace, 'SOUL.md')) : false;

      // Find last session timestamp (by most recent mtime, not alphabetical)
      let lastSession = null;
      const sessionsDir = path.join(PATHS.OPENCLAW_ROOT, 'agents', id, 'sessions');
      try {
        const sessionFiles = fs.readdirSync(sessionsDir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (sessionFiles.length > 0) {
          lastSession = new Date(sessionFiles[0].mtime).toISOString();
        }
      } catch (error) {
        // Sessions directory doesn't exist or can't read
      }

      // Extract spawn permissions
      const canSpawn = agent.subagents?.allowAgents || [];

      // Count tools
      const tools = agent.tools || {};
      const toolsAllowed = (tools.allow || []).length;
      const toolsDenied = (tools.deny || []).length;

      // Sandbox mode
      const sandbox = agent.sandbox?.mode || 'default';

      // Determine agent status based on recent session activity
      let status = 'offline';
      if (lastSession) {
        const lastActive = new Date(lastSession);
        const hoursSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
        if (hoursSinceActive < 1) status = 'online';
        else if (hoursSinceActive < 24) status = 'idle';
        else status = 'offline';
      } else {
        status = 'unknown';
      }

      // Get agent role
      const role = getRole(id);

      return {
        id,
        name,
        model,
        role,
        status,
        workspace,
        agentDir,
        wsExists,
        soulExists,
        lastSession,
        canSpawn,
        toolsAllowed,
        toolsDenied,
        sandbox
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'AGENTS_LIST_FAILED' 
    });
  }
});

// Contract 3: Ollama Status
app.get(`${API_PREFIX}/ollama`, (req, res) => {
  try {
    // Check service status
    const serviceStatus = executeCommand('systemctl --user is-active ollama 2>/dev/null || systemctl is-active ollama 2>/dev/null') || 'unknown';
    
    // Get model list
    const modelOutput = executeCommand('ollama list 2>/dev/null') || '';
    const models = [];
    
    if (modelOutput) {
      const lines = modelOutput.split('\n').slice(1); // Skip header
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[0]) {
          models.push({
            name: parts[0],
            size: parts[2] && parts[3] ? `${parts[2]} ${parts[3]}` : parts[2] || ''
          });
        }
      }
    }

    res.json({
      status: serviceStatus,
      models
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'OLLAMA_STATUS_FAILED' 
    });
  }
});

// Contract 4: Task Dashboard
app.get(`${API_PREFIX}/tasks`, (req, res) => {
  try {
    // Query plans as full objects
    const plans = queryDatabase('SELECT id, title, description, status, created_by, created_at, updated_at FROM plans ORDER BY updated_at DESC');
    
    // Active tasks with plan titles
    const active_tasks = queryDatabase(`
      SELECT t.id, t.title, t.owner, t.status, t.priority, t.plan_id, p.title as plan_title
      FROM tasks t 
      JOIN plans p ON p.id = t.plan_id 
      WHERE t.status NOT IN ('done', 'cancelled') 
      ORDER BY t.priority ASC, t.updated_at DESC 
      LIMIT 20
    `);
    
    // Recent log entries with task titles
    const recent_log = queryDatabase(`
      SELECT tl.task_id, tl.agent_id, tl.old_status, tl.new_status, 
             tl.timestamp, tl.note, t.title
      FROM task_log tl 
      JOIN tasks t ON t.id = tl.task_id 
      ORDER BY tl.timestamp DESC 
      LIMIT 10
    `);

    // Summary stats
    const task_stats = {
      total: queryDatabase('SELECT COUNT(*) as c FROM tasks')[0].c,
      byStatus: queryDatabase('SELECT status, COUNT(*) as c FROM tasks GROUP BY status ORDER BY status'),
      byOwner: queryDatabase(`
        SELECT owner, status, COUNT(*) as c 
        FROM tasks 
        WHERE status NOT IN ('done', 'cancelled') 
        GROUP BY owner, status 
        ORDER BY owner, status
      `)
    };

    res.json({
      plans,
      active_tasks,
      recent_log,
      task_stats
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'TASK_DASHBOARD_FAILED' 
    });
  }
});

// Contract 5: Decision Feed
app.get(`${API_PREFIX}/decisions`, (req, res) => {
  try {
    const decisions = [];
    
    // Parse BOOTSTRAP.md files from all agent workspaces
    for (const workspace of AGENT_WORKSPACES) {
      const bootstrapPath = path.join(workspace.path, 'BOOTSTRAP.md');
      const content = readFileOrNull(bootstrapPath);
      if (!content) continue;
      
      const lines = content.split('\n');
      let currentSection = '';
      
      for (const line of lines) {
        // Track section headers
        if (line.startsWith('## ')) {
          currentSection = line.replace('## ', '').trim();
          continue;
        }
        
        // Extract decision entries (lines starting with - [ or - DEC:)
        if (line.startsWith('- [') || line.startsWith('- DEC:')) {
          decisions.push({
            agent: workspace.id,
            section: currentSection,
            text: line.replace(/^- /, '').trim(),
            source: bootstrapPath
          });
        }
      }
    }
    
    // Return last 50 decisions in reverse chronological order
    res.json({
      decisions: decisions.slice(-50).reverse()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'DECISIONS_FEED_FAILED' 
    });
  }
});

// Contract 6: Parking Lot
app.get(`${API_PREFIX}/pinned`, (req, res) => {
  try {
    const pinnedDir = path.join(PATHS.WORKSPACE_ROOT, 'pinned');
    const items = [];
    
    if (fs.existsSync(pinnedDir)) {
      const files = fs.readdirSync(pinnedDir)
        .filter(f => f.endsWith('.md') && f !== 'README.md');
      
      for (const file of files) {
        const content = readFileOrNull(path.join(pinnedDir, file));
        if (!content) continue;
        
        // Parse metadata from content
        const titleMatch = content.match(/^# (.+)/m);
        const statusMatch = content.match(/\*\*Status:\*\* (.+)/m);
        const pinnedMatch = content.match(/\*\*Pinned:\*\* (.+)/m);
        
        items.push({
          file,
          title: titleMatch ? titleMatch[1].replace('PINNED: ', '') : file.replace('.md', ''),
          status: statusMatch ? statusMatch[1] : 'open',
          pinned: pinnedMatch ? pinnedMatch[1] : 'unknown',
          content: content.slice(0, 500)
        });
      }
    }
    
    res.json({ items });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'PINNED_ITEMS_FAILED' 
    });
  }
});

// Contract 7: Health Check
app.get(`${API_PREFIX}/health`, (req, res) => {
  try {
    const isLive = req.query.live === 'true';
    
    if (isLive) {
      // Run live healthcheck
      const output = executeCommand(`${PATHS.HEALTHCHECK_SCRIPT} 2>&1`, 10000) || 'No output';
      
      // Parse results
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);
      const warningsMatch = output.match(/(\d+) warnings/);
      
      res.json({
        live: true,
        output,
        passed: passedMatch ? parseInt(passedMatch[1]) : 0,
        failed: failedMatch ? parseInt(failedMatch[1]) : 0,
        warnings: warningsMatch ? parseInt(warningsMatch[1]) : 0
      });
    } else {
      // Return cached log
      const logContent = readFileOrNull(PATHS.HEALTHCHECK_LOG);
      const lastLog = logContent 
        ? logContent.split('\n').slice(-20).join('\n')
        : 'No healthcheck log available';
      
      res.json({
        live: false,
        lastLog
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'HEALTH_CHECK_FAILED' 
    });
  }
});

// Contract 8: Cron Jobs
app.get(`${API_PREFIX}/crons`, (req, res) => {
  try {
    const crontabOutput = executeCommand('crontab -l 2>/dev/null') || '';
    const lines = crontabOutput.split('\n');
    const jobs = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      
      // Look for comment above this line
      let description = '';
      if (i > 0 && lines[i - 1].trim().startsWith('#')) {
        description = lines[i - 1].replace('#', '').trim();
      }
      
      // Parse cron line
      const parts = line.split(' ');
      if (parts.length >= 6) {
        jobs.push({
          schedule: parts.slice(0, 5).join(' '),
          command: parts.slice(5).join(' '),
          description
        });
      }
    }
    
    res.json({
      jobs,
      raw: crontabOutput
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      code: 'CRON_JOBS_FAILED' 
    });
  }
});

// ====================================
// v3 NEW ENDPOINTS (4)
// ====================================

// Contract 9: Task Archive - GET /api/tasks/finished
app.get(`${API_PREFIX}/tasks/finished`, (req, res) => {
  try {
    const finishedDir = PATHS.TASKS_FINISHED;
    if (!fs.existsSync(finishedDir)) {
      return res.json({ 
        tasks: [], 
        total: 0, 
        filter_options: { owners: [], plans: [], months: [] }
      });
    }
    
    const files = fs.readdirSync(finishedDir)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => {
        // Sort by filename (should contain timestamps) - newest first
        return b.localeCompare(a);
      });
    
    const tasks = [];
    const owners = new Set();
    const plans = new Set();
    const months = new Set();
    
    // Process up to 100 latest files
    for (const file of files.slice(0, 100)) {
      try {
        const content = fs.readFileSync(path.join(finishedDir, file), 'utf8');
        const task = parseFinishedTask(content, file);
        if (task) {
          tasks.push(task);
          owners.add(task.owner);
          plans.add(task.plan_title);
          months.add(task.completed_date.substring(0, 7)); // YYYY-MM
        }
      } catch (parseErr) {
        console.warn(`Failed to parse finished task ${file}:`, parseErr.message);
      }
    }
    
    res.json({
      tasks,
      total: tasks.length,
      filter_options: {
        owners: Array.from(owners).sort(),
        plans: Array.from(plans).sort(),
        months: Array.from(months).sort()
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'TASK_ARCHIVE_FAILED'
    });
  }
});

// Contract 10: Task Log Stream - GET /api/tasks/log
app.get(`${API_PREFIX}/tasks/log`, (req, res) => {
  try {
    const sinceParam = req.query.since;
    let sinceTimestamp = null;
    
    if (sinceParam) {
      sinceTimestamp = new Date(sinceParam);
      if (isNaN(sinceTimestamp.getTime())) {
        return res.status(400).json({
          error: 'Invalid since parameter format',
          code: 'INVALID_TIMESTAMP'
        });
      }
    }
    
    // Query with optional timestamp filter
    const whereClause = sinceTimestamp ? `WHERE tl.timestamp > ?` : '';
    const params = sinceTimestamp ? [sinceTimestamp.toISOString()] : [];
    
    const query = `
      SELECT 
        tl.id,
        tl.timestamp,
        tl.agent_id,
        tl.task_id,
        tl.old_status,
        tl.new_status,
        tl.note,
        t.title as task_title,
        t.plan_id,
        t.priority,
        t.tags
      FROM task_log tl
      JOIN tasks t ON t.id = tl.task_id
      ${whereClause}
      ORDER BY tl.timestamp DESC
      LIMIT 50
    `;
    
    const entries = queryDatabase(query, params);
    
    // Transform and enrich data
    const enrichedEntries = entries.map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      agent_id: entry.agent_id,
      action_type: inferActionType(entry),
      task_id: entry.task_id,
      task_title: entry.task_title,
      old_value: entry.old_status,
      new_value: entry.new_status,
      note: entry.note,
      metadata: {
        plan_id: entry.plan_id,
        priority: entry.priority,
        tags: entry.tags ? entry.tags.split(',') : []
      }
    }));
    
    const latestTimestamp = entries.length > 0 ? 
      entries[0].timestamp : new Date().toISOString();
    
    res.json({
      entries: enrichedEntries,
      latest_timestamp: latestTimestamp,
      has_more: entries.length === 50
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'TASK_LOG_FAILED'
    });
  }
});

// Contract 11: Hierarchy Tree - GET /api/hierarchy
app.get(`${API_PREFIX}/hierarchy`, (req, res) => {
  try {
    const config = loadConfig();
    if (!config || !config.agents) {
      return res.status(500).json({
        error: 'Cannot read agent configuration',
        code: 'CONFIG_LOAD_FAILED'
      });
    }
    
    // Define hierarchy relationships (from AGENTS.md)
    const hierarchy = {
      bob: { level: 0, children: ['main'] },
      main: { level: 1, children: ['denny'] },
      denny: { level: 2, children: ['nexus', 'qa', 'leaddev'] },
      leaddev: { level: 3, children: ['weblead'] },
      weblead: { level: 4, children: ['frontend', 'backend', 'realtime', 'graphics'] },
      nexus: { level: 3, children: [] },
      qa: { level: 3, children: [] },
      frontend: { level: 5, children: [] },
      backend: { level: 5, children: [] },
      realtime: { level: 5, children: [] },
      graphics: { level: 5, children: [] }
    };
    
    const nodes = {};
    const agents = config.agents.list || [];
    
    // Build node data
    Object.entries(hierarchy).forEach(([agentId, hierarchyData]) => {
      const agentConfig = agents.find(a => a.id === agentId);
      const workspace = agentConfig?.workspace || '';
      const model = extractModelName(agentConfig?.model);
      
      // Determine status
      let status = 'unknown';
      if (agentId === 'bob') {
        status = 'online'; // Bob is always online
      } else if (agentConfig) {
        const wsExists = workspace && fs.existsSync(workspace);
        const soulExists = wsExists && fs.existsSync(path.join(workspace, 'SOUL.md'));
        status = (wsExists && soulExists) ? 'online' : 'offline';
      }
      
      // Get last active time
      let lastActive = null;
      if (agentConfig) {
        const sessionsDir = path.join(PATHS.OPENCLAW_ROOT, 'agents', agentId, 'sessions');
        try {
          const sessionFiles = fs.readdirSync(sessionsDir)
            .filter(f => f.endsWith('.jsonl'))
            .sort();
          if (sessionFiles.length > 0) {
            const lastFile = sessionFiles[sessionFiles.length - 1];
            const stat = fs.statSync(path.join(sessionsDir, lastFile));
            lastActive = stat.mtime.toISOString();
          }
        } catch (error) {
          // Sessions directory doesn't exist
        }
      }
      
      nodes[agentId] = {
        id: agentId,
        name: getDisplayName(agentId),
        role: getRole(agentId),
        level: hierarchyData.level,
        model: model,
        status: status,
        children: hierarchyData.children,
        workspace_health: status === 'online',
        last_active: lastActive,
        tools_count: (agentConfig?.tools?.allow || []).length + (agentConfig?.tools?.deny || []).length,
        spawn_targets: agentConfig?.subagents?.allowAgents || []
      };
    });
    
    res.json({
      nodes,
      root: 'bob',
      max_depth: 5
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'HIERARCHY_FAILED'
    });
  }
});

// Contract 12: Whiteboard Save - POST /api/whiteboard
app.post(`${API_PREFIX}/whiteboard`, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file uploaded',
        code: 'NO_FILE_UPLOADED'
      });
    }
    
    const metadata = JSON.parse(req.body.metadata || '{}');
    const timestamp = new Date().toISOString();
    const filename = `whiteboard_${timestamp.replace(/[:.]/g, '-')}.png`;
    const finalPath = path.join('./whiteboards/', filename);
    
    // Move uploaded file to final location
    fs.renameSync(req.file.path, finalPath);
    
    // Get file stats
    const stats = fs.statSync(finalPath);
    
    res.json({
      filename,
      path: `whiteboards/${filename}`,
      size_bytes: stats.size,
      dimensions: metadata.dimensions || { width: 0, height: 0 },
      url: `/whiteboards/${filename}`,
      timestamp
    });
  } catch (error) {
    // Cleanup temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: error.message,
      code: 'WHITEBOARD_SAVE_FAILED'
    });
  }
});

// Sites API routes
try {
  const sitesRouter = require('./routes/sites.js');
  app.use(`${API_PREFIX}/sites`, sitesRouter);
  console.log('Sites API routes mounted at', `${API_PREFIX}/sites`);
} catch (err) {
  console.warn('Sites routes not loaded:', err.message);
}

try {
  const pipelineRouter = require('./routes/pipeline.js');
  app.use(`${API_PREFIX}/pipeline`, pipelineRouter);
  console.log('Pipeline API routes mounted at', `${API_PREFIX}/pipeline`);
} catch (err) {
  console.warn('Pipeline routes not loaded:', err.message);
}

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error(`Error in ${req.path}:`, err.message);
  console.error(err.stack);
  
  res.status(500).json({ 
    error: err.message,
    code: 'INTERNAL_SERVER_ERROR'
  });
});

// Start server
app.listen(PORT, BIND_ADDRESS, () => {
  console.log(`Mission Control v3 Backend running on http://${BIND_ADDRESS}:${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}${API_PREFIX}/`);
});
