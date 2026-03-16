// Mission Control v3 — Sites Tab
// Views: Dashboard, Directories, Campaigns, Follow-ups
// API base: /api/sites

class SitesTab {
  constructor() {
    this.tabName = 'sites';
    this.container = document.getElementById('sites-content');
    this.currentView = 'dashboard';
    this.currentCampaignId = null;
    this.dirSearch = '';
    this.dirTierFilter = '';
    this.dirHealthFilter = '';
    this.subStatusFilter = '';
    this.followupFilter = 'pending';
    TabSystem.registerComponent(this.tabName, this);
  }

  onShow() {
    this.render();
  }

  async refresh() {
    await this.render();
  }

  async render() {
    if (!this.container) return;
    this.container.innerHTML = this.buildShell();
    this.attachNavListeners();

    switch (this.currentView) {
      case 'dashboard': await this.renderDashboard(); break;
      case 'directories': await this.renderDirectories(); break;
      case 'campaigns': await this.renderCampaigns(); break;
      case 'followups': await this.renderFollowups(); break;
    }
  }

  buildShell() {
    const views = [
      { id: 'dashboard', label: '📊 Dashboard' },
      { id: 'directories', label: '📁 Directories' },
      { id: 'campaigns', label: '🚀 Campaigns' },
      { id: 'followups', label: '📅 Follow-ups' },
    ];
    return `
      <div class="mb-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-semibold text-white">Site Manager</h2>
            <p class="text-gray-400 text-sm mt-1">Directory submissions &amp; campaign tracking</p>
          </div>
          <button onclick="window.SitesTabInstance.refresh()" class="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm transition-colors">
            ↻ Refresh
          </button>
        </div>
        <div class="flex border-b border-gray-700 mb-6">
          ${views.map(v => `
            <button id="sites-nav-${v.id}"
              onclick="window.SitesTabInstance.switchView('${v.id}')"
              class="sites-view-btn px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${this.currentView === v.id ? 'border-claw-500 text-claw-400' : 'border-transparent text-gray-400 hover:text-gray-200'}">
              ${v.label}
            </button>
          `).join('')}
        </div>
      </div>
      <div id="sites-view-content">
        <div class="text-gray-400 text-center py-12">Loading...</div>
      </div>
    `;
  }

  attachNavListeners() {
    // Already using onclick, no extra listeners needed
  }

  switchView(view) {
    this.currentView = view;
    this.render();
  }

  async api(path) {
    try {
      const r = await fetch(`/api/sites${path}`);
      if (!r.ok) throw new Error(`API error ${r.status}: ${await r.text()}`);
      return await r.json();
    } catch (err) {
      return { error: err.message };
    }
  }

