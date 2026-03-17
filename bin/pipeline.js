#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const Table = require('cli-table3');
const chalk = require('chalk');
const { PipelineService } = require('../lib/service.js');

const program = new Command();
const machineJson = process.argv.slice(2).includes('--json');

program
  .name('pipeline')
  .description('Gate-enforced development pipeline controller')
  .option('--json', 'Emit machine-readable JSON');

function service() {
  return new PipelineService();
}

function outputJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function outputText(text) {
  process.stdout.write(`${text}\n`);
}

function wantsJson(command) {
  return machineJson || Boolean(command.optsWithGlobals ? command.optsWithGlobals().json : program.opts().json);
}

function requestOptions(options = {}, actor = 'system') {
  return {
    actor,
    requestId: options.requestId || null
  };
}

function addRequestIdOption(command) {
  return command.option('--request-id <id>', 'Idempotency request identifier');
}

function renderSliceTable(slices) {
  const table = new Table({
    head: ['ID', 'Title', 'Status', 'Display', 'Next Action'],
    style: { head: ['cyan'] }
  });

  slices.forEach((slice) => {
    table.push([slice.id, slice.title, slice.status, slice.display_status, slice.next_action]);
  });

  return table.toString();
}

function renderFeatureTable(features) {
  const table = new Table({
    head: ['ID', 'Name', 'Status', 'Merged', 'Total'],
    style: { head: ['cyan'] }
  });

  features.forEach((feature) => {
    table.push([feature.id, feature.name, feature.status, feature.merged_count, feature.total_count]);
  });

  return table.toString();
}

function emit(command, payload, humanRenderer) {
  if (wantsJson(command)) {
    outputJson(payload);
    return;
  }

  outputText(humanRenderer(payload));
}

program
  .command('config')
  .description('Show the loaded pipeline config')
  .action((command) => {
    const payload = {
      status: 'ok',
      config: service().configSnapshot()
    };
    emit(command, payload, (result) => JSON.stringify(result.config, null, 2));
  });

addRequestIdOption(
  program
    .command('import <file>')
    .alias('load')
    .description('Import slices and feature groups from JSON')
).action((file, options, command) => {
  const payload = service().importFromFile(file, requestOptions(options));
  emit(command, payload, (result) => `Imported ${result.slice_count} slices and ${result.feature_count} features.`);
});

program
  .command('list')
  .description('List slices')
  .option('--status <status>', 'Filter by raw or display status')
  .action((options, command) => {
    const payload = service().listSlices(options.status || null);
    emit(command, payload, (result) => renderSliceTable(result.slices));
  });

program
  .command('show <id>')
  .description('Show a single slice')
  .action((id, command) => {
    const payload = service().showSlice(id);
    emit(command, payload, (result) => JSON.stringify(result.slice, null, 2));
  });

program
  .command('log <id>')
  .description('Show slice events')
  .action((id, command) => {
    const payload = service().logSlice(id);
    emit(command, payload, (result) => JSON.stringify(result.events, null, 2));
  });

program
  .command('feature-status')
  .description('Show feature-group progress')
  .action((command) => {
    const payload = service().getFeatures();
    emit(command, payload, (result) => renderFeatureTable(result.features));
  });

program
  .command('status')
  .description('Show pipeline summary')
  .option('--validate', 'Validate gate configuration and schema')
  .action((options, command) => {
    const payload = service().getStatus({
      validate: Boolean(options.validate)
    });
    emit(command, payload, (result) => JSON.stringify(options.validate ? {
      summary: result.summary,
      runtime: result.runtime,
      validation: result.validation
    } : result.summary, null, 2));
  });

program
  .command('doctor')
  .description('Run pre-dispatch environment checks')
  .action((command) => {
    const payload = service().doctor();
    emit(command, payload, (result) => JSON.stringify(result, null, 2));
  });

addRequestIdOption(
  program
    .command('migrate')
    .description('Apply pending schema migrations')
).action((options, command) => {
  const payload = service().migrate(requestOptions(options));
  emit(command, payload, (result) => JSON.stringify(result, null, 2));
});

addRequestIdOption(
  program
    .command('reconcile')
    .description('Recover stale runtime state and abandoned work')
).action((options, command) => {
  const payload = service().reconcile(requestOptions(options));
  emit(command, payload, (result) => JSON.stringify(result, null, 2));
});

