'use strict';

const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const constants = require('../../shared/constants.js');

const router = express.Router();
const { PATHS, PIPELINE_COMMAND } = constants;

router.use(express.json());

function notInitialized(message = 'Pipeline controller not initialized') {
  return {
    status: 'pipeline_not_initialized',
    message,
    summary: {
      counts: {},
      display_counts: {},
      active_slice: null,
      next_ready_slice: null,
      merged_count: 0,
      total_slices: 0,
      attention_count: 0,
      feature_counts: {}
    },
    slices: [],
    features: []
  };
}

function runPipeline(args) {
  if (!fs.existsSync(PATHS.PIPELINE_CLI)) {
    return { ok: false, payload: notInitialized(`Pipeline CLI not found at ${PATHS.PIPELINE_CLI}`) };
  }

  const result = spawnSync(process.execPath, [PATHS.PIPELINE_CLI, ...args], {
    cwd: PATHS.PIPELINE_ROOT,
    encoding: 'utf8',
    timeout: PIPELINE_COMMAND.TIMEOUT_MS
  });

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();

  if (!stdout && result.status !== 0) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        status: 'error',
        error: stderr || 'Pipeline command failed',
        code: 'PIPELINE_COMMAND_FAILED'
      }
    };
  }

  let payload = null;
  try {
    payload = stdout ? JSON.parse(stdout) : null;
  } catch (error) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        status: 'error',
        error: 'Pipeline command returned invalid JSON',
        code: 'PIPELINE_BAD_JSON',
        stdout,
        stderr
      }
    };
  }

  if (payload && payload.code === 'CONFIG_MISSING') {
    return { ok: false, payload: notInitialized(payload.error) };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      statusCode: payload && payload.code === 'SLICE_NOT_FOUND' ? 404 : 400,
      payload: payload || {
        status: 'error',
        error: stderr || 'Pipeline command failed',
        code: 'PIPELINE_COMMAND_FAILED'
      }
    };
  }

  return { ok: true, payload };
}

function buildRequestId(req) {
  const incoming = req.headers['x-request-id']
    || (req.body && req.body.requestId)
    || (req.query && req.query.requestId);
  if (incoming) {
    return String(incoming);
  }

  if (typeof crypto.randomUUID === 'function') {
    return `mc-${crypto.randomUUID()}`;
  }

  return `mc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendResult(res, commandResult) {
  if (commandResult.ok) {
    res.json(commandResult.payload);
    return;
  }

  if (commandResult.payload && commandResult.payload.status === 'pipeline_not_initialized') {
    res.status(200).json(commandResult.payload);
    return;
  }

  res.status(commandResult.statusCode || 500).json(commandResult.payload);
}

router.get('/status', (req, res) => {
  sendResult(res, runPipeline(['--json', 'status']));
});

router.get('/slices', (req, res) => {
  const args = ['--json', 'list'];
  if (req.query.status) {
    args.push('--status', req.query.status);
  }
  sendResult(res, runPipeline(args));
});

router.get('/slices/:id', (req, res) => {
  sendResult(res, runPipeline(['--json', 'show', req.params.id]));
});

router.get('/slices/:id/events', (req, res) => {
  sendResult(res, runPipeline(['--json', 'log', req.params.id]));
});

router.get('/features', (req, res) => {
  sendResult(res, runPipeline(['--json', 'feature-status']));
});

router.post('/slices/:id/approve', (req, res) => {
  const args = ['--json', 'approve', req.params.id, '--request-id', buildRequestId(req)];
  if (req.body && req.body.notes) {
    args.push('--notes', req.body.notes);
  }
  sendResult(res, runPipeline(args));
});

router.post('/slices/:id/reject', (req, res) => {
  const reason = req.body && req.body.reason ? String(req.body.reason) : '';
  if (!reason) {
    res.status(400).json({
      status: 'error',
      error: 'Reject requires a reason',
      code: 'REASON_REQUIRED'
    });
    return;
  }

  sendResult(res, runPipeline([
    '--json',
    'reject',
    req.params.id,
    '--reason',
    reason,
    '--request-id',
    buildRequestId(req)
  ]));
});

router.post('/slices/:id/dispatch', (req, res) => {
  sendResult(res, runPipeline(['--json', 'dispatch', req.params.id, '--request-id', buildRequestId(req)]));
});

router.post('/slices/:id/cancel', (req, res) => {
  sendResult(res, runPipeline(['--json', 'cancel', req.params.id, '--request-id', buildRequestId(req)]));
});

module.exports = router;
