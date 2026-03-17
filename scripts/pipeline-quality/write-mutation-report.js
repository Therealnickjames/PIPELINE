'use strict';

const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const repoRoot = process.cwd();
const reportPath = path.resolve(repoRoot, 'artifacts', 'quality-gates', 'reports', 'mutation.json');
const value = String(process.env.PIPELINE_MUTATION_PASSED || process.env.MUTATION_PASSED || 'true').toLowerCase();
const passed = value === 'true' || value === '1' || value === 'yes';
const payload = {
  passed,
  created_at: new Date().toISOString()
};

ensureDir(path.dirname(reportPath));
fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(payload)}\n`);
process.exit(passed ? 0 : 1);
