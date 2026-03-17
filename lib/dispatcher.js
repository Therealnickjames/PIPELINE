'use strict';

const fs = require('fs');
const path = require('path');
const { nowIso, readJson, writeJson, fileExists, readText, writeText } = require('./utils.js');
const { PipelineError } = require('./errors.js');
const { launchCommand, resolveCommandSpec } = require('./command-runner.js');

function signalPath(config, sliceId) {
  return path.resolve(config.paths.signalDir, `${sliceId}-done.json`);
}

function buildContext(config, slice, extra = {}) {
  const handoff = extra.handoff || '';
  const codemap = extra.codemap ? JSON.stringify(extra.codemap, null, 2) : '{}';
  const failureMemoryNotes = extra.failureMemory && extra.failureMemory.applied
    ? [
        '## Failure Memory',
        `- Matched signature: ${extra.failureMemory.error_signature}`,
        `- Source slice: ${extra.failureMemory.source_slice_id}`,
        '- Read docs/fix-hypothesis.md and apply that minimal hypothesis before broader changes.',
        ''
      ].join('\n')
    : '';
  const failureContext = extra.failureContext
    ? [
        '## Failure Context',
        extra.failureContext,
        ''
      ].join('\n')
    : '';
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
    failureMemoryNotes,
    failureContext,
    '## Required Flow',
    '1. Read docs/current-slice.md and docs/session-handoff.md.',
    '2. If docs/fix-hypothesis.md contains a cached winning pattern, apply that minimal hypothesis before broader edits.',
    '3. Write docs/preflight.md with the required five sections before editing any non-doc file.',
    '4. Do the smallest production-grade implementation for this slice.',
    '5. Basic slice tests must pass, then coverage must be at least 90% and mutation tests must pass.',
    '6. When done, write the expanded signal file described below.',
    '',
    '## Signal File',
    `Write ${signalPath(config, slice.id)} with JSON fields:`,
    '- slice_id, success, status, summary, files_changed, handoff_notes, known_issues,',
    '- needs_split, split_reason, tests, preflight_summary, completed_at, codemap_updates, architecture_notes',
    '',
    modeNotes
  ].filter(Boolean).join('\n');
}

function dispatch(config, slice, options = {}, metadata = {}) {
  const sessionId = `${slice.id}-${Date.now()}`;
  const contextPath = path.resolve(config.paths.contextsDir, `${slice.id}-${options.mode || 'dispatch'}.md`);
  writeJson(path.resolve(config.paths.contextsDir, `${slice.id}-${options.mode || 'dispatch'}.json`), {
    session_id: sessionId,
    slice_id: slice.id,
    mode: options.mode || 'EXECUTING',
    created_at: nowIso()
  });

  const context = buildContext(config, slice, options);
  writeText(contextPath, `${context}\n`);

  let commandRun = null;
  if (config.dispatcher.type === 'command' && config.dispatcher.command.exec.length > 0) {
    const spec = resolveCommandSpec(config, {
      name: 'dispatcher',
      exec: config.dispatcher.command.exec.map((token) =>
        String(token)
          .replace(/\{context_path\}/g, contextPath)
          .replace(/\{slice_id\}/g, slice.id)
      ),
      cwd: config.dispatcher.command.cwd,
      timeoutSeconds: config.dispatcher.command.timeoutSeconds,
      envAllowlist: config.dispatcher.command.envAllowlist
    });
    commandRun = launchCommand(config, spec, {
      ...metadata,
      sliceId: slice.id,
      phase: options.mode || 'EXECUTING'
    });
  }

  return {
    sessionId,
    contextPath,
    command_run: commandRun
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
    fs.unlinkSync(target);
  }
}

function timedOut(config, slice, timeoutMinutes) {
  if (!slice.dispatched_at) {
    return false;
  }

  const effectiveTimeoutSeconds = Math.max(
    timeoutMinutes * 60,
    config.runtime.staleExecutionTimeoutSeconds
  );
  return (Date.now() - Date.parse(slice.dispatched_at)) > (effectiveTimeoutSeconds * 1000);
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
