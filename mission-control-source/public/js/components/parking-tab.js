// Mission Control v3 - Parking Tab Component
// Todo/ideas collection and management

class ParkingTab {
  constructor() {
    this.tabName = 'parking';
    this.container = document.getElementById('parking-content');
    this.sortBy = 'priority';
  }

  async render() {
    if (!this.container) {
      console.error('Parking tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading parking items...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getPinned();
      
      stateManager.setTabData(this.tabName, data);
      this.renderContent(data);
      
    } catch (error) {
      console.error('Parking refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  renderContent(data) {
    if (!data) return;

    const items = data.items || [];
    const sortedItems = this.sortItems(items);
    const itemsByCategory = this.groupItemsByCategory(sortedItems);

    this.container.innerHTML = `
      ${this.renderParkingStats(items)}
      ${this.renderParkingControls()}
      ${Object.keys(itemsByCategory).length > 0 ? this.renderItemsByCategory(itemsByCategory) : this.renderEmptyState()}
    `;

    this.attachEventListeners();
  }

  renderParkingStats(items) {
    const totalItems = items.length;
    const highPriorityItems = items.filter(item => this.getItemPriority(item) > 7).length;
    const categories = [...new Set(items.map(item => this.getItemCategory(item)))].length;
    const recentItems = items.filter(item => this.isRecentItem(item)).length;

    return `
      <div class="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-claw-500">${totalItems}</div>
          <div class="text-sm text-gray-400">Total Items</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-red-400">${highPriorityItems}</div>
          <div class="text-sm text-gray-400">High Priority</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-blue-400">${categories}</div>
          <div class="text-sm text-gray-400">Categories</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-green-400">${recentItems}</div>
          <div class="text-sm text-gray-400">Added Recently</div>
        </div>
      </div>
    `;
  }

  renderParkingControls() {
    return `
      <div class="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex flex-wrap gap-4 items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-400">Sort by:</label>
              <select id="parking-sort" class="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm">
                <option value="priority" ${this.sortBy === 'priority' ? 'selected' : ''}>Priority</option>
                <option value="category" ${this.sortBy === 'category' ? 'selected' : ''}>Category</option>
                <option value="date" ${this.sortBy === 'date' ? 'selected' : ''}>Date Added</option>
                <option value="title" ${this.sortBy === 'title' ? 'selected' : ''}>Title</option>
              </select>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="ParkingTab.addNewItem()" class="btn btn-primary text-sm">
              <span>➕</span> Add Item
            </button>
            <button onclick="ParkingTab.exportItems()" class="btn btn-secondary text-sm">
              <span>📤</span> Export
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderItemsByCategory(itemsByCategory) {
    return `
      <div class="space-y-6">
        ${Object.entries(itemsByCategory).map(([category, items]) => 
          this.renderCategorySection(category, items)
        ).join('')}
      </div>
    `;
  }

  renderCategorySection(category, items) {
    const categoryColor = this.getCategoryColor(category);
    const categoryIcon = this.getCategoryIcon(category);

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <span style="color: ${categoryColor}">${categoryIcon}</span>
            <span>${category}</span>
            <span class="bg-gray-700 px-2 py-0.5 rounded text-xs font-normal">${items.length}</span>
          </h3>
          <button onclick="ParkingTab.collapseCategory('${category}')" 
                  class="text-gray-400 hover:text-gray-300 text-sm">
            ▼
          </button>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${items.map(item => this.renderParkingItem(item)).join('')}
        </div>
      </div>
    `;
  }

  renderParkingItem(item) {
    const priority = this.getItemPriority(item);
    const priorityColor = this.getPriorityColor(priority);
    const category = this.getItemCategory(item);
    const dateAdded = this.getItemDate(item);
    const tags = this.getItemTags(item);

    return `
      <div class="bg-gray-700 border border-gray-600 rounded-lg p-4 hover:bg-gray-650 transition-colors">
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1">
            <h4 class="font-semibold text-gray-100 mb-1">${item.title || 'Untitled Item'}</h4>
            <p class="text-sm text-gray-400 line-clamp-2">${item.description || item.content || 'No description'}</p>
          </div>
          <div class="flex items-center gap-2 ml-3">
            ${priority > 0 ? `
              <span class="text-xs px-2 py-1 rounded font-medium" 
                    style="background-color: ${priorityColor}20; color: ${priorityColor}">
                P${priority}
              </span>
            ` : ''}
            <button onclick="ParkingTab.showItemMenu('${item.id || item.file || item.title}')" 
                    class="text-gray-400 hover:text-gray-300">
              ⋮
            </button>
          </div>
        </div>

        ${tags.length > 0 ? `
          <div class="flex flex-wrap gap-1 mb-3">
            ${tags.map(tag => `
              <span class="text-xs px-2 py-0.5 bg-gray-600 rounded text-gray-300">
                ${tag}
              </span>
            `).join('')}
          </div>
        ` : ''}

        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>Added ${TabUtils.formatTimestamp(dateAdded)}</span>
          ${item.source ? `<span>from ${item.source}</span>` : ''}
        </div>

        <div class="mt-3 flex gap-2">
          <button onclick="ParkingTab.promoteToTask('${item.id || item.file || item.title}')" 
                  class="btn btn-secondary text-xs flex-1">
            Promote to Task
          </button>
          <button onclick="ParkingTab.editItem('${item.id || item.file || item.title}')" 
                  class="btn text-xs px-3" style="background-color: ${priorityColor}">
            Edit
          </button>
        </div>
      </div>
    `;
  }

  renderEmptyState() {
    return `
      <div class="text-center py-12 text-gray-400">
        <div class="text-6xl mb-4">🅿️</div>
        <div class="text-xl mb-2">Parking Lot is Empty</div>
        <div class="text-sm mb-6">Ideas and todos will appear here as they're added</div>
        <button onclick="ParkingTab.addNewItem()" class="btn btn-primary">
          <span>➕</span> Add Your First Item
        </button>
      </div>
    `;
  }

  sortItems(items) {
    const sorted = [...items];
    
    switch (this.sortBy) {
      case 'priority':
        return sorted.sort((a, b) => this.getItemPriority(b) - this.getItemPriority(a));
      case 'category':
        return sorted.sort((a, b) => this.getItemCategory(a).localeCompare(this.getItemCategory(b)));
      case 'date':
        return sorted.sort((a, b) => new Date(this.getItemDate(b)) - new Date(this.getItemDate(a)));
      case 'title':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      default:
        return sorted;
    }
  }

  groupItemsByCategory(items) {
    const grouped = {};
    
    items.forEach(item => {
      const category = this.getItemCategory(item);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });

    return grouped;
  }

  getItemPriority(item) {
    // Try to extract priority from various fields
    if (item.priority !== undefined) return item.priority;
    if (item.metadata && item.metadata.priority) return item.metadata.priority;
    
    // Infer priority from content
    const content = (item.title + ' ' + (item.description || item.content || '')).toLowerCase();
    if (content.includes('urgent') || content.includes('critical')) return 9;
    if (content.includes('important') || content.includes('high')) return 7;
    if (content.includes('medium') || content.includes('moderate')) return 5;
    if (content.includes('low') || content.includes('nice to have')) return 3;
    
    return 5; // Default medium priority
  }

  getItemCategory(item) {
    if (item.category) return item.category;
    if (item.type) return item.type;
    
    // Infer category from content
    const content = (item.title + ' ' + (item.description || item.content || '')).toLowerCase();
    if (content.includes('bug') || content.includes('fix')) return 'Bug Fixes';
    if (content.includes('feature') || content.includes('enhancement')) return 'Features';
    if (content.includes('idea') || content.includes('concept')) return 'Ideas';
    if (content.includes('research') || content.includes('investigate')) return 'Research';
    if (content.includes('doc') || content.includes('documentation')) return 'Documentation';
    if (content.includes('refactor') || content.includes('cleanup')) return 'Technical Debt';
    
    return 'General';
  }

  getItemDate(item) {
    return item.created || item.date || item.timestamp || item.pinned || new Date().toISOString();
  }

  getItemTags(item) {
    if (Array.isArray(item.tags)) return item.tags;
    if (typeof item.tags === 'string') return item.tags.split(',').map(t => t.trim());
    return [];
  }

  isRecentItem(item) {
    const itemDate = new Date(this.getItemDate(item));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return itemDate > weekAgo;
  }

  getCategoryColor(category) {
    const colors = {
      'Bug Fixes': '#ef4444',      // red-500
      'Features': '#10b981',       // emerald-500
      'Ideas': '#8b5cf6',          // violet-500
      'Research': '#06b6d4',       // cyan-500
      'Documentation': '#f59e0b',  // amber-500
      'Technical Debt': '#6366f1', // indigo-500
      'General': '#6b7280'         // gray-500
    };
    return colors[category] || '#6b7280';
  }

  getCategoryIcon(category) {
    const icons = {
      'Bug Fixes': '🐛',
      'Features': '✨',
      'Ideas': '💡',
      'Research': '🔍',
      'Documentation': '📚',
      'Technical Debt': '🔧',
      'General': '📝'
    };
    return icons[category] || '📝';
  }

  getPriorityColor(priority) {
    if (priority >= 8) return '#ef4444'; // red-500
    if (priority >= 6) return '#f59e0b'; // amber-500
    if (priority >= 4) return '#3b82f6'; // blue-500
    return '#6b7280'; // gray-500
  }

  attachEventListeners() {
    const sortSelect = document.getElementById('parking-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        stateManager.setTabState(this.tabName, { sortBy: this.sortBy });
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

  // Static methods for item actions
  static addNewItem() {
    console.log('Adding new parking item');
    // This could open a modal or form
    const title = prompt('Item title:');
    const description = prompt('Description (optional):');
    
    if (title) {
      // In real implementation, this would call an API to create the item
      console.log('Would create item:', { title, description });
      alert('Item creation would be implemented here');
    }
  }

  static editItem(itemId) {
    console.log('Editing item:', itemId);
    // This could open an edit modal
    alert(`Edit functionality for item ${itemId} would be implemented here`);
  }

  static promoteToTask(itemId) {
    console.log('Promoting to task:', itemId);
    // This could create a new task from the parking item
    if (confirm(`Promote "${itemId}" to a task?`)) {
      alert('Task creation from parking item would be implemented here');
    }
  }

  static exportItems() {
    console.log('Exporting parking items');
    const data = stateManager.getTabData('parking');
    if (data && data.items) {
      const jsonData = JSON.stringify(data.items, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parking-items-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  static showItemMenu(itemId) {
    console.log('Showing menu for item:', itemId);
    // This could show a context menu with actions
    const actions = ['Edit', 'Promote to Task', 'Change Priority', 'Delete'];
    const action = prompt(`Actions for "${itemId}":\n${actions.join('\n')}\n\nEnter action:`);
    if (action) {
      console.log(`Would perform "${action}" on ${itemId}`);
    }
  }

  static collapseCategory(category) {
    console.log('Toggling category collapse:', category);
    // This could collapse/expand the category section
    alert(`Category collapse for "${category}" would be implemented here`);
  }

  // Component lifecycle methods
  onShow() {
    console.log('Parking tab shown');
    
    // Restore state from storage
    const tabState = stateManager.getTabState(this.tabName);
    if (tabState) {
      this.sortBy = tabState.sortBy || 'priority';
    }
  }

  onHide() {
    console.log('Parking tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    // Handle tab change if needed
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const parkingTab = new ParkingTab();
  TabSystem.registerComponent('parking', parkingTab);
  
  // Make static methods globally available
  window.ParkingTab = ParkingTab;
});