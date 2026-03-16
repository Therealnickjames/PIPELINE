// Mission Control v3 - Projects Tab Component
// Task plans and progress tracking

class ProjectsTab {
  constructor() {
    this.tabName = 'projects';
    this.container = document.getElementById('projects-content');
    this.viewMode = 'plans'; // 'plans' or 'tasks'
    this.statusFilter = 'all';
  }

  async render() {
    if (!this.container) {
      console.error('Projects tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading project data...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getTasks();
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      
    } catch (error) {
      console.error('Projects refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data) return;

    this.container.innerHTML = `
      ${this.renderControls(data)}
      ${this.viewMode === 'plans' ? this.renderPlansView(data) : this.renderTasksView(data)}
    `;

    this.attachEventListeners();
  }

  renderControls(data) {
    const plans = data.plans || [];
    const activeTasks = data.active_tasks || [];
    const totalPlans = plans.length;
    const activePlans = plans.filter(p => p.status === 'active').length;
    const totalTasks = activeTasks.length;
    const blockedTasks = activeTasks.filter(t => t.status === 'blocked').length;

    return `
      <div class="mb-6 space-y-4">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-claw-500">${totalPlans}</div>
            <div class="text-sm text-gray-400">Total Plans</div>
          </div>
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-green-400">${activePlans}</div>
            <div class="text-sm text-gray-400">Active Plans</div>
          </div>
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-blue-400">${totalTasks}</div>
            <div class="text-sm text-gray-400">Active Tasks</div>
          </div>
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-red-400">${blockedTasks}</div>
            <div class="text-sm text-gray-400">Blocked</div>
          </div>
        </div>

        <!-- View Controls -->
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div class="flex flex-wrap gap-4 items-center">
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-400">View:</label>
              <div class="flex bg-gray-700 rounded overflow-hidden">
                <button id="view-plans" class="px-3 py-1 text-sm ${this.viewMode === 'plans' ? 'bg-claw-600 text-white' : 'text-gray-300 hover:bg-gray-600'}">
                  Plans
                </button>
                <button id="view-tasks" class="px-3 py-1 text-sm ${this.viewMode === 'tasks' ? 'bg-claw-600 text-white' : 'text-gray-300 hover:bg-gray-600'}">
                  Tasks
                </button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-400">Filter:</label>
              <select id="projects-status-filter" class="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm">
                <option value="all" ${this.statusFilter === 'all' ? 'selected' : ''}>All Status</option>
                <option value="active" ${this.statusFilter === 'active' ? 'selected' : ''}>Active</option>
                <option value="planning" ${this.statusFilter === 'planning' ? 'selected' : ''}>Planning</option>
                <option value="blocked" ${this.statusFilter === 'blocked' ? 'selected' : ''}>Blocked</option>
                <option value="review" ${this.statusFilter === 'review' ? 'selected' : ''}>Review</option>
                <option value="done" ${this.statusFilter === 'done' ? 'selected' : ''}>Done</option>
              </select>
            </div>
            <button onclick="TabSystem.navigate('archive')" class="btn btn-secondary text-sm ml-auto">
              <span>📁</span> View Archive
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderPlansView(data) {
    const plans = this.filterPlans(data.plans || []);
    
    if (plans.length === 0) {
      return `
        <div class="text-center py-12 text-gray-400">
          <div class="text-4xl mb-4">📋</div>
          <div class="text-lg">No plans match the current filter</div>
        </div>
      `;
    }

    return `
      <div class="space-y-6">
        ${plans.map(plan => this.renderPlanCard(plan, data.active_tasks || [])).join('')}
      </div>
    `;
  }

  renderPlanCard(plan, allTasks) {
    const planTasks = allTasks.filter(task => task.plan_id === plan.id);
    const completedTasks = planTasks.filter(task => task.status === 'done');
    const blockedTasks = planTasks.filter(task => task.status === 'blocked');
    const progress = planTasks.length > 0 ? (completedTasks.length / planTasks.length) * 100 : 0;
    const statusColor = TabUtils.getStatusColor(plan.status);

    return `
      <div class="card">
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-lg font-semibold text-gray-100">${plan.title}</h3>
              <span class="status-badge" style="background-color: ${statusColor}">
                ${plan.status}
              </span>
            </div>
            <p class="text-gray-400 text-sm">${plan.description || 'No description provided'}</p>
          </div>
          <div class="text-right text-sm text-gray-400">
            <div>Created ${TabUtils.formatTimestamp(plan.created)}</div>
            ${plan.updated !== plan.created ? `<div>Updated ${TabUtils.formatTimestamp(plan.updated)}</div>` : ''}
          </div>
        </div>

        <!-- Plan Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div class="text-center">
            <div class="text-xl font-bold text-blue-400">${planTasks.length}</div>
            <div class="text-xs text-gray-400">Total Tasks</div>
          </div>
          <div class="text-center">
            <div class="text-xl font-bold text-green-400">${completedTasks.length}</div>
            <div class="text-xs text-gray-400">Completed</div>
          </div>
          <div class="text-center">
            <div class="text-xl font-bold text-red-400">${blockedTasks.length}</div>
            <div class="text-xs text-gray-400">Blocked</div>
          </div>
          <div class="text-center">
            <div class="text-xl font-bold text-claw-500">${Math.round(progress)}%</div>
            <div class="text-xs text-gray-400">Progress</div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="mb-4">
          <div class="flex items-center justify-between text-sm text-gray-400 mb-1">
            <span>Progress</span>
            <span>${Math.round(progress)}%</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-2">
            <div class="bg-claw-500 h-2 rounded-full transition-all duration-300" 
                 style="width: ${progress}%"></div>
          </div>
        </div>

        <!-- Recent Tasks -->
        ${planTasks.length > 0 ? this.renderPlanTasks(planTasks.slice(0, 3), plan.id) : ''}

        <!-- Plan Actions -->
        <div class="flex gap-2 mt-4">
          <button onclick="ProjectsTab.viewPlanDetails('${plan.id}')" 
                  class="btn btn-secondary text-sm">
            View Details
          </button>
          ${planTasks.length > 3 ? `
            <button onclick="ProjectsTab.showAllTasks('${plan.id}')" 
                    class="btn text-sm" style="background-color: ${statusColor}">
              View All ${planTasks.length} Tasks
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderPlanTasks(tasks, planId) {
    if (tasks.length === 0) return '';

    return `
      <div class="border-t border-gray-700 pt-3">
        <h4 class="text-sm font-medium text-gray-300 mb-2">Recent Tasks</h4>
        <div class="space-y-2">
          ${tasks.map(task => this.renderTaskRow(task)).join('')}
        </div>
      </div>
    `;
  }

  renderTasksView(data) {
    const tasks = this.filterTasks(data.active_tasks || []);
    
    if (tasks.length === 0) {
      return `
        <div class="text-center py-12 text-gray-400">
          <div class="text-4xl mb-4">📝</div>
          <div class="text-lg">No tasks match the current filter</div>
        </div>
      `;
    }

    // Group tasks by status
    const tasksByStatus = this.groupTasksByStatus(tasks);

    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        ${Object.entries(tasksByStatus).map(([status, statusTasks]) => 
          this.renderTaskColumn(status, statusTasks)
        ).join('')}
      </div>
    `;
  }

  renderTaskColumn(status, tasks) {
    const statusColor = TabUtils.getStatusColor(status);
    const statusTitle = status.charAt(0).toUpperCase() + status.slice(1);

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background-color: ${statusColor}"></span>
            ${statusTitle}
          </h3>
          <span class="bg-gray-700 px-2 py-1 rounded text-xs font-medium">${tasks.length}</span>
        </div>
        <div class="space-y-3">
          ${tasks.map(task => this.renderTaskCard(task)).join('')}
        </div>
      </div>
    `;
  }

  renderTaskCard(task) {
    const agentColor = TabUtils.getAgentColor(task.owner);
    const priority = task.priority || 0;
    const priorityColor = priority > 7 ? 'text-red-400' : priority > 4 ? 'text-yellow-400' : 'text-gray-400';

    return `
      <div class="bg-gray-700 border border-gray-600 rounded p-3 hover:bg-gray-650 transition-colors">
        <div class="flex items-start justify-between mb-2">
          <h4 class="font-medium text-sm text-gray-100 line-clamp-2">${task.title}</h4>
          ${priority > 0 ? `<span class="${priorityColor} text-xs font-bold">P${priority}</span>` : ''}
        </div>
        <div class="text-xs text-gray-400 space-y-1">
          <div class="flex items-center justify-between">
            <span>Owner:</span>
            <span style="color: ${agentColor}">${task.owner}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Updated:</span>
            <span>${TabUtils.formatTimestamp(task.updated)}</span>
          </div>
          ${task.plan_title ? `
            <div class="flex items-center justify-between">
              <span>Plan:</span>
              <span class="truncate max-w-20" title="${task.plan_title}">${task.plan_title}</span>
            </div>
          ` : ''}
        </div>
        <button onclick="ProjectsTab.viewTaskDetails('${task.id}')" 
                class="btn btn-secondary text-xs w-full mt-2">
          View Details
        </button>
      </div>
    `;
  }

  renderTaskRow(task) {
    const statusColor = TabUtils.getStatusColor(task.status);
    const agentColor = TabUtils.getAgentColor(task.owner);

    return `
      <div class="flex items-center justify-between p-2 bg-gray-700/30 rounded">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${statusColor}"></span>
            <span class="text-sm font-medium text-gray-200 truncate">${task.title}</span>
          </div>
          <div class="text-xs text-gray-400 mt-1">
            <span style="color: ${agentColor}">${task.owner}</span>
            <span class="mx-2">•</span>
            <span>${TabUtils.formatTimestamp(task.updated)}</span>
          </div>
        </div>
        <span class="text-xs px-2 py-1 rounded flex-shrink-0" style="background-color: ${statusColor}30; color: ${statusColor}">
          ${task.status}
        </span>
      </div>
    `;
  }

  filterPlans(plans) {
    if (this.statusFilter === 'all') return plans;
    return plans.filter(plan => plan.status === this.statusFilter);
  }

  filterTasks(tasks) {
    if (this.statusFilter === 'all') return tasks;
    return tasks.filter(task => task.status === this.statusFilter);
  }

  groupTasksByStatus(tasks) {
    const grouped = {};
    tasks.forEach(task => {
      const status = task.status || 'unknown';
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(task);
    });
    
    // Sort each group by priority (high to low) then by updated date (recent first)
    Object.keys(grouped).forEach(status => {
      grouped[status].sort((a, b) => {
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.updated) - new Date(a.updated);
      });
    });
    
    return grouped;
  }

  attachEventListeners() {
    // View mode buttons
    document.getElementById('view-plans')?.addEventListener('click', () => {
      this.setViewMode('plans');
    });

    document.getElementById('view-tasks')?.addEventListener('click', () => {
      this.setViewMode('tasks');
    });

    // Status filter
    document.getElementById('projects-status-filter')?.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      stateManager.setTabState(this.tabName, { statusFilter: this.statusFilter });
      this.rerenderWithCurrentData();
    });
  }

  setViewMode(mode) {
    this.viewMode = mode;
    stateManager.setTabState(this.tabName, { viewMode: this.viewMode });
    this.rerenderWithCurrentData();
  }

  rerenderWithCurrentData() {
    const data = stateManager.getTabData(this.tabName);
    if (data) {
      this.renderContent(data);
    }
  }

  // Static methods for actions
  static viewPlanDetails(planId) {
    console.log(`Viewing plan details: ${planId}`);
    // Could open a modal or navigate to detailed view
  }

  static showAllTasks(planId) {
    console.log(`Showing all tasks for plan: ${planId}`);
    // Could filter task view or open a modal
  }

  static viewTaskDetails(taskId) {
    console.log(`Viewing task details: ${taskId}`);
    // Could open a modal or navigate to detailed view
  }

  // Component lifecycle methods
  onShow() {
    console.log('Projects tab shown');
    
    // Restore state from storage
    const tabState = stateManager.getTabState(this.tabName);
    if (tabState) {
      this.viewMode = tabState.viewMode || 'plans';
      this.statusFilter = tabState.statusFilter || 'all';
    }
  }

  onHide() {
    console.log('Projects tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const projectsTab = new ProjectsTab();
  TabSystem.registerComponent('projects', projectsTab);
});