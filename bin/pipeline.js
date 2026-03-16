#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const Table = require('cli-table3');
const chalk = require('chalk');
const { PipelineService } = require('../lib/service.js');
const { PipelineError } = require('../lib/errors.js');

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
  .action(() => {
    const payload = {
      status: 'ok',
      config: service().configSnapshot()
    };
    if (program.opts().json) {
      outputJson(payload);
      return;
    }

    outputText(JSON.stringify(payload.config, null, 2));
  });

program
  .command('import <file>')
  .alias('load')
  .description('Import slices and feature groups from JSON')
  .action((file, command) => {
    const payload = service().importFromFile(file);
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
  .action((command) => {
    const payload = service().getStatus();
    emit(command, payload, (result) => JSON.stringify(result.summary, null, 2));
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
  .option('--agent <agentType>', 'Filter by agent type')
  .action((options, command) => {
    const payload = service().metrics({
      feature: options.feature || null,
      agent: options.agent || null
    });
    emit(command, payload, (result) => JSON.stringify(result.metrics, null, 2));
  });

program
  .command('start <id>')
  .description('Move a slice from PENDING to SSE_REVIEW')
  .action((id, command) => {
    const payload = service().startSlice(id);
    emit(command, payload, (result) => `${chalk.yellow(result.slice.id)} -> ${result.slice.status}`);
  });

program
  .command('approve <id>')
  .description('Approve a slice in SSE_REVIEW')
  .option('--notes <notes>', 'Approval notes')
  .action((id, options, command) => {
    const payload = service().approveSlice(id, options.notes || '');
    emit(command, payload, (result) => `${chalk.green(result.slice.id)} approved`);
  });

program
  .command('reject <id>')
  .description('Reject a slice in SSE_REVIEW')
  .requiredOption('--reason <reason>', 'Reason for rejection')
  .action((id, options, command) => {
    const payload = service().rejectSlice(id, options.reason);
    emit(command, payload, (result) => `${chalk.red(result.slice.id)} returned to PENDING`);
  });

program
  .command('dispatch <id>')
  .description('Dispatch an APPROVED slice')
  .action((id, command) => {
    const payload = service().dispatchSlice(id);
    emit(command, payload, (result) => `${chalk.blue(result.slice.id)} executing (${result.dispatch.sessionId})`);
  });

program
  .command('cancel <id>')
  .description('Cancel an active slice')
  .action((id, command) => {
    const payload = service().cancelSlice(id);
    emit(command, payload, (result) => `${result.slice.id} returned to APPROVED`);
  });

program
  .command('process-signals')
  .description('Process executing slice signals')
  .option('--slice <id>', 'Process a specific slice')
  .action((options, command) => {
    const payload = {
      status: 'ok',
      results: service().processSignals(options.slice || null)
    };
    emit(command, payload, (result) => JSON.stringify(result.results, null, 2));
  });

program
  .command('pr <id>')
  .description('Create a PR for a tested slice')
  .action((id, command) => {
    const payload = service().createPr(id);
    emit(command, payload, (result) => result.pr ? result.pr.url : JSON.stringify(result, null, 2));
  });

program
  .command('sync <id>')
  .description('Sync a PR-backed slice')
  .action((id, command) => {
    const payload = service().syncSlice(id);
    emit(command, payload, (result) => JSON.stringify(result, null, 2));
  });

program
  .command('run')
  .description('Run one automated pipeline cycle')
  .action((command) => {
    const payload = service().runCycle();
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
    code: error.code || 'UNKNOWN'
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
