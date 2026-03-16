// Mission Control v3 - Archive Tab Component
// Completed work history with search and filtering

class ArchiveTab {
  constructor() {
    this.tabName = 'archive';
    this.container = document.getElementById('archive-content');
    this.filters = {
      owner: '',
      plan: '',
      month: '',
      search: ''
    };
    this.pagination = {
      page: 1,
      limit: 20,
      total: 0
    };
  }

  async render() {
    if (!this.container) {
      console.error('Archive tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading archive...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getTasksFinished(this.filters);
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      this.populateFilterOptions(data);
      
    } catch (error) {
      console.error('Archive refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data) return;

    const filteredTasks = this.applyClientSideFiltering(data.tasks);
    const paginatedTasks = this.paginateResults(filteredTasks);

    this.container.innerHTML = `
      ${this.renderArchiveStats(data, filteredTasks)}
      ${this.renderTasksList(paginatedTasks)}
      ${this.renderPagination(filteredTasks.length)}
    `;
  }

  renderArchiveStats(data, filteredTasks) {
    const total = data.total || 0;
    const filtered = filteredTasks.length;
    const hasFilters = this.hasActiveFilters();

    // Calculate some stats
    const tasksByMonth = this.groupTasksByMonth(filteredTasks);
    const tasksByOwner = this.groupTasksByOwner(filteredTasks);
    const avgDuration = this.calculateAverageDuration(filteredTasks);

    return `
      <div class="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-claw-500">${hasFilters ? filtered : total}</div>
          <div class="text-sm text-gray-400">${hasFilters ? 'Filtered' : 'Total'} Tasks</div>
          ${hasFilters ? `<div class="text-xs text-gray-500 mt-1">of ${total} total</div>` : ''}
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-blue-400">${Object.keys(tasksByMonth).length}</div>
          <div class="text-sm text-gray-400">Months Active</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-green-400">${Object.keys(tasksByOwner).length}</div>
          <div class="text-sm text-gray-400">Contributors</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-purple-400">${avgDuration}</div>
          <div class="text-sm text-gray-400">Avg Duration</div>
        </div>
      </div>
    `;
  }

  renderTasksList(tasks) {
    if (tasks.length === 0) {
      return `
        <div class="text-center py-12 text-gray-400">
          <div class="text-4xl mb-4">📁</div>
          <div class="text-lg">No completed tasks found</div>
          ${this.hasActiveFilters() ? `
            <button onclick="ArchiveTab.clearAllFilters()" class="btn btn-secondary mt-4">
              Clear Filters
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="space-y-3">
        ${tasks.map(task => this.renderTaskItem(task)).join('')}
      </div>
    `;
  }

  renderTaskItem(task) {
    const agentColor = TabUtils.getAgentColor(task.owner);
    const complexityColor = this.getComplexityColor(task.complexity);
    const completedDate = new Date(task.completed_date);

    return `
      <div class="archive-item">
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1">
            <h3 class="archive-item-title">${task.title}</h3>
            <p class="text-gray-400 text-sm mt-1">${task.plan_title}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="status-badge" style="background-color: ${complexityColor}">
              ${task.complexity}
            </span>
            <button onclick="ArchiveTab.viewTaskEvidence('${task.id}', '${task.evidence_path}')" 
                    class="btn btn-secondary text-xs">
              View Evidence
            </button>
          </div>
        </div>

        <div class="archive-item-meta">
          <span class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-full" style="background-color: ${agentColor}"></span>
            <span style="color: ${agentColor}">${task.owner}</span>
          </span>
          <span>•</span>
          <span title="${completedDate.toLocaleString()}">
            Completed ${TabUtils.formatTimestamp(task.completed_date)}
          </span>
          <span>•</span>
          <span>${this.formatDuration(task.duration_hours)}</span>
          <span>•</span>
          <span class="font-mono text-gray-400">
            ${task.id}
          </span>
        </div>
      </div>
    `;
  }

  renderPagination(totalResults) {
    const totalPages = Math.ceil(totalResults / this.pagination.limit);
    if (totalPages <= 1) return '';

    const currentPage = this.pagination.page;
    const startItem = ((currentPage - 1) * this.pagination.limit) + 1;
    const endItem = Math.min(currentPage * this.pagination.limit, totalResults);

    return `
      <div class="mt-6 flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="text-sm text-gray-400">
          Showing ${startItem}-${endItem} of ${totalResults} tasks
        </div>
        <div class="flex items-center gap-2">
          <button onclick="ArchiveTab.previousPage()" 
                  class="btn btn-secondary text-sm" 
                  ${currentPage === 1 ? 'disabled' : ''}>
            Previous
          </button>
          <div class="flex items-center gap-1">
            ${this.renderPageNumbers(currentPage, totalPages)}
          </div>
          <button onclick="ArchiveTab.nextPage()" 
                  class="btn btn-secondary text-sm"
                  ${currentPage === totalPages ? 'disabled' : ''}>
            Next
          </button>
        </div>
      </div>
    `;
  }

  renderPageNumbers(currentPage, totalPages) {
    const pages = [];
    const showPages = 5; // Show 5 page numbers max
    
    let start = Math.max(1, currentPage - Math.floor(showPages / 2));
    let end = Math.min(totalPages, start + showPages - 1);
    start = Math.max(1, end - showPages + 1);

    if (start > 1) {
      pages.push(`<button onclick="ArchiveTab.goToPage(1)" class="px-2 py-1 text-sm rounded hover:bg-gray-700">1</button>`);
      if (start > 2) pages.push('<span class="px-2 py-1 text-sm text-gray-500">...</span>');
    }

    for (let i = start; i <= end; i++) {
      const isActive = i === currentPage;
      pages.push(`
        <button onclick="ArchiveTab.goToPage(${i})" 
                class="px-2 py-1 text-sm rounded ${isActive ? 'bg-claw-600 text-white' : 'hover:bg-gray-700'}">
          ${i}
        </button>
      `);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('<span class="px-2 py-1 text-sm text-gray-500">...</span>');
      pages.push(`<button onclick="ArchiveTab.goToPage(${totalPages})" class="px-2 py-1 text-sm rounded hover:bg-gray-700">${totalPages}</button>`);
    }

    return pages.join('');
  }

  populateFilterOptions(data) {
    if (!data.filter_options) return;

    const ownerSelect = document.getElementById('archive-owner-filter');
    const planSelect = document.getElementById('archive-plan-filter');
    const monthSelect = document.getElementById('archive-month-filter');

    if (ownerSelect) {
      ownerSelect.innerHTML = '<option value="">All Agents</option>' +
        data.filter_options.owners.map(owner => 
          `<option value="${owner}" ${this.filters.owner === owner ? 'selected' : ''}>${owner}</option>`
        ).join('');
    }

    if (planSelect) {
      planSelect.innerHTML = '<option value="">All Plans</option>' +
        data.filter_options.plans.map(plan => 
          `<option value="${plan}" ${this.filters.plan === plan ? 'selected' : ''}>${plan}</option>`
        ).join('');
    }

    if (monthSelect) {
      monthSelect.innerHTML = '<option value="">All Months</option>' +
        data.filter_options.months.map(month => 
          `<option value="${month}" ${this.filters.month === month ? 'selected' : ''}>${this.formatMonth(month)}</option>`
        ).join('');
    }

    // Update search input
    const searchInput = document.getElementById('archive-search');
    if (searchInput) {
      searchInput.value = this.filters.search;
    }
  }

  applyClientSideFiltering(tasks) {
    let filtered = [...tasks];

    // Apply search filter
    if (this.filters.search) {
      const searchTerm = this.filters.search.toLowerCase();
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchTerm) ||
        task.plan_title.toLowerCase().includes(searchTerm) ||
        task.owner.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }

  paginateResults(tasks) {
    const start = (this.pagination.page - 1) * this.pagination.limit;
    const end = start + this.pagination.limit;
    return tasks.slice(start, end);
  }

  hasActiveFilters() {
    return this.filters.owner || this.filters.plan || this.filters.month || this.filters.search;
  }

  groupTasksByMonth(tasks) {
    const grouped = {};
    tasks.forEach(task => {
      const month = task.completed_date.substring(0, 7); // YYYY-MM
      grouped[month] = (grouped[month] || 0) + 1;
    });
    return grouped;
  }

  groupTasksByOwner(tasks) {
    const grouped = {};
    tasks.forEach(task => {
      grouped[task.owner] = (grouped[task.owner] || 0) + 1;
    });
    return grouped;
  }

  calculateAverageDuration(tasks) {
    if (tasks.length === 0) return '0h';
    const totalHours = tasks.reduce((sum, task) => sum + (task.duration_hours || 0), 0);
    const avgHours = totalHours / tasks.length;
    return this.formatDuration(avgHours);
  }

  getComplexityColor(complexity) {
    const colors = {
      'simple': '#10b981',    // emerald-500
      'medium': '#f59e0b',    // amber-500
      'complex': '#ef4444'    // red-500
    };
    return colors[complexity] || '#6b7280'; // gray-500
  }

  formatDuration(hours) {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  formatMonth(monthString) {
    const date = new Date(monthString + '-01');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  // Filter application methods
  static applyFilters() {
    const archiveTab = TabSystem.getComponent('archive');
    if (!archiveTab) return;

    // Get filter values
    archiveTab.filters.owner = document.getElementById('archive-owner-filter')?.value || '';
    archiveTab.filters.plan = document.getElementById('archive-plan-filter')?.value || '';
    archiveTab.filters.month = document.getElementById('archive-month-filter')?.value || '';
    archiveTab.filters.search = document.getElementById('archive-search')?.value || '';

    // Reset to first page
    archiveTab.pagination.page = 1;

    // Save filters to state
    stateManager.setTabState('archive', { 
      filters: archiveTab.filters,
      pagination: archiveTab.pagination 
    });

    // Apply filters (triggers API call with new filters)
    archiveTab.refresh();
  }

  static clearAllFilters() {
    const archiveTab = TabSystem.getComponent('archive');
    if (!archiveTab) return;

    // Clear all filters
    archiveTab.filters = { owner: '', plan: '', month: '', search: '' };
    archiveTab.pagination.page = 1;

    // Clear UI
    document.getElementById('archive-owner-filter').value = '';
    document.getElementById('archive-plan-filter').value = '';
    document.getElementById('archive-month-filter').value = '';
    document.getElementById('archive-search').value = '';

    // Save to state
    stateManager.setTabState('archive', { 
      filters: archiveTab.filters,
      pagination: archiveTab.pagination 
    });

    // Refresh
    archiveTab.refresh();
  }

  // Pagination methods
  static previousPage() {
    const archiveTab = TabSystem.getComponent('archive');
    if (archiveTab && archiveTab.pagination.page > 1) {
      archiveTab.pagination.page--;
      archiveTab.rerenderWithCurrentData();
    }
  }

  static nextPage() {
    const archiveTab = TabSystem.getComponent('archive');
    if (archiveTab) {
      archiveTab.pagination.page++;
      archiveTab.rerenderWithCurrentData();
    }
  }

  static goToPage(page) {
    const archiveTab = TabSystem.getComponent('archive');
    if (archiveTab) {
      archiveTab.pagination.page = page;
      archiveTab.rerenderWithCurrentData();
    }
  }

  static viewTaskEvidence(taskId, evidencePath) {
    console.log(`Viewing evidence for task ${taskId}:`, evidencePath);
    
    // This could open the evidence file in a modal or new window
    alert(`Evidence viewing would open: ${evidencePath}`);
  }

  rerenderWithCurrentData() {
    const data = stateManager.getTabData(this.tabName);
    if (data) {
      this.renderContent(data);
    }
  }

  // Component lifecycle methods
  onShow() {
    console.log('Archive tab shown');
    
    // Restore state from storage
    const tabState = stateManager.getTabState(this.tabName);
    if (tabState) {
      this.filters = { ...this.filters, ...tabState.filters };
      this.pagination = { ...this.pagination, ...tabState.pagination };
    }
  }

  onHide() {
    console.log('Archive tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const archiveTab = new ArchiveTab();
  TabSystem.registerComponent('archive', archiveTab);
  
  // Make static methods globally available
  window.ArchiveTab = ArchiveTab;
});