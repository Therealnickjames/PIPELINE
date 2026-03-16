'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { nowIso, readJson, writeJson, fileExists, readText } = require('./utils.js');
const { PipelineError } = require('./errors.js');

function signalPath(config, sliceId) {
  return path.resolve(config.paths.signalDir, `${sliceId}-done.json`);
}

function buildContext(config, slice, extra = {}) {
  const handoff = extra.handoff || '';
  const codemap = extra.codemap ? JSON.stringify(extra.codemap, null, 2) : '{}';
  const modeNotes = extra.mode === 'AUTO_FIX'
    ? [
        'AUTO_FIX MODE:',
        '- Write docs/fix-hypothesis.md before applying fixes.',
        '- Fix only what the tests indicate is broken.',
        '- Do not refactor outside the failing surface.'
      ].join('\n')
    : '';

  return [
    `# Slice ${slice.id}: ${slice.title}`,
    '',
    '## Description',
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
    '## Codemap',
    codemap,
    '',
    '## Prior Handoff',
    handoff || 'No prior handoff.',
    '',
    '## Required Flow',
    '1. Read docs/current-slice.md and docs/session-handoff.md.',
    '2. Write docs/preflight.md with the required five sections before editing any non-doc file.',
    '3. Do the smallest production-grade implementation for this slice.',
    '4. When done, write the expanded signal file described below.',
    '',
    '## Signal File',
    `Write ${signalPath(config, slice.id)} with JSON fields:`,
    '- slice_id, success, status, summary, files_changed, handoff_notes, known_issues,',
    '- needs_split, split_reason, tests, preflight_summary, completed_at, codemap_updates, architecture_notes',
    '',
    modeNotes
  ].filter(Boolean).join('\n');
}

function dispatch(config, slice, options = {}) {
  const sessionId = `${slice.id}-${Date.now()}`;
  const contextPath = path.resolve(config.paths.contextsDir, `${slice.id}-${options.mode || 'dispatch'}.md`);
  writeJson(path.resolve(config.paths.contextsDir, `${slice.id}-${options.mode || 'dispatch'}.json`), {
    session_id: sessionId,
    slice_id: slice.id,
    mode: options.mode || 'EXECUTING',
    created_at: nowIso()
  });

  const context = buildContext(config, slice, options);
  require('./utils.js').writeText(contextPath, `${context}\n`);

  if (config.dispatcher.type === 'command' && config.dispatcher.commandTemplate) {
    const command = config.dispatcher.commandTemplate
      .replace(/\{context_path\}/g, contextPath)
      .replace(/\{slice_id\}/g, slice.id);
    const child = spawn(command, {
      cwd: config.repoPath,
      detached: true,
      shell: true,
      stdio: 'ignore'
    });
    child.unref();
  }

  return {
    sessionId,
    contextPath
  };
}

function readSignal(config, sliceId) {
  const target = signalPath(config, sliceId);
  if (!fileExists(target)) {
    return null;
  }

  const signal = readJson(target, null);
  if (!signal) {
    throw new PipelineError('INVALID_SIGNAL', `Signal file is not valid JSON: ${target}`);
  }

  return signal;
}

function clearSignal(config, sliceId) {
  const target = signalPath(config, sliceId);
  if (fileExists(target)) {
    require('fs').unlinkSync(target);
  }
}

function timedOut(config, slice, timeoutMinutes) {
  if (!slice.dispatched_at) {
    return false;
  }

  const timeoutMs = timeoutMinutes * 60 * 1000;
  return (Date.now() - Date.parse(slice.dispatched_at)) > timeoutMs;
}

function readFixHypothesis(config) {
  return readText(path.resolve(config.paths.docsDir, 'fix-hypothesis.md'), '');
}

module.exports = {
  signalPath,
  buildContext,
  dispatch,
  readSignal,
  clearSignal,
  timedOut,
  readFixHypothesis
};

