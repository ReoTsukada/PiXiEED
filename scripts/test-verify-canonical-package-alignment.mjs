#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');
const verifier = path.join(repo, 'scripts/verify-canonical-package-alignment.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixieed-canonical-'));
for (const file of [
  '00_START_HERE/WORK_PACKAGE_REGISTRY.json',
  '00_START_HERE/IMPLEMENTATION_QUEUE.yaml',
  '.codex/PIXIEED_IMPLEMENTATION_STATE.yaml',
  '09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md',
  '09_ROADMAP/WORK_PACKAGES/WP-900.md',
  '09_ROADMAP/WORK_PACKAGES/WP-970.md',
  '09_ROADMAP/WORK_PACKAGES/WP-980.md',
]) {
  const destination = path.join(temp, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repo, file), destination);
}

execFileSync(process.execPath, [verifier, temp], { stdio: 'pipe' });
const queue = path.join(temp, '00_START_HERE/IMPLEMENTATION_QUEUE.yaml');
const queueText = fs.readFileSync(queue, 'utf8');
const currentReadyPackage = queueText.match(/^current_ready_package:\s*([^#\n]+)/m)?.[1]?.trim();
assert.ok(currentReadyPackage, 'fixture queue must declare current_ready_package');
fs.writeFileSync(queue, queueText.replace(
  `current_ready_package: ${currentReadyPackage}`,
  'current_ready_package: FP-004',
));
assert.throws(
  () => execFileSync(process.execPath, [verifier, temp], { stdio: 'pipe' }),
  (error) => error.status === 1 && /current package mismatch/.test(error.stderr.toString()),
);
console.log('PASS canonical alignment verifier tests');
