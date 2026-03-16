// Mission Control v3 - State Management
// Centralized state management with persistence and tab-specific configurations

class StateManager {
  constructor() {
    this.state = this.initializeState();
    this.listeners = new Map();
    this.storageKey = 'mc_v3_state';
    
    // Load persisted state
    this.loadFromStorage();
  }

  initializeState() {
    return {
      // Global app state
      global: {
        currentTab: 'overview',
        lastGlobalRefresh: null,
        theme: 'dark',
        sidebarCollapsed: false,
        version: '3.0.0'
      },

      // Tab-specific state and configuration
      tabs: {
        overview: {
          data: null,
          lastRefresh: null,
          refreshInterval: 10000, // 10s
          autoRefresh: true,
          error: null
        },
        agents: {
          data: null,
          lastRefresh: null,
          refreshInterval: 30000, // 30s
          autoRefresh: true,
          error: null,
          sortBy: 'name',
          filterStatus: 'all'
        },
        hierarchy: {
          data: null,
          lastRefresh: null,
          refreshInterval: null, // Static
          autoRefresh: false,
          error: null,
          zoomLevel: 1,
          centerPosition: { x: 0, y: 0 }
        },
        projects: {
          data: null,
          lastRefresh: null,
          refreshInterval: 30000, // 30s
          autoRefresh: true,
          error: null,
          viewMode: 'plans', // 'plans' or 'tasks'
          statusFilter: 'all'
        },
        archive: {
          data: null,
          lastRefresh: null,
          refreshInterval: null, // Static
          autoRefresh: false,
          error: null,
          filters: {
            owner: '',
            plan: '',
            month: '',
            search: ''
          },
          pagination: {
            page: 1,
            limit: 20,
            total: 0
          }
        },
        feed: {
          data: null,
          lastRefresh: null,
          refreshInterval: 5000, // 5s
          autoRefresh: true,
          error: null,
          sinceTimestamp: null,
          maxEntries: 100,
          autoScroll: true
        },
        performance: {
          data: null,
          lastRefresh: null,
          refreshInterval: 60000, // 60s
          autoRefresh: true,
          error: null,
          dateRange: '7d',
          chartTypes: ['completion', 'activity', 'health', 'resources']
        },
        parking: {
          data: null,
          lastRefresh: null,
          refreshInterval: null, // Static
          autoRefresh: false,
          error: null,
          sortBy: 'priority'
        },
        whiteboard: {
          canvas: null,
          tools: {
            active: 'pen',
            pen: { size: 2, color: '#f59e0b' },
            eraser: { size: 10 },
            line: { size: 2, color: '#f59e0b' },
            rectangle: { size: 2, color: '#f59e0b', filled: false },
            circle: { size: 2, color: '#f59e0b', filled: false }
          },
          isDrawing: false,
          history: [],
          error: null,
          canvasSize: { width: 800, height: 600 }
        },
        pipeline: {
          data: null,
          lastRefresh: null,
          refreshInterval: 30000,
          autoRefresh: true,
          error: null,
          selectedSliceId: null
        }
      }
    };
  }

  // Get global state
  getGlobal(key) {
    return key ? this.state.global[key] : this.state.global;
  }

  // Set global state
  setGlobal(key, value) {
    this.state.global[key] = value;
    this.notifyListeners('global', key, value);
    this.saveToStorage();
  }

  // Get tab state
  getTabState(tabName) {
    return this.state.tabs[tabName] || null;
  }

  // Update tab state
  setTabState(tabName, updates) {
    if (!this.state.tabs[tabName]) {
      console.warn(`Tab '${tabName}' not found in state`);
      return;
    }

    const oldState = { ...this.state.tabs[tabName] };
    Object.assign(this.state.tabs[tabName], updates);
    
    this.notifyListeners(`tab:${tabName}`, 'update', { old: oldState, new: this.state.tabs[tabName] });
    this.saveToStorage();
  }

  // Get tab data
  getTabData(tabName) {
    return this.state.tabs[tabName]?.data || null;
  }

  // Set tab data with timestamp
  setTabData(tabName, data) {
    const tabState = this.state.tabs[tabName];
    if (!tabState) {
      console.warn(`Tab '${tabName}' not found in state`);
      return;
    }

    tabState.data = data;
    tabState.lastRefresh = Date.now();
    tabState.error = null; // Clear any previous error
    
    this.notifyListeners(`tab:${tabName}`, 'data', data);
    this.saveToStorage();
  }

  // Set tab error
  setTabError(tabName, error) {
    const tabState = this.state.tabs[tabName];
    if (!tabState) {
      console.warn(`Tab '${tabName}' not found in state`);
      return;
    }

    tabState.error = {
      message: error.message || error.toString(),
      status: error.status || 0,
      timestamp: Date.now()
    };
    
    this.notifyListeners(`tab:${tabName}`, 'error', tabState.error);
    this.saveToStorage();
  }

  // Clear tab error
  clearTabError(tabName) {
    const tabState = this.state.tabs[tabName];
    if (!tabState) return;

    tabState.error = null;
    this.notifyListeners(`tab:${tabName}`, 'error', null);
    this.saveToStorage();
  }

