'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { JSDOM } = require('jsdom');

function loadComponent() {
  const componentPath = path.resolve(__dirname, '..', 'public', 'js', 'components', 'pipeline-tab.js');
  delete require.cache[componentPath];
  require(componentPath);
}

test('pipeline tab renders runtime banners and detail correlation data', async () => {
  const dom = new JSDOM('<!DOCTYPE html><div id="pipeline-content"></div>', {
    url: 'http://localhost/'
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.TabSystem = {
    registerComponent() {}
  };
  global.stateManager = {
    setTabData() {},
    setTabError() {},
    setTabState() {}
  };
  global.api = {
    createRequestId(prefix) {
      return `${prefix}-123`;
    }
  };
  window.MISSION_CONTROL_CONSTANTS = {
    PIPELINE_STATUS_COLORS: {
      APPROVED: 'bg-blue-600',
      FAILED_EXECUTION: 'bg-red-600'
    },
    PIPELINE_COLUMNS: [
      { id: 'attention', label: 'Attention Required' },
      { id: 'approved', label: 'Approved' }
    ]
  };

  loadComponent();
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const instance = window.PipelineTabInstance;

  instance.statusData = {
    status: 'ok',
    summary: {
      active_slice: null,
      next_ready_slice: null,
      merged_count: 0,
      total_slices: 1,
      attention_count: 1
    },
    runtime: {
      lease: { owner_id: 'runner-1' },
      stale_slices: [{ id: 'SL-100' }],
      warnings: []
    }
  };
  instance.slicesData = {
    slices: [
      {
        id: 'SL-100',
        title: 'Detail slice',
        status: 'APPROVED',
        display_status: 'APPROVED',
        next_action: 'dispatch',
        complexity: 'low'
      }
    ]
  };
  instance.featuresData = { features: [] };
  instance.render();
  assert.match(instance.container.innerHTML, /runner-1/);
  assert.match(instance.container.innerHTML, /Reconciliation needed/);

  instance.selectedSliceId = 'SL-100';
  instance.detailData = {
    slice: {
      id: 'SL-100',
      title: 'Detail slice',
      status: 'APPROVED',
      display_status: 'FAILED_EXECUTION',
      agent_type: 'codex',
      description: 'Example',
      acceptance_criteria: ['One'],
      affected_files: ['README.md'],
      dependency_details: [],
      agent_instructions: 'Keep it small.',
      test_results: {},
      recent_commands: [
        {
          command_name: 'quality-gate:coverage',
          status: 'FAILED',
          run_id: 'run-1',
          request_id: 'req-1',
          stderr_excerpt: 'coverage below threshold'
        }
      ],
      stale_execution: true,
      last_request_id: 'req-1',
      last_run_id: 'run-1',
      quality_gate_evidence: { passed: false }
    },
    events: [
      {
        event_type: 'failure',
        created_at: '2026-03-17T00:00:00.000Z',
        actor: 'system',
        request_id: 'req-1',
        run_id: 'run-1'
      }
    ]
  };
  instance.renderDetailDrawer();
  const drawer = document.getElementById('pipeline-detail-drawer');
  assert.match(drawer.innerHTML, /req-1/);
  assert.match(drawer.innerHTML, /run-1/);
  assert.match(drawer.innerHTML, /coverage below threshold/);
});
