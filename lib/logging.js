'use strict';

const path = require('path');
const { appendText, nowIso } = require('./utils.js');

function logPath(config) {
  return path.resolve(config.paths.logsDir, 'pipeline.jsonl');
}

function writeStructuredLog(config, event, payload = {}) {
  const entry = {
    timestamp: nowIso(),
    event,
    ...payload
  };

  appendText(logPath(config), `${JSON.stringify(entry)}\n`);
  return entry;
}

module.exports = {
  logPath,
  writeStructuredLog
};
