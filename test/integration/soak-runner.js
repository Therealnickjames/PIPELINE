'use strict';

const { spawnSync } = require('child_process');

const result = spawnSync(process.execPath, ['--test', 'test/integration/pipeline-flow.test.js'], {
  stdio: 'inherit',
  shell: false
});

process.exit(result.status === null ? 1 : result.status);
