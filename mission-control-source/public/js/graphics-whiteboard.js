/**
 * Mission Control v3 - HTML5 Canvas Whiteboard
 * Graphics Dev: graphics
 * 
 * Interactive drawing surface with tool palette
 * Features: Pen, eraser, shapes, colors, save to PNG
 */

class MCWhiteboard {
  constructor(canvasContainer, toolbarContainer) {
    this.canvasContainer = canvasContainer;
    this.toolbarContainer = toolbarContainer;
    this.canvas = null;
    this.ctx = null;
    this.width = 1200;
    this.height = 800;
    
    // Tool state
    this.tools = {
      pen: { active: true, size: 2, color: '#f59e0b' },
      eraser: { active: false, size: 10 },
      line: { active: false, size: 2, color: '#f59e0b' },
      rectangle: { active: false, size: 2, color: '#f59e0b', filled: false },
      circle: { active: false, size: 2, color: '#f59e0b', filled: false }
    };
    
    // Drawing state
    this.isDrawing = false;
    this.startPos = { x: 0, y: 0 };
    this.currentPos = { x: 0, y: 0 };
    this.history = [];
    this.historyStep = 0;
    this.maxHistory = 50;
    
    // Color palette
    this.colors = [
      '#f59e0b', // OpenClaw orange
      '#f85149', // Red
      '#3fb950', // Green
      '#58a6ff', // Blue
      '#a855f7', // Purple
      '#ec4899', // Pink
      '#06b6d4', // Cyan
      '#14b8a6', // Teal
      '#f97316', // Orange
      '#8b5cf6', // Violet
      '#ffffff', // White
      '#000000'  // Black
    ];

    this.init();
  }

  init() {
    this.createCanvas();
    this.createToolbar();
    this.setupEventListeners();
    this.saveToHistory();
  }

  createCanvas() {
    // Clear container
    this.canvasContainer.innerHTML = '';
    
    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.cssText = `
      width: 100%;
      height: 100%;
      border: 1px solid ${MCGraphicsUtils.colors['border-primary']};
      border-radius: 0.5rem;
      background: #ffffff;
      cursor: crosshair;
      display: block;
    `;
    
    this.ctx = this.canvas.getContext('2d');
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.canvasContainer.appendChild(this.canvas);
  }

  createToolbar() {
    // Clear toolbar
    this.toolbarContainer.innerHTML = '';
    
    // Tool palette
    const toolPalette = document.createElement('div');
    toolPalette.className = 'flex items-center gap-2';
    
    // Tool buttons
    Object.entries(this.tools).forEach(([toolName, tool]) => {
      const button = document.createElement('button');
      button.className = `px-3 py-2 rounded text-sm font-medium transition-colors ${
        tool.active 
          ? 'bg-orange-500 text-white border border-orange-400' 
          : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
      }`;
      button.textContent = this.getToolDisplayName(toolName);
      button.onclick = () => this.setActiveTool(toolName);
      button.setAttribute('data-tool', toolName);
      toolPalette.appendChild(button);
    });

    // Separator
    const separator1 = document.createElement('div');
    separator1.className = 'w-px h-6 bg-gray-600 mx-2';
    toolPalette.appendChild(separator1);

    // Size control
    const sizeLabel = document.createElement('label');
    sizeLabel.className = 'text-sm text-gray-300';
    sizeLabel.textContent = 'Size:';
    toolPalette.appendChild(sizeLabel);

    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '1';
    sizeSlider.max = '20';
    sizeSlider.value = this.getCurrentTool().size;
    sizeSlider.className = 'w-20 ml-1';
    sizeSlider.oninput = (e) => this.setToolSize(parseInt(e.target.value));
    toolPalette.appendChild(sizeSlider);

    const sizeDisplay = document.createElement('span');
    sizeDisplay.className = 'text-sm text-gray-300 ml-1 w-6';
    sizeDisplay.textContent = this.getCurrentTool().size;
    sizeDisplay.setAttribute('data-size-display', '');
    toolPalette.appendChild(sizeDisplay);

    // Color palette
    const separator2 = document.createElement('div');
    separator2.className = 'w-px h-6 bg-gray-600 mx-2';
    toolPalette.appendChild(separator2);

    const colorPalette = document.createElement('div');
    colorPalette.className = 'flex gap-1';
    
    this.colors.forEach(color => {
      const colorButton = document.createElement('button');
      colorButton.className = `w-6 h-6 rounded border-2 ${
        this.getCurrentTool().color === color 
          ? 'border-white' 
          : 'border-gray-600'
      }`;
      colorButton.style.backgroundColor = color;
      colorButton.onclick = () => this.setToolColor(color);
      colorButton.setAttribute('data-color', color);
      colorPalette.appendChild(colorButton);
    });
    
    toolPalette.appendChild(colorPalette);

    // Action buttons
    const separator3 = document.createElement('div');
    separator3.className = 'w-px h-6 bg-gray-600 mx-2';
    toolPalette.appendChild(separator3);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flex gap-2';

    // Undo button
    const undoBtn = document.createElement('button');
    undoBtn.className = 'px-3 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded text-sm font-medium hover:bg-gray-600 transition-colors';
    undoBtn.textContent = 'Undo';
    undoBtn.onclick = () => this.undo();
    actionsDiv.appendChild(undoBtn);

    // Redo button
    const redoBtn = document.createElement('button');
    redoBtn.className = 'px-3 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded text-sm font-medium hover:bg-gray-600 transition-colors';
    redoBtn.textContent = 'Redo';
    redoBtn.onclick = () => this.redo();
    actionsDiv.appendChild(redoBtn);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'px-3 py-2 bg-red-700 text-white border border-red-600 rounded text-sm font-medium hover:bg-red-600 transition-colors';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = () => this.clear();
    actionsDiv.appendChild(clearBtn);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'px-3 py-2 bg-green-700 text-white border border-green-600 rounded text-sm font-medium hover:bg-green-600 transition-colors';
    saveBtn.textContent = 'Save PNG';
    saveBtn.onclick = () => this.save();
    actionsDiv.appendChild(saveBtn);

    toolPalette.appendChild(actionsDiv);
    
    this.toolbarContainer.appendChild(toolPalette);
  }

  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Touch events for mobile
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleMouseDown(e) {
    this.isDrawing = true;
    this.startPos = this.getEventPos(e);
    this.currentPos = { ...this.startPos };
    
    const activeTool = this.getActiveToolName();
    
    if (activeTool === 'pen' || activeTool === 'eraser') {
      this.ctx.beginPath();
      this.ctx.moveTo(this.startPos.x, this.startPos.y);
      this.setupDrawingStyle(activeTool);
    }
  }

