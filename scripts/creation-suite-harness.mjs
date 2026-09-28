#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FIXTURE_VERSION = 1;
const SUITES = {
  baseline: [
    'tests/creation-suite/baseline-routes.test.mjs',
    'tests/public-work-policy.test.mjs',
    'tests/globe/tool-shell.test.mjs',
    'tests/globe/post-contract.test.mjs',
    'tests/globe/puzzle-publication-gate.test.mjs',
    'tests/globe/post-likes.test.mjs',
    'tests/globe/pixel-png.test.mjs',
    'tests/globe/camera-post.test.mjs',
    'tests/pixel-lens/camera-page.test.mjs',
    'tests/creation-suite/public-key-headers.test.mjs',
  ],
  'legacy-posts': ['tests/creation-suite/legacy-posts.test.mjs', 'tests/creation-suite/legacy-placement.test.mjs'],
  'asset-contract': ['tests/creation-suite/asset-contract.test.mjs', 'tests/creation-suite/pixel-contract.test.mjs'],
  drafts: ['tests/creation-suite/local-drafts.test.mjs', 'tests/creation-suite/picture-shelf.test.mjs'],
  'pixel-io': ['tests/pixel-scale.test.mjs', 'tests/export/pixel-export.test.mjs', 'tests/export/pixel-roundtrip.test.mjs', 'tests/export/animated-export.test.mjs', 'tests/pixel-studio/png-export.test.mjs', 'tests/pixel-lens/gif.test.mjs'],
  pxd: ['tests/creation-suite/pxd-codec.test.mjs', 'tests/creation-suite/pxd-store.test.mjs', 'tests/creation-suite/pxd-project.test.mjs', 'tests/creation-suite/pxd-draw-audio.test.mjs', 'tests/creation-suite/pxd-puzzles.test.mjs', 'tests/creation-suite/pxd-camera-context.test.mjs', 'tests/creation-suite/work-save-policy.test.mjs'],
  draw: ['tests/creation-suite/draw.test.mjs', 'tests/creation-suite/draw-handoff.test.mjs', 'tests/creation-suite/pixel-canvas-surface.test.mjs', 'tests/creation-suite/draw-timelapse.test.mjs'],
  audio: ['tests/creation-suite/audio.test.mjs', 'tests/creation-suite/image-to-loop.test.mjs', 'tests/creation-suite/audio-enhancements.test.mjs', 'tests/creation-suite/audio-camera-handoff.test.mjs', 'tests/creation-suite/audio-export.test.mjs', 'tests/creation-suite/audio-viewport.test.mjs', 'tests/creation-suite/audio-video.test.mjs'],
  game: ['tests/creation-suite/game.test.mjs'],
  jigsaw: ['tests/creation-suite/jigsaw.test.mjs', 'tests/creation-suite/jigsaw-workspace.test.mjs', 'tests/creation-suite/jigsaw-selection.test.mjs'],
  'spot-difference': ['tests/creation-suite/spot-difference.test.mjs'],
  'hidden-object': ['tests/creation-suite/hidden-object.test.mjs'],
  'puzzle-definition': ['tests/creation-suite/puzzle-definition.test.mjs', 'tests/creation-suite/puzzle-admission.test.mjs', 'tests/creation-suite/puzzle-upload.test.mjs', 'tests/creation-suite/public-puzzle.test.mjs', 'tests/creation-suite/puzzle-handoff.test.mjs'],
  pixfind: ['tests/creation-suite/pixfind.test.mjs'],
  rewards: ['tests/pass/pass.test.mjs', 'tests/pass/no-ad.test.mjs', 'tests/pass/pass-accumulation.test.mjs', 'tests/pass/pass-gauge.test.mjs', 'tests/pass/header.test.mjs', 'tests/creation-suite/puzzle-hint.test.mjs', 'tests/creation-suite/audio-pass-policy.test.mjs'],
  'site-ui': ['tests/home/home-play.test.mjs', 'tests/home/home-animation.test.mjs', 'tests/arcade/tools-arcade.test.mjs', 'tests/arcade/jigsaw-arcade.test.mjs', 'tests/nav/bottom-nav.test.mjs'],
  seo: ['tests/creation-suite/seo.test.mjs', 'tests/creation-suite/seo-exclusions.test.mjs', 'tests/creation-suite/puzzle-share-page.test.mjs'],
};
const GATES = ['browser', 'device', 'liveData', 'production'];
const TEST_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  let suite = null; let all = false; let json = false; let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (arg === '--json') { json = true; continue; }
    if (arg === '--all') { all = true; continue; }
    if (arg === '--suite') {
      suite = argv[++i];
      if (!suite || suite.startsWith('-')) throw new Error('--suite requires a suite name');
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  if (!help && (all === Boolean(suite))) throw new Error('choose exactly one of --suite <name> or --all');
  if (suite && !Object.hasOwn(SUITES, suite)) throw new Error(`unknown suite: ${suite}`);
  return { suite, all, json, help };
}

