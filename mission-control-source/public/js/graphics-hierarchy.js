/**
 * Mission Control v3 - Interactive SVG Hierarchy Chart
 * Graphics Dev: graphics
 * 
 * Renders agent hierarchy as interactive org chart with zoom/pan
 * Data source: GET /api/hierarchy
 */

class MCHierarchyChart {
  constructor(container, data) {
    this.container = container;
    this.data = data;
    this.svg = null;
    this.g = null; // Main group for zoom/pan
    this.width = 800;
    this.height = 600;
    this.nodeRadius = 30;
    this.levelSpacing = 120;
    this.nodeSpacing = 160;
    this.positions = {};
    this.zoom = null;
    this.selectedNode = null;
    
    this.init();
  }

  init() {
    this.createSVG();
    this.calculateLayout();
    this.renderChart();
    this.setupZoom();
    this.setupInteractions();
  }

  createSVG() {
    // Clear container
    this.container.innerHTML = '';
    
    // Create SVG with responsive viewBox
    this.svg = MCGraphicsUtils.createSVGElement('svg', {
      viewBox: `0 0 ${this.width} ${this.height}`,
      width: '100%',
      height: '100%',
      style: 'background: #0f1419; border-radius: 0.5rem; cursor: grab;'
    });

    // Add definitions for gradients and patterns
    const defs = MCGraphicsUtils.createSVGElement('defs');
    
    // Agent role gradients
    Object.entries(MCGraphicsUtils.colors).forEach(([key, color]) => {
      if (key.startsWith('agent-')) {
        const gradient = MCGraphicsUtils.createSVGElement('radialGradient', {
          id: `gradient-${key}`,
          cx: '30%',
          cy: '30%',
          r: '70%'
        });
        
        const stop1 = MCGraphicsUtils.createSVGElement('stop', {
          offset: '0%',
          'stop-color': color,
          'stop-opacity': '0.9'
        });
        
        const stop2 = MCGraphicsUtils.createSVGElement('stop', {
          offset: '100%',
          'stop-color': color,
          'stop-opacity': '0.6'
        });
        
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
      }
    });

    this.svg.appendChild(defs);
    
    // Main group for zoom/pan transforms
    this.g = MCGraphicsUtils.createSVGElement('g');
    this.svg.appendChild(this.g);
    
    this.container.appendChild(this.svg);
  }

  calculateLayout() {
    if (!this.data || !this.data.nodes) return;

    // Group nodes by hierarchy level
    const levels = {};
    Object.values(this.data.nodes).forEach(node => {
      if (!levels[node.level]) levels[node.level] = [];
      levels[node.level].push(node);
    });

    // Calculate positions
    this.positions = {};
    const maxLevel = Math.max(...Object.keys(levels).map(Number));
    
    Object.entries(levels).forEach(([level, nodes]) => {
      const levelNum = parseInt(level);
      const yPos = 80 + (levelNum * this.levelSpacing);
      
      // Center nodes horizontally
      const totalWidth = (nodes.length - 1) * this.nodeSpacing;
      const startX = (this.width - totalWidth) / 2;
      
      nodes.forEach((node, index) => {
        this.positions[node.id] = {
          x: startX + (index * this.nodeSpacing),
          y: yPos
        };
      });
    });
  }

  renderChart() {
    if (!this.data || !this.data.nodes) return;

    // Clear existing content
    this.g.innerHTML = '';

    // Render connections first (behind nodes)
    this.renderConnections();
    
    // Render nodes
    this.renderNodes();
  }

