'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function appendText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf8');
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

function randomId(prefix = 'req') {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${crypto.randomBytes(16).toString('hex')}`;
}

function deepGet(value, dottedPath, fallback = undefined) {
  if (!dottedPath) {
    return value;
  }

  const result = String(dottedPath).split('.').reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[key];
  }, value);

  return result === undefined ? fallback : result;
}

function truncateText(text, maxBytes) {
  const value = String(text || '');
  if (!maxBytes || Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }

  let clipped = value;
  while (Buffer.byteLength(clipped, 'utf8') > Math.max(0, maxBytes - 32)) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}\n...[truncated]`;
}

function resolveFrom(baseDir, target) {
  if (!target) {
    return baseDir;
  }

  return path.isAbsolute(target) ? target : path.resolve(baseDir, target);
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

module.exports = {
  nowIso,
  ensureDir,
  fileExists,
  readJson,
  writeJson,
  readText,
  writeText,
  appendText,
  parseStoredJson,
  toStoredJson,
  shellQuoteList,
  durationSeconds,
  commandExists,
  randomId,
  deepGet,
  truncateText,
  resolveFrom,
  copyFile
};
