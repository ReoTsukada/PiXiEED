#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkOnly = process.argv.includes('--check');
const generatedTemplates = new Set([
  'scripts/generate-books-catalog.mjs',
  'scripts/generate-event-pages.mjs',
]);
const excludedDirectories = new Set(['.git', '.agents', '.codex', 'assets', 'docs', 'tests', 'vendor', 'node_modules']);

// These are URL-only changes. Keep module bodies, revision semantics, and
// runtime-specific query values out of this normalizer.
const targets = new Map([
  ['site-header.mjs', 'rev=20261017-performance-1'],
  ['tool-header-controls.mjs', 'rev=20261006-header-controls-1&nav=20261016-tool-operations-1'],
  ['draw-core.mjs', 'rev=20261011-tool-size-1'],
  ['drawing-tool-icons.mjs', 'rev=20261004-canvas-settings-1'],
  ['pixel-png-metadata.mjs', 'rev=20260928-pixel-roundtrip-1'],
  ['audio-timbres.mjs', 'rev=20261005-audio-drums-1'],
  ['jigsaw-file.mjs', 'rev=20260929-claude-integration-1'],
]);

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(path);
    else if (entry.isFile() && (relative(root, path).startsWith('js/') || generatedTemplates.has(relative(root, path)))
      && /\.(?:js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function normalize(source, file) {
  let changed = source;
  for (const [name, query] of targets) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reference = new RegExp(`(["'\x60])([^"'\x60\\s<>]*?)(${escaped})(\\?[^"'\x60\\s<>]*)?\\1`, 'g');
    changed = changed.replace(reference, (whole, quote, prefix, filename, oldQuery = '') => {
      // Only local relative/rooted references are in scope. Bare package names
      // and URL schemes are left for their own resolver.
      if (prefix && !prefix.endsWith('/')) return whole;
      if (/^[a-z][a-z\d+.-]*:/i.test(prefix)) return whole;
      if (oldQuery.includes('attempt=')) return whole;
      const current = oldQuery.replace(/^\?/, '');
      if (current === query) return whole;
      return `${quote}${prefix}${filename}?${query}${quote}`;
    });
  }
  return changed;
}

const files = (await walk(root)).sort();
const changedFiles = [];
for (const file of files) {
  const before = await readFile(file, 'utf8');
  const after = normalize(before, file);
  if (before === after) continue;
  changedFiles.push(relative(root, file));
  if (!checkOnly) await writeFile(file, after);
}

if (checkOnly && changedFiles.length) {
  process.stderr.write(`Noncanonical module URLs remain in ${changedFiles.length} files:\n${changedFiles.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${checkOnly ? 'Canonical URLs verified' : `Normalized ${changedFiles.length} files`} (${files.length} source files scanned).\n`);
}
