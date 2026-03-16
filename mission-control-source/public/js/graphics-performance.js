/**
 * Mission Control v3 - Performance Visualizations
 * Graphics Dev: graphics
 * 
 * Canvas-based charts for metrics and analytics
 * Features: Task completion trends, agent activity, system health, resource usage
 */

class MCPerformanceCharts {
  constructor(containers, data) {
    this.containers = containers;
    this.data = data;
    this.charts = {};
    this.canvases = {};
    this.contexts = {};
    
    // Chart configuration
    this.config = {
      padding: 40,
      colors: {
        primary: '#f59e0b',
        secondary: '#58a6ff',
        success: '#3fb950',
        warning: '#d29922',
        error: '#f85149',
        grid: '#2d3441',
        text: '#8b949e',
        textPrimary: '#f0f6fc'
      },
      font: {
        size: 11,
        family: 'system-ui, -apple-system, sans-serif'
      }
    };
    
    this.init();
  }

  init() {
    this.processData();
    this.createCharts();
    this.renderAllCharts();
  }

  processData() {
    if (!this.data) {
      this.processedData = {
        taskCompletion: [],
        agentActivity: [],
        systemHealth: [],
        resourceUsage: []
      };
      return;
    }
    try {

    this.processedData = {
      taskCompletion: this.processTaskCompletionData(),
      agentActivity: this.processAgentActivityData(),
      systemHealth: this.processSystemHealthData(),
      resourceUsage: this.processResourceUsageData()
    };
    } catch(e) {
      console.warn('Performance data processing error:', e.message);
      this.processedData = { taskCompletion: [], agentActivity: [], systemHealth: [], resourceUsage: [] };
    }
  }

  processTaskCompletionData() {
    // Process task data into time series for completion trends
    const tasks = this.data.tasks?.active || [];
    const completedTasks = this.data.tasks?.finished || [];
    
    // Group by date (last 7 days)
    const days = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const completed = completedTasks.filter(task => 
        task.completed_date && task.completed_date.startsWith(dateStr)
      ).length;
      
      const created = tasks.filter(task =>
        task.created && task.created.startsWith(dateStr)
      ).length;
      
      days.push({
        date: dateStr,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        completed,
        created,
        efficiency: created > 0 ? (completed / created) * 100 : 0
      });
    }
    