program
  .command('smoke')
  .description('Run a lightweight readiness check')
  .action((command) => {
    const payload = service().smoke();
    emit(command, payload, (result) => JSON.stringify(result, null, 2));
  });

program
  .command('next')
  .description('Show the next ready slice')
  .action((command) => {
    const payload = service().nextSlice();
    emit(command, payload, (result) => result.slice ? `${result.slice.id} - ${result.slice.title}` : 'No ready slice');
  });

program
  .command('metrics')
  .description('Show pipeline metrics')
  .option('--feature <featureId>', 'Filter by feature')
  .option('--agent <agentType>', 'Filter by agent')
  .action((options, command) => {
    const payload = service().metrics({
      feature: options.feature || null,
      agent: options.agent || null
    });
    emit(command, payload, (result) => JSON.stringify(result.metrics, null, 2));
  });

addRequestIdOption(
  program
    .command('start <id>')
    .description('Move a slice from PENDING to SSE_REVIEW')
).action((id, options, command) => {
  const payload = service().startSlice(id, 'sse', requestOptions(options, 'sse'));
  emit(command, payload, (result) => `${chalk.yellow(result.slice.id)} -> ${result.slice.status}`);
});

addRequestIdOption(
  program
    .command('approve <id>')
    .description('Approve a slice in SSE_REVIEW')
    .option('--notes <notes>', 'Approval notes')
).action((id, options, command) => {
  const payload = service().approveSlice(id, options.notes || '', 'sse', requestOptions(options, 'sse'));
  emit(command, payload, (result) => `${chalk.green(result.slice.id)} approved`);
});

addRequestIdOption(
  program
    .command('reject <id>')
    .description('Reject a slice in SSE_REVIEW')
    .requiredOption('--reason <reason>', 'Reason for rejection')
).action((id, options, command) => {
  const payload = service().rejectSlice(id, options.reason, 'sse', requestOptions(options, 'sse'));
  emit(command, payload, (result) => `${chalk.red(result.slice.id)} returned to PENDING`);
});

addRequestIdOption(
  program
    .command('dispatch <id>')
    .description('Dispatch an APPROVED slice')
).action((id, options, command) => {
  const payload = service().dispatchSlice(id, 'sse', requestOptions(options, 'sse'));
  emit(command, payload, (result) => `${chalk.blue(result.slice.id)} executing (${result.dispatch.sessionId})`);
});

addRequestIdOption(
  program
    .command('cancel <id>')
    .description('Cancel an active slice')
).action((id, options, command) => {
  const payload = service().cancelSlice(id, 'sse', requestOptions(options, 'sse'));
  emit(command, payload, (result) => `${result.slice.id} returned to APPROVED`);
});

addRequestIdOption(
  program
    .command('process-signals')
    .description('Process executing slice signals')
    .option('--slice <id>', 'Process a specific slice')
).action((options, command) => {
  const payload = service().processSignals(options.slice || null, 'system', requestOptions(options));
  emit(command, payload, (result) => JSON.stringify(result.results, null, 2));
});

addRequestIdOption(
  program
    .command('pr <id>')
    .description('Create a PR for a tested slice')
).action((id, options, command) => {
  const payload = service().createPr(id, 'system', requestOptions(options));
  emit(command, payload, (result) => result.pr ? result.pr.url : JSON.stringify(result, null, 2));
});

addRequestIdOption(
  program
    .command('sync <id>')
    .description('Sync a PR-backed slice')
).action((id, options, command) => {
  const payload = service().syncSlice(id, 'system', requestOptions(options));
  emit(command, payload, (result) => JSON.stringify(result, null, 2));
});

addRequestIdOption(
  program
    .command('run')
    .description('Run one automated pipeline cycle')
).action((options, command) => {
  const payload = service().runCycle('system', requestOptions(options));
  emit(command, payload, (result) => `Cycle complete. ${result.changes.length} changes.`);
});

function main() {
  try {
    if (machineJson) {
      const reordered = [
        process.argv[0],
        process.argv[1],
        '--json',
        ...process.argv.slice(2).filter((argument) => argument !== '--json')
      ];
      program.parse(reordered);
      return;
    }

    program.parse(process.argv);
  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  const payload = {
    status: 'error',
    error: error.message,
    code: error.code || 'UNKNOWN',
    details: error.details || null
  };

  if (machineJson || program.opts().json) {
    outputJson(payload);
  } else {
    process.stderr.write(`${chalk.red(payload.code)}: ${payload.error}\n`);
  }
  process.exitCode = 1;
}

process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

main();
