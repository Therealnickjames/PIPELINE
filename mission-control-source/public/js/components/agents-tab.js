// Mission Control v3 - Agents Tab Component
// Detailed agent information and management

class AgentsTab {
  constructor() {
    this.tabName = 'agents';
    this.container = document.getElementById('agents-content');
    this.sortBy = 'name';
    this.filterStatus = 'all';
  }

  async render() {
    if (!this.container) {
      console.error('Agents tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading agent details...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getAgents();
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      
    } catch (error) {
      console.error('Agents refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data || (!Array.isArray(data) && !data.agents)) {
      this.container.innerHTML = '<div class="text-gray-400">No agent data available</div>';
      return;
    }

    const agents = this.sortAndFilterAgents(Array.isArray(data) ? data : data.agents);

    this.container.innerHTML = `
      ${this.renderControls()}
      ${this.renderAgentsGrid(agents)}
    `;

    this.attachEventListeners();
  }

  renderControls() {
    return `
      <div class="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex flex-wrap gap-4 items-center">
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-400">Sort by:</label>
            <select id="agents-sort" class="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm">
              <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>Name</option>
              <option value="status" ${this.sortBy === 'status' ? 'selected' : ''}>Status</option>
              <option value="model" ${this.sortBy === 'model' ? 'selected' : ''}>Model</option>
              <option value="level" ${this.sortBy === 'level' ? 'selected' : ''}>Hierarchy Level</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-400">Filter:</label>
            <select id="agents-filter" class="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm">
              <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>All Agents</option>
              <option value="online" ${this.filterStatus === 'online' ? 'selected' : ''}>Online Only</option>
              <option value="offline" ${this.filterStatus === 'offline' ? 'selected' : ''}>Offline Only</option>
              <option value="unknown" ${this.filterStatus === 'unknown' ? 'selected' : ''}>Unknown Status</option>
            </select>
          </div>
          <button onclick="TabSystem.navigate('hierarchy')" class="btn btn-secondary text-sm">
            <span>🌳</span> View Hierarchy
          </button>
        </div>
      </div>
    `;
  }

  renderAgentsGrid(agents) {
    if (agents.length === 0) {
      return '<div class="text-gray-400 text-center py-8">No agents match the current filters</div>';
    }

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${agents.map(agent => this.renderAgentCard(agent)).join('')}
      </div>
    `;
  }

  renderAgentCard(agent) {
    const statusColor = this.getStatusColor(agent.status);
    const agentColor = TabUtils.getAgentColor(agent.id);
    const lastActive = agent.lastSession ? TabUtils.formatTimestamp(agent.lastSession) : 'Never';

    return `
      <div class="card hover:scale-105 transition-transform">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background-color: ${agentColor}20; color: ${agentColor}">
              ${this.getAgentEmoji(agent.id)}
            </div>
            <div>
              <h3 class="font-semibold" style="color: ${agentColor}">${agent.name}</h3>
              <p class="text-sm text-gray-400">${agent.role || 'Agent'}</p>
            </div>
          </div>
          <span class="status-badge" style="background-color: ${statusColor}">
            ${agent.status}
          </span>
        </div>

        <div class="space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <span class="text-gray-400">Model:</span>
              <div class="font-medium">${this.formatModel(agent.model)}</div>
            </div>
            <div>
              <span class="text-gray-400">Level:</span>
              <div class="font-medium">${agent.level || 'Unknown'}</div>
            </div>
          </div>

          <div>
            <span class="text-gray-400">Workspace:</span>
            <div class="font-mono text-xs text-gray-300 truncate" title="${agent.workspace}">
              ${this.formatWorkspacePath(agent.workspace)}
            </div>
          </div>

          <div>
            <span class="text-gray-400">Last Active:</span>
            <div class="font-medium">${lastActive}</div>
          </div>

          ${agent.toolsAllowed > 0 ? `
            <div>
              <span class="text-gray-400">Tools:</span>
              <div class="font-medium">${agent.toolsAllowed} available</div>
            </div>
          ` : ''}

          ${this.renderWorkspaceHealth(agent)}

          ${agent.canSpawn && agent.canSpawn.length > 0 ? `
            <div>
              <span class="text-gray-400">Can Spawn:</span>
              <div class="flex flex-wrap gap-1 mt-1">
                ${agent.canSpawn.map(target => 
                  `<span class="px-2 py-0.5 bg-gray-700 rounded text-xs">${target}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        ${this.renderAgentActions(agent)}
      </div>
    `;
  }

  renderWorkspaceHealth(agent) {
    // Check workspace health based on wsExists and soulExists
    const isHealthy = agent.wsExists && agent.soulExists;
    
    if (!isHealthy) {
      return `
        <div class="flex items-center gap-2 p-2 bg-red-900/20 border border-red-700 rounded">
          <span class="w-2 h-2 bg-red-500 rounded-full"></span>
          <span class="text-red-400 text-xs">Workspace issues detected</span>
        </div>
      `;
    }

    return `
      <div class="flex items-center gap-2 p-2 bg-green-900/20 border border-green-700 rounded">
        <span class="w-2 h-2 bg-green-500 rounded-full"></span>
        <span class="text-green-400 text-xs">Workspace healthy</span>
      </div>
    `;
  }

  renderAgentActions(agent) {
    return `
      <div class="mt-4 pt-3 border-t border-gray-700">
        <div class="flex gap-2">
          <button onclick="AgentsTab.viewAgentDetails('${agent.id}')" 
                  class="btn btn-secondary text-xs flex-1">
            View Details
          </button>
          ${agent.status === 'offline' ? `
            <button onclick="AgentsTab.diagnoseAgent('${agent.id}')" 
                    class="btn text-xs px-3" style="background-color: ${this.getStatusColor('warning')}">
              Diagnose
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  sortAndFilterAgents(agents) {
    let filtered = agents;

    // Apply status filter
    if (this.filterStatus !== 'all') {
      filtered = filtered.filter(agent => agent.status === this.filterStatus);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'model':
          return (a.model || '').localeCompare(b.model || '');
        case 'level':
          return (a.level || 0) - (b.level || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }

  attachEventListeners() {
    const sortSelect = document.getElementById('agents-sort');
    const filterSelect = document.getElementById('agents-filter');

    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        stateManager.setTabState(this.tabName, { sortBy: this.sortBy });
        this.rerenderWithCurrentData();
      });
    }

    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.filterStatus = e.target.value;
        stateManager.setTabState(this.tabName, { filterStatus: this.filterStatus });
        this.rerenderWithCurrentData();
      });
    }
  }

  rerenderWithCurrentData() {
    const data = stateManager.getTabData(this.tabName);
    if (data) {
      this.renderContent(data);
    }
  }

  getStatusColor(status) {
    return TabUtils.getStatusColor(status);
  }

  getAgentEmoji(agentId) {
    const emojis = {
      main: '👑',
      denny: '📋',
      nexus: '🔍',
      qa: '🔍',
      leaddev: '⚡',
      weblead: '🌐',
      frontend: '🎨',
      backend: '⚙️',
      realtime: '📡',
      graphics: '🖼️'
    };
    return emojis[agentId] || '🤖';
  }

  formatModel(model) {
    if (!model) return 'Unknown';
    
    // Strip common prefixes for cleaner display
    return model
      .replace('anthropic/', '')
      .replace('claude-', '')
      .replace('sonnet-', 'Sonnet ')
      .replace('opus-', 'Opus ')
      .replace('haiku-', 'Haiku ');
  }

  formatWorkspacePath(workspace) {
    if (!workspace) return 'Not configured';
    
    // Shorten path for display
    return workspace.replace(/^\/home\/[^/]+/, '~');
  }

  // Static methods for agent actions
  static async viewAgentDetails(agentId) {
    // This could open a modal or navigate to a detailed view
    console.log(`Viewing details for agent: ${agentId}`);
    
    // For now, just log the agent data
    const data = stateManager.getTabData('agents');
    const agent = data?.agents?.find(a => a.id === agentId);
    if (agent) {
      console.table(agent);
    }
  }

  static async diagnoseAgent(agentId) {
    console.log(`Diagnosing agent: ${agentId}`);
    
    // This could trigger a diagnostic API call
    alert(`Diagnostic tools for ${agentId} would be implemented here`);
  }

  // Component lifecycle methods
  onShow() {
    console.log('Agents tab shown');
    
    // Restore state from storage
    const tabState = stateManager.getTabState(this.tabName);
    if (tabState) {
      this.sortBy = tabState.sortBy || 'name';
      this.filterStatus = tabState.filterStatus || 'all';
    }
  }

  onHide() {
    console.log('Agents tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const agentsTab = new AgentsTab();
  TabSystem.registerComponent('agents', agentsTab);
});