    return days;
  }

  processAgentActivityData() {
    // Process agent data into activity metrics
    const agents = this.data.agents || [];
    
    return agents.map(agent => ({
      id: agent.id,
      name: agent.name || agent.id,
      status: agent.status,
      tasksActive: agent.tasks_active || 0,
      toolsCount: agent.tools_count || 0,
      lastActive: agent.last_active,
      healthScore: this.calculateAgentHealthScore(agent)
    })).sort((a, b) => b.healthScore - a.healthScore);
  }

  calculateAgentHealthScore(agent) {
    let score = 0;
    
    // Status contribution (0-40 points)
    if (agent.status === 'online') score += 40;
    else if (agent.status === 'offline') score += 10;
    
    // Activity contribution (0-30 points)
    if (agent.last_active) {
      const lastActiveDate = new Date(agent.last_active);
      const hoursSinceActive = (Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceActive < 1) score += 30;
      else if (hoursSinceActive < 24) score += 20;
      else if (hoursSinceActive < 168) score += 10;
    }
    
    // Task activity (0-20 points)
    score += Math.min(20, (agent.tasks_active || 0) * 5);
    
    // Tool availability (0-10 points)
    score += Math.min(10, (agent.tools_count || 0));
    
    return score;
  }

  processSystemHealthData() {
    // Process system health metrics
    const gateway = this.data.gateway || {};
    const ollama = this.data.ollama || {};
    
    return [
      {
        metric: 'Gateway Status',
        value: gateway.status === 'running' ? 100 : 0,
        status: gateway.status,
        color: gateway.status === 'running' ? this.config.colors.success : this.config.colors.error
      },
      {
        metric: 'Ollama Service',
        value: ollama.status === 'running' ? 100 : 0,
        status: ollama.status,
        color: ollama.status === 'running' ? this.config.colors.success : this.config.colors.error
      },
      {
        metric: 'Active Tasks',
        value: Math.min(100, ((this.data.tasks?.active?.length || 0) / 10) * 100),
        status: `${this.data.tasks?.active?.length || 0} tasks`,
        color: this.config.colors.primary
      },
      {
        metric: 'Agents Online',
        value: this.processedData.agentActivity.filter(a => a.status === 'online').length / 
               Math.max(1, this.processedData.agentActivity.length) * 100,
        status: `${this.processedData.agentActivity.filter(a => a.status === 'online').length} online`,
        color: this.config.colors.secondary
      }
    ];
  }

  processResourceUsageData() {
    // Mock resource usage data (in real implementation, this would come from system metrics)
    const hours = [];
    const now = new Date();
    
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now);
      hour.setHours(hour.getHours() - i);
      
      // Generate mock data with some realistic patterns
      const baseLoad = 30 + Math.sin((i / 24) * Math.PI * 2) * 15;
      const noise = (Math.random() - 0.5) * 10;
      
      hours.push({
        time: hour.toLocaleTimeString('en-US', { hour: 'numeric' }),
        cpu: Math.max(0, Math.min(100, baseLoad + noise)),
        memory: Math.max(0, Math.min(100, baseLoad + noise + 10)),
        tasks: this.data.tasks?.active?.length || 0
      });
    }
    
    return hours;
  }

  createCharts() {
    Object.entries(this.containers).forEach(([chartType, container]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      canvas.style.cssText = 'width: 100%; height: 200px; display: block;';
      
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      
      container.innerHTML = '';
      container.appendChild(canvas);
      
      this.canvases[chartType] = canvas;
      this.contexts[chartType] = ctx;
    });
  }

  renderAllCharts() {
    this.renderTaskCompletionChart();
    this.renderAgentActivityChart();
    this.renderSystemHealthChart();
    this.renderResourceUsageChart();
  }

  renderTaskCompletionChart() {
    const ctx = this.contexts['task-completion-chart'];
    const canvas = this.canvases['task-completion-chart'];
    if (!ctx || !canvas) return;

    this.clearCanvas(ctx, canvas);
    
    const data = this.processedData.taskCompletion;
    if (!data || data.length === 0) {
      this.drawNoDataMessage(ctx, canvas, 'Task Completion Trends');
      return;
    }

    // Draw title
    this.drawTitle(ctx, 'Task Completion Trends');
    
    // Chart area
    const chartArea = {
      x: this.config.padding,
      y: this.config.padding + 25,
      width: canvas.width - (this.config.padding * 2),
      height: canvas.height - (this.config.padding * 2) - 25
    };

    // Draw grid and axes
    this.drawGrid(ctx, chartArea, data.length, Math.max(...data.map(d => Math.max(d.created, d.completed))));
    
    // Draw x-axis labels
    data.forEach((day, index) => {
      const x = chartArea.x + (index / (data.length - 1)) * chartArea.width;
      ctx.fillStyle = this.config.colors.text;
      ctx.textAlign = 'center';
      ctx.fillText(day.label, x, chartArea.y + chartArea.height + 15);
    });

    // Draw lines
    this.drawLine(ctx, chartArea, data.map(d => d.completed), this.config.colors.success, 'Completed');
    this.drawLine(ctx, chartArea, data.map(d => d.created), this.config.colors.primary, 'Created');
    
    // Draw legend
    this.drawLegend(ctx, canvas, [
      { label: 'Completed', color: this.config.colors.success },
      { label: 'Created', color: this.config.colors.primary }
    ]);
  }

  renderAgentActivityChart() {
    const ctx = this.contexts['agent-activity-chart'];
    const canvas = this.canvases['agent-activity-chart'];
    if (!ctx || !canvas) return;

    this.clearCanvas(ctx, canvas);
    
    const data = this.processedData.agentActivity.slice(0, 8); // Top 8 agents
    if (!data || data.length === 0) {
      this.drawNoDataMessage(ctx, canvas, 'Agent Activity');
      return;
    }

    // Draw title
    this.drawTitle(ctx, 'Agent Activity');
    
    // Chart area
    const chartArea = {
      x: this.config.padding,
      y: this.config.padding + 25,
      width: canvas.width - (this.config.padding * 2),
      height: canvas.height - (this.config.padding * 2) - 25
    };

    // Draw horizontal bar chart
    const barHeight = Math.floor((chartArea.height - 20) / data.length);
    const maxScore = Math.max(...data.map(d => d.healthScore));
    
    data.forEach((agent, index) => {
      const y = chartArea.y + (index * barHeight) + 10;
      const barWidth = (agent.healthScore / maxScore) * (chartArea.width - 100);
      
      // Draw bar
      ctx.fillStyle = MCGraphicsUtils.getAgentColor(agent.id);
      ctx.fillRect(chartArea.x + 100, y, barWidth, barHeight - 5);
      
      // Draw agent name
      ctx.fillStyle = this.config.colors.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(agent.name, chartArea.x + 95, y + (barHeight / 2) + 3);
      
      // Draw score
      ctx.fillStyle = this.config.colors.text;
      ctx.textAlign = 'left';
      ctx.fillText(agent.healthScore.toString(), chartArea.x + 105 + barWidth, y + (barHeight / 2) + 3);
      
      // Draw status indicator
      ctx.fillStyle = MCGraphicsUtils.getStatusColor(agent.status);
      ctx.beginPath();
      ctx.arc(chartArea.x + 15, y + (barHeight / 2), 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  renderSystemHealthChart() {
    const ctx = this.contexts['system-health-chart'];
    const canvas = this.canvases['system-health-chart'];
    if (!ctx || !canvas) return;

    this.clearCanvas(ctx, canvas);
    
    const data = this.processedData.systemHealth;
    if (!data || data.length === 0) {
      this.drawNoDataMessage(ctx, canvas, 'System Health');
      return;
    }

    // Draw title
    this.drawTitle(ctx, 'System Health');
    
    // Chart area
    const chartArea = {
      x: this.config.padding,
      y: this.config.padding + 25,
      width: canvas.width - (this.config.padding * 2),
      height: canvas.height - (this.config.padding * 2) - 25
    };

    // Draw radial health indicators
    const centerX = chartArea.x + (chartArea.width / 2);
    const centerY = chartArea.y + (chartArea.height / 2);
    const maxRadius = Math.min(chartArea.width, chartArea.height) / 3;
    
    data.forEach((metric, index) => {
      const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
      const radius = maxRadius;
      
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Draw metric arc
      const arcRadius = 25;
      const progress = metric.value / 100;
      
      // Background arc
      ctx.strokeStyle = this.config.colors.grid;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, arcRadius, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Progress arc
      ctx.strokeStyle = metric.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, arcRadius, -Math.PI / 2, (-Math.PI / 2) + (progress * 2 * Math.PI));
      ctx.stroke();
      
      // Metric name
      ctx.fillStyle = this.config.colors.textPrimary;
      ctx.textAlign = 'center';
      ctx.fillText(metric.metric, x, y - 35);
      
      // Status text
      ctx.fillStyle = this.config.colors.text;
      ctx.fillText(metric.status, x, y + 40);
    });
  }

  renderResourceUsageChart() {
    const ctx = this.contexts['resource-usage-chart'];
    const canvas = this.canvases['resource-usage-chart'];
    if (!ctx || !canvas) return;

    this.clearCanvas(ctx, canvas);
    
    const data = this.processedData.resourceUsage;
    if (!data || data.length === 0) {
      this.drawNoDataMessage(ctx, canvas, 'Resource Usage (24h)');
      return;
    }

    // Draw title
    this.drawTitle(ctx, 'Resource Usage (24h)');
    
    // Chart area
    const chartArea = {
      x: this.config.padding,
      y: this.config.padding + 25,
      width: canvas.width - (this.config.padding * 2),
      height: canvas.height - (this.config.padding * 2) - 25
    };

    // Draw grid
    this.drawGrid(ctx, chartArea, 6, 100); // 0-100% scale
    
    // Draw x-axis labels (every 4 hours)
    for (let i = 0; i < data.length; i += 4) {
      const x = chartArea.x + (i / (data.length - 1)) * chartArea.width;
      ctx.fillStyle = this.config.colors.text;
      ctx.textAlign = 'center';
      ctx.fillText(data[i].time, x, chartArea.y + chartArea.height + 15);
    }

    // Draw area chart for CPU
    this.drawAreaChart(ctx, chartArea, data.map(d => d.cpu), this.config.colors.warning, 0.3);
    
    // Draw line chart for Memory
    this.drawLine(ctx, chartArea, data.map(d => d.memory), this.config.colors.secondary, 'Memory');
    
    // Draw legend
    this.drawLegend(ctx, canvas, [
      { label: 'CPU Usage', color: this.config.colors.warning },
      { label: 'Memory Usage', color: this.config.colors.secondary }
    ]);
  }

  // Helper drawing methods
  clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1f26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawTitle(ctx, title) {
    ctx.fillStyle = this.config.colors.textPrimary;
    ctx.font = `bold ${this.config.font.size + 2}px ${this.config.font.family}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, ctx.canvas.width / 2, 20);
  }

  drawGrid(ctx, area, xSteps, maxValue) {
    ctx.strokeStyle = this.config.colors.grid;
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = area.y + (i / ySteps) * area.height;
      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.width, y);
      ctx.stroke();
      
      // Y-axis labels
      const value = maxValue - (i / ySteps) * maxValue;
      ctx.fillStyle = this.config.colors.text;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(value).toString(), area.x - 5, y + 3);
    }
    
    // Vertical grid lines
    for (let i = 0; i <= xSteps; i++) {
      const x = area.x + (i / xSteps) * area.width;
      ctx.beginPath();
      ctx.moveTo(x, area.y);
      ctx.lineTo(x, area.y + area.height);
      ctx.stroke();
    }
  }

  drawLine(ctx, area, values, color, label) {
    if (values.length === 0) return;
    
    const maxValue = Math.max(...values);
    if (maxValue === 0) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    values.forEach((value, index) => {
      const x = area.x + (index / (values.length - 1)) * area.width;
      const y = area.y + area.height - (value / maxValue) * area.height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = color;
    values.forEach((value, index) => {
      const x = area.x + (index / (values.length - 1)) * area.width;
      const y = area.y + area.height - (value / maxValue) * area.height;
      
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  drawAreaChart(ctx, area, values, color, opacity) {
    if (values.length === 0) return;
    
    const maxValue = Math.max(...values);
    if (maxValue === 0) return;
    
    ctx.fillStyle = MCGraphicsUtils.hexToRgba(color, opacity);
    ctx.beginPath();
    
    // Start from bottom left
    ctx.moveTo(area.x, area.y + area.height);
    
    // Draw to all points
    values.forEach((value, index) => {
      const x = area.x + (index / (values.length - 1)) * area.width;
      const y = area.y + area.height - (value / maxValue) * area.height;
      ctx.lineTo(x, y);
    });
    
    // Close to bottom right
    ctx.lineTo(area.x + area.width, area.y + area.height);
    ctx.closePath();
    ctx.fill();
    
    // Draw line on top
    this.drawLine(ctx, area, values, color);
  }

  drawLegend(ctx, canvas, items) {
    const legendY = canvas.height - 20;
    let legendX = 20;
    
    items.forEach(item => {
      // Draw color indicator
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, legendY - 8, 12, 12);
      
      // Draw label
      ctx.fillStyle = this.config.colors.text;
      ctx.textAlign = 'left';
      ctx.fillText(item.label, legendX + 16, legendY);
      
      legendX += ctx.measureText(item.label).width + 40;
    });
  }

  drawNoDataMessage(ctx, canvas, title) {
    this.drawTitle(ctx, title);
    
    ctx.fillStyle = this.config.colors.text;
    ctx.textAlign = 'center';
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
  }

  // Public API methods
  updateData(newData) {
    this.data = newData;
    this.processData();
    this.renderAllCharts();
  }

  getChartImage(chartType) {
    const canvas = this.canvases[chartType];
    return canvas ? canvas.toDataURL() : null;
  }

  downloadChart(chartType, filename) {
    const canvas = this.canvases[chartType];
    if (canvas) {
      const link = document.createElement('a');
      link.download = filename || `${chartType}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }
}

// Make available globally
window.MCPerformanceCharts = MCPerformanceCharts;