  async apiPut(path, body) {
    const r = await fetch(`/api/sites${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  }

  getViewEl() {
    return document.getElementById('sites-view-content');
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  async renderDashboard() {
    const el = this.getViewEl();
    el.innerHTML = '<div class="text-gray-400 text-sm">Loading stats...</div>';

    const data = await this.api('/stats');
    if (data.error) {
      el.innerHTML = this.errorBox(data.error);
      return;
    }

    const statusColors = {
      queued: '#6b7280',
      in_progress: '#3b82f6',
      submitted: '#8b5cf6',
      pending_review: '#f59e0b',
      approved: '#10b981',
      rejected: '#ef4444',
      dead: '#374151',
      needs_account: '#f97316',
      needs_captcha: '#ec4899',
      blocked: '#dc2626',
      paid_only: '#eab308',
      skipped: '#6b7280',
    };

    const byStatus = data.by_status || {};
    const statusEntries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
    const total = data.total_submissions || 1;

    const donutSegments = this.buildDonut(statusEntries, total, statusColors);

    el.innerHTML = `
      <!-- Stat Cards Row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${this.statCard('📁', 'Directories', data.directories?.toLocaleString() || '0', 'text-blue-400')}
        ${this.statCard('🚀', 'Active Campaigns', data.active_campaigns || 0, 'text-purple-400')}
        ${this.statCard('✅', 'Approval Rate', `${data.approval_rate || 0}%`, 'text-green-400')}
        ${this.statCard('📅', 'Follow-ups Due', `${(data.followups_overdue || 0)} overdue`, data.followups_overdue > 0 ? 'text-red-400' : 'text-gray-400')}
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <!-- Donut Chart -->
        <div class="bg-gray-800 rounded-lg p-5 border border-gray-700">
          <h3 class="text-sm font-semibold text-gray-300 mb-4">Submissions by Status</h3>
          <div class="flex items-center gap-6">
            <div class="relative" style="width:120px;height:120px;flex-shrink:0;">
              <svg viewBox="0 0 42 42" width="120" height="120">
                ${donutSegments}
                <text x="21" y="22" text-anchor="middle" font-size="6" fill="#f3f4f6" font-weight="bold">${total}</text>
                <text x="21" y="27" text-anchor="middle" font-size="3.5" fill="#9ca3af">total</text>
              </svg>
            </div>
            <div class="flex flex-col gap-1.5 min-w-0">
              ${statusEntries.slice(0, 8).map(([status, count]) => `
                <div class="flex items-center gap-2 text-xs">
                  <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:${statusColors[status] || '#6b7280'}"></span>
                  <span class="text-gray-300 capitalize truncate">${status.replace(/_/g, ' ')}</span>
                  <span class="text-gray-500 ml-auto">${count}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Follow-ups Summary -->
        <div class="bg-gray-800 rounded-lg p-5 border border-gray-700">
          <h3 class="text-sm font-semibold text-gray-300 mb-4">Follow-up Queue</h3>
          <div class="space-y-3">
            ${this.followupCard('🔴 Overdue', data.followups_overdue || 0, 'text-red-400', 'overdue')}
            ${this.followupCard('🟡 Due this week', data.followups_this_week || 0, 'text-yellow-400', 'week')}
          </div>
          <div class="mt-4 pt-4 border-t border-gray-700">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Submission rate</span>
              <span class="text-white font-medium">${data.submission_rate || 0}%</span>
            </div>
            <div class="mt-1 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div class="bg-purple-500 h-2 rounded-full transition-all" style="width:${data.submission_rate || 0}%"></div>
            </div>
          </div>
          <button onclick="window.SitesTabInstance.switchView('followups')"
            class="mt-4 w-full text-xs text-center text-claw-400 hover:text-claw-300 py-1">
            View all follow-ups →
          </button>
        </div>
      </div>

      <!-- Quick nav -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${this.quickNavCard('📁', 'Directories', `${data.directories || 0} tracked`, 'directories')}
        ${this.quickNavCard('🚀', 'Campaigns', `${data.active_campaigns || 0} active`, 'campaigns')}
        ${this.quickNavCard('📅', 'Follow-ups', `${(data.followups_overdue || 0)} need action`, 'followups')}
      </div>
    `;
  }

  buildDonut(entries, total, colors) {
    if (total === 0 || entries.length === 0) {
      return `<circle cx="21" cy="21" r="15.915" fill="none" stroke="#374151" stroke-width="6"/>`;
    }

    const cx = 21, cy = 21, r = 15.915;
    const circumference = 2 * Math.PI * r;
    let segments = '';
    let offset = 0;
    const gap = 0.5;

    for (const [status, count] of entries) {
      const pct = count / total;
      const dash = Math.max(0, (pct * circumference) - gap);
      const color = colors[status] || '#6b7280';
      segments += `
        <circle cx="${cx}" cy="${cy}" r="${r}"
          fill="none" stroke="${color}" stroke-width="6"
          stroke-dasharray="${dash} ${circumference - dash}"
          stroke-dashoffset="${-offset * circumference}"
          transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += pct;
    }

    return segments;
  }

  statCard(icon, label, value, colorClass) {
    return `
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-2xl mb-1">${icon}</div>
        <div class="text-xl font-bold ${colorClass}">${value}</div>
        <div class="text-xs text-gray-400 mt-1">${label}</div>
      </div>
    `;
  }

  followupCard(label, count, colorClass, filter) {
    return `
      <div class="flex items-center justify-between cursor-pointer hover:bg-gray-750 rounded px-1 py-0.5"
        onclick="window.SitesTabInstance.switchViewFollowup('${filter}')">
        <span class="text-sm text-gray-300">${label}</span>
        <span class="font-bold ${colorClass}">${count}</span>
      </div>
    `;
  }

  quickNavCard(icon, label, sub, view) {
    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-500 transition-colors"
        onclick="window.SitesTabInstance.switchView('${view}')">
        <div class="text-xl mb-1">${icon}</div>
        <div class="text-sm font-medium text-white">${label}</div>
        <div class="text-xs text-gray-400 mt-1">${sub}</div>
      </div>
    `;
  }

  switchViewFollowup(filter) {
    this.followupFilter = filter;
    this.switchView('followups');
  }

  // ── Directories ─────────────────────────────────────────────────────────────
  async renderDirectories() {
    const el = this.getViewEl();
    el.innerHTML = `
      <div class="flex flex-wrap gap-3 mb-4">
        <input type="text" id="dir-search" placeholder="Search name or URL..."
          value="${this.dirSearch}"
          class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-claw-500 w-56"
          oninput="window.SitesTabInstance.onDirSearch(this.value)"/>
        <select id="dir-tier" onchange="window.SitesTabInstance.onDirTierFilter(this.value)"
          class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="">All tiers</option>
          <option value="1" ${this.dirTierFilter === '1' ? 'selected' : ''}>Tier 1 (Priority)</option>
          <option value="2" ${this.dirTierFilter === '2' ? 'selected' : ''}>Tier 2 (Standard)</option>
          <option value="3" ${this.dirTierFilter === '3' ? 'selected' : ''}>Tier 3 (Low)</option>
        </select>
        <select id="dir-health" onchange="window.SitesTabInstance.onDirHealthFilter(this.value)"
          class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="">All health</option>
          <option value="alive" ${this.dirHealthFilter === 'alive' ? 'selected' : ''}>Alive</option>
          <option value="dead" ${this.dirHealthFilter === 'dead' ? 'selected' : ''}>Dead</option>
          <option value="unknown" ${this.dirHealthFilter === 'unknown' ? 'selected' : ''}>Unknown</option>
        </select>
        <span id="dir-count" class="text-gray-400 text-sm self-center"></span>
      </div>
      <div id="dir-table-container">
        <div class="text-gray-400 text-sm">Loading...</div>
      </div>
    `;

    await this.loadDirectoriesTable();
  }

  async loadDirectoriesTable() {
    const params = new URLSearchParams({ limit: 100, offset: 0 });
    if (this.dirSearch) params.set('search', this.dirSearch);
    if (this.dirTierFilter) params.set('tier', this.dirTierFilter);
    if (this.dirHealthFilter) params.set('health', this.dirHealthFilter);

    const data = await this.api(`/directories?${params}`);
    const el = document.getElementById('dir-table-container');
    const countEl = document.getElementById('dir-count');
    if (!el) return;

    if (data.error) { el.innerHTML = this.errorBox(data.error); return; }
    if (countEl) countEl.textContent = `${data.rows.length} of ${data.total}`;

    const healthBadge = (h) => {
      const map = { alive: 'bg-green-900 text-green-300', dead: 'bg-red-900 text-red-300', unknown: 'bg-gray-700 text-gray-400', parked: 'bg-yellow-900 text-yellow-300', hijacked: 'bg-red-800 text-red-200' };
      return `<span class="text-xs px-1.5 py-0.5 rounded ${map[h] || 'bg-gray-700 text-gray-400'}">${h}</span>`;
    };
    const tierBadge = (t) => {
      const c = t === 1 ? 'bg-claw-900 text-claw-400' : t === 2 ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-400';
      return `<span class="text-xs px-1.5 py-0.5 rounded ${c}">T${t}</span>`;
    };

    el.innerHTML = `
      <div class="overflow-x-auto rounded-lg border border-gray-700">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 bg-gray-800 border-b border-gray-700">
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">URL</th>
              <th class="px-4 py-3">DR</th>
              <th class="px-4 py-3">Tier</th>
              <th class="px-4 py-3">Health</th>
              <th class="px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700/50">
            ${data.rows.map(d => `
              <tr class="hover:bg-gray-750 transition-colors">
                <td class="px-4 py-2.5 text-white font-medium max-w-xs truncate">${this.esc(d.name)}</td>
                <td class="px-4 py-2.5">
                  <a href="${this.esc(d.url)}" target="_blank" class="text-blue-400 hover:text-blue-300 text-xs truncate block max-w-[200px]">${this.esc(d.url)}</a>
                </td>
                <td class="px-4 py-2.5 text-gray-300 text-xs">${d.domain_rating ? `DR${d.domain_rating}` : '—'}</td>
                <td class="px-4 py-2.5">${tierBadge(d.tier)}</td>
                <td class="px-4 py-2.5">${healthBadge(d.health_status)}</td>
                <td class="px-4 py-2.5">
                  <div class="flex gap-1 flex-wrap">
                    ${d.requires_account ? '<span class="text-xs bg-orange-900 text-orange-300 px-1 rounded">acct</span>' : ''}
                    ${d.requires_backlink ? '<span class="text-xs bg-yellow-900 text-yellow-300 px-1 rounded">bkl</span>' : ''}
                    ${d.paid_only ? '<span class="text-xs bg-red-900 text-red-300 px-1 rounded">paid</span>' : ''}
                    ${d.captcha_type ? `<span class="text-xs bg-purple-900 text-purple-300 px-1 rounded">${d.captcha_type}</span>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${data.total > 100 ? `<p class="text-xs text-gray-500 mt-2">Showing 100 of ${data.total}. Use search/filter to narrow results.</p>` : ''}
    `;
  }

  onDirSearch(v) {
    this.dirSearch = v;
    clearTimeout(this._dirSearchTimer);
    this._dirSearchTimer = setTimeout(() => this.loadDirectoriesTable(), 300);
  }

  onDirTierFilter(v) { this.dirTierFilter = v; this.loadDirectoriesTable(); }
  onDirHealthFilter(v) { this.dirHealthFilter = v; this.loadDirectoriesTable(); }

  // ── Campaigns ───────────────────────────────────────────────────────────────
  async renderCampaigns() {
    const el = this.getViewEl();

    if (this.currentCampaignId) {
      await this.renderCampaignDetail(this.currentCampaignId);
      return;
    }

    el.innerHTML = '<div class="text-gray-400 text-sm">Loading campaigns...</div>';
    const data = await this.api('/campaigns');
    if (data.error) { el.innerHTML = this.errorBox(data.error); return; }

    const statusBadge = (s) => {
      const map = { active: 'bg-green-900 text-green-300', paused: 'bg-yellow-900 text-yellow-300', complete: 'bg-gray-700 text-gray-300' };
      return `<span class="text-xs px-1.5 py-0.5 rounded ${map[s] || 'bg-gray-700 text-gray-400'}">${s}</span>`;
    };

    el.innerHTML = `
      <div class="space-y-3">
        ${data.rows.length === 0 ? '<p class="text-gray-400">No campaigns yet.</p>' : data.rows.map(c => {
          const submitPct = c.total > 0 ? Math.round(c.submitted / c.total * 100) : 0;
          const approvePct = c.total > 0 ? Math.round(c.approved / c.total * 100) : 0;
          return `
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-500 transition-colors"
            onclick="window.SitesTabInstance.openCampaign(${c.id})">
            <div class="flex items-start justify-between mb-2">
              <div>
                <div class="text-white font-medium">${this.esc(c.name)}</div>
                <div class="text-xs text-gray-400 mt-0.5">${this.esc(c.product_name)} · ${new Date(c.created_at).toLocaleDateString()}</div>
              </div>
              ${statusBadge(c.status)}
            </div>
            <div class="grid grid-cols-3 gap-3 mt-3 text-center">
              <div><div class="text-lg font-bold text-white">${c.total}</div><div class="text-xs text-gray-400">Total</div></div>
              <div><div class="text-lg font-bold text-purple-400">${submitPct}%</div><div class="text-xs text-gray-400">Submitted</div></div>
              <div><div class="text-lg font-bold text-green-400">${approvePct}%</div><div class="text-xs text-gray-400">Approved</div></div>
            </div>
            <div class="mt-3 bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div class="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-green-500" style="width:${submitPct}%"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  openCampaign(id) {
    this.currentCampaignId = id;
    this.subStatusFilter = '';
    this.renderCampaigns();
  }

  async renderCampaignDetail(campaignId) {
    const el = this.getViewEl();
    el.innerHTML = '<div class="text-gray-400 text-sm">Loading campaign...</div>';

    const [detail, subsData] = await Promise.all([
      this.api(`/campaigns/${campaignId}`),
      this.api(`/submissions?campaign=${campaignId}&limit=300`)
    ]);

    if (detail.error) { el.innerHTML = this.errorBox(detail.error); return; }

    const statusFilters = ['', 'queued', 'submitted', 'pending_review', 'approved', 'needs_account', 'dead', 'blocked', 'paid_only'];
    const statusColors = {
      queued: 'bg-gray-700 text-gray-300',
      submitted: 'bg-purple-900 text-purple-300',
      pending_review: 'bg-yellow-900 text-yellow-300',
      approved: 'bg-green-900 text-green-300',
      rejected: 'bg-red-900 text-red-300',
      dead: 'bg-gray-800 text-gray-500',
      needs_account: 'bg-orange-900 text-orange-300',
      needs_captcha: 'bg-pink-900 text-pink-300',
      blocked: 'bg-red-900 text-red-400',
      paid_only: 'bg-yellow-900 text-yellow-300',
      skipped: 'bg-gray-700 text-gray-500',
      in_progress: 'bg-blue-900 text-blue-300',
    };

    const allSubs = subsData.rows || [];
    const filtered = this.subStatusFilter
      ? allSubs.filter(s => s.status === this.subStatusFilter)
      : allSubs;

    const statusBadge = (s) => `<span class="text-xs px-1.5 py-0.5 rounded ${statusColors[s] || 'bg-gray-700 text-gray-300'}">${s.replace(/_/g, ' ')}</span>`;

    el.innerHTML = `
      <div class="mb-4 flex items-center gap-3">
        <button onclick="window.SitesTabInstance.closeCampaign()" class="text-gray-400 hover:text-white text-sm">← Back</button>
        <div>
          <h3 class="text-lg font-semibold text-white">${this.esc(detail.campaign.name)}</h3>
          <p class="text-xs text-gray-400">${detail.campaign.product_name} · ${detail.total} directories · ${detail.approval_rate}% approval rate</p>
        </div>
      </div>

      <!-- Status filter tabs -->
      <div class="flex flex-wrap gap-2 mb-4">
        ${statusFilters.map(s => {
          const label = s ? s.replace(/_/g, ' ') : 'All';
          const count = s ? (detail.stats[s] || 0) : detail.total;
          const active = this.subStatusFilter === s;
          return `
            <button onclick="window.SitesTabInstance.filterSubs('${s}')"
              class="text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'border-claw-500 text-claw-400 bg-claw-900/30' : 'border-gray-700 text-gray-400 hover:border-gray-500'}">
              ${label} (${count})
            </button>`;
        }).join('')}
      </div>

      <!-- Submissions table -->
      <div class="overflow-x-auto rounded-lg border border-gray-700">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 bg-gray-800 border-b border-gray-700">
              <th class="px-4 py-3">Directory</th>
              <th class="px-4 py-3">DR</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Submitted</th>
              <th class="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-700/50">
            ${filtered.length === 0 ? `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">No submissions match filter</td></tr>` :
              filtered.map(s => `
                <tr class="hover:bg-gray-750 transition-colors" id="sub-row-${s.id}">
                  <td class="px-4 py-2.5">
                    <div class="text-white text-xs font-medium">${this.esc(s.dir_name)}</div>
                    <a href="${this.esc(s.dir_url)}" target="_blank" class="text-gray-500 text-xs hover:text-blue-400">${this.esc(s.dir_url)}</a>
                  </td>
                  <td class="px-4 py-2.5 text-gray-400 text-xs">${s.domain_rating ? `DR${s.domain_rating}` : '—'}</td>
                  <td class="px-4 py-2.5">${statusBadge(s.status)}</td>
                  <td class="px-4 py-2.5 text-gray-400 text-xs">${s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—'}</td>
                  <td class="px-4 py-2.5">
                    <select onchange="window.SitesTabInstance.updateSubStatus(${s.id}, this.value)"
                      class="bg-gray-700 border border-gray-600 rounded text-xs px-2 py-1 text-gray-300 cursor-pointer">
                      ${['queued','in_progress','submitted','pending_review','approved','rejected','dead','needs_account','needs_captcha','blocked','paid_only','skipped']
                        .map(opt => `<option value="${opt}" ${s.status === opt ? 'selected' : ''}>${opt.replace(/_/g, ' ')}</option>`).join('')}
                    </select>
                    ${s.listing_url ? `<a href="${this.esc(s.listing_url)}" target="_blank" class="ml-2 text-xs text-green-400 hover:text-green-300">↗ Live</a>` : ''}
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  closeCampaign() {
    this.currentCampaignId = null;
    this.renderCampaigns();
  }

  filterSubs(status) {
    this.subStatusFilter = status;
    this.renderCampaignDetail(this.currentCampaignId);
  }

  async updateSubStatus(id, status) {
    const result = await this.apiPut(`/submissions/${id}`, { status });
    if (result.error) {
      alert(`Error updating: ${result.error}`);
    } else {
      // Refresh the row badge
      const row = document.getElementById(`sub-row-${id}`);
      if (row) {
        const badge = row.querySelector('td:nth-child(3)');
        if (badge) {
          const statusColors = {
            queued: 'bg-gray-700 text-gray-300',
            submitted: 'bg-purple-900 text-purple-300',
            pending_review: 'bg-yellow-900 text-yellow-300',
            approved: 'bg-green-900 text-green-300',
            rejected: 'bg-red-900 text-red-300',
            dead: 'bg-gray-800 text-gray-500',
            needs_account: 'bg-orange-900 text-orange-300',
          };
          const cls = statusColors[status] || 'bg-gray-700 text-gray-300';
          badge.innerHTML = `<span class="text-xs px-1.5 py-0.5 rounded ${cls}">${status.replace(/_/g, ' ')}</span>`;
        }
      }
    }
  }

  // ── Follow-ups ──────────────────────────────────────────────────────────────
  async renderFollowups() {
    const el = this.getViewEl();
    el.innerHTML = '<div class="text-gray-400 text-sm">Loading follow-ups...</div>';

    const data = await this.api(`/followups?filter=${this.followupFilter}`);
    if (data.error) { el.innerHTML = this.errorBox(data.error); return; }

    const filters = [
      { id: 'pending', label: '📋 All Pending' },
      { id: 'overdue', label: '🔴 Overdue' },
      { id: 'today', label: '🟡 Due Today' },
      { id: 'week', label: '📅 This Week' },
    ];

    const urgencyStyle = (u) => ({
      overdue: 'border-l-red-500 bg-red-950/20',
      today: 'border-l-yellow-500 bg-yellow-950/20',
      upcoming: 'border-l-gray-600 bg-gray-800',
    }[u] || 'border-l-gray-600 bg-gray-800');

    const typeIcon = (t) => ({
      check_approval: '🔍',
      verify_email: '📧',
      add_backlink: '🔗',
      resubmit: '🔄',
    }[t] || '📌');

    el.innerHTML = `
      <!-- Filter buttons -->
      <div class="flex gap-2 mb-5">
        ${filters.map(f => `
          <button onclick="window.SitesTabInstance.switchFollowupFilter('${f.id}')"
            class="text-xs px-3 py-1.5 rounded-full border transition-colors ${this.followupFilter === f.id ? 'border-claw-500 text-claw-400 bg-claw-900/30' : 'border-gray-700 text-gray-400 hover:border-gray-500'}">
            ${f.label}
          </button>`).join('')}
        <span class="text-gray-500 text-xs self-center ml-auto">${data.rows.length} items</span>
      </div>

      <!-- Follow-up list -->
      <div class="space-y-2">
        ${data.rows.length === 0 ? `
          <div class="text-center py-12 text-gray-500">
            <div class="text-3xl mb-2">🎉</div>
            <div>No pending follow-ups!</div>
          </div>` :
          data.rows.map(f => `
            <div class="border-l-4 ${urgencyStyle(f.urgency)} rounded-r-lg p-4 flex items-start justify-between gap-4" id="fu-${f.id}">
              <div class="min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-base">${typeIcon(f.type)}</span>
                  <span class="text-white text-sm font-medium">${this.esc(f.dir_name)}</span>
                  <span class="text-xs text-gray-500">${f.type.replace(/_/g, ' ')}</span>
                </div>
                <div class="text-xs text-gray-400">${this.esc(f.campaign_name)}</div>
                ${f.notes ? `<div class="text-xs text-gray-400 mt-1 italic">${this.esc(f.notes)}</div>` : ''}
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <div class="text-right">
                  <div class="text-xs font-medium ${f.urgency === 'overdue' ? 'text-red-400' : f.urgency === 'today' ? 'text-yellow-400' : 'text-gray-400'}">${f.due_date}</div>
                  <div class="text-xs text-gray-500">${f.urgency}</div>
                </div>
                <button onclick="window.SitesTabInstance.completeFollowup(${f.id})"
                  class="bg-gray-700 hover:bg-green-800 text-white text-xs px-3 py-1.5 rounded transition-colors">
                  Done
                </button>
              </div>
            </div>
          `).join('')}
      </div>
    `;
  }

  switchFollowupFilter(f) {
    this.followupFilter = f;
    this.renderFollowups();
  }

  async completeFollowup(id) {
    const result = await this.apiPut(`/followups/${id}/complete`, {});
    if (result.error) {
      alert(`Error: ${result.error}`);
    } else {
      const el = document.getElementById(`fu-${id}`);
      if (el) {
        el.style.opacity = '0.4';
        el.style.pointerEvents = 'none';
        setTimeout(() => el.remove(), 600);
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  errorBox(msg) {
    return `
      <div class="bg-red-950/30 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
        <strong>Error:</strong> ${this.esc(msg)}
        <div class="mt-2 text-xs text-red-400">Is the sites.db initialized? Run: <code>node tools/site-manager.js init && node tools/migrate-submissions.js</code></div>
      </div>
    `;
  }
}

// ── Initialize ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.SitesTabInstance = new SitesTab();
});
