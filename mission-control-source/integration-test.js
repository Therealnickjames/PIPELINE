#!/usr/bin/env node
// Mission Control v3 - Integration Test
// Verifies all endpoints and basic functionality

const http = require('http');

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runIntegrationTests() {
  console.log('🦞 Mission Control v3 - Integration Test Suite');
  console.log('=' .repeat(50));
  
  const tests = [
    // Static file tests
    { name: 'Main HTML', path: '/index-v3.html', expectStatus: 200 },
    { name: 'CSS Styles', path: '/css/v3-styles.css', expectStatus: 200 },
    { name: 'Main App JS', path: '/js/app-v3.js', expectStatus: 200 },
    { name: 'Constants JS', path: '/js/constants.js', expectStatus: 200 },
    { name: 'Graphics Init', path: '/js/graphics-init.js', expectStatus: 200 },
    { name: 'Graphics Hierarchy', path: '/js/graphics-hierarchy.js', expectStatus: 200 },
    { name: 'Graphics Performance', path: '/js/graphics-performance.js', expectStatus: 200 },
    { name: 'Graphics Whiteboard', path: '/js/graphics-whiteboard.js', expectStatus: 200 },
    
    // API endpoint tests
    { name: 'Gateway API', path: '/api/gateway', expectStatus: 200, expectJson: true },
    { name: 'Agents API', path: '/api/agents', expectStatus: 200, expectJson: true },
    { name: 'Ollama API', path: '/api/ollama', expectStatus: 200, expectJson: true },
    { name: 'Tasks API', path: '/api/tasks', expectStatus: 200, expectJson: true },
    { name: 'Decisions API', path: '/api/decisions', expectStatus: 200, expectJson: true },
    { name: 'Pinned API', path: '/api/pinned', expectStatus: 200, expectJson: true },
    { name: 'Health API', path: '/api/health', expectStatus: 200, expectJson: true },
    { name: 'Crons API', path: '/api/crons', expectStatus: 200, expectJson: true },
    { name: 'Tasks Finished API', path: '/api/tasks/finished', expectStatus: 200, expectJson: true },
    { name: 'Tasks Log API', path: '/api/tasks/log', expectStatus: 200, expectJson: true },
    { name: 'Hierarchy API', path: '/api/hierarchy', expectStatus: 200, expectJson: true },
    { name: 'Whiteboard POST', path: '/api/whiteboard', method: 'POST', expectStatus: 400, data: { test: 'data' } }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const response = await makeRequest(test.path, test.method || 'GET', test.data || null);
      
      const statusOk = response.status === test.expectStatus;
      let jsonOk = true;
      
      if (test.expectJson && statusOk) {
        try {
          JSON.parse(response.body);
        } catch (e) {
          jsonOk = false;
        }
      }

      if (statusOk && jsonOk) {
        console.log(`✓ ${test.name.padEnd(20)} - HTTP ${response.status}`);
        passed++;
      } else {
        console.log(`✗ ${test.name.padEnd(20)} - HTTP ${response.status} (expected ${test.expectStatus})`);
        if (test.expectJson && !jsonOk) {
          console.log(`  └─ Invalid JSON response`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`✗ ${test.name.padEnd(20)} - Error: ${error.message}`);
      failed++;
    }
  }

  console.log('=' .repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All integration tests passed!');
    console.log('📊 Mission Control v3 is ready for use at: http://localhost:3000/index-v3.html');
    return true;
  } else {
    console.log('❌ Some tests failed. Check the output above.');
    return false;
  }
}

if (require.main === module) {
  runIntegrationTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runIntegrationTests };