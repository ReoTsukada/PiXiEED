#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkOnly = process.argv.includes('--check');
const generatedTemplates = new Set([
  'scripts/generate-books-catalog.mjs',
  'scripts/generate-event-pages.mjs',
]);
const excludedDirectories = new Set(['.git', '.agents', '.codex', 'assets', 'docs', 'tests', 'work', 'vendor', 'node_modules']);

// These are URL-only changes. Keep module bodies, revision semantics, and
// runtime-specific query values out of this normalizer.
const targets = new Map([
  ['tool-start-routes.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-direct.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-shell.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-workspace-state.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-offerwall-entry.mjs', 'rev=20261024-common-tool-start-1'],
  ['public-navigation.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-entry-compat.js', 'rev=20261024-common-tool-start-1'],
  ['project-workspace.mjs', 'rev=20261024-common-tool-start-1'],
  ['jigsaw-page.mjs', 'rev=20261024-common-tool-start-1'],
  ['spot-difference-page.mjs', 'rev=20261024-common-tool-start-1'],
  ['hidden-object-page.mjs', 'rev=20261024-common-tool-start-1'],
  ['draw-page.mjs', 'rev=20261024-common-tool-start-1'],
  ['creation-runtime.mjs', 'rev=20261024-common-tool-start-1'],
  ['creation-modes.mjs', 'rev=20261024-common-tool-start-1'],
  ['app.js', 'rev=20261024-common-tool-start-1'],
  ['site-header.mjs', 'rev=20261024-common-tool-start-1'],
  ['page-navigation.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-help.mjs', 'rev=20261027-guide-constraints-1'],
  ['tool-help-data.mjs', 'rev=20261027-guide-constraints-1'],
  ['tool-help-bootstrap.mjs', 'rev=20261027-guide-constraints-1'],
  ['profile-likes-page.mjs', 'rev=20261024-intelligence-ui-1'],
  ['output-page.mjs', 'rev=20261031-workspace-2'],
  ['tool-output.css', 'rev=20261024-intelligence-ui-1'],
  ['tool-help.css', 'rev=20261024-intelligence-ui-1'],
  ['social-feed.css', 'rev=20261024-side-ad-layout-1'],
  ['social/app.mjs', 'rev=20261029-explore-1'],
  ['ordinary-ad-entry.mjs', 'rev=20261024-side-ad-layout-2'],
  ['information-auto-ads.mjs', 'rev=20261024-side-ad-layout-1'],
  ['display-ads.mjs', 'rev=20261030-event-inline-ads-1'],
  ['tool-header-controls.mjs', 'rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1'],
  ['draw-core.mjs', 'rev=20261011-tool-size-1'],
  ['drawing-tool-icons.mjs', 'rev=20261004-canvas-settings-1'],
  ['pixel-png-metadata.mjs', 'rev=20260928-pixel-roundtrip-1'],
  ['audio-timbres.mjs', 'rev=20261005-audio-drums-1'],
  ['jigsaw-file.mjs', 'rev=20260929-claude-integration-1'],
]);

const commonToolStartModules = new Set(["js/adsense-offerwall-policy.js", "js/app.js", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/output-page.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/home-startup.mjs", "js/page-navigation.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/public-navigation.mjs", "js/site-header.mjs", "js/tool-direct.mjs", "js/tool-embed.mjs", "js/tool-entry-compat.js", "js/tool-offerwall-entry.mjs", "js/tool-shell.mjs", "js/tool-start-routes.mjs", "js/tool-workspace-state.mjs"]);

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && excludedDirectories.has(entry.name) && relative(root, path) !== 'output/work') continue;
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
  // Keep the complete importer closure on the same release URL, preserving
  // unrelated runtime parameters and the historical core/animation identities.
  changed = changed.replace(/(["'`])([^"'`\s<>]+?\.(?:mjs|js))(\?[^"'`\s<>]*)?\1/g, (whole, quote, path, query = '') => {
    if (!path.startsWith('/') && !path.startsWith('.') || path.startsWith('//') || query.includes('attempt=')) return whole;
    const owner = relative(root, file).replaceAll('\\', '/');
    const target = path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(owner), path));
    if (!commonToolStartModules.has(target)) return whole;
    const revision = target === 'js/creation/output-page.mjs' ? '20261031-workspace-2' : '20261024-common-tool-start-1';
    const next = /[?&]rev=/.test(query) ? query.replace(/([?&])rev=[^&]*/, '$1rev=' + revision) : query + (query ? '&' : '?') + 'rev=' + revision;
    return `${quote}${path}${next}${quote}`;
  });
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
