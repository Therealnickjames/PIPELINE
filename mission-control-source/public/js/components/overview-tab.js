// Mission Control v3 - Overview Tab Component
// System health summary with real-time updates

class OverviewTab {
  constructor() {
    this.tabName = 'overview';
    this.container = document.getElementById('overview-content');
    this.lastUpdate = null;
  }

  async render() {
    if (!this.container) {
      console.error('Overview tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading system overview...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getOverviewData();
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      this.updateLastUpdateTime();
      
    } catch (error) {
      console.error('Overview refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data) return;

    this.container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        ${this.renderGatewayCard(data.gateway)}
        ${this.renderAgentSummaryCard(data.agents)}
        ${this.renderTaskSummaryCard(data.tasks)}
        ${this.renderSystemHealthCard(data.health)}
        ${this.renderQuickStats(data)}
        ${this.renderCostTrackingCard(data)}
        ${this.renderRecentActivity(data.tasks)}
      </div>
    `;
  }

  renderGatewayCard(gateway) {
    if (gateway.error) {
      return `
        <div class="card">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>⚡</span> Gateway
            <span class="text-red-400 text-sm font-normal">Error</span>
          </h3>
          <div class="text-red-400 text-sm">${gateway.error}</div>
        </div>
      `;
    }

    const uptime = gateway.uptime_formatted || 'Unknown';
    const version = gateway.version || 'Unknown';
    const status = gateway.status === 'online' ? 'Online' : 'Offline';
    const statusColor = gateway.status === 'online' ? 'text-green-400' : 'text-red-400';

    return `
      <div class="card">
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>⚡</span> Gateway
          <span class="${statusColor} text-sm font-normal">${status}</span>
        </h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Version:</span>
            <span class="text-claw-500">${version}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Uptime:</span>
            <span>${uptime}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">PID:</span>
            <span>${gateway.pid || 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderAgentSummaryCard(agents) {
    if (agents.error) {
      return `
        <div class="card">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>🤖</span> Agents
            <span class="text-red-400 text-sm font-normal">Error</span>
          </h3>
          <div class="text-red-400 text-sm">${agents.error}</div>
        </div>
      `;
    }

    const agentsList = Array.isArray(agents) ? agents : (agents.agents || []);
    const totalAgents = agentsList.length;
    const onlineAgents = agentsList.filter(a => a.status === 'online').length;
    const offlineAgents = agentsList.filter(a => a.status === 'offline').length;

    return `
      <div class="card">
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🤖</span> Agents
          <span class="text-gray-400 text-sm font-normal">${totalAgents} Total</span>
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-green-400 flex items-center gap-2">
              <span class="w-2 h-2 bg-green-400 rounded-full"></span>
              Online
            </span>
            <span class="font-medium">${onlineAgents}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-red-400 flex items-center gap-2">
              <span class="w-2 h-2 bg-red-400 rounded-full"></span>
              Offline
            </span>
            <span class="font-medium">${offlineAgents}</span>
          </div>
          <div class="mt-4">
            <button onclick="TabSystem.navigate('agents')" class="btn btn-secondary w-full text-sm">
              View Details
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderTaskSummaryCard(tasks) {
    if (tasks.error) {
      return `
        <div class="card">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>📋</span> Tasks
            <span class="text-red-400 text-sm font-normal">Error</span>
          </h3>
          <div class="text-red-400 text-sm">${tasks.error}</div>
        </div>
      `;
    }

    const activeTasks = tasks.active_tasks || [];
    const plans = tasks.plans || [];
    
    const totalActiveTasks = activeTasks.length;
    const blockedTasks = activeTasks.filter(t => t.status === 'blocked').length;
    const activePlans = plans.filter(p => p.status === 'active').length;

    return `
      <div class="card">
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📋</span> Tasks
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-blue-400">Active Tasks</span>
            <span class="font-medium">${totalActiveTasks}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-red-400">Blocked</span>
            <span class="font-medium">${blockedTasks}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-green-400">Active Plans</span>
            <span class="font-medium">${activePlans}</span>
          </div>
          <div class="mt-4">
            <button onclick="TabSystem.navigate('projects')" class="btn btn-secondary w-full text-sm">
              View Projects
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderSystemHealthCard(health) {
    if (health.error) {
      return `
        <div class="card">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>❤️</span> System Health
            <span class="text-red-400 text-sm font-normal">Error</span>
          </h3>
          <div class="text-red-400 text-sm">${health.error}</div>
        </div>
      `;
    }

    const healthChecks = health.checks || {};
    const overallStatus = health.overall_status || 'unknown';
    const statusColor = overallStatus === 'healthy' ? 'text-green-400' : 
                       overallStatus === 'warning' ? 'text-yellow-400' : 'text-red-400';

    return `
      <div class="card">
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>❤️</span> System Health
          <span class="${statusColor} text-sm font-normal capitalize">${overallStatus}</span>
        </h3>
        <div class="space-y-2 text-sm">
          ${Object.entries(healthChecks).map(([check, status]) => `
            <div class="flex justify-between items-center">
              <span class="text-gray-400">${this.formatCheckName(check)}:</span>
              <span class="${status === 'pass' ? 'text-green-400' : 'text-red-400'}">${status}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderQuickStats(data) {
    const stats = this.calculateQuickStats(data);
    
    return `
      <div class="card lg:col-span-2 xl:col-span-1">
        <h3 class="text-lg font-semibold mb-4">Quick Stats</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-claw-500">${stats.totalAgents}</div>
            <div class="text-xs text-gray-400">Total Agents</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-400">${stats.activeTasks}</div>
            <div class="text-xs text-gray-400">Active Tasks</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-400">${stats.completedToday}</div>
            <div class="text-xs text-gray-400">Done Today</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-400">${stats.uptime}</div>
            <div class="text-xs text-gray-400">Uptime</div>
          </div>
        </div>
      </div>
    `;
  }

  renderRecentActivity(tasks) {
    if (tasks.error || !tasks.log) {
      return `
        <div class="card lg:col-span-2 xl:col-span-2">
          <h3 class="text-lg font-semibold mb-4">Recent Activity</h3>
          <div class="text-gray-400 text-sm">No recent activity available</div>
        </div>
      `;
    }

    const recentLogs = (tasks.recent_log || tasks.log || []).slice(0, 5);

    return `
      <div class="card lg:col-span-2 xl:col-span-2">
        <h3 class="text-lg font-semibold mb-4">Recent Activity</h3>
        <div class="space-y-3">
          ${recentLogs.map(log => `
            <div class="flex items-start gap-3 p-2 rounded bg-gray-700/30">
              <span class="text-xs text-gray-400 mt-0.5 w-16 flex-shrink-0">${TabUtils.formatTimestamp(log.timestamp)}</span>
              <div class="flex-1 text-sm">
                ${TabUtils.createAgentBadge(log.agent)} 
                <span class="text-gray-300">${this.formatLogMessage(log)}</span>
              </div>
            </div>
          `).join('')}
          <div class="pt-2">
            <button onclick="TabSystem.navigate('feed')" class="btn btn-secondary w-full text-sm">
              View Live Feed
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderCostTrackingCard(data) {
    // Pull cost data from tasks/sessions if available
    const tasks = data.tasks || {};
    const activeTasks = tasks.active_tasks || [];
    const totalTasks = activeTasks.filter(t =>
      t.status === 'active' || t.status === 'done' || t.status === 'review'
    ).length;
    const agentsList = Array.isArray(data.agents) ? data.agents : (data.agents?.agents || []);
    const activeAgents = agentsList.filter(a => a.status === 'online').length;

    return `
      <div class="card" style="background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:14px; padding:20px;">
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>💰</span> Cost Tracking
        </h3>
        <div class="space-y-3 text-sm">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Today's tasks</span>
            <span style="color:#FFD000; font-weight:600;">${totalTasks}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Active agents</span>
            <span>${activeAgents}</span>
          </div>
          <div style="height:1px; background:var(--border-primary); margin:8px 0;"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--text-secondary);">Est. session cost</span>
            <span style="color:#FFD000; font-weight:600;">
              $${((totalTasks * 0.04) + (activeAgents * 0.02)).toFixed(2)}
            </span>
          </div>
          <div style="margin-top:8px;">
            <a href="#" onclick="TabSystem.navigate('performance'); return false;"
               style="font-size:12px; color:#FFD000; opacity:.8;">
              View full cost report →
            </a>
          </div>
        </div>
      </div>
    `;
  }

  calculateQuickStats(data) {
    const agents = Array.isArray(data.agents) ? data.agents : (data.agents?.agents || []);
    const tasks = data.tasks?.active_tasks || [];
    const gateway = data.gateway || {};

    // Count completed tasks today (simplified)
    const today = new Date().toDateString();
    const completedToday = tasks.filter(t => 
      t.status === 'done' && new Date(t.updated).toDateString() === today
    ).length;

    return {
      totalAgents: agents.length,
      activeTasks: tasks.filter(t => t.status === 'active').length,
      completedToday,
      uptime: this.formatUptime(gateway.uptime_seconds)
    };
  }

  formatCheckName(checkName) {
    return checkName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatLogMessage(log) {
    switch (log.action) {
      case 'task_created':
        return `created task "${log.task_title}"`;
      case 'task_completed':
        return `completed task "${log.task_title}"`;
      case 'task_updated':
        return `updated task "${log.task_title}"`;
      default:
        return log.message || 'performed an action';
    }
  }

  formatUptime(seconds) {
    if (!seconds) return '0s';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(seconds / 60)}m`;
  }

  updateLastUpdateTime() {
    this.lastUpdate = new Date();
    const timeElement = document.getElementById('last-update');
    if (timeElement) {
      timeElement.textContent = `Updated ${this.lastUpdate.toLocaleTimeString()}`;
    }
  }

  // Component lifecycle methods
  onShow() {
    console.log('Overview tab shown');
  }

  onHide() {
    console.log('Overview tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const overviewTab = new OverviewTab();
  TabSystem.registerComponent('overview', overviewTab);
  
  // Auto-render when component loads
  if (TabSystem.isActiveTab('overview')) {
    overviewTab.render();
  }
});