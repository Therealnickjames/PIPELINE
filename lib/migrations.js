'use strict';

const fs = require('fs');
const path = require('path');
const { copyFile, ensureDir, fileExists, nowIso } = require('./utils.js');
const { PipelineError } = require('./errors.js');

function tableExists(db, tableName) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName);
  return Boolean(row);
}

function columnExists(db, tableName, columnName) {
  if (!tableExists(db, tableName)) {
    return false;
  }

  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function ensureColumn(db, tableName, columnName, sqlType) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
  }
}

function ensureIndex(db, name, sql) {
  db.exec(sql.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'));
}

function ensureSchemaMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

const MIGRATIONS = [
  {
    id: '001_baseline',
    description: 'Bootstrap baseline pipeline tables',
    up(db) {
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
      `);

      ensureIndex(db, 'idx_slices_status', 'CREATE INDEX idx_slices_status ON slices(status)');
      ensureIndex(db, 'idx_events_slice_id', 'CREATE INDEX idx_events_slice_id ON events(slice_id, created_at)');
      ensureIndex(db, 'idx_feature_groups_status', 'CREATE INDEX idx_feature_groups_status ON feature_groups(status)');
      ensureIndex(db, 'idx_slice_timing_slice_id', 'CREATE INDEX idx_slice_timing_slice_id ON slice_timing(slice_id, entered_at)');
      ensureIndex(db, 'idx_failure_patterns_signature', 'CREATE INDEX idx_failure_patterns_signature ON failure_patterns(error_signature, timestamp)');
    }
  },
  {
    id: '002_hardening_runtime',
    description: 'Add runtime, observability, and idempotency tables',
    up(db) {
      ensureColumn(db, 'events', 'run_id', 'TEXT');
      ensureColumn(db, 'events', 'request_id', 'TEXT');
      ensureColumn(db, 'events', 'correlation_id', 'TEXT');

      ensureColumn(db, 'slices', 'last_request_id', 'TEXT');
      ensureColumn(db, 'slices', 'last_run_id', 'TEXT');

      db.exec(`
        CREATE TABLE IF NOT EXISTS controller_lease (
          lease_key TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          lease_token TEXT NOT NULL,
          acquired_at TEXT NOT NULL,
          heartbeat_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS operations (
          request_id TEXT PRIMARY KEY,
          operation_name TEXT NOT NULL,
          target_id TEXT,
          actor TEXT NOT NULL,
          status TEXT NOT NULL,
          response_json TEXT,
          error_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS slice_runs (
          run_id TEXT PRIMARY KEY,
          slice_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          request_id TEXT,
          actor TEXT NOT NULL,
          status TEXT NOT NULL,
          details TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS command_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command_name TEXT NOT NULL,
          slice_id TEXT,
          run_id TEXT,
          request_id TEXT,
          phase TEXT,
          cwd TEXT NOT NULL,
          exec_json TEXT NOT NULL,
          env_keys_json TEXT NOT NULL,
          status TEXT NOT NULL,
          exit_code INTEGER,
          duration_ms INTEGER,
          stdout_excerpt TEXT,
          stderr_excerpt TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      ensureIndex(db, 'idx_operations_status', 'CREATE INDEX idx_operations_status ON operations(status, updated_at)');
      ensureIndex(db, 'idx_slice_runs_slice_id', 'CREATE INDEX idx_slice_runs_slice_id ON slice_runs(slice_id, started_at)');
      ensureIndex(db, 'idx_command_runs_slice_id', 'CREATE INDEX idx_command_runs_slice_id ON command_runs(slice_id, created_at)');
      ensureIndex(db, 'idx_command_runs_run_id', 'CREATE INDEX idx_command_runs_run_id ON command_runs(run_id, created_at)');
      ensureIndex(db, 'idx_events_request_id', 'CREATE INDEX idx_events_request_id ON events(request_id, created_at)');
    }
  }
];

function backupExistingDb(dbPath, backupsDir) {
  if (!fileExists(dbPath)) {
    return null;
  }

  const stats = fs.statSync(dbPath);
  if (!stats.isFile() || stats.size === 0) {
    return null;
  }

  ensureDir(backupsDir);
  const backupPath = path.resolve(backupsDir, `pipeline-${Date.now()}.sqlite`);
  copyFile(dbPath, backupPath);
  return backupPath;
}

function getAppliedMigrationIds(db) {
  ensureSchemaMigrationsTable(db);
  return db.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map((row) => row.id);
}

function validateMigrationState(db) {
  const applied = getAppliedMigrationIds(db);
  const knownIds = new Set(MIGRATIONS.map((migration) => migration.id));
  const unknown = applied.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new PipelineError('UNKNOWN_MIGRATION_STATE', `Unknown applied migrations: ${unknown.join(', ')}`);
  }
}

function applyMigrations(db, options = {}) {
  const dbPath = options.dbPath || '';
  const backupsDir = options.backupsDir || path.resolve(path.dirname(dbPath || '.'), 'backups');

  ensureSchemaMigrationsTable(db);
  validateMigrationState(db);

  const applied = new Set(getAppliedMigrationIds(db));
  const pending = MIGRATIONS.filter((migration) => !applied.has(migration.id));
  let backupPath = null;

  if (pending.length > 0 && dbPath) {
    backupPath = backupExistingDb(dbPath, backupsDir);
  }

  pending.forEach((migration) => {
    const transaction = db.transaction(() => {
      migration.up(db);
      db.prepare(`
        INSERT INTO schema_migrations (id, applied_at)
        VALUES (?, ?)
      `).run(migration.id, nowIso());
    });
    transaction();
  });

  return {
    applied: pending.map((migration) => migration.id),
    backup_path: backupPath
  };
}

module.exports = {
  MIGRATIONS,
  applyMigrations,
  getAppliedMigrationIds,
  validateMigrationState,
  tableExists,
  columnExists
};
