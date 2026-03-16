'use strict';

const path = require('path');
const { PREFLIGHT_SECTIONS } = require('./constants.js');
const { ensureDir, fileExists, readText, writeText } = require('./utils.js');

function docsPath(config, fileName) {
  return path.resolve(config.paths.docsDir, fileName);
}

function scaffold(config) {
  ensureDir(config.paths.docsDir);
  const templates = {
    'current-slice.md': '# Current Slice\n\nNo slice is currently executing.\n',
    'session-handoff.md': '# Session Handoff\n\nNo handoff has been recorded yet.\n',
    'known-issues.md': '# Known Issues\n\n- None recorded.\n',
    'architecture.md': '# Architecture\n\nNo architecture decisions recorded yet.\n',
    'backlog.md': '# Backlog\n\nNo slices imported yet.\n',
    'preflight.md': '# Preflight\n\nThis file is written by the active agent.\n',
    'fix-hypothesis.md': '# Fix Hypothesis\n\nThis file is written during AUTO_FIX attempts.\n'
  };

  Object.entries(templates).forEach(([fileName, template]) => {
    const target = docsPath(config, fileName);
    if (!fileExists(target)) {
      writeText(target, template);
    }
  });
}

function writeCurrentSlice(config, slice) {
  const dependencies = slice.dependency_details || [];
  const dependencySummary = dependencies.length === 0
    ? 'None'
    : dependencies.map((dependency) => `${dependency.id} (${dependency.status})`).join(', ');

  const content = [
    `# Current Slice: ${slice.id}`,
    '',
    `**Title:** ${slice.title}`,
    `**Status:** ${slice.status}`,
    `**Agent:** ${slice.agent_type}`,
    `**Dependencies:** ${dependencySummary}`,
    '',
    '## Spec',
    slice.description,
    '',
    '## Acceptance Criteria',
    ...slice.acceptance_criteria.map((criterion) => `- ${criterion}`),
    '',
    '## Affected Files',
    ...(slice.affected_files.length ? slice.affected_files.map((filePath) => `- ${filePath}`) : ['- None provided']),
    '',
    '## Agent Instructions',
    slice.agent_instructions || 'None provided.',
    '',
    '## Do Not',
    '- Do not refactor files outside the affected files list',
    '- Do not add capabilities beyond this slice',
    '- Do not redesign existing interfaces'
  ].join('\n');

  writeText(docsPath(config, 'current-slice.md'), `${content}\n`);
}

function readHandoff(config) {
  return readText(docsPath(config, 'session-handoff.md'), '');
}

function writeHandoff(config, slice, signal) {
  const content = [
    `# Handoff: ${slice.id}`,
    '',
    `**Slice:** ${slice.id} - ${slice.title}`,
    `**Completed:** ${signal.completed_at || new Date().toISOString()}`,
    `**Status:** ${signal.status || 'done'}`,
    '',
    '## What Changed',
    ...(Array.isArray(signal.files_changed) && signal.files_changed.length
      ? signal.files_changed.map((filePath) => `- ${filePath}`)
      : ['- No files reported']),
    '',
    '## Summary',
    signal.summary || 'No summary reported.',
    '',
    '## Known Issues',
    ...(Array.isArray(signal.known_issues) && signal.known_issues.length
      ? signal.known_issues.map((issue) => `- ${issue}`)
      : ['- None reported']),
    '',
    '## What The Next Slice Needs To Know',
    signal.handoff_notes || 'No additional notes.'
  ].join('\n');

  writeText(docsPath(config, 'session-handoff.md'), `${content}\n`);
}

function updateKnownIssues(config, signal) {
  const content = [
    '# Known Issues',
    '',
    ...(Array.isArray(signal.known_issues) && signal.known_issues.length
      ? signal.known_issues.map((issue) => `- ${issue}`)
      : ['- None reported.'])
  ].join('\n');
  writeText(docsPath(config, 'known-issues.md'), `${content}\n`);
}

function updateArchitecture(config, signal) {
  if (!signal.architecture_notes) {
    return;
  }

  const content = [
    '# Architecture',
    '',
    signal.architecture_notes
  ].join('\n');
  writeText(docsPath(config, 'architecture.md'), `${content}\n`);
}

function updateBacklog(config, slices) {
  const content = [
    '# Backlog',
    '',
    ...slices.map((slice) => `- ${slice.id} [${slice.display_status}] ${slice.title}`)
  ].join('\n');

  writeText(docsPath(config, 'backlog.md'), `${content}\n`);
}

function validatePreflight(config) {
  const target = docsPath(config, 'preflight.md');
  if (!fileExists(target)) {
    return { exists: false, valid: false, path: target };
  }

  const content = readText(target, '');
  const missingSections = PREFLIGHT_SECTIONS.filter((section) => !content.includes(section));
  return {
    exists: true,
    valid: missingSections.length === 0,
    path: target,
    missing_sections: missingSections
  };
}

module.exports = {
  scaffold,
  writeCurrentSlice,
  readHandoff,
  writeHandoff,
  updateKnownIssues,
  updateArchitecture,
  updateBacklog,
  validatePreflight
};
