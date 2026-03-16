'use strict';

const path = require('path');
const { ensureDir, writeText, readText } = require('./utils.js');

function notificationsLogPath(config) {
  return path.resolve(config.paths.notificationsDir, 'notifications.log');
}

function notify(config, eventName, payload) {
  if (!config.notifications.enabled) {
    return { delivered: false, provider: 'disabled' };
  }

  const entry = {
    event: eventName,
    provider: config.notifications.provider,
    payload,
    created_at: new Date().toISOString()
  };

  const target = notificationsLogPath(config);
  ensureDir(path.dirname(target));
  const current = readText(target, '');
  writeText(target, `${current}${JSON.stringify(entry)}\n`);
  return { delivered: true, provider: config.notifications.provider, entry };
}

module.exports = {
  notify
};