  renderConnections() {
    const connections = MCGraphicsUtils.createSVGElement('g', {
      class: 'connections'
    });

    Object.values(this.data.nodes).forEach(node => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(childId => {
          const childNode = this.data.nodes[childId];
          if (!childNode) return;

          const parentPos = this.positions[node.id];
          const childPos = this.positions[childId];
          
          if (!parentPos || !childPos) return;

          // Create curved connection line
          const path = MCGraphicsUtils.createSVGElement('path', {
            d: this.createConnectionPath(parentPos, childPos),
            stroke: MCGraphicsUtils.colors['border-primary'],
            'stroke-width': '2',
            fill: 'none',
            opacity: '0.6'
          });

          connections.appendChild(path);
        });
      }
    });

    this.g.appendChild(connections);
  }

  createConnectionPath(parent, child) {
    // Create smooth curve from parent to child
    const midY = parent.y + (child.y - parent.y) / 2;
    return `M ${parent.x} ${parent.y + this.nodeRadius} 
            Q ${parent.x} ${midY} ${(parent.x + child.x) / 2} ${midY}
            Q ${child.x} ${midY} ${child.x} ${child.y - this.nodeRadius}`;
  }

  renderNodes() {
    const nodes = MCGraphicsUtils.createSVGElement('g', {
      class: 'nodes'
    });

    Object.values(this.data.nodes).forEach(node => {
      const nodeGroup = this.createNodeElement(node);
      nodes.appendChild(nodeGroup);
    });

    this.g.appendChild(nodes);
  }

  createNodeElement(node) {
    const pos = this.positions[node.id];
    if (!pos) return MCGraphicsUtils.createSVGElement('g');

    const nodeGroup = MCGraphicsUtils.createSVGElement('g', {
      class: 'node',
      'data-node-id': node.id,
      transform: `translate(${pos.x}, ${pos.y})`,
      style: 'cursor: pointer;'
    });

    // Node circle with gradient
    const circle = MCGraphicsUtils.createSVGElement('circle', {
      r: this.nodeRadius,
      fill: `url(#gradient-agent-${node.id})`,
      stroke: MCGraphicsUtils.getStatusColor(node.status),
      'stroke-width': '3',
      opacity: node.status === 'online' ? '1' : '0.6'
    });

    // Status indicator ring
    if (node.status !== 'online') {
      const statusRing = MCGraphicsUtils.createSVGElement('circle', {
        r: this.nodeRadius + 6,
        fill: 'none',
        stroke: MCGraphicsUtils.getStatusColor(node.status),
        'stroke-width': '2',
        'stroke-dasharray': node.status === 'offline' ? '8,4' : '4,4',
        opacity: '0.8'
      });
      nodeGroup.appendChild(statusRing);
    }

    nodeGroup.appendChild(circle);

    // Node label (name)
    const nameText = MCGraphicsUtils.createSVGElement('text', {
      'text-anchor': 'middle',
      y: '5',
      fill: MCGraphicsUtils.colors['text-primary'],
      'font-size': '11',
      'font-weight': '600',
      style: 'pointer-events: none;'
    });
    nameText.textContent = node.name;
    nodeGroup.appendChild(nameText);

    // Role label
    const roleText = MCGraphicsUtils.createSVGElement('text', {
      'text-anchor': 'middle',
      y: this.nodeRadius + 15,
      fill: MCGraphicsUtils.colors['text-secondary'],
      'font-size': '10',
      style: 'pointer-events: none;'
    });
    roleText.textContent = node.role;
    nodeGroup.appendChild(roleText);

    // Model indicator
    const modelText = MCGraphicsUtils.createSVGElement('text', {
      'text-anchor': 'middle',
      y: this.nodeRadius + 28,
      fill: MCGraphicsUtils.colors['text-secondary'],
      'font-size': '8',
      opacity: '0.7',
      style: 'pointer-events: none;'
    });
    modelText.textContent = node.model || 'Unknown';
    nodeGroup.appendChild(modelText);

    // Activity indicator
    if (node.last_active) {
      const activityText = MCGraphicsUtils.createSVGElement('text', {
        'text-anchor': 'middle',
        y: -this.nodeRadius - 8,
        fill: MCGraphicsUtils.colors['status-info'],
        'font-size': '8',
        opacity: '0.8',
        style: 'pointer-events: none;'
      });
      activityText.textContent = MCGraphicsUtils.formatTimestamp(node.last_active);
      nodeGroup.appendChild(activityText);
    }

    // Tool count badge
    if (node.tools_count > 0) {
      const badge = MCGraphicsUtils.createSVGElement('circle', {
        cx: this.nodeRadius - 8,
        cy: -this.nodeRadius + 8,
        r: '8',
        fill: MCGraphicsUtils.colors['accent-primary'],
        stroke: MCGraphicsUtils.colors['bg-secondary'],
        'stroke-width': '2'
      });
      nodeGroup.appendChild(badge);

      const badgeText = MCGraphicsUtils.createSVGElement('text', {
        x: this.nodeRadius - 8,
        y: -this.nodeRadius + 8 + 3,
        'text-anchor': 'middle',
        fill: '#ffffff',
        'font-size': '8',
        'font-weight': '600',
        style: 'pointer-events: none;'
      });
      badgeText.textContent = node.tools_count;
      nodeGroup.appendChild(badgeText);
    }

    return nodeGroup;
  }

  setupZoom() {
    // Simple zoom/pan implementation
    let isPanning = false;
    let startPan = { x: 0, y: 0 };
    let currentTransform = { x: 0, y: 0, scale: 1 };

    this.svg.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'svg') {
        isPanning = true;
        startPan = { x: e.clientX, y: e.clientY };
        this.svg.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        const dx = e.clientX - startPan.x;
        const dy = e.clientY - startPan.y;
        
        currentTransform.x += dx;
        currentTransform.y += dy;
        
        this.g.setAttribute('transform', 
          `translate(${currentTransform.x}, ${currentTransform.y}) scale(${currentTransform.scale})`);
        
        startPan = { x: e.clientX, y: e.clientY };
      }
    });

    document.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        this.svg.style.cursor = 'grab';
      }
    });

    // Zoom with mouse wheel
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const rect = this.svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.3, Math.min(3, currentTransform.scale * delta));
      
      if (newScale !== currentTransform.scale) {
        // Zoom towards cursor position
        const scaleRatio = newScale / currentTransform.scale;
        currentTransform.x = x - scaleRatio * (x - currentTransform.x);
        currentTransform.y = y - scaleRatio * (y - currentTransform.y);
        currentTransform.scale = newScale;
        
        this.g.setAttribute('transform', 
          `translate(${currentTransform.x}, ${currentTransform.y}) scale(${currentTransform.scale})`);
      }
    });
  }

  setupInteractions() {
    // Node click handlers
    this.svg.addEventListener('click', (e) => {
      const nodeGroup = e.target.closest('.node');
      if (nodeGroup) {
        const nodeId = nodeGroup.getAttribute('data-node-id');
        this.selectNode(nodeId);
        
        // Dispatch custom event for external handling
        this.container.dispatchEvent(new CustomEvent('nodeClick', {
          detail: { nodeId, node: this.data.nodes[nodeId] }
        }));
      } else {
        // Clear selection if clicking on empty space
        this.clearSelection();
      }
    });

    // Node hover effects
    this.svg.addEventListener('mouseover', (e) => {
      const nodeGroup = e.target.closest('.node');
      if (nodeGroup && !nodeGroup.classList.contains('selected')) {
        const circle = nodeGroup.querySelector('circle');
        circle.setAttribute('stroke-width', '4');
        circle.setAttribute('opacity', '1');
      }
    });

    this.svg.addEventListener('mouseout', (e) => {
      const nodeGroup = e.target.closest('.node');
      if (nodeGroup && !nodeGroup.classList.contains('selected')) {
        const circle = nodeGroup.querySelector('circle');
        circle.setAttribute('stroke-width', '3');
        const node = this.data.nodes[nodeGroup.getAttribute('data-node-id')];
        circle.setAttribute('opacity', node.status === 'online' ? '1' : '0.6');
      }
    });
  }

  selectNode(nodeId) {
    // Clear previous selection
    this.clearSelection();
    
    const nodeGroup = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeGroup) {
      nodeGroup.classList.add('selected');
      const circle = nodeGroup.querySelector('circle');
      circle.setAttribute('stroke-width', '5');
      circle.setAttribute('opacity', '1');
      
      // Add selection ring
      const selectionRing = MCGraphicsUtils.createSVGElement('circle', {
        r: this.nodeRadius + 10,
        fill: 'none',
        stroke: MCGraphicsUtils.colors['accent-primary'],
        'stroke-width': '2',
        opacity: '0.7',
        class: 'selection-ring'
      });
      nodeGroup.appendChild(selectionRing);
    }
    
    this.selectedNode = nodeId;
  }

  clearSelection() {
    const selected = this.svg.querySelector('.node.selected');
    if (selected) {
      selected.classList.remove('selected');
      const circle = selected.querySelector('circle');
      circle.setAttribute('stroke-width', '3');
      
      const nodeId = selected.getAttribute('data-node-id');
      const node = this.data.nodes[nodeId];
      circle.setAttribute('opacity', node.status === 'online' ? '1' : '0.6');
      
      // Remove selection ring
      const ring = selected.querySelector('.selection-ring');
      if (ring) ring.remove();
    }
    
    this.selectedNode = null;
  }

  updateData(newData) {
    this.data = newData;
    this.calculateLayout();
    this.renderChart();
  }

  // Public API methods
  centerView() {
    this.g.setAttribute('transform', 'translate(0, 0) scale(1)');
  }

  focusNode(nodeId) {
    const pos = this.positions[nodeId];
    if (pos) {
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const translateX = centerX - pos.x;
      const translateY = centerY - pos.y;
      
      this.g.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(1.2)`);
      this.selectNode(nodeId);
    }
  }
}

// Make available globally
window.MCHierarchyChart = MCHierarchyChart;