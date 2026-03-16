// Mission Control v3 - Whiteboard Tab Component
// HTML5 Canvas whiteboard with Graphics Dev integration

class WhiteboardTab {
  constructor() {
    this.tabName = 'whiteboard';
    this.container = document.getElementById('tab-whiteboard');
    this.canvasContainer = null;
    this.toolbarContainer = null;
    this.canvas = null;
    this.isInitialized = false;
  }

  async render() {
    if (!this.container) {
      console.error('Whiteboard tab container not found');
      return;
    }

    // Initialize containers
    this.canvasContainer = document.getElementById('whiteboard-canvas-container');
    this.toolbarContainer = document.getElementById('whiteboard-toolbar');
    
    if (!this.canvasContainer || !this.toolbarContainer) {
      console.error('Whiteboard containers not found');
      return;
    }

    // Check if already initialized to avoid duplicating setup
    if (!this.isInitialized) {
      this.initializeWhiteboard();
      this.isInitialized = true;
    }
  }

  async refresh() {
    // Whiteboard doesn't need data refresh - it's user-driven
    console.log('Whiteboard refresh called (no action needed)');
  }

  initializeWhiteboard() {
    // Setup toolbar first
    this.renderToolbar();
    
    // Setup canvas container
    this.renderCanvas();
    
    // Initialize Graphics Dev component if available
    this.initializeGraphicsComponent();
  }

  renderToolbar() {
    this.toolbarContainer.innerHTML = `
      <div class="flex items-center gap-4 flex-wrap">
        <!-- Tool Selection -->
        <div class="flex bg-gray-700 rounded overflow-hidden">
          <button id="tool-pen" class="tool-btn px-3 py-1 text-sm bg-claw-600 text-white" data-tool="pen">
            ✏️ Pen
          </button>
          <button id="tool-eraser" class="tool-btn px-3 py-1 text-sm hover:bg-gray-600" data-tool="eraser">
            🧽 Eraser
          </button>
          <button id="tool-line" class="tool-btn px-3 py-1 text-sm hover:bg-gray-600" data-tool="line">
            📏 Line
          </button>
          <button id="tool-rectangle" class="tool-btn px-3 py-1 text-sm hover:bg-gray-600" data-tool="rectangle">
            ⬜ Rectangle
          </button>
          <button id="tool-circle" class="tool-btn px-3 py-1 text-sm hover:bg-gray-600" data-tool="circle">
            ⭕ Circle
          </button>
        </div>

        <!-- Color Picker -->
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-400">Color:</label>
          <input type="color" id="color-picker" value="#f59e0b" 
                 class="w-8 h-8 rounded border border-gray-600 cursor-pointer">
          <div class="flex gap-1">
            <button onclick="WhiteboardTab.setColor('#f59e0b')" class="w-6 h-6 rounded" style="background-color: #f59e0b" title="Orange"></button>
            <button onclick="WhiteboardTab.setColor('#ef4444')" class="w-6 h-6 rounded" style="background-color: #ef4444" title="Red"></button>
            <button onclick="WhiteboardTab.setColor('#10b981')" class="w-6 h-6 rounded" style="background-color: #10b981" title="Green"></button>
            <button onclick="WhiteboardTab.setColor('#3b82f6')" class="w-6 h-6 rounded" style="background-color: #3b82f6" title="Blue"></button>
            <button onclick="WhiteboardTab.setColor('#8b5cf6')" class="w-6 h-6 rounded" style="background-color: #8b5cf6" title="Purple"></button>
            <button onclick="WhiteboardTab.setColor('#ffffff')" class="w-6 h-6 rounded border border-gray-600" style="background-color: #ffffff" title="White"></button>
          </div>
        </div>

        <!-- Brush Size -->
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-400">Size:</label>
          <input type="range" id="brush-size" min="1" max="20" value="2" 
                 class="w-20">
          <span id="size-display" class="text-sm text-gray-300 w-8">2px</span>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 ml-auto">
          <button onclick="WhiteboardTab.undo()" class="btn btn-secondary text-sm">
            ↶ Undo
          </button>
          <button onclick="WhiteboardTab.redo()" class="btn btn-secondary text-sm">
            ↷ Redo
          </button>
          <button onclick="WhiteboardTab.clearCanvas()" class="btn btn-secondary text-sm">
            🗑️ Clear
          </button>
          <button onclick="WhiteboardTab.saveWhiteboard()" class="btn btn-primary text-sm">
            💾 Save
          </button>
        </div>
      </div>
    `;

    this.attachToolbarListeners();
  }

  renderCanvas() {
    this.canvasContainer.innerHTML = `
      <div class="h-full w-full flex items-center justify-center">
        <div class="text-center text-gray-500">
          <div class="text-lg mb-2">🎨</div>
          <div>Canvas whiteboard will be rendered here by Graphics Dev</div>
          <div class="text-sm mt-2 text-gray-400">
            Container ID: whiteboard-canvas-container<br>
            Toolbar ID: whiteboard-toolbar
          </div>
          <div class="text-xs mt-4 text-gray-500 max-w-md">
            Graphics Dev should implement HTML5 Canvas with drawing tools,
            mouse/touch events, and integration with the toolbar controls above.
          </div>
        </div>
      </div>
    `;
  }

