// Mission Control v3 - Feed Tab Component
// Real-time activity stream

class FeedTab {
  constructor() {
    this.tabName = 'feed';
    this.container = document.getElementById('feed-content');
    this.sinceTimestamp = null;
    this.maxEntries = 100;
    this.autoScroll = true;
    this.entries = [];
  }

  async render() {
    if (!this.container) {
      console.error('Feed tab container not found');
      return;
    }

    TabErrorHandler.showLoading(this.container, 'Loading live feed...');
    
    try {
      await this.refresh();
    } catch (error) {
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  async refresh() {
    try {
      TabErrorHandler.clearErrors(this.container);
      
      const data = await api.getTasksLog(this.sinceTimestamp);
      
      // Merge new entries with existing ones
      if (this.sinceTimestamp && data.entries) {
        this.mergeEntries(data.entries);
      } else {
        this.entries = data.entries || [];
      }
      
      // Update timestamp for next refresh
      this.sinceTimestamp = data.latest_timestamp;
      
      stateManager.setTabData(this.tabName, { 
        entries: this.entries, 
        latest_timestamp: this.sinceTimestamp 
      });
      
      this.renderContent();
      
    } catch (error) {
      console.error('Feed refresh failed:', error);
      stateManager.setTabError(this.tabName, error);
      TabErrorHandler.showError(this.container, error, () => this.refresh());
    }
  }

  mergeEntries(newEntries) {
    if (!newEntries.length) return;

    // Add new entries to the beginning
    this.entries = [...newEntries, ...this.entries];
    
    // Remove duplicates based on ID
    const seen = new Set();
    this.entries = this.entries.filter(entry => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    
    // Limit total entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
  }

  renderContent() {
    if (!this.entries.length) {
      this.container.innerHTML = `
        <div class="h-full flex items-center justify-center text-gray-400">
          <div class="text-center">
            <div class="text-4xl mb-4">📡</div>
            <div class="text-lg">No activity yet</div>
            <div class="text-sm mt-2">Activity will appear here as it happens</div>
          </div>
        </div>
      `;
      return;
    }

    const groupedEntries = this.groupEntriesByTime(this.entries);
    
    this.container.innerHTML = `
      <div class="h-full flex flex-col">
        ${this.renderFeedControls()}
        <div class="flex-1 overflow-y-auto space-y-4" id="feed-scroll-container">
          ${Object.entries(groupedEntries).map(([timeGroup, entries]) => 
            this.renderTimeGroup(timeGroup, entries)
          ).join('')}
        </div>
      </div>
    `;

    // Auto-scroll to top if new entries were added
    if (this.autoScroll) {
      this.scrollToTop();
    }
  }

  renderFeedControls() {
    return `
      <div class="mb-4 flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg p-3">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span class="text-sm text-green-400 font-medium">Live Feed</span>
          </div>
          <div class="text-sm text-gray-400">
            ${this.entries.length} entries
          </div>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" 
                   ${this.autoScroll ? 'checked' : ''} 
                   onchange="FeedTab.toggleAutoScroll(this.checked)"
                   class="rounded">
            Auto-scroll
          </label>
          <button onclick="FeedTab.clearFeed()" class="btn btn-secondary text-sm">
            Clear
          </button>
          <button onclick="TabSystem.refreshCurrentTab(true)" class="btn btn-secondary text-sm">
            Refresh
          </button>
        </div>
      </div>
    `;
  }

  renderTimeGroup(timeGroup, entries) {
    return `
      <div class="feed-time-group">
        <div class="sticky top-0 bg-gray-900/80 backdrop-blur-sm py-2 mb-3 border-b border-gray-700">
          <h3 class="text-sm font-medium text-gray-400">${timeGroup}</h3>
        </div>
        <div class="space-y-2">
          ${entries.map(entry => this.renderFeedEntry(entry)).join('')}
        </div>
      </div>
    `;
  }

  renderFeedEntry(entry) {
    const agentColor = TabUtils.getAgentColor(entry.agent_id);
    const actionIcon = this.getActionIcon(entry.action_type);
    const timestamp = new Date(entry.timestamp);
    const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="feed-item">
        <div class="flex items-start gap-3">
          <div class="feed-item-timestamp">${timeStr}</div>
          <div class="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-sm" 
               style="background-color: ${agentColor}20; color: ${agentColor}">
            ${actionIcon}
          </div>
          <div class="flex-1 min-w-0">
            <div class="feed-item-content">
              <span class="feed-item-agent" style="color: ${agentColor}">${entry.agent_id}</span>
              <span class="text-gray-300">${this.formatActionMessage(entry)}</span>
            </div>
            ${entry.note ? `
              <div class="text-xs text-gray-500 mt-1 italic">
                "${entry.note}"
              </div>
            ` : ''}
            ${entry.metadata && (entry.metadata.priority || entry.metadata.tags?.length) ? `
              <div class="flex items-center gap-2 mt-1">
                ${entry.metadata.priority ? `
                  <span class="text-xs px-1.5 py-0.5 rounded" 
                        style="background-color: ${this.getPriorityColor(entry.metadata.priority)}20; color: ${this.getPriorityColor(entry.metadata.priority)}">
                    P${entry.metadata.priority}
                  </span>
                ` : ''}
                ${entry.metadata.tags?.map(tag => `
                  <span class="text-xs px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                    ${tag}
                  </span>
                `).join('') || ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  groupEntriesByTime(entries) {
    const groups = {};
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();

    entries.forEach(entry => {
      const entryDate = new Date(entry.timestamp);
      const entryDateStr = entryDate.toDateString();
      
      let groupKey;
      if (entryDateStr === today) {
        groupKey = 'Today';
      } else if (entryDateStr === yesterday) {
        groupKey = 'Yesterday';
      } else {
        groupKey = entryDate.toLocaleDateString([], { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric' 
        });
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(entry);
    });

    return groups;
  }

  getActionIcon(actionType) {
    const icons = {
      'create': '✨',
      'update': '📝',
      'complete': '✅',
      'assign': '👤',
      'block': '🚫',
      'escalate': '⬆️',
      'start': '▶️',
      'pause': '⏸️',
      'resume': '▶️',
      'cancel': '❌'
    };
    return icons[actionType] || '📋';
  }

  formatActionMessage(entry) {
    const taskTitle = entry.task_title ? `"${entry.task_title}"` : 'a task';
    
    switch (entry.action_type) {
      case 'create':
        return `created ${taskTitle}`;
      case 'update':
        if (entry.old_value && entry.new_value) {
          return `updated ${taskTitle} from ${entry.old_value} to ${entry.new_value}`;
        }
        return `updated ${taskTitle}`;
      case 'complete':
        return `completed ${taskTitle}`;
      case 'assign':
        return `was assigned ${taskTitle}`;
      case 'block':
        return `blocked ${taskTitle}`;
      case 'escalate':
        return `escalated ${taskTitle}`;
      case 'start':
        return `started working on ${taskTitle}`;
      case 'pause':
        return `paused work on ${taskTitle}`;
      case 'resume':
        return `resumed work on ${taskTitle}`;
      case 'cancel':
        return `cancelled ${taskTitle}`;
      default:
        return `performed ${entry.action_type} on ${taskTitle}`;
    }
  }

  getPriorityColor(priority) {
    if (priority >= 8) return '#ef4444'; // red-500
    if (priority >= 5) return '#f59e0b'; // amber-500
    if (priority >= 3) return '#3b82f6'; // blue-500
    return '#6b7280'; // gray-500
  }

  scrollToTop() {
    const scrollContainer = document.getElementById('feed-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  }

  // Static methods
  static toggleAutoScroll(enabled) {
    const feedTab = TabSystem.getComponent('feed');
    if (feedTab) {
      feedTab.autoScroll = enabled;
      stateManager.setTabState('feed', { autoScroll: enabled });
    }
  }

  static clearFeed() {
    const feedTab = TabSystem.getComponent('feed');
    if (feedTab) {
      feedTab.entries = [];
      feedTab.sinceTimestamp = null;
      stateManager.setTabData('feed', { entries: [], latest_timestamp: null });
      feedTab.renderContent();
    }
  }

  // Component lifecycle methods
  onShow() {
    console.log('Feed tab shown');
    
    // Restore state from storage
    const tabState = stateManager.getTabState(this.tabName);
    if (tabState) {
      this.autoScroll = tabState.autoScroll !== undefined ? tabState.autoScroll : true;
    }

    // Restore data from state
    const data = stateManager.getTabData(this.tabName);
    if (data) {
      this.entries = data.entries || [];
      this.sinceTimestamp = data.latest_timestamp;
    }
  }

  onHide() {
    console.log('Feed tab hidden');
  }

  onTabChange(fromTab, toTab, isActive) {
    if (isActive) {
      // Force refresh when becoming active to get latest entries
      setTimeout(() => this.refresh(), 100);
    }
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const feedTab = new FeedTab();
  TabSystem.registerComponent('feed', feedTab);
  
  // Make static methods globally available
  window.FeedTab = FeedTab;
});