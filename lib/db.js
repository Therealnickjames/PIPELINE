'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { ensureDir } = require('./utils.js');
const { applyMigrations } = require('./migrations.js');

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
  applyMigrations(cachedDb, {
    dbPath: config.paths.dbPath,
    backupsDir: config.paths.backupsDir
  });
  return cachedDb;
}

function resetDbCache() {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch (error) {
      // Ignore close failures during test teardown.
    }
  }
  cachedDb = null;
  cachedDbPath = null;
}

module.exports = {
  getDb,
  resetDbCache
};
