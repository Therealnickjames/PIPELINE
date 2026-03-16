// Mission Control v3 - Hierarchy Tab Component
// Interactive organization chart (Graphics Dev integration)

class HierarchyTab {
  constructor() {
    this.tabName = 'hierarchy';
    this.container = document.getElementById('hierarchy-content');
    this.chartContainer = null;
  }

  async render() {
    if (!this.container) {
      console.error('Hierarchy tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading organization hierarchy...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getHierarchy();
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      
    } catch (error) {
      console.error('Hierarchy refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data) return;

    this.container.innerHTML = `
      <div class="space-y-6">
        ${this.renderHierarchyInfo(data)}
        ${this.renderHierarchyChart(data)}
        ${this.renderNodeDetails(data)}
      </div>
    `;

    this.chartContainer = document.getElementById('hierarchy-chart-container');
    this.initializeChart(data);
  }

  renderHierarchyInfo(data) {
    const totalNodes = Object.keys(data.nodes).length;
    const maxDepth = data.max_depth;
    const onlineNodes = Object.values(data.nodes).filter(n => n.status === 'online').length;
    
    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 class="text-lg font-semibold mb-4">Hierarchy Overview</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-claw-500">${totalNodes}</div>
            <div class="text-sm text-gray-400">Total Agents</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-400">${onlineNodes}</div>
            <div class="text-sm text-gray-400">Online</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-400">${maxDepth}</div>
            <div class="text-sm text-gray-400">Hierarchy Depth</div>
          </div>
        </div>
      </div>
    `;
  }

  renderHierarchyChart(data) {
    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Organization Chart</h3>
          <div class="flex gap-2">
            <button onclick="HierarchyTab.zoomIn()" class="btn btn-secondary text-sm">
              Zoom In
            </button>
            <button onclick="HierarchyTab.zoomOut()" class="btn btn-secondary text-sm">
              Zoom Out
            </button>
            <button onclick="HierarchyTab.resetZoom()" class="btn btn-secondary text-sm">
              Reset
            </button>
          </div>
        </div>
        <div id="hierarchy-chart-container" class="w-full h-96 border border-gray-700 rounded bg-gray-900 relative overflow-hidden">
          <!-- Graphics Dev: SVG hierarchy chart will be rendered here -->
          <div class="absolute inset-0 flex items-center justify-center text-gray-500">
            <div class="text-center">
              <div class="text-lg mb-2">🌳</div>
              <div>Interactive hierarchy chart will be rendered here by Graphics Dev</div>
              <div class="text-sm mt-2 text-gray-400">
                Container ID: hierarchy-chart-container
              </div>
            </div>
          </div>
        </div>
        <div class="mt-4 text-xs text-gray-500">
          Click nodes to view details • Drag to pan • Scroll to zoom
        </div>
      </div>
    `;
  }

  renderNodeDetails(data) {
    const nodesByLevel = this.groupNodesByLevel(data.nodes);
    
    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 class="text-lg font-semibold mb-4">Hierarchy Breakdown</h3>
        <div class="space-y-4">
          ${Object.entries(nodesByLevel).map(([level, nodes]) => `
            <div>
              <h4 class="font-medium text-claw-500 mb-2">
                Level ${level} ${this.getLevelTitle(level)}
              </h4>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${nodes.map(node => this.renderNodeCard(node)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderNodeCard(node) {
    const statusColor = TabUtils.getStatusColor(node.status);
    const agentColor = TabUtils.getAgentColor(node.id);
    
    return `
      <div class="bg-gray-700 border border-gray-600 rounded p-3 hover:bg-gray-650 transition-colors cursor-pointer"
           onclick="HierarchyTab.selectNode('${node.id}')">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                 style="background-color: ${agentColor}30; color: ${agentColor}">
              ${this.getAgentEmoji(node.id)}
            </div>
            <span class="font-medium text-sm">${node.name}</span>
          </div>
          <span class="status-badge text-xs" style="background-color: ${statusColor}">
            ${node.status}
          </span>
        </div>
        <div class="text-xs text-gray-400">
          <div>${node.role}</div>
          <div class="mt-1">${this.formatModel(node.model)}</div>
          ${node.children.length > 0 ? `<div class="mt-1">${node.children.length} reports</div>` : ''}
        </div>
      </div>
    `;
  }

  groupNodesByLevel(nodes) {
    const grouped = {};
    Object.values(nodes).forEach(node => {
      const level = node.level;
      if (!grouped[level]) grouped[level] = [];
      grouped[level].push(node);
    });
    
    // Sort nodes within each level by name
    Object.keys(grouped).forEach(level => {
      grouped[level].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return grouped;
  }

  getLevelTitle(level) {
    const titles = {
      '0': '(Board)',
      '1': '(Executive)',
      '2': '(Leadership)',
      '3': '(Department Heads)',
      '4': '(Team Leads)',
      '5': '(Specialists)'
    };
    return titles[level] || '';
  }

  getAgentEmoji(agentId) {
    const emojis = {
      bob: '👨‍💼',
      main: '👑',
      denny: '📋',
      nexus: '🔍',
      qa: '✅',
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
    return model.replace('anthropic/', '').replace('claude-', '');
  }

  initializeChart(data) {
    // This is where Graphics Dev's hierarchy chart would be initialized
    console.log('Hierarchy data ready for Graphics Dev:', data);
    
    // Check if Graphics Dev has loaded their component
    if (window.MCGraphics && window.MCGraphics.initHierarchyChart) {
      try {
        window.MCGraphics.initHierarchyChart('hierarchy-chart-container', data);
        console.log('Hierarchy chart initialized by Graphics Dev');
      } catch (error) {
        console.error('Failed to initialize hierarchy chart:', error);
        this.showChartError(error);
      }
    } else {
      console.log('Graphics components not ready, retrying in 100ms...');
      // Retry after a short delay to allow graphics components to load
      setTimeout(() => {
        if (window.MCGraphics && window.MCGraphics.initHierarchyChart) {
          try {
            window.MCGraphics.initHierarchyChart('hierarchy-chart-container', data);
            console.log('Hierarchy chart initialized by Graphics Dev (retry)');
          } catch (error) {
            console.error('Failed to initialize hierarchy chart (retry):', error);
            this.showChartError(error);
          }
        } else {
          console.warn('Graphics components still not available after retry');
          this.showChartError(new Error('Graphics components not loaded'));
        }
      }, 100);
    }
  }

  showChartError(error) {
    const container = document.getElementById('hierarchy-chart-container');
    if (container) {
      container.innerHTML = `
        <div class="absolute inset-0 flex items-center justify-center text-gray-500">
          <div class="text-center">
            <div class="text-lg mb-2">⚠️</div>
            <div class="text-red-400 mb-2">Chart initialization failed</div>
            <div class="text-sm text-gray-400">${error.message}</div>
            <button onclick="this.parentElement.parentElement.parentElement.dispatchEvent(new CustomEvent('retryChart'))" 
                    class="mt-3 bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm transition-colors">
              Retry
            </button>
          </div>
        </div>
      `;
      
      // Add retry event listener
      container.addEventListener('retryChart', () => {
        this.initializeChart(data);
      });
    }
  }

  // Static methods for chart controls
  static zoomIn() {
    if (window.MCGraphics && window.MCGraphics.zoomHierarchy) {
      window.MCGraphics.zoomHierarchy(1.2);
    } else {
      console.log('Zoom In - Graphics Dev component not loaded');
    }
  }

  static zoomOut() {
    if (window.MCGraphics && window.MCGraphics.zoomHierarchy) {
      window.MCGraphics.zoomHierarchy(0.8);
    } else {
      console.log('Zoom Out - Graphics Dev component not loaded');
    }
  }

  static resetZoom() {
    if (window.MCGraphics && window.MCGraphics.resetHierarchyZoom) {
      window.MCGraphics.resetHierarchyZoom();
    } else {
      console.log('Reset Zoom - Graphics Dev component not loaded');
    }
  }

  static selectNode(nodeId) {
    console.log(`Selected node: ${nodeId}`);
    
    if (window.MCGraphics && window.MCGraphics.highlightNode) {
      window.MCGraphics.highlightNode(nodeId);
    }
    
    // Could also show detailed info panel
    const data = stateManager.getTabData('hierarchy');
    const node = data?.nodes[nodeId];
    if (node) {
      console.log('Node details:', node);
    }
  }

  // Component lifecycle methods
  onShow() {
    console.log('Hierarchy tab shown');
    
    // If Graphics Dev component is available, refresh the chart
    const data = stateManager.getTabData(this.tabName);
    if (data && window.MCGraphics && window.MCGraphics.updateHierarchyChart) {
      window.MCGraphics.updateHierarchyChart(data);
    }
  }

  onHide() {
    console.log('Hierarchy tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const hierarchyTab = new HierarchyTab();
  TabSystem.registerComponent('hierarchy', hierarchyTab);
});