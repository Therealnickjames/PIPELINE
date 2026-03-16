'use strict';

const fs = require('fs');
const path = require('path');

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return fallback;
  }
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function parseStoredJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function toStoredJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function shellQuoteList(items) {
  return items.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(' ');
}

function durationSeconds(fromIso, toIso = nowIso()) {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
}

function commandExists(command) {
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return pathEntries.some((entry) =>
    suffixes.some((suffix) => fileExists(path.join(entry, `${command}${suffix}`)))
  );
}

module.exports = {
  nowIso,
  ensureDir,
  fileExists,
  readJson,
  writeJson,
  readText,
  writeText,
  parseStoredJson,
  toStoredJson,
  shellQuoteList,
  durationSeconds,
  commandExists
};