  handleMouseMove(e) {
    if (!this.isDrawing) return;
    
    this.currentPos = this.getEventPos(e);
    const activeTool = this.getActiveToolName();
    
    if (activeTool === 'pen' || activeTool === 'eraser') {
      this.drawLine();
    } else {
      this.drawShapePreview();
    }
  }

  handleMouseUp(e) {
    if (!this.isDrawing) return;
    
    this.isDrawing = false;
    const activeTool = this.getActiveToolName();
    
    if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'circle') {
      this.drawFinalShape();
    }
    
    this.saveToHistory();
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    this.canvas.dispatchEvent(mouseEvent);
  }

  handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          break;
        case 's':
          e.preventDefault();
          this.save();
          break;
      }
    }
  }

  getEventPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  setupDrawingStyle(toolName) {
    const tool = this.tools[toolName];
    
    if (toolName === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = tool.size;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = tool.color;
      this.ctx.lineWidth = tool.size;
    }
  }

  drawLine() {
    this.ctx.lineTo(this.currentPos.x, this.currentPos.y);
    this.ctx.stroke();
  }

  drawShapePreview() {
    // Clear and redraw for preview
    this.ctx.putImageData(this.getCurrentImageData(), 0, 0);
    this.drawShape(true);
  }

  drawFinalShape() {
    this.drawShape(false);
  }

  drawShape(isPreview) {
    const activeTool = this.getActiveToolName();
    const tool = this.tools[activeTool];
    
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = tool.color;
    this.ctx.lineWidth = tool.size;
    
    if (isPreview) {
      this.ctx.setLineDash([5, 5]);
    } else {
      this.ctx.setLineDash([]);
    }
    
    switch (activeTool) {
      case 'line':
        this.ctx.beginPath();
        this.ctx.moveTo(this.startPos.x, this.startPos.y);
        this.ctx.lineTo(this.currentPos.x, this.currentPos.y);
        this.ctx.stroke();
        break;
        
      case 'rectangle':
        const width = this.currentPos.x - this.startPos.x;
        const height = this.currentPos.y - this.startPos.y;
        
        if (tool.filled) {
          this.ctx.fillStyle = tool.color;
          this.ctx.fillRect(this.startPos.x, this.startPos.y, width, height);
        } else {
          this.ctx.strokeRect(this.startPos.x, this.startPos.y, width, height);
        }
        break;
        
      case 'circle':
        const radius = Math.sqrt(
          Math.pow(this.currentPos.x - this.startPos.x, 2) + 
          Math.pow(this.currentPos.y - this.startPos.y, 2)
        );
        
        this.ctx.beginPath();
        this.ctx.arc(this.startPos.x, this.startPos.y, radius, 0, 2 * Math.PI);
        
        if (tool.filled) {
          this.ctx.fillStyle = tool.color;
          this.ctx.fill();
        } else {
          this.ctx.stroke();
        }
        break;
    }
    
    this.ctx.setLineDash([]);
  }

  // Tool management
  getActiveToolName() {
    return Object.keys(this.tools).find(name => this.tools[name].active);
  }

  getCurrentTool() {
    return this.tools[this.getActiveToolName()];
  }

  setActiveTool(toolName) {
    // Deactivate all tools
    Object.values(this.tools).forEach(tool => tool.active = false);
    
    // Activate selected tool
    this.tools[toolName].active = true;
    
    // Update UI
    this.updateToolbarUI();
    
    // Update cursor
    this.updateCursor();
  }

  setToolSize(size) {
    const activeTool = this.getCurrentTool();
    activeTool.size = size;
    
    // Update size display
    const sizeDisplay = this.toolbarContainer.querySelector('[data-size-display]');
    if (sizeDisplay) {
      sizeDisplay.textContent = size;
    }
    
    this.updateCursor();
  }

  setToolColor(color) {
    const activeTool = this.getCurrentTool();
    if (activeTool.color !== undefined) {
      activeTool.color = color;
    }
    
    // Update color palette UI
    this.updateColorPaletteUI();
  }

  updateToolbarUI() {
    // Update tool buttons
    const toolButtons = this.toolbarContainer.querySelectorAll('[data-tool]');
    toolButtons.forEach(button => {
      const toolName = button.getAttribute('data-tool');
      const isActive = this.tools[toolName].active;
      
      button.className = `px-3 py-2 rounded text-sm font-medium transition-colors ${
        isActive 
          ? 'bg-orange-500 text-white border border-orange-400' 
          : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
      }`;
    });
    
    // Update size slider
    const sizeSlider = this.toolbarContainer.querySelector('input[type="range"]');
    if (sizeSlider) {
      sizeSlider.value = this.getCurrentTool().size;
    }
  }

  updateColorPaletteUI() {
    const colorButtons = this.toolbarContainer.querySelectorAll('[data-color]');
    colorButtons.forEach(button => {
      const color = button.getAttribute('data-color');
      const isActive = this.getCurrentTool().color === color;
      
      button.className = `w-6 h-6 rounded border-2 ${
        isActive ? 'border-white' : 'border-gray-600'
      }`;
    });
  }

  updateCursor() {
    const activeTool = this.getActiveToolName();
    const size = this.getCurrentTool().size;
    
    switch (activeTool) {
      case 'pen':
        this.canvas.style.cursor = 'crosshair';
        break;
      case 'eraser':
        this.canvas.style.cursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${size + 4}' height='${size + 4}'><circle cx='${(size + 4) / 2}' cy='${(size + 4) / 2}' r='${size / 2}' fill='none' stroke='black' stroke-width='1'/></svg>") ${(size + 4) / 2} ${(size + 4) / 2}, auto`;
        break;
      default:
        this.canvas.style.cursor = 'crosshair';
    }
  }

  getToolDisplayName(toolName) {
    const names = {
      pen: 'Pen',
      eraser: 'Eraser',
      line: 'Line',
      rectangle: 'Rectangle',
      circle: 'Circle'
    };
    return names[toolName] || toolName;
  }

  // History management
  saveToHistory() {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    // Remove any history beyond current step
    this.history = this.history.slice(0, this.historyStep + 1);
    
    // Add new state
    this.history.push(imageData);
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    
    this.historyStep = this.history.length - 1;
  }

  getCurrentImageData() {
    return this.history[this.historyStep];
  }

  undo() {
    if (this.historyStep > 0) {
      this.historyStep--;
      this.ctx.putImageData(this.history[this.historyStep], 0, 0);
    }
  }

  redo() {
    if (this.historyStep < this.history.length - 1) {
      this.historyStep++;
      this.ctx.putImageData(this.history[this.historyStep], 0, 0);
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.saveToHistory();
  }

  // Public API methods
  getImageBlob() {
    return new Promise((resolve) => {
      this.canvas.toBlob(resolve, 'image/png');
    });
  }

  async save() {
    try {
      const blob = await this.getImageBlob();
      const formData = new FormData();
      formData.append('image', blob, 'whiteboard.png');
      formData.append('metadata', JSON.stringify({
        timestamp: new Date().toISOString(),
        dimensions: {
          width: this.canvas.width,
          height: this.canvas.height
        }
      }));

      const response = await fetch('/api/whiteboard', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Dispatch save event
      this.canvasContainer.dispatchEvent(new CustomEvent('whiteboardSaved', {
        detail: result
      }));

      return result;
    } catch (error) {
      console.error('Failed to save whiteboard:', error);
      
      // Dispatch error event
      this.canvasContainer.dispatchEvent(new CustomEvent('whiteboardError', {
        detail: { error: error.message, operation: 'save' }
      }));
      
      throw error;
    }
  }

  downloadPNG() {
    const link = document.createElement('a');
    link.download = `whiteboard-${new Date().toISOString().slice(0, 19)}.png`;
    link.href = this.canvas.toDataURL();
    link.click();
  }
}

// Make available globally
window.MCWhiteboard = MCWhiteboard;