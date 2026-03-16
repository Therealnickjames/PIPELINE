// Mission Control v3 - Pipeline Tab

class PipelineTab {
  constructor() {
    this.tabName = 'pipeline';
    this.container = document.getElementById('pipeline-content');
    this.selectedSliceId = null;
    this.statusData = null;
    this.slicesData = null;
    this.featuresData = null;
    this.detailData = null;
    TabSystem.registerComponent(this.tabName, this);
  }

  onShow() {
    this.refresh();
  }

  async refresh() {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = this.loadingState('Loading pipeline...');

    try {
      const [statusData, slicesData, featuresData] = await Promise.all([
        api.getPipelineStatus(),
        api.getPipelineSlices(),
        api.getPipelineFeatures()
      ]);

      this.statusData = statusData;
      this.slicesData = slicesData;
      this.featuresData = featuresData;
      stateManager.setTabData(this.tabName, {
        status: statusData,
        slices: slicesData,
        features: featuresData
      });

      this.render();

      if (this.selectedSliceId) {
        await this.openSlice(this.selectedSliceId, true);
      }
    } catch (error) {
      stateManager.setTabError(this.tabName, error);
      this.container.innerHTML = this.errorState(error.message || 'Failed to load pipeline.');
    }
  }

  render() {
    if (!this.container) {
      return;
    }

    const status = this.statusData || {};
    if (status.status === 'pipeline_not_initialized') {
      this.container.innerHTML = `
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <div class="text-4xl mb-4">🧩</div>
          <h2 class="text-2xl font-semibold text-white mb-2">Pipeline Not Initialized</h2>
          <p class="text-gray-400">${status.message || 'The pipeline controller is not available yet.'}</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.buildShell();
    this.renderStatusBar();
    this.renderFeatureStrip();
    this.renderBoard();
    this.renderDetailDrawer();
  }

  buildShell() {
    return `
      <div class="space-y-4 relative">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-semibold text-white">Pipeline Control</h2>
            <p class="text-gray-400 text-sm mt-1">Gate-enforced slice orchestration and review flow</p>
          </div>
          <button onclick="window.PipelineTabInstance.refresh()" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm transition-colors">
            ↻ Refresh
          </button>
        </div>
        <div id="pipeline-status-bar"></div>
        <div id="pipeline-feature-strip"></div>
        <div id="pipeline-board" class="flex gap-4 overflow-x-auto pb-6"></div>
        <div id="pipeline-detail-drawer" class="hidden fixed right-0 top-0 h-full w-96 bg-gray-800 border-l border-gray-700 overflow-y-auto z-50 shadow-2xl"></div>
      </div>
    `;
  }

  renderStatusBar() {
    const target = document.getElementById('pipeline-status-bar');
    if (!target) {
      return;
    }

    const summary = (this.statusData && this.statusData.summary) || {};
    const active = summary.active_slice ? `${summary.active_slice.id} - ${summary.active_slice.title}` : 'None';
    const nextUp = summary.next_ready_slice ? `${summary.next_ready_slice.id} - ${summary.next_ready_slice.title}` : 'None';

    target.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        ${this.statCard('Active', active, summary.active_slice ? 'text-blue-400' : 'text-gray-400')}
        ${this.statCard('Next Up', nextUp, summary.next_ready_slice ? 'text-claw-400' : 'text-gray-400')}
        ${this.statCard('Merged', `${summary.merged_count || 0} / ${summary.total_slices || 0}`, 'text-emerald-400')}
        ${this.statCard('Attention', `${summary.attention_count || 0}`, (summary.attention_count || 0) > 0 ? 'text-red-400' : 'text-gray-400')}
      </div>
    `;
  }

  renderFeatureStrip() {
    const target = document.getElementById('pipeline-feature-strip');
    if (!target) {
      return;
    }

    const features = (this.featuresData && this.featuresData.features) || [];
    if (!features.length) {
      target.innerHTML = '';
      return;
    }

    target.innerHTML = `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-300">Feature Health</h3>
          <span class="text-xs text-gray-500">${features.length} feature groups</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          ${features.map((feature) => `
            <div class="border border-gray-700 rounded-lg p-3 bg-gray-900">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-medium text-white">${feature.id}</div>
                <span class="text-xs px-2 py-1 rounded ${this.statusColor(feature.status)}">${feature.status}</span>
              </div>
              <div class="text-sm text-gray-300 mt-1">${feature.name}</div>
              <div class="text-xs text-gray-500 mt-2">${feature.merged_count}/${feature.total_count} merged</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderBoard() {
    const target = document.getElementById('pipeline-board');
    if (!target) {
      return;
    }

    const slices = (this.slicesData && this.slicesData.slices) || [];
    const columns = (window.MISSION_CONTROL_CONSTANTS && window.MISSION_CONTROL_CONSTANTS.PIPELINE_COLUMNS) || [];

    target.innerHTML = columns.map((column) => `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 shrink-0" style="min-width: 18rem;">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-300">${column.label}</h3>
          <span class="text-xs text-gray-500">${this.columnSlices(column.id, slices).length}</span>
        </div>
        <div class="space-y-3">
          ${this.columnSlices(column.id, slices).map((slice) => this.renderSliceCard(slice)).join('') || '<div class="text-sm text-gray-500">No slices</div>'}
        </div>
      </div>
    `).join('');
  }

  columnSlices(columnId, slices) {
    return slices.filter((slice) => {
      if (columnId === 'attention') {
        return ['NEEDS_SPLIT', 'BLOCKED', 'FAILED_EXECUTION', 'FAILED_TESTS', 'FAILED_PR'].includes(slice.display_status);
      }
      if (['NEEDS_SPLIT', 'BLOCKED', 'FAILED_EXECUTION', 'FAILED_TESTS', 'FAILED_PR'].includes(slice.display_status)) {
        return false;
      }
      if (columnId === 'pending') {
        return slice.status === 'PENDING';
      }
      if (columnId === 'review') {
        return slice.status === 'SSE_REVIEW';
      }
      if (columnId === 'approved') {
        return slice.status === 'APPROVED';
      }
      if (columnId === 'in_progress') {
        return ['EXECUTING', 'TESTING', 'AUTO_FIX'].includes(slice.status);
      }
      if (columnId === 'pr_open') {
        return slice.status === 'PR_OPEN';
      }
      if (columnId === 'merged') {
        return slice.status === 'MERGED';
      }
      return false;
    });
  }

  renderSliceCard(slice) {
    const complexityClass = slice.complexity === 'high'
      ? 'text-red-300 bg-red-900/40'
      : slice.complexity === 'medium'
        ? 'text-yellow-300 bg-yellow-900/40'
        : 'text-green-300 bg-green-900/40';
    const blocked = slice.blocked_reason ? `<div class="text-xs text-red-300 mt-2">${slice.blocked_reason}</div>` : '';
    const spinner = slice.status === 'EXECUTING' ? '<span class="animate-spin inline-block">◌</span>' : '';

    return `
      <button onclick="window.PipelineTabInstance.openSlice('${slice.id}')" class="w-full text-left bg-gray-900 border border-gray-700 rounded-lg p-3 hover:border-claw-500 transition-colors">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-white">${slice.id}</div>
            <div class="text-sm text-gray-300 mt-1">${slice.title}</div>
          </div>
          <span class="text-xs px-2 py-1 rounded ${complexityClass}">${slice.complexity || 'n/a'}</span>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <span class="text-xs px-2 py-1 rounded ${this.statusColor(slice.display_status)}">${slice.display_status}</span>
          <span class="text-xs text-gray-500">${slice.next_action || ''}</span>
          <span class="text-blue-400 text-xs">${spinner}</span>
        </div>
        ${blocked}
      </button>
    `;
  }

  async openSlice(sliceId, silent = false) {
    this.selectedSliceId = sliceId;
    stateManager.setTabState(this.tabName, { selectedSliceId: sliceId });
    this.renderDetailDrawer(true);

    try {
      const [sliceData, eventsData] = await Promise.all([
        api.getPipelineSlice(sliceId),
        api.getPipelineEvents(sliceId)
      ]);
      this.detailData = {
        slice: sliceData.slice,
        events: eventsData.events || []
      };
      this.renderDetailDrawer();
    } catch (error) {
      if (!silent) {
        this.notify(error.message || 'Failed to load slice detail', 'error');
      }
      this.detailData = {
        error: error.message || 'Failed to load detail'
      };
      this.renderDetailDrawer();
    }
  }

  closeDetail() {
    this.selectedSliceId = null;
    this.detailData = null;
    stateManager.setTabState(this.tabName, { selectedSliceId: null });
    this.renderDetailDrawer();
  }

  renderDetailDrawer(loading = false) {
    const target = document.getElementById('pipeline-detail-drawer');
    if (!target) {
      return;
    }

    if (!this.selectedSliceId) {
      target.classList.add('hidden');
      target.innerHTML = '';
      return;
    }

    target.classList.remove('hidden');

    if (loading) {
      target.innerHTML = `<div class="p-6 text-gray-400">Loading slice detail...</div>`;
      return;
    }

    if (this.detailData && this.detailData.error) {
      target.innerHTML = `
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-white">Slice Detail</h3>
            <button onclick="window.PipelineTabInstance.closeDetail()" class="text-gray-400 hover:text-white">✕</button>
          </div>
          <div class="text-red-400 text-sm">${this.detailData.error}</div>
        </div>
      `;
      return;
    }

    const slice = this.detailData && this.detailData.slice;
    const events = (this.detailData && this.detailData.events) || [];
    if (!slice) {
      target.innerHTML = '';
      return;
    }

    target.innerHTML = `
      <div class="p-6 space-y-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-gray-500">${slice.id}</div>
            <h3 class="text-xl font-semibold text-white">${slice.title}</h3>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-xs px-2 py-1 rounded ${this.statusColor(slice.display_status)}">${slice.display_status}</span>
              <span class="text-xs text-gray-500">${slice.agent_type}</span>
            </div>
          </div>
          <button onclick="window.PipelineTabInstance.closeDetail()" class="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        <div class="space-y-3 text-sm">
          <div>
            <div class="text-gray-400 mb-1">Description</div>
            <div class="text-gray-200">${this.escapeHtml(slice.description || '')}</div>
          </div>
          <div>
            <div class="text-gray-400 mb-1">Acceptance Criteria</div>
            <ul class="list-disc list-inside text-gray-200 space-y-1">
              ${(slice.acceptance_criteria || []).map((criterion) => `<li>${this.escapeHtml(criterion)}</li>`).join('')}
            </ul>
          </div>
          <div>
            <div class="text-gray-400 mb-1">Affected Files</div>
            <ul class="list-disc list-inside text-gray-200 space-y-1">
              ${(slice.affected_files || []).map((filePath) => `<li>${this.escapeHtml(filePath)}</li>`).join('') || '<li>None</li>'}
            </ul>
          </div>
          <div>
            <div class="text-gray-400 mb-1">Dependencies</div>
            <ul class="list-disc list-inside text-gray-200 space-y-1">
              ${(slice.dependency_details || []).map((dependency) => `<li>${dependency.id} - ${dependency.status}</li>`).join('') || '<li>None</li>'}
            </ul>
          </div>
          <div>
            <div class="text-gray-400 mb-1">Agent Instructions</div>
            <div class="text-gray-200">${this.escapeHtml(slice.agent_instructions || 'None provided.')}</div>
          </div>
          <div>
            <div class="text-gray-400 mb-1">Last Test Result</div>
            <pre class="bg-gray-900 border border-gray-700 rounded p-3 text-xs text-gray-200 overflow-x-auto">${this.escapeHtml(JSON.stringify(slice.test_results || {}, null, 2))}</pre>
          </div>
          ${slice.pr_url ? `<div><a href="${slice.pr_url}" target="_blank" class="text-claw-400 hover:text-claw-300">Open PR</a></div>` : ''}
        </div>

        <div class="flex flex-wrap gap-2">
          ${this.actionButtons(slice)}
        </div>

        <div>
          <div class="text-gray-400 text-sm mb-2">Event Log</div>
          <div class="space-y-2 max-h-80 overflow-y-auto">
            ${events.map((event) => `
              <div class="bg-gray-900 border border-gray-700 rounded p-3 text-xs">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-white">${event.event_type}</span>
                  <span class="text-gray-500">${event.created_at}</span>
                </div>
                <div class="text-gray-400 mt-1">${event.actor}${event.from_state ? `: ${event.from_state} -> ${event.to_state}` : ''}</div>
              </div>
            `).join('') || '<div class="text-gray-500 text-sm">No events</div>'}
          </div>
        </div>
      </div>
    `;
  }

  actionButtons(slice) {
    if (slice.status === 'SSE_REVIEW') {
      return `
        <button onclick="window.PipelineTabInstance.approveSlice('${slice.id}')" class="bg-green-700 hover:bg-green-600 px-3 py-2 rounded text-sm transition-colors">Approve</button>
        <button onclick="window.PipelineTabInstance.rejectSlice('${slice.id}')" class="bg-red-700 hover:bg-red-600 px-3 py-2 rounded text-sm transition-colors">Reject</button>
      `;
    }

    if (slice.status === 'APPROVED') {
      return `<button onclick="window.PipelineTabInstance.dispatchSlice('${slice.id}')" class="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded text-sm transition-colors">Dispatch</button>`;
    }

    if (slice.status === 'EXECUTING' || slice.status === 'AUTO_FIX') {
      return `<button onclick="window.PipelineTabInstance.cancelSlice('${slice.id}')" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm transition-colors">Cancel</button>`;
    }

    return '';
  }

  async approveSlice(sliceId) {
    try {
      await api.approvePipelineSlice(sliceId, '');
      this.notify(`Approved ${sliceId}`, 'success');
      await this.refresh();
    } catch (error) {
      this.notify(error.message || 'Approve failed', 'error');
    }
  }

  async rejectSlice(sliceId) {
    const reason = window.prompt(`Reject ${sliceId}: provide a reason`);
    if (!reason) {
      return;
    }

    try {
      await api.rejectPipelineSlice(sliceId, reason);
      this.notify(`Rejected ${sliceId}`, 'success');
      await this.refresh();
    } catch (error) {
      this.notify(error.message || 'Reject failed', 'error');
    }
  }

  async dispatchSlice(sliceId) {
    try {
      await api.dispatchPipelineSlice(sliceId);
      this.notify(`Dispatched ${sliceId}`, 'success');
      await this.refresh();
    } catch (error) {
      this.notify(error.message || 'Dispatch failed', 'error');
    }
  }

  async cancelSlice(sliceId) {
    try {
      await api.cancelPipelineSlice(sliceId);
      this.notify(`Cancelled ${sliceId}`, 'success');
      await this.refresh();
    } catch (error) {
      this.notify(error.message || 'Cancel failed', 'error');
    }
  }

  statCard(label, value, colorClass) {
    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="text-xs uppercase tracking-wide text-gray-500">${label}</div>
        <div class="text-sm mt-2 ${colorClass}">${this.escapeHtml(String(value))}</div>
      </div>
    `;
  }

  statusColor(status) {
    const colors = (window.MISSION_CONTROL_CONSTANTS && window.MISSION_CONTROL_CONSTANTS.PIPELINE_STATUS_COLORS) || {};
    return colors[status] || 'bg-gray-700';
  }

  notify(message, type) {
    if (window.MissionControlApp && typeof window.MissionControlApp.showNotification === 'function') {
      window.MissionControlApp.showNotification(message, type, 3000);
    }
  }

  loadingState(message) {
    return `<div class="text-gray-400 text-sm">${message}</div>`;
  }

  errorState(message) {
    return `<div class="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-300">${this.escapeHtml(message)}</div>`;
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.PipelineTabInstance = new PipelineTab();
});
