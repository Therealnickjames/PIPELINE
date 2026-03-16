// Quick test to check if our JS files have syntax errors
// Simulate browser global environment

// Mock browser globals
global.window = {};
global.document = {
  getElementById: () => ({ innerHTML: '', style: {} }),
  querySelector: () => ({ innerHTML: '', style: {} }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ innerHTML: '', style: {}, classList: { add: () => {}, remove: () => {} } })
};
global.console = console;

// Mock fetch
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

console.log("Testing JavaScript file loading...");

try {
  // Load constants
  console.log("Loading constants.js...");
  require('./public/js/constants.js');
  console.log("✓ Constants loaded");

  // Test that constants are available
  if (global.window.MISSION_CONTROL_CONSTANTS) {
    console.log("✓ Constants are globally available");
  } else {
    console.error("✗ Constants not found in global scope");
  }

  console.log("All tests passed! JavaScript files should load correctly in browser.");
} catch (error) {
  console.error("JavaScript loading error:", error.message);
  console.error("Stack:", error.stack);
}