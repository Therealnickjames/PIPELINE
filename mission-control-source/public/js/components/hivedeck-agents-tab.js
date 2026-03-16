// Mission Control v3 - HiveDeck Agents Catalog Tab
class HivedeckAgentsTab {
  constructor() {
    this.tabName = 'hivedeck-agents';
    this.container = document.getElementById('hivedeck-agents-content');
  }

  async render() {
    if (!this.container) return;
    this.renderContent();
  }

  async refresh() {
    this.renderContent();
  }

  renderContent() {
    const agents = window.MISSION_CONTROL_CONSTANTS.HIVEDECK_AGENTS;

    this.container.innerHTML = `
      <div class="mb-6">
        <h2 class="text-2xl font-semibold">HiveDeck Agent Catalog</h2>
        <p class="text-gray-400 mt-1">11 production-grade agents available at <a href="https://hivedeck.ai" target="_blank" class="text-yellow-400 hover:text-yellow-300">hivedeck.ai</a></p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${agents.map(agent => this.renderAgentCard(agent)).join('')}
      </div>
    `;
  }

  renderAgentCard(agent) {
    return `
      <div class="card hover:border-yellow-400/30 transition-colors cursor-default" style="background:var(--bg-secondary); border:1px solid var(--border-primary); border-radius:14px; padding:18px;">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:12px;">
          <div>
            <div style="font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--text-secondary);">${agent.role}</div>
            <div style="margin-top:6px; font-size:17px; font-weight:650;" class="${agent.color}">${agent.name}</div>
          </div>
          <span style="padding:4px 10px; border:1px solid var(--border-primary); border-radius:999px; font-size:12px; color:#FFD000; white-space:nowrap;">${agent.price}</span>
        </div>
        <div style="margin-top:10px; font-size:13px; line-height:1.55; color:var(--text-secondary);">${agent.desc}</div>
        <div style="margin-top:14px; font-size:12px; color:var(--text-secondary);">
          <a href="https://hivedeck.ai" target="_blank" style="color:#FFD000; opacity:.8;">View on HiveDeck →</a>
        </div>
      </div>
    `;
  }

  // Component lifecycle methods
  onShow() {
    if (!this.container) {
      this.container = document.getElementById('hivedeck-agents-content');
    }
    this.renderContent();
  }

  onHide() {}

  onTabChange(fromTab, toTab, isActive) {}
}

// Register the component
document.addEventListener('DOMContentLoaded', () => {
  const hivedeckAgentsTab = new HivedeckAgentsTab();
  TabSystem.registerComponent('hivedeck-agents', hivedeckAgentsTab);
});
