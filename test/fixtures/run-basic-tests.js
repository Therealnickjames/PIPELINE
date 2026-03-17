'use strict';

const fs = require('fs');
const path = require('path');

const controlPath = path.resolve(process.cwd(), 'artifacts', 'test-control.json');
let control = {
  passed: true,
  passCount: 3,
  failCount: 0,
  skippedCount: 0
};

if (fs.existsSync(controlPath)) {
  control = {
    ...control,
    ...JSON.parse(fs.readFileSync(controlPath, 'utf8'))
  };
}

if (control.passCount) {
  process.stdout.write(`${control.passCount} passing\n`);
}

if (control.failCount) {
  process.stderr.write(`${control.failCount} failing\n`);
}

if (control.skippedCount) {
  process.stdout.write(`${control.skippedCount} skipped\n`);
}

process.exit(control.passed ? 0 : 1);
