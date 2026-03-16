// Mission Control v3 - Tab Navigation System
// Handles hash-based routing and tab lifecycle management

class TabSystemClass {
  constructor() {
    this.currentTab = 'overview';
    this.tabComponents = new Map();
    this.refreshTimers = new Map();
    this.routeHandlers = new Map();
    this.initialized = false;
  }

  // Initialize the tab system
  init() {
    if (this.initialized) return;

    this.setupRouting();
    this.attachEventListeners();
    this.registerTabComponents();
    
    // Set initial tab from URL hash
    const initialTab = this.getTabFromHash();
    this.currentTab = ''; // Force showTab to run
    this.showTab(initialTab);
    
    this.initialized = true;
    console.log('Tab system initialized, current tab:', this.currentTab);
  }

  // Setup hash-based routing
  setupRouting() {
    // Valid routes
    this.routes = {
      '': 'overview',           // Default route
      'overview': 'overview',   // /#/overview
      'agents': 'agents',       // /#/agents
      'hierarchy': 'hierarchy', // /#/hierarchy
      'projects': 'projects',   // /#/projects
      'archive': 'archive',     // /#/archive
      'feed': 'feed',          // /#/feed
      'performance': 'performance', // /#/performance
      'parking': 'parking',     // /#/parking
      'whiteboard': 'whiteboard',       // /#/whiteboard
      'hivedeck-agents': 'hivedeck-agents', // /#/hivedeck-agents
      'sites': 'sites',                     // /#/sites
      'pipeline': 'pipeline'                // /#/pipeline
    };

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      const newTab = this.getTabFromHash();
      if (newTab !== this.currentTab) {
        this.showTab(newTab);
      }
    });
  }

  // Get current tab from URL hash
  getTabFromHash() {
    const hash = window.location.hash.slice(2); // Remove #/
    return this.routes[hash] || 'overview';
  }

  // Navigate to a tab (updates URL hash)
  navigate(tabName) {
    if (!this.routes[tabName] && tabName !== '') {
      console.warn(`Invalid tab: ${tabName}`);
      return;
    }
    
    window.location.hash = `#/${tabName}`;
  }

  // Show a specific tab
  showTab(tabName) {
    if (tabName === this.currentTab) return;

    const previousTab = this.currentTab;
    
    // Hide current tab
    this.hideTab(previousTab);
    
    // Show new tab
    this.currentTab = tabName;
    this.showTabContent(tabName);
    this.updateTabNavigation(tabName);
    
    // Update global state
    stateManager.setGlobal('currentTab', tabName);
    
    // Notify tab components
    this.notifyTabChange(previousTab, tabName);
    
    // Handle tab refresh
    this.handleTabRefresh(tabName);
    
    console.log(`Switched from ${previousTab} to ${tabName}`);
  }

  // Hide tab content
  hideTab(tabName) {
    const tabElement = document.getElementById(`tab-${tabName}`);
    if (tabElement) {
      tabElement.classList.add('hidden');
    }

    // Notify component it's being hidden
    const component = this.tabComponents.get(tabName);
    if (component && typeof component.onHide === 'function') {
      try {
        component.onHide();
      } catch (error) {
        console.error(`Error hiding tab ${tabName}:`, error);
      }
    }
  }

  // Show tab content
  showTabContent(tabName) {
    const tabElement = document.getElementById(`tab-${tabName}`);
    if (tabElement) {
      tabElement.classList.remove('hidden');
    }

    // Notify component it's being shown
    const component = this.tabComponents.get(tabName);
    if (component && typeof component.onShow === 'function') {
      try {
        component.onShow();
      } catch (error) {
        console.error(`Error showing tab ${tabName}:`, error);
      }
    }
  }

  // Update tab navigation visual state
  updateTabNavigation(activeTab) {
    document.querySelectorAll('.tab-button').forEach(button => {
      const tabName = button.getAttribute('data-tab');
      if (tabName === activeTab) {
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
      } else {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
      }
    });
  }

  // Register tab components
  registerTabComponents() {
    // Components will register themselves when loaded
    // This method can be used to force registration
  }

  // Register a tab component
  registerComponent(tabName, component) {
    this.tabComponents.set(tabName, component);
    console.log(`Registered component for tab: ${tabName}`);
  }

  // Notify components of tab changes
  notifyTabChange(fromTab, toTab) {
    this.tabComponents.forEach((component, tabName) => {
      if (typeof component.onTabChange === 'function') {
        try {
          component.onTabChange(fromTab, toTab, tabName === toTab);
        } catch (error) {
          console.error(`Error notifying tab change to ${tabName}:`, error);
        }
      }
    });
  }

  // Handle tab refresh logic
  handleTabRefresh(tabName, force = false) {
    if (stateManager.needsRefresh(tabName, force)) {
      this.refreshTab(tabName);
    }
    
    // Setup auto-refresh timer for this tab
    this.setupRefreshTimer(tabName);
  }

  // Refresh a specific tab
  async refreshTab(tabName) {
    const component = this.tabComponents.get(tabName);
    if (component && typeof component.refresh === 'function') {
      try {
        await component.refresh();
      } catch (error) {
        console.error(`Error refreshing tab ${tabName}:`, error);
        stateManager.setTabError(tabName, error);
      }
    }
  }

  // Refresh current tab
  refreshCurrentTab(force = false) {
    this.refreshTab(this.currentTab);
  }

  // Setup auto-refresh timer for active tab
  setupRefreshTimer(tabName) {
    // Clear existing timer
    if (this.refreshTimers.has(tabName)) {
      clearInterval(this.refreshTimers.get(tabName));
    }

    const tabState = stateManager.getTabState(tabName);
    if (!tabState || !tabState.autoRefresh || !tabState.refreshInterval) {
      return;
    }

    // Only set timer if this is the current tab
    if (tabName === this.currentTab) {
      const timer = setInterval(() => {
        if (this.currentTab === tabName) { // Double-check we're still on this tab
          this.refreshTab(tabName);
        }
      }, tabState.refreshInterval);
      
      this.refreshTimers.set(tabName, timer);
    }
  }

  // Clear refresh timer for a tab
  clearRefreshTimer(tabName) {
    if (this.refreshTimers.has(tabName)) {
      clearInterval(this.refreshTimers.get(tabName));
      this.refreshTimers.delete(tabName);
    }
  }

  // Clear all refresh timers
  clearAllRefreshTimers() {
    this.refreshTimers.forEach((timer, tabName) => {
      clearInterval(timer);
    });
    this.refreshTimers.clear();
  }

  // Attach global event listeners
  attachEventListeners() {
    // Handle page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clearAllRefreshTimers();
      } else {
        // Page became visible, refresh current tab and restart timers
        this.handleTabRefresh(this.currentTab, true);
      }
    });

    // Handle window focus
    window.addEventListener('focus', () => {
      this.handleTabRefresh(this.currentTab, true);
    });

    // Handle keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + number keys for tab switching
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const tabNames = Object.values(this.routes).filter((v, i, arr) => arr.indexOf(v) === i);
        if (tabNames[tabIndex]) {
          this.navigate(tabNames[tabIndex]);
        }
      }
    });
  }

  // Get tab component
  getComponent(tabName) {
    return this.tabComponents.get(tabName);
  }

  // Check if tab is active
  isActiveTab(tabName) {
    return this.currentTab === tabName;
  }

  // Get all registered tabs
  getRegisteredTabs() {
    return Array.from(this.tabComponents.keys());
  }

  // Destroy tab system (cleanup)
  destroy() {
    this.clearAllRefreshTimers();
    window.removeEventListener('hashchange', this.handleHashChange);
    this.tabComponents.clear();
    this.initialized = false;
  }

  // Debug helpers
  debug() {
    console.log('Tab System State:', {
      currentTab: this.currentTab,
      registeredComponents: this.getRegisteredTabs(),
      activeTimers: Array.from(this.refreshTimers.keys()),
      urlHash: window.location.hash,
      initialized: this.initialized
    });
  }
}