function tapSummary(output) {
  const get = (name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, 'mi'));
    return match ? Number(match[1]) : null;
  };
  return { tests: get('tests'), pass: get('pass'), fail: get('fail'), skipped: get('skipped'), cancelled: get('cancelled') };
}

function hashAndFileList() {
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const tracked = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' });
  return {
    sha: sha.status === 0 ? sha.stdout.trim() : null,
    files: tracked.status === 0 ? tracked.stdout.trim().split('\n').filter(Boolean).sort() : [],
  };
}

function runSuite(name) {
  const requested = SUITES[name];
  const missing = requested.filter((file) => {
    const path = resolve(process.cwd(), file);
    return !existsSync(path) || !statSync(path).isFile();
  });
  const present = requested.filter((file) => !missing.includes(file));
  let child = null;
  if (present.length) child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...present], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: TEST_TIMEOUT_MS, killSignal: 'SIGTERM',
  });
  const output = `${child?.stdout ?? ''}\n${child?.stderr ?? ''}`;
  const summary = child ? tapSummary(output) : null;
  const valid = summary && ['tests', 'pass', 'fail', 'skipped', 'cancelled'].every((key) => Number.isInteger(summary[key]));
  const reason = missing.length ? 'required test file missing'
    : child?.error ? `test runner error: ${child.error.message}`
      : !valid ? 'TAP summary missing or invalid'
        : summary.tests === 0 ? 'zero tests reported'
          : summary.pass === 0 ? 'no passing tests reported'
            : summary.fail || summary.cancelled || child.status !== 0 ? 'failed or cancelled tests reported'
              : null;
  const status = reason ? 'FAIL' : 'PASS';
  return {
    name, status, reason, files: requested, missing,
    counts: summary ?? { tests: null, pass: null, fail: null, skipped: null, cancelled: null },
    stdout: child?.stdout ?? '', stderr: child?.stderr ?? '',
  };
}

function suiteRecord(name) {
  const result = runSuite(name);
  const gates = Object.fromEntries(GATES.map((gate) => [gate, {
    status: 'UNTESTED', reason: `${gate} gate is not executed by this dependency-free local harness.`,
  }]));
  return { ...result, gates };
}

function makeReport(names) {
  const suites = names.map(suiteRecord);
  const baseline = suites.find((suite) => suite.name === 'baseline');
  const overall = suites.every((suite) => suite.status === 'PASS') ? 'PASS' : 'FAIL';
  const { sha, files } = hashAndFileList();
  return {
    fixtureVersion: FIXTURE_VERSION,
    sha,
    fileCount: files.length,
    files,
    suites,
    evidence: {
      unit: { status: overall, reason: 'Every requested suite must contain passing tests and no failures.' },
      browser: baseline?.gates.browser ?? { status: 'UNTESTED', reason: 'No suite selected.' },
      device: baseline?.gates.device ?? { status: 'UNTESTED', reason: 'No suite selected.' },
      liveData: baseline?.gates.liveData ?? { status: 'UNTESTED', reason: 'No suite selected.' },
      production: baseline?.gates.production ?? { status: 'UNTESTED', reason: 'No suite selected.' },
    },
    exitCode: overall === 'PASS' ? 0 : 1,
  };
}

function usage() {
  return 'Usage: node scripts/creation-suite-harness.mjs --suite <baseline|legacy-posts|asset-contract|drafts|pixel-io|pxd|draw|audio|game|jigsaw|spot-difference|hidden-object|puzzle-definition|pixfind|rewards|site-ui|seo> [--json]\n       node scripts/creation-suite-harness.mjs --all [--json]';
}

const options = (() => { try { return parseArgs(process.argv.slice(2)); } catch (error) {
  console.error(`ERROR: ${error.message}\n${usage()}`); process.exitCode = 2; return null;
} })();
if (options?.help) console.log(usage());
else if (options) {
  const names = options.all ? Object.keys(SUITES) : [options.suite];
  const report = makeReport(names);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else for (const suite of report.suites) {
    const c = suite.counts;
    console.log(`${suite.name}: ${suite.status} (${c.tests ?? 'unknown'} tests, ${c.pass ?? 'unknown'} pass, ${c.fail ?? 'unknown'} fail, ${c.skipped ?? 'unknown'} skip${suite.reason ? `; ${suite.reason}` : ''})`);
    if (suite.missing.length) console.log(`  missing: ${suite.missing.join(', ')}`);
  }
  process.exitCode = report.exitCode;
}
