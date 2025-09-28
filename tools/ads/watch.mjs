#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const vendorsDir = path.join(projectRoot, 'ads', 'adsets', 'vendors');

let running = false;
let queued = false;

function runApply() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  const child = spawn('node', [path.join(__dirname, 'apply.mjs')], {
    stdio: 'inherit'
  });
  child.on('exit', () => {
    running = false;
    if (queued) {
      queued = false;
      runApply();
    }
  });
}

function ensureWatchDir() {
  fs.mkdirSync(vendorsDir, { recursive: true });
}

function watchDirectory(dir) {
  try {
    fs.watch(dir, { recursive: true }, () => {
      runApply();
    });
  } catch (error) {
    console.error('[ads] Failed to watch directory', dir, error);
    process.exit(1);
  }
}

console.log('[ads] Watching vendor folders. Drop new folders into ads/adsets/vendors and changes will be picked up automatically.');
ensureWatchDir();
runApply();
watchDirectory(vendorsDir);
