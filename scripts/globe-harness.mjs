#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const DEFAULT_TESTS = [
  'tests/globe/geometry.test.mjs',
  'tests/globe/topology.test.mjs',
  'tests/globe/hierarchy.test.mjs',
  'tests/globe/renderer.test.mjs'
  , 'tests/globe/mask.test.mjs'
  , 'tests/globe/geo-input.test.mjs'
  , 'tests/globe/post-contract.test.mjs'
];
const TEST_TIMEOUT_MS = 60_000;

function usage() {
  return `Usage: node scripts/globe-harness.mjs [options]

Runs Node's built-in test runner for every dependency-free globe test.

Options:
  --test <path>   Add an explicit test file; may be repeated
  --browser-url <url>  Open a local page for the browser evidence gate
  --json          Emit a machine-readable result
  --help          Show this help

With no --test option, runs all tests under tests/globe/.
Missing paths and a zero-test result fail closed. Browser evidence is reported
as UNTESTED until a renderer integration exists; it is never promoted to PASS.`.trim();
}

function parseArgs(argv) {
  const tests = [];
  let json = false;
  let browserUrl = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--browser-url') {
      browserUrl = argv[++index];
      if (!browserUrl || browserUrl.startsWith('-')) throw new Error('--browser-url requires a URL');
      continue;
    }
    if (arg === '--test') {
      const path = argv[++index];
      if (!path || path.startsWith('-')) throw new Error('--test requires a path');
      tests.push(path);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    throw new Error(`unexpected argument: ${arg}; use --test <path>`);
  }

  return { help: false, json, browserUrl, tests: tests.length > 0 ? tests : DEFAULT_TESTS };
}

function preflight(paths) {
  const missing = [];
  const runnable = [];
  for (const path of paths) {
    const absolute = resolve(process.cwd(), path);
    if (existsSync(absolute) && statSync(absolute).isFile()) runnable.push(path);
    else missing.push(path);
  }
  return { missing, runnable };
}

function parseTapSummary(output) {
  const read = (name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, 'mi'));
    return match ? Number(match[1]) : null;
  };
  return {
    tests: read('tests'),
    pass: read('pass'),
    fail: read('fail'),
    skipped: read('skipped'),
    cancelled: read('cancelled'),
  };
}

function runNodeTests(paths) {
  if (paths.length === 0) return { status: 'NOT_RUN', exitCode: null, stdout: '', stderr: '', summary: null };
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...paths], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TEST_TIMEOUT_MS,
    killSignal: 'SIGTERM',
  });
  if (child.error) {
    return {
      status: 'FAIL',
      exitCode: child.status,
      stdout: child.stdout ?? '',
      stderr: `${child.stderr ?? ''}${child.error.message}`,
      summary: null,
      timeout: child.error.code === 'ETIMEDOUT',
    };
  }
  const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
  const summary = parseTapSummary(output);
  return {
    status: child.status === 0 ? 'PASS' : 'FAIL',
    exitCode: child.status,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
    summary,
  };
}

async function runBrowserGate(url) {
  const emptyMetrics = {
    viewport: null,
    dpr: null,
    seamPixels: null,
    crackPixels: null,
    backHemisphereClipped: null,
    frameP95Ms: null
  };
  if (!url) return { status: 'UNTESTED', reason: 'No --browser-url supplied; runtime integration is pending.', metrics: emptyMetrics };
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    return { status: 'UNTESTED', reason: 'Optional Playwright is unavailable; no dependency was added.', metrics: emptyMetrics };
  }
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    return {
      status: 'UNTESTED',
      reason: 'Page opened, but runtime globe integration is pending; pixel and frame assertions are not claimed.',
      metrics: { ...emptyMetrics, viewport: { width: viewport.width, height: viewport.height }, dpr: viewport.dpr }
    };
  } finally {
    await browser.close();
  }
}

async function buildResult(options) {
  const { missing, runnable } = preflight(options.tests);
  const unit = runNodeTests(runnable);
  const summary = unit.summary;
  const validSummary = summary
    && Number.isInteger(summary.tests)
    && Number.isInteger(summary.pass)
    && Number.isInteger(summary.fail)
    && Number.isInteger(summary.skipped)
    && Number.isInteger(summary.cancelled);
  const zeroTests = !validSummary || summary.tests === 0;
  const noPassingTests = !validSummary || summary.pass < 1;
  const testFailures = !validSummary || summary.fail !== 0 || summary.cancelled !== 0;
  const requiredMissing = missing.length > 0;
  if (requiredMissing || zeroTests || noPassingTests || testFailures || unit.status === 'FAIL') {
    unit.status = 'FAIL';
    unit.reason = requiredMissing
      ? 'required test path is missing'
      : !validSummary
        ? 'TAP summary is missing or invalid'
        : zeroTests
          ? 'zero tests were reported'
          : noPassingTests
            ? 'no passing tests were reported'
            : testFailures
              ? 'failed or cancelled tests were reported'
              : 'node --test failed';
  }
  return {
    command: [process.execPath, '--test', '--test-reporter=tap', ...options.tests],
    requested: options.tests,
    missing,
    unit,
    browser: await runBrowserGate(options.browserUrl),
    exitCode: unit.status === 'PASS' ? 0 : 1,
  };
}

function printHuman(result) {
  for (const path of result.missing) console.log(`SKIP unit ${path}: required test path is missing`);
  if (result.unit.stdout) process.stdout.write(result.unit.stdout);
  if (result.unit.stderr) process.stderr.write(result.unit.stderr);
  const testCount = result.unit.summary?.tests ?? 'unknown';
  const passCount = result.unit.summary?.pass ?? 'unknown';
  const failCount = result.unit.summary?.fail ?? 'unknown';
  const skippedCount = result.unit.summary?.skipped ?? 'unknown';
  const cancelledCount = result.unit.summary?.cancelled ?? 'unknown';
  const reason = result.unit.reason ? `, ${result.unit.reason}` : '';
  console.log(`UNIT: ${result.unit.status} (${testCount} test(s), ${passCount} pass, ${failCount} fail, ${skippedCount} skipped, ${cancelledCount} cancelled${reason})`);
  console.log(`BROWSER: ${result.browser.status} (${result.browser.reason})`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}\n\n${usage()}`);
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const result = await buildResult(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  return result.exitCode;
}

process.exitCode = await main();
