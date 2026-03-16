// Mission Control v3 - Performance Tab Component
// System metrics and analytics with Graphics Dev integration

class PerformanceTab {
  constructor() {
    this.tabName = 'performance';
    this.container = document.getElementById('performance-content');
    this.dateRange = '7d';
    this.chartTypes = ['completion', 'activity', 'health', 'resources'];
  }

  async render() {
    if (!this.container) {
      console.error('Performance tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading performance metrics...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      // Get task data for performance analysis
      const tasksData = await api.getTasks();
      const agentsData = await api.getAgents();
      const healthData = await api.getHealth();
      
      const data = {
        tasks: tasksData,
        agents: agentsData,
        health: healthData,
        timestamp: new Date().toISOString()
      };
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      
    } catch (error) {
      console.error('Performance refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data) return;

    // Calculate performance metrics
    const metrics = this.calculateMetrics(data);

    // Get the existing container structure from the HTML
    this.renderMetricsSummary(metrics);
    this.updateDateRangeControl();
    this.initializeCharts(metrics);
  }

  renderMetricsSummary(metrics) {
    // Find or create metrics summary area
    let summaryContainer = this.container.querySelector('#metrics-summary');
    if (!summaryContainer) {
      summaryContainer = document.createElement('div');
      summaryContainer.id = 'metrics-summary';
      summaryContainer.className = 'mb-6';
      this.container.insertBefore(summaryContainer, this.container.firstChild);
    }

    summaryContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-green-400">${metrics.completionRate}%</div>
          <div class="text-sm text-gray-400">Completion Rate</div>
          <div class="text-xs text-gray-500 mt-1">${this.dateRange.replace('d', ' days')}</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-blue-400">${metrics.avgTaskDuration}</div>
          <div class="text-sm text-gray-400">Avg Task Duration</div>
          <div class="text-xs text-gray-500 mt-1">Hours per task</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-claw-500">${metrics.agentUtilization}%</div>
          <div class="text-sm text-gray-400">Agent Utilization</div>
          <div class="text-xs text-gray-500 mt-1">Active agents</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold ${metrics.systemHealth > 90 ? 'text-green-400' : metrics.systemHealth > 70 ? 'text-yellow-400' : 'text-red-400'}">${metrics.systemHealth}%</div>
          <div class="text-sm text-gray-400">System Health</div>
          <div class="text-xs text-gray-500 mt-1">Overall status</div>
        </div>
      </div>
    `;
  }

  updateDateRangeControl() {
    const rangeSelect = document.getElementById('performance-range');
    if (rangeSelect) {
      rangeSelect.value = this.dateRange;
      rangeSelect.onchange = (e) => {
        this.dateRange = e.target.value;
        stateManager.setTabState(this.tabName, { dateRange: this.dateRange });
        this.refresh();
      };
    }
  }

  calculateMetrics(data) {
    const tasks = data.tasks?.active_tasks || data.tasks?.activeTasks || [];
    const agents = Array.isArray(data.agents) ? data.agents : (data.agents?.agents || []);
    const health = data.health || {};

    // Calculate completion rate (simplified)
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const totalTasks = tasks.length || 1; // Avoid division by zero
    const completionRate = Math.round((completedTasks / totalTasks) * 100);

    // Calculate average task duration (mock calculation)
    const avgTaskDuration = this.calculateAverageTaskDuration(tasks);

    // Calculate agent utilization
    const onlineAgents = agents.filter(a => a.status === 'online').length;
    const totalAgents = agents.length || 1;
    const agentUtilization = Math.round((onlineAgents / totalAgents) * 100);

    // Calculate system health score
    const systemHealth = this.calculateSystemHealthScore(health, agents);

    return {
      completionRate,
      avgTaskDuration: avgTaskDuration + 'h',
      agentUtilization,
      systemHealth,
      tasksOverTime: this.generateTasksOverTimeData(tasks),
      agentActivityData: this.generateAgentActivityData(agents),
      healthTrendData: this.generateHealthTrendData(health),
      resourceUsageData: this.generateResourceUsageData()
    };
  }

  calculateAverageTaskDuration(tasks) {
    if (!tasks.length) return 0;
    
    // Mock calculation - in real implementation, this would use actual task timestamps
    const durations = tasks.map(task => {
      // Estimate duration based on status and complexity
      const baseHours = task.status === 'done' ? 2 : 1;
      const multiplier = Math.random() * 3 + 0.5; // 0.5 to 3.5
      return baseHours * multiplier;
    });
    
    const avgHours = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    return Math.round(avgHours * 10) / 10; // Round to 1 decimal
  }

  calculateSystemHealthScore(health, agents) {
    let score = 100;
    
    // Deduct points for offline agents
    const offlineAgents = agents.filter(a => a.status === 'offline').length;
    score -= offlineAgents * 10;
    
    // Deduct points for health check failures
    if (health.checks) {
      const failedChecks = Object.values(health.checks).filter(check => check !== 'pass').length;
      score -= failedChecks * 15;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  generateTasksOverTimeData(tasks) {
    // Generate mock time series data for task completion
    const days = parseInt(this.dateRange.replace('d', ''));
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Mock data - in real implementation, this would query actual completion dates
      const completed = Math.floor(Math.random() * 10) + 1;
      const created = Math.floor(Math.random() * 8) + completed;
      
      data.push({
        date: date.toISOString().split('T')[0],
        completed,
        created,
        net: completed - created
      });
    }
    
    return data;
  }

  generateAgentActivityData(agents) {
    // Generate agent activity summary
    return agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      tasksCompleted: Math.floor(Math.random() * 20) + 1,
      hoursActive: Math.floor(Math.random() * 40) + 10,
      efficiency: Math.floor(Math.random() * 30) + 70
    }));
  }

  generateHealthTrendData(health) {
    // Generate system health trend over time
    const hours = 24;
    const data = [];
    
    for (let i = hours - 1; i >= 0; i--) {
      const date = new Date();
      date.setHours(date.getHours() - i);
      
      // Mock health score with some variation
      const baseScore = 85;
      const variation = (Math.random() - 0.5) * 20;
      const score = Math.max(50, Math.min(100, baseScore + variation));
      
      data.push({
        timestamp: date.toISOString(),
        healthScore: Math.round(score),
        cpuUsage: Math.floor(Math.random() * 40) + 20,
        memoryUsage: Math.floor(Math.random() * 30) + 40
      });
    }
    
    return data;
  }

  generateResourceUsageData() {
    // Generate resource usage data
    return {
      cpu: {
        current: Math.floor(Math.random() * 40) + 20,
        average: Math.floor(Math.random() * 30) + 25,
        peak: Math.floor(Math.random() * 20) + 70
      },
      memory: {
        current: Math.floor(Math.random() * 30) + 40,
        average: Math.floor(Math.random() * 20) + 45,
        peak: Math.floor(Math.random() * 15) + 75
      },
      disk: {
        used: Math.floor(Math.random() * 20) + 30,
        available: 70,
        total: 100
      },
      network: {
        inbound: Math.floor(Math.random() * 1000) + 500,
        outbound: Math.floor(Math.random() * 800) + 300
      }
    };
  }

  initializeCharts(metrics) {
    // Check if Graphics Dev component is available
    if (window.MCGraphics && window.MCGraphics.initPerformanceCharts) {
      try {
        const chartData = {
          tasks: { active: metrics.tasksOverTime, finished: [] },
          agents: metrics.agentActivityData || [],
          health: metrics.healthTrendData || {},
          resourceUsage: metrics.resourceUsageData || []
        };
        
        const containerIds = {
          taskCompletion: 'task-completion-chart',
          agentActivity: 'agent-activity-chart',
          systemHealth: 'system-health-chart',
          resourceUsage: 'resource-usage-chart'
        };
        
        window.MCGraphics.initPerformanceCharts(containerIds, chartData);
        console.log('Performance charts initialized by Graphics Dev');
      } catch (error) {
        console.error('Failed to initialize performance charts:', error);
        this.showChartPlaceholders();
      }
    } else {
      console.log('Performance chart containers ready - waiting for Graphics Dev component');
      this.showChartPlaceholders();
    }
  }

  showChartPlaceholders() {
    // Update placeholders with data info
    const containers = [
      'task-completion-chart',
      'agent-activity-chart', 
      'system-health-chart',
      'resource-usage-chart'
    ];
    
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = `
          <div class="h-full flex items-center justify-center text-gray-500">
            <div class="text-center">
              <div class="text-lg mb-2">📊</div>
              <div>Chart ready for Graphics Dev</div>
              <div class="text-sm mt-1 text-gray-400">Container ID: ${id}</div>
            </div>
          </div>
        `;
      }
    });
  }

  // Component lifecycle methods
  onShow() {
    console.log('Performance tab shown');
    
    // Restore state from storage
    const tabState = stateManager.getTabState(this.tabName);
    if (tabState) {
      this.dateRange = tabState.dateRange || '7d';
    }

    // If Graphics Dev component is available, refresh the charts
    const data = stateManager.getTabData(this.tabName);
    if (data && window.MCGraphics && window.MCGraphics.updatePerformanceCharts) {
      const metrics = this.calculateMetrics(data);
      const chartData = {
        tasksOverTime: metrics.tasksOverTime,
        agentActivity: metrics.agentActivityData,
        healthTrend: metrics.healthTrendData,
        resourceUsage: metrics.resourceUsageData
      };
      window.MCGraphics.updatePerformanceCharts(chartData);
    }
  }

  onHide() {
    console.log('Performance tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const performanceTab = new PerformanceTab();
  TabSystem.registerComponent('performance', performanceTab);
});