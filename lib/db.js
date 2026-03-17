'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { ensureDir } = require('./utils.js');

let cachedDb = null;
let cachedDbPath = null;

function getDb(config) {
  if (cachedDb && cachedDbPath === config.paths.dbPath) {
    return cachedDb;
  }

  ensureDir(path.dirname(config.paths.dbPath));
  cachedDb = new Database(config.paths.dbPath);
  cachedDbPath = config.paths.dbPath;
  cachedDb.pragma('journal_mode = WAL');
  cachedDb.pragma('foreign_keys = ON');
  initSchema(cachedDb);
  return cachedDb;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS slices (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      affected_files TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      agent_instructions TEXT,
      dependencies TEXT NOT NULL,
      feature_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'PENDING',
      complexity TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      branch_name TEXT,
      test_results TEXT,
      sse_reviewer TEXT,
      sse_notes TEXT,
      agent_session_id TEXT,
      fix_attempts INTEGER NOT NULL DEFAULT 0,
      dispatch_attempts INTEGER NOT NULL DEFAULT 0,
      last_failure_type TEXT,
      last_failure_reason TEXT,
      last_signal TEXT,
      needs_split INTEGER NOT NULL DEFAULT 0,
      split_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      dispatched_at TEXT,
      merged_at TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slice_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT,
      actor TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slice_ids TEXT NOT NULL,
      test_suite TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      last_result TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS slice_timing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slice_id TEXT NOT NULL,
      state TEXT NOT NULL,
      entered_at TEXT NOT NULL,
      exited_at TEXT,
      duration_seconds INTEGER
    );

    CREATE TABLE IF NOT EXISTS failure_patterns (
      slice_id TEXT NOT NULL,
      error_signature TEXT NOT NULL,
      successful_fix TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_slices_status ON slices(status);
    CREATE INDEX IF NOT EXISTS idx_events_slice_id ON events(slice_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_feature_groups_status ON feature_groups(status);
    CREATE INDEX IF NOT EXISTS idx_slice_timing_slice_id ON slice_timing(slice_id, entered_at);
    CREATE INDEX IF NOT EXISTS idx_failure_patterns_signature ON failure_patterns(error_signature, timestamp);
  `);
}

module.exports = {
  getDb,
  initSchema
};
