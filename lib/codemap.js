'use strict';

const path = require('path');
const { ensureDir, fileExists, readJson, writeJson } = require('./utils.js');

function getCodemap(config) {
  if (!fileExists(config.paths.codemapPath)) {
    return {
      updated_at: null,
      last_slice: null,
      modules: {},
      conventions: config.codemap.conventions
    };
  }

  return readJson(config.paths.codemapPath, {
    updated_at: null,
    last_slice: null,
    modules: {},
    conventions: config.codemap.conventions
  });
}

function ensureCodemap(config) {
  ensureDir(path.dirname(config.paths.codemapPath));
  if (!fileExists(config.paths.codemapPath)) {
    writeJson(config.paths.codemapPath, {
      updated_at: null,
      last_slice: null,
      modules: {},
      conventions: config.codemap.conventions
    });
  }
}

function updateFromSignal(config, slice, signal) {
  ensureCodemap(config);
  const codemap = getCodemap(config);
  const updates = Array.isArray(signal.codemap_updates) ? signal.codemap_updates : [];
  const changedFiles = Array.isArray(signal.files_changed) ? signal.files_changed : [];

  changedFiles.forEach((filePath) => {
    const moduleEntry = codemap.modules[filePath] || {
      purpose: '',
      exports: [],
      depends_on: [],
      touched_by: []
    };

    if (!moduleEntry.touched_by.includes(slice.id)) {
      moduleEntry.touched_by.push(slice.id);
    }
    codemap.modules[filePath] = moduleEntry;
  });

  updates.forEach((update) => {
    if (!update || !update.path) {
      return;
    }

    const moduleEntry = codemap.modules[update.path] || {
      purpose: '',
      exports: [],
      depends_on: [],
      touched_by: []
    };

    moduleEntry.purpose = update.purpose || moduleEntry.purpose;
    moduleEntry.exports = Array.isArray(update.exports) ? update.exports : moduleEntry.exports;
    moduleEntry.depends_on = Array.isArray(update.depends_on) ? update.depends_on : moduleEntry.depends_on;
    if (!moduleEntry.touched_by.includes(slice.id)) {
      moduleEntry.touched_by.push(slice.id);
    }
    codemap.modules[update.path] = moduleEntry;
  });

  codemap.updated_at = signal.completed_at || new Date().toISOString();
  codemap.last_slice = slice.id;
  writeJson(config.paths.codemapPath, codemap);
  return codemap;
}

module.exports = {
  getCodemap,
  ensureCodemap,
  updateFromSignal
};