  // Check if tab needs refresh
  needsRefresh(tabName, force = false) {
    const tabState = this.state.tabs[tabName];
    if (!tabState) return false;
    if (force) return true;
    if (!tabState.lastRefresh) return true; // Always load on first visit
    if (!tabState.autoRefresh) return false; // No auto-refresh after first load
    if (!tabState.refreshInterval) return false;

    const now = Date.now();
    const timeSinceRefresh = now - tabState.lastRefresh;
    return timeSinceRefresh >= tabState.refreshInterval;
  }

  // Get all tabs that need refresh
  getTabsNeedingRefresh() {
    return Object.keys(this.state.tabs).filter(tabName => this.needsRefresh(tabName));
  }

  // Event listener system
  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  // Notify listeners
  notifyListeners(event, type, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(type, data);
        } catch (error) {
          console.error(`State listener error for event '${event}':`, error);
        }
      });
    }
  }

  // Persistence
  saveToStorage() {
    try {
      // Don't save data or errors, only configuration
      const persistState = {
        global: { ...this.state.global },
        tabs: {}
      };

      Object.entries(this.state.tabs).forEach(([tabName, tabState]) => {
        persistState.tabs[tabName] = {
          refreshInterval: tabState.refreshInterval,
          autoRefresh: tabState.autoRefresh,
          // Tab-specific settings
          ...Object.fromEntries(
            Object.entries(tabState).filter(([key]) => 
              !['data', 'error', 'lastRefresh'].includes(key)
            )
          )
        };
      });

      localStorage.setItem(this.storageKey, JSON.stringify(persistState));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return;

      const persistState = JSON.parse(saved);
      
      // Merge global state
      Object.assign(this.state.global, persistState.global || {});
      
      // Merge tab configurations
      Object.entries(persistState.tabs || {}).forEach(([tabName, saved]) => {
        if (this.state.tabs[tabName]) {
          Object.assign(this.state.tabs[tabName], saved);
        }
      });
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error);
    }
  }

  // Clear all data (keep configuration)
  clearAllData() {
    Object.keys(this.state.tabs).forEach(tabName => {
      this.state.tabs[tabName].data = null;
      this.state.tabs[tabName].error = null;
      this.state.tabs[tabName].lastRefresh = null;
    });
    this.state.global.lastGlobalRefresh = null;
    this.notifyListeners('global', 'clear', true);
  }

  // Debug helpers
  getFullState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  logStateInfo() {
    const tabs = Object.entries(this.state.tabs).map(([name, state]) => ({
      name,
      hasData: !!state.data,
      hasError: !!state.error,
      lastRefresh: state.lastRefresh ? new Date(state.lastRefresh).toLocaleTimeString() : 'never',
      needsRefresh: this.needsRefresh(name)
    }));
    
    console.table(tabs);
  }
}

// Tab refresh intervals (from contracts)
const TAB_REFRESH_INTERVALS = {
  overview: 10000,    // 10s - frequent updates
  agents: 30000,      // 30s - moderate updates
  hierarchy: null,    // Static - no auto-refresh
  projects: 30000,    // 30s - moderate updates
  archive: null,      // Static - no auto-refresh
  feed: 5000,         // 5s - real-time feel
  performance: 60000, // 60s - less frequent
  parking: null,      // Static - no auto-refresh
  whiteboard: null,   // Manual save only
  pipeline: 30000
};

// Agent hex colors (for canvas/SVG rendering)
const AGENT_HEX_COLORS = {
  main: '#f59e0b',      // CEO - orange
  denny: '#58a6ff',     // Chief of Staff - blue
  nexus: '#a855f7',     // Research - purple
  qa: '#3fb950',        // QA - green
  leaddev: '#06b6d4',   // Lead Dev - cyan
  weblead: '#14b8a6',   // Web Lead - teal
  frontend: '#ec4899',  // Frontend - pink
  backend: '#6366f1',   // Backend - indigo
  realtime: '#f97316',  // Realtime - orange
  graphics: '#8b5cf6'   // Graphics - violet
};

// Status hex colors (for canvas/SVG rendering)
const STATUS_HEX_COLORS = {
  draft: '#6b7280',     // gray-500
  queued: '#3b82f6',    // blue-500
  active: '#10b981',    // emerald-500
  review: '#f59e0b',    // amber-500
  done: '#059669',      // emerald-600
  blocked: '#ef4444',   // red-500
  escalated: '#f97316', // orange-500
  cancelled: '#4b5563', // gray-600
  planning: '#3b82f6',  // blue-500
  completed: '#059669',  // emerald-600
  online: '#10b981',    // emerald-500
  offline: '#ef4444',   // red-500
  unknown: '#6b7280'    // gray-500
};

// Global state manager instance
window.stateManager = new StateManager();
window.AGENT_HEX_COLORS = AGENT_HEX_COLORS;
window.STATUS_HEX_COLORS = STATUS_HEX_COLORS;
window.TAB_REFRESH_INTERVALS = TAB_REFRESH_INTERVALS;