  attachToolbarListeners() {
    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tool = e.target.dataset.tool;
        this.selectTool(tool);
      });
    });

    // Color picker
    const colorPicker = document.getElementById('color-picker');
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        this.setColor(e.target.value);
      });
    }

    // Brush size
    const brushSize = document.getElementById('brush-size');
    const sizeDisplay = document.getElementById('size-display');
    if (brushSize && sizeDisplay) {
      brushSize.addEventListener('input', (e) => {
        const size = e.target.value;
        sizeDisplay.textContent = size + 'px';
        this.setBrushSize(parseInt(size));
      });
    }
  }

  selectTool(toolName) {
    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.remove('bg-claw-600', 'text-white');
      btn.classList.add('hover:bg-gray-600');
    });
    
    const selectedBtn = document.querySelector(`[data-tool="${toolName}"]`);
    if (selectedBtn) {
      selectedBtn.classList.add('bg-claw-600', 'text-white');
      selectedBtn.classList.remove('hover:bg-gray-600');
    }

    // Notify Graphics Dev component
    if (window.MCGraphics && window.MCGraphics.setWhiteboardTool) {
      window.MCGraphics.setWhiteboardTool(toolName);
    }

    console.log('Selected tool:', toolName);
  }

  setColor(color) {
    // Update color picker
    const colorPicker = document.getElementById('color-picker');
    if (colorPicker) {
      colorPicker.value = color;
    }

    // Notify Graphics Dev component
    if (window.MCGraphics && window.MCGraphics.setWhiteboardColor) {
      window.MCGraphics.setWhiteboardColor(color);
    }

    console.log('Set color:', color);
  }

  setBrushSize(size) {
    // Notify Graphics Dev component
    if (window.MCGraphics && window.MCGraphics.setWhiteboardSize) {
      window.MCGraphics.setWhiteboardSize(size);
    }

    console.log('Set brush size:', size);
  }

  initializeGraphicsComponent() {
    // Check if Graphics Dev component is available
    if (window.MCGraphics && window.MCGraphics.initWhiteboard) {
      try {
        window.MCGraphics.initWhiteboard('whiteboard-canvas-container', 'whiteboard-toolbar');
        console.log('Whiteboard initialized by Graphics Dev');
      } catch (error) {
        console.error('Failed to initialize whiteboard:', error);
      }
    } else {
      console.log('Whiteboard containers ready - waiting for Graphics Dev component');
    }
  }

  // Static methods for whiteboard actions
  static setColor(color) {
    const whiteboardTab = TabSystem.getComponent('whiteboard');
    if (whiteboardTab) {
      whiteboardTab.setColor(color);
    }
  }

  static undo() {
    if (window.MCGraphics && window.MCGraphics.whiteboardUndo) {
      window.MCGraphics.whiteboardUndo();
    } else {
      console.log('Undo - Graphics Dev component not loaded');
    }
  }

  static redo() {
    if (window.MCGraphics && window.MCGraphics.whiteboardRedo) {
      window.MCGraphics.whiteboardRedo();
    } else {
      console.log('Redo - Graphics Dev component not loaded');
    }
  }

  static clearCanvas() {
    if (confirm('Clear the entire whiteboard? This cannot be undone.')) {
      if (window.MCGraphics && window.MCGraphics.clearWhiteboard) {
        window.MCGraphics.clearWhiteboard();
      } else {
        console.log('Clear - Graphics Dev component not loaded');
      }
    }
  }

  static async saveWhiteboard() {
    try {
      let imageBlob;
      
      if (window.MCGraphics && window.MCGraphics.getWhiteboardImage) {
        imageBlob = window.MCGraphics.getWhiteboardImage();
      } else {
        // Fallback - create a placeholder image
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = '#6b7280';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Whiteboard Placeholder', 400, 300);
        
        imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }

      if (!imageBlob) {
        throw new Error('Failed to get canvas image');
      }

      // Save via API
      const metadata = {
        title: `Whiteboard ${new Date().toLocaleDateString()}`,
        timestamp: new Date().toISOString(),
        dimensions: { width: 800, height: 600 }
      };

      const result = await api.saveWhiteboard(imageBlob, metadata);
      
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
      successMsg.textContent = `Saved as ${result.filename}`;
      document.body.appendChild(successMsg);
      
      setTimeout(() => successMsg.remove(), 3000);
      
      console.log('Whiteboard saved:', result);
      
    } catch (error) {
      console.error('Failed to save whiteboard:', error);
      
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50';
      errorMsg.textContent = 'Failed to save whiteboard';
      document.body.appendChild(errorMsg);
      
      setTimeout(() => errorMsg.remove(), 3000);
    }
  }

  // Component lifecycle methods
  onShow() {
    console.log('Whiteboard tab shown');
    
    // Initialize if not already done
    if (!this.isInitialized) {
      this.render();
    }
    
    // If Graphics Dev component is available, ensure it's active
    if (window.MCGraphics && window.MCGraphics.activateWhiteboard) {
      window.MCGraphics.activateWhiteboard();
    }
  }

  onHide() {
    console.log('Whiteboard tab hidden');
    
    // If Graphics Dev component is available, deactivate to save resources
    if (window.MCGraphics && window.MCGraphics.deactivateWhiteboard) {
      window.MCGraphics.deactivateWhiteboard();
    }
  }

  onTabChange(fromTab, toTab, isActive) {
    if (isActive) {
      // Give Graphics Dev a moment to initialize if just loaded
      setTimeout(() => {
        if (!this.isInitialized) {
          this.render();
        }
      }, 100);
    }
  }
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const whiteboardTab = new WhiteboardTab();
  TabSystem.registerComponent('whiteboard', whiteboardTab);
  
  // Make static methods globally available
  window.WhiteboardTab = WhiteboardTab;
});