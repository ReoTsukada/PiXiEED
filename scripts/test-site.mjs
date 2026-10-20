#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function testFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await testFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(path);
  }
  return files.sort();
}
const files = await testFiles(join(root, 'tests'));
if (!files.length) throw new Error('No test files found');
console.log(`Running ${files.length} test files with Node ${process.versions.node}, TZ=UTC`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root, stdio: 'inherit', env: { ...process.env, TZ: 'UTC' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