// Error display utilities for tabs
class TabErrorHandler {
  static showError(container, error, retryCallback = null) {
    this.clearErrors(container);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <div class="error-title">Failed to Load Data</div>
      <div class="error-details">${error.message || error.toString()}</div>
      ${retryCallback ? `<button class="retry-button" onclick="(${retryCallback.toString()})()">Retry</button>` : ''}
    `;
    
    container.appendChild(errorDiv);
  }

  static clearErrors(container) {
    container.querySelectorAll('.error-message').forEach(el => el.remove());
  }

  static showLoading(container, message = 'Loading...') {
    container.innerHTML = `<div class="loading-spinner">${message}</div>`;
  }
}

// Utility functions for tabs
class TabUtils {
  static formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  static formatDuration(ms) {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  static getAgentColor(agentId) {
    return AGENT_HEX_COLORS[agentId] || '#6b7280';
  }

  static getStatusColor(status) {
    return STATUS_HEX_COLORS[status] || '#6b7280';
  }

  static createStatusBadge(status, customClass = '') {
    const color = this.getStatusColor(status);
    return `<span class="status-badge ${customClass}" style="background-color: ${color}">${status}</span>`;
  }

  static createAgentBadge(agentId, name = null) {
    const color = this.getAgentColor(agentId);
    const displayName = name || agentId;
    return `<span class="agent-badge" style="color: ${color}">${displayName}</span>`;
  }
}

// Global tab system instance
window.TabSystem = new TabSystemClass();
window.TabErrorHandler = TabErrorHandler;
window.TabUtils = TabUtils;
