// Mission Control v3 - Main Application
// Orchestrates the entire dashboard system

class MissionControlApp {
  constructor() {
    this.version = '3.0.0';
    this.initialized = false;
    this.globalRefreshTimer = null;
    this.gatewayStatusTimer = null;
  }

  async init() {
    if (this.initialized) {
      console.warn('App already initialized');
      return;
    }

    console.log(`🦞 Mission Control v${this.version} - Initializing...`);

    try {
      // Initialize core systems
      this.initializeErrorHandling();
      this.initializeTabSystem();
      this.initializeGlobalListeners();
      this.initializeGlobalRefresh();
      this.initializeGatewayMonitoring();
      
      // Set initial state
      this.updateLastUpdateTime();
      
      this.initialized = true;
      console.log('✅ Mission Control v3 initialized successfully');
      
      // Show initial tab
      const initialTab = TabSystem.currentTab || 'overview';
      TabSystem.showTab(initialTab);
      
    } catch (error) {
      console.error('❌ Failed to initialize Mission Control v3:', error);
      this.showGlobalError('Failed to initialize application', error);
    }
  }

  initializeErrorHandling() {
    // Global error handler
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.logError(event.error, 'Global');
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.logError(event.reason, 'Promise');
    });

    // API error handler
    window.addEventListener('apierror', (event) => {
      console.error('API error:', event.detail);
      this.handleApiError(event.detail);
    });
  }

  initializeTabSystem() {
    // Initialize the tab navigation system
    TabSystem.init();
    
    // Listen for tab changes to update state
    stateManager.addListener('global', (type, data) => {
      if (type === 'currentTab') {
        this.onTabChange(data);
      }
    });
  }

  initializeGlobalListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });

    // Window focus/blur for refresh optimization
    window.addEventListener('focus', () => {
      this.onWindowFocus();
    });

    window.addEventListener('blur', () => {
      this.onWindowBlur();
    });

    // Connection status monitoring
    window.addEventListener('online', () => {
      this.onConnectionChange(true);
    });

    window.addEventListener('offline', () => {
      this.onConnectionChange(false);
    });

    // Theme change detection
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addListener((e) => {
      this.onThemeChange(e.matches ? 'dark' : 'light');
    });
  }

  initializeGlobalRefresh() {
    // Start global refresh cycle
    this.startGlobalRefresh();
  }

  initializeGatewayMonitoring() {
    // Monitor gateway status for header indicator
    this.startGatewayMonitoring();
  }

  startGlobalRefresh() {
    // Clear existing timer
    if (this.globalRefreshTimer) {
      clearInterval(this.globalRefreshTimer);
    }

    // Refresh tabs that need it every 5 seconds
    this.globalRefreshTimer = setInterval(() => {
      this.performGlobalRefresh();
    }, 5000);
  }

  async performGlobalRefresh() {
    try {
      // Only refresh if page is visible
      if (document.hidden) return;
      
      // Get tabs that need refresh
      const tabsNeedingRefresh = stateManager.getTabsNeedingRefresh();
      
      if (tabsNeedingRefresh.length === 0) return;
      
      // Refresh current tab if it needs it
      const currentTab = stateManager.getGlobal('currentTab');
      if (tabsNeedingRefresh.includes(currentTab)) {
        TabSystem.refreshCurrentTab();
      }
      
    } catch (error) {
      console.error('Global refresh failed:', error);
    }
  }

  startGatewayMonitoring() {
    // Clear existing timer
    if (this.gatewayStatusTimer) {
      clearInterval(this.gatewayStatusTimer);
    }

    // Check gateway status every 10 seconds
    this.gatewayStatusTimer = setInterval(() => {
      this.checkGatewayStatus();
    }, 10000);

    // Initial check
    this.checkGatewayStatus();
  }

  async checkGatewayStatus() {
    try {
      const gateway = await api.getGatewayStatus();
      this.updateGatewayIndicator(gateway.status === 'online');
    } catch (error) {
      this.updateGatewayIndicator(false);
    }
  }

  updateGatewayIndicator(isOnline) {
    const indicator = document.getElementById('gateway-indicator');
    if (indicator) {
      indicator.className = `w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`;
      indicator.title = isOnline ? 'Gateway Online' : 'Gateway Offline';
    }
  }

  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + R - Refresh current tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      TabSystem.refreshCurrentTab(true);
      return;
    }

    // Ctrl/Cmd + number keys - Switch tabs
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      const tabNames = ['overview', 'agents', 'hierarchy', 'projects', 'archive', 'feed', 'performance', 'parking', 'whiteboard'];
      if (tabNames[tabIndex]) {
        TabSystem.navigate(tabNames[tabIndex]);
      }
      return;
    }

    // Escape - Clear any modal overlays
    if (e.key === 'Escape') {
      this.closeModals();
      return;
    }
  }

  onWindowFocus() {
    console.log('Window focused - resuming refresh timers');
    this.startGlobalRefresh();
    this.startGatewayMonitoring();
    
    // Force refresh current tab
    setTimeout(() => {
      TabSystem.refreshCurrentTab(true);
    }, 500);
  }

  onWindowBlur() {
    console.log('Window blurred - pausing refresh timers');
    // Keep timers running but reduce frequency could be implemented here
  }

  onConnectionChange(isOnline) {
    const status = isOnline ? 'online' : 'offline';
    console.log(`Connection status changed: ${status}`);
    
    // Show notification
    this.showNotification(
      isOnline ? 'Connection restored' : 'Connection lost',
      isOnline ? 'success' : 'error',
      3000
    );
    
    if (isOnline) {
      // Refresh current tab when coming back online
      setTimeout(() => {
        TabSystem.refreshCurrentTab(true);
      }, 1000);
    }
  }

  onThemeChange(theme) {
    console.log(`Theme changed to: ${theme}`);
    stateManager.setGlobal('theme', theme);
  }

  onTabChange(tabName) {
    console.log(`Tab changed to: ${tabName}`);
    this.updateLastUpdateTime();
  }

  updateLastUpdateTime() {
    const timeElement = document.getElementById('last-update');
    if (timeElement) {
      timeElement.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
  }

  handleApiError(error) {
    console.error('API Error:', error);
    
    // Show user-friendly error based on error type
    if (error.status === 0) {
      this.showNotification('Network connection error', 'error', 5000);
    } else if (error.status >= 500) {
      this.showNotification('Server error - please try again', 'error', 5000);
    } else if (error.status === 404) {
      this.showNotification('Resource not found', 'warning', 3000);
    } else {
      this.showNotification('Request failed - please try again', 'error', 3000);
    }
  }

  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${
      type === 'success' ? 'bg-green-600' :
      type === 'error' ? 'bg-red-600' :
      type === 'warning' ? 'bg-yellow-600' :
      'bg-blue-600'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, duration);
  }

  showGlobalError(message, error) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
    errorContainer.innerHTML = `
      <div class="bg-gray-800 border border-red-600 rounded-lg p-6 max-w-md mx-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-red-500 text-2xl">⚠️</div>
          <div>
            <h3 class="text-lg font-semibold text-red-400">Application Error</h3>
            <p class="text-gray-300 text-sm">${message}</p>
          </div>
        </div>
        <div class="text-xs text-gray-500 mb-4 font-mono bg-gray-900 p-2 rounded">
          ${error.message || error.toString()}
        </div>
        <div class="flex gap-2">
          <button onclick="location.reload()" class="btn btn-primary text-sm">
            Reload Page
          </button>
          <button onclick="this.parentNode.parentNode.parentNode.remove()" class="btn btn-secondary text-sm">
            Dismiss
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(errorContainer);
  }

  closeModals() {
    // Close any modal overlays
    document.querySelectorAll('.fixed.inset-0').forEach(modal => {
      if (modal.style.zIndex >= 40) { // High z-index indicates modal
        modal.remove();
      }
    });
  }

  logError(error, context) {
    // Log error for debugging
    const errorLog = {
      timestamp: new Date().toISOString(),
      context: context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      userAgent: navigator.userAgent,
      url: window.location.href,
      currentTab: stateManager.getGlobal('currentTab')
    };
    
    console.error('Error logged:', errorLog);
    
    // Could send to error tracking service here
  }

  // Utility methods for global actions
  static async refreshAll() {
    console.log('Refreshing all data...');
    
    // Clear all cached data
    stateManager.clearAllData();
    
    // Force refresh current tab
    TabSystem.refreshCurrentTab(true);
    
    // Update timestamp
    const timeElement = document.getElementById('last-update');
    if (timeElement) {
      timeElement.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    }
    
    // Show feedback
    const app = window.MissionControlApp;
    if (app) {
      app.showNotification('All data refreshed', 'success', 2000);
    }
  }

  // Cleanup method
  destroy() {
    if (this.globalRefreshTimer) {
      clearInterval(this.globalRefreshTimer);
    }
    
    if (this.gatewayStatusTimer) {
      clearInterval(this.gatewayStatusTimer);
    }
    
    TabSystem.destroy();
    
    this.initialized = false;
    console.log('Mission Control v3 destroyed');
  }

  // Debug helpers
  getSystemInfo() {
    return {
      version: this.version,
      initialized: this.initialized,
      currentTab: stateManager.getGlobal('currentTab'),
      stateSnapshot: stateManager.getFullState(),
      registeredTabs: TabSystem.getRegisteredTabs(),
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };
  }
}

// Global app instance and initialization
let app;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Verify all dependencies loaded
    const deps = ['stateManager', 'TabSystem', 'api'];
    const missing = deps.filter(d => !window[d]);
    if (missing.length > 0) {
      throw new Error(`Missing dependencies: ${missing.join(', ')}. Try hard refresh (Ctrl+Shift+R).`);
    }

    // Create and initialize app
    app = new MissionControlApp();
    await app.init();
    
    // Make app globally accessible
    window.MissionControlApp = app;
    
    // Make refresh function globally available for button
    window.refreshAll = MissionControlApp.refreshAll;
    
    // Add console commands for debugging
    if (typeof console !== 'undefined') {
      console.log('🦞 Mission Control v3 Debug Commands:');
      console.log('- app.getSystemInfo() - Get system information');
      console.log('- stateManager.logStateInfo() - Log state info');
      console.log('- TabSystem.debug() - Debug tab system');
      console.log('- refreshAll() - Force refresh all data');
    }
    
  } catch (error) {
    console.error('Failed to start Mission Control v3:', error);
    
    // Show fallback error UI
    document.body.innerHTML = `
      <div class="bg-gray-900 text-gray-100 min-h-screen flex items-center justify-center">
        <div class="text-center max-w-md mx-4">
          <div class="text-6xl mb-4">🦞</div>
          <h1 class="text-2xl font-bold text-red-400 mb-2">Mission Control v3</h1>
          <p class="text-gray-400 mb-6">Failed to initialize. Please check the console for details.</p>
          <button onclick="location.reload()" class="bg-claw-600 hover:bg-claw-700 px-4 py-2 rounded font-medium transition-colors">
            Reload Page
          </button>
        </div>
      </div>
    `;
  }
});