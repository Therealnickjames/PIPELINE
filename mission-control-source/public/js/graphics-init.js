/**
 * Mission Control v3 - Graphics Component Initializer
 * Graphics Dev: graphics
 * 
 * Exposes global window.MCGraphics API for Frontend Dev integration
 */

(function() {
  'use strict';

  // Global graphics API interface
  window.MCGraphics = {
    // Component instances
    _hierarchyChart: null,
    _whiteboard: null,
    _performanceCharts: null,

    // Hierarchy Chart API
    initHierarchyChart(containerId, data) {
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error(`Container not found: ${containerId}`);
      }

      if (typeof MCHierarchyChart === 'undefined') {
        throw new Error('MCHierarchyChart not loaded. Include graphics-hierarchy.js first.');
      }

      this._hierarchyChart = new MCHierarchyChart(container, data);
      return this._hierarchyChart;
    },

    updateHierarchyChart(data) {
      if (!this._hierarchyChart) {
        throw new Error('Hierarchy chart not initialized. Call initHierarchyChart first.');
      }
      return this._hierarchyChart.updateData(data);
    },

    // Whiteboard API
    initWhiteboard(containerId, toolbarId) {
      const container = document.getElementById(containerId);
      const toolbar = document.getElementById(toolbarId);
      
      if (!container || !toolbar) {
        throw new Error(`Container(s) not found: ${containerId}, ${toolbarId}`);
      }

      if (typeof MCWhiteboard === 'undefined') {
        throw new Error('MCWhiteboard not loaded. Include graphics-whiteboard.js first.');
      }

      this._whiteboard = new MCWhiteboard(container, toolbar);
      return this._whiteboard;
    },

    getWhiteboardImage() {
      if (!this._whiteboard) {
        throw new Error('Whiteboard not initialized. Call initWhiteboard first.');
      }
      return this._whiteboard.getImageBlob();
    },

    clearWhiteboard() {
      if (!this._whiteboard) {
        throw new Error('Whiteboard not initialized. Call initWhiteboard first.');
      }
      return this._whiteboard.clear();
    },

    // Performance Charts API
    initPerformanceCharts(containerIds, data) {
      if (typeof MCPerformanceCharts === 'undefined') {
        throw new Error('MCPerformanceCharts not loaded. Include graphics-performance.js first.');
      }

      // Validate all containers exist
      const containers = {};
      Object.entries(containerIds).forEach(([key, id]) => {
        const element = document.getElementById(id);
        if (!element) {
          throw new Error(`Performance chart container not found: ${id}`);
        }
        containers[key] = element;
      });

      this._performanceCharts = new MCPerformanceCharts(containers, data);
      return this._performanceCharts;
    },

    updatePerformanceCharts(data) {
      if (!this._performanceCharts) {
        throw new Error('Performance charts not initialized. Call initPerformanceCharts first.');
      }
      return this._performanceCharts.updateData(data);
    }
  };

  // Utility functions for graphics components
  window.MCGraphicsUtils = {
    // Color palette from design tokens
    colors: {
      'agent-main': '#f59e0b',      // CEO - orange
      'agent-denny': '#58a6ff',     // Chief of Staff - blue
      'agent-nexus': '#a855f7',     // Research - purple
      'agent-qa': '#3fb950',        // QA - green
      'agent-leaddev': '#06b6d4',   // Lead Dev - cyan
      'agent-weblead': '#14b8a6',   // Web Lead - teal
      'agent-frontend': '#ec4899',  // Frontend - pink
      'agent-backend': '#6366f1',   // Backend - indigo
      'agent-realtime': '#f97316',  // Realtime - orange
      'agent-graphics': '#8b5cf6',  // Graphics - violet
      'status-success': '#3fb950',
      'status-warning': '#d29922',
      'status-error': '#f85149',
      'status-info': '#58a6ff',
      'accent-primary': '#f59e0b',
      'text-primary': '#f0f6fc',
      'text-secondary': '#8b949e',
      'bg-secondary': '#1a1f26',
      'border-primary': '#2d3441'
    },

    // Get agent color by ID
    getAgentColor(agentId) {
      return this.colors[`agent-${agentId}`] || this.colors['accent-primary'];
    },

    // Get status color
    getStatusColor(status) {
      const statusMap = {
        'online': this.colors['status-success'],
        'offline': this.colors['status-error'],
        'unknown': this.colors['status-info'],
        'active': this.colors['status-success'],
        'blocked': this.colors['status-error'],
        'completed': this.colors['status-success']
      };
      return statusMap[status] || this.colors['status-info'];
    },

    // Format timestamp for display
    formatTimestamp(isoString) {
      if (!isoString) return 'Never';
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    },

    // Create SVG element with namespace
    createSVGElement(tag, attributes = {}) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
      return element;
    },

    // Debounce function for performance
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    // Linear interpolation for animations
    lerp(start, end, factor) {
      return start + (end - start) * factor;
    },

    // Convert hex to rgba
    hexToRgba(hex, alpha = 1) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  };

  console.log('MCGraphics API initialized');
})();