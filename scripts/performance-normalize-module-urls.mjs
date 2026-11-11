#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkOnly = process.argv.includes('--check');
const generatedTemplates = new Set([
  'scripts/generate-books-catalog.mjs',
  'scripts/generate-event-pages.mjs',
  'scripts/generate-conversion-guides.mjs',
]);
const excludedDirectories = new Set(['.git', '.agents', '.codex', 'assets', 'docs', 'tests', 'work', 'vendor', 'node_modules']);

// Declare canonical cache revisions here; derive no versions from file contents.
// Keep runtime-specific query values intact while normalizing module references.
const targets = new Map([
  ['draw-brush-settings.css', 'rev=20261107-brush-camera-1'],
  ['creation-mode-motion.mjs', 'rev=20261107-mode-continuity-1'],
  ['tool-start-routes.mjs', 'rev=20261110-output-result-1'],
  ['audio-entry.mjs', 'rev=20261107-gallery-1'],
  ['audio-page.mjs', 'rev=20261107-gallery-1'],
  ['tool-direct.mjs', 'rev=20261108-gallery-first-ad-1'],
  ['tool-shell.mjs', 'rev=20261108-gallery-first-ad-1'],
  ['creation-runtime.mjs', 'rev=20261107-gallery-1'],
  ['creation-modes.mjs', 'rev=20261107-gallery-1'],
  ['creation-modes.css', 'rev=20261108-work-manager-1'],
  ['draw-music.mjs', 'rev=20261106-button-icon-audit-1'],
  ['draw-audio-timbre-panel.mjs', 'rev=20261106-button-icon-audit-1'],
  ['tool-project-import.mjs', 'rev=20261107-gallery-1'],
  ['project-workspace.mjs', 'rev=20261107-gallery-1'],
  ['tool-workspace-state.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-offerwall-entry.mjs', 'rev=20261110-output-result-1'],
  ['public-navigation.mjs', 'rev=20261024-common-tool-start-1'],
  ['tool-entry-compat.js', 'rev=20261024-common-tool-start-1'],
  ['jigsaw-page.mjs', 'rev=20261107-gallery-1'],
  ['spot-difference-page.mjs', 'rev=20261107-gallery-1'],
  ['hidden-object-page.mjs', 'rev=20261107-gallery-1'],
  ['draw-page.mjs', 'rev=20261107-gallery-1'],
  ['animation-controls.mjs', 'rev=20261106-button-icon-audit-1'],
  ['draw-desktop-ui.mjs', 'rev=20261106-button-icon-audit-1'],
  ['creation-runtime.mjs', 'rev=20261107-gallery-1'],
  ['creation-modes.mjs', 'rev=20261107-gallery-1'],
  ['app.js', 'rev=20261024-common-tool-start-1'],
  ['site-header.mjs', 'rev=20261024-common-tool-start-1'],
  ['page-navigation.mjs', 'rev=20261024-common-tool-start-1'],
  ['adsense-offerwall-policy.js', 'rev=20261110-output-result-1'],
  ['conversion-entry.mjs', 'rev=20261110-output-layout-7'],
  ['conversion-display-ad.mjs', 'rev=20261110-output-result-1'],
  ['tool-help.mjs', 'rev=20261107-brush-camera-1'],
  ['tool-help-data.mjs', 'rev=20261107-brush-camera-1'],
  ['tool-help-bootstrap.mjs', 'rev=20261107-brush-camera-1'],
  ['profile-likes-page.mjs', 'rev=20261024-intelligence-ui-1'],
  ['output-page.mjs', 'rev=20261110-output-result-1'],
  ['output-receive.mjs', 'rev=20261105-download-name-1'],
  ['tool-output.css', 'rev=20261024-intelligence-ui-1'],
  ['tool-help.css', 'rev=20261024-intelligence-ui-1'],
  ['social-feed.css', 'rev=20261024-side-ad-layout-1'],
  ['social/app.mjs', 'rev=20261108-sns-loading-1'],
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

const lazyGalleryTargets = new Set(["js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-gallery-data.mjs", "js/creation/project-start-picker.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-store.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/creation/tool-project-import.mjs", "js/creation/tool-project-store.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);

const importPreviewTargets = new Set(["css/project-workspace.css", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-gallery.mjs", "js/creation/project-start-picker.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
targets.set("project-workspace.css", "rev=20261109-import-preview-gallery-1");

const ellipseTargets = new Set(["js/creation/draw-tool-operations.mjs", "js/creation/draw-page.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);

const managerTargets = new Set(["js/creation/project-gallery.mjs", "js/creation/shared-project-settings.mjs", "css/creation-modes.css", "css/project-workspace.css", "css/tool-direct.css", "data/project-gallery-ad-config.mjs", "js/ads/project-gallery-ad.mjs", "js/ads/project-manager-ad.mjs", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/draw-viewport-overlays.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-start-picker.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
for (const target of managerTargets) {
  if (target.endsWith('.css') && !importPreviewTargets.has(target)) targets.set(posix.basename(target), 'rev=20261108-gallery-canvas-viewport-1');
}

const commonToolStartModules = new Set(["js/adsense-offerwall-policy.js", "js/ads/conversion-display-ad.mjs", "js/creation/conversion-entry.mjs", "js/app.js", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/output-page.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/home-startup.mjs", "js/page-navigation.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/public-navigation.mjs", "js/site-header.mjs", "js/tool-direct.mjs", "js/tool-embed.mjs", "js/tool-entry-compat.js", "js/tool-offerwall-entry.mjs", "js/tool-shell.mjs", "js/tool-start-routes.mjs", "js/tool-workspace-state.mjs"]);

const outputOfferwallTargets = new Set(["js/creation/conversion-startup.mjs", "data/posting-policy.mjs", "js/ads/conversion-display-ad.mjs", "js/adsense-offerwall-policy.js", "js/app.js", "js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/conversion-entry.mjs", "js/creation/conversion-page.mjs", "js/creation/conversion-recovery-workspace.mjs", "js/creation/conversion-smart-ui.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-music.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/legacy-placement-page.mjs", "js/creation/output-entry-context.mjs", "js/creation/output-handoff-core.mjs", "js/creation/output-handoff.mjs", "js/creation/output-page.mjs", "js/creation/output-receive.mjs", "js/creation/output-router.mjs", "js/creation/pixfind-play.mjs", "js/creation/profile-likes-page.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/creation/text-tools.mjs", "js/creation/tool-project-import.mjs", "js/creation/work-save-policy.mjs", "js/globe/post-supabase.mjs", "js/globe/post-ui.mjs", "js/globe/prototype.mjs", "js/home-startup.mjs", "js/pixel-export.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/pixel-lens/file-save.mjs", "js/pixel-studio/app.mjs", "js/post-composer.js", "js/posting-consent-ui.mjs", "js/site-header.mjs", "js/social/api.mjs", "js/social/app.mjs", "js/social/server-actions.mjs", "js/social/tool-handoff.mjs", "js/tool-direct.mjs", "js/tool-header-controls.mjs", "js/tool-offerwall-entry.mjs", "js/tool-shell.mjs"]);

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
    if (!path.startsWith('/') && !path.startsWith('.') || path.startsWith('//')) return whole;
    const owner = relative(root, file).replaceAll('\\', '/');
    const target = path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(owner), path));
    if (!lazyGalleryTargets.has(target) && !importPreviewTargets.has(target) && !commonToolStartModules.has(target) && !managerTargets.has(target) && !ellipseTargets.has(target)) return whole;
    const iconAuditTargets = new Set([
      'js/creation/audio-entry.mjs', 'js/creation/audio-page.mjs',
      'js/creation/creation-camera.mjs', 'js/creation/creation-modes.mjs',
      'js/creation/creation-runtime.mjs', 'js/creation/draw-entry.mjs',
      'js/creation/draw-page.mjs', 'js/creation/project-workspace.mjs',
      'js/tool-direct.mjs', 'js/tool-shell.mjs'
    ]);
    const continuityTargets = new Set(["js/creation/creation-camera.mjs", "css/creation-modes.css", "js/creation/creation-mode-motion.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/tool-direct.mjs", "js/tool-shell.mjs"]);
    const brushCameraTargets = new Set(["js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "css/draw-brush-settings.css", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/creation-runtime.mjs", "js/creation/draw-entry.mjs", "js/tool-direct.mjs", "js/tool-help-bootstrap.mjs", "js/tool-help-data.mjs", "js/tool-help.mjs", "js/tool-shell.mjs"]);
    const resumeTargets = new Set(['js/tool-direct.mjs', 'js/tool-shell.mjs']);
    const galleryAdTargets = new Set(['js/tool-direct.mjs', 'js/tool-shell.mjs']);
    const galleryTargets = new Set(["js/creation/audio-entry.mjs", "js/creation/audio-page.mjs", "js/creation/creation-camera.mjs", "js/creation/creation-modes.mjs", "js/creation/draw-entry.mjs", "js/creation/draw-page.mjs", "js/creation/hidden-object-page.mjs", "js/creation/jigsaw-page.mjs", "js/creation/project-workspace.mjs", "js/creation/pxd-ui.mjs", "js/creation/spot-difference-page.mjs", "js/creation/tool-project-import.mjs", "js/pixel-lens/app.mjs", "js/pixel-lens/entry.mjs", "js/tool-shell.mjs", "js/creation/creation-runtime.mjs", "js/tool-direct.mjs", "js/creation/tool-project-store.mjs", "js/creation/project-gallery.mjs", "js/creation/pxd-store.mjs", "css/project-workspace.css"]);
    const revision = lazyGalleryTargets.has(target) ? '20261109-lazy-gallery-1' : importPreviewTargets.has(target) ? '20261109-import-preview-gallery-1' : ellipseTargets.has(target) ? '20261109-ellipse-geometry-1' : managerTargets.has(target) ? '20261108-gallery-canvas-viewport-1' : galleryAdTargets.has(target) ? '20261108-gallery-first-ad-1' : galleryTargets.has(target) ? '20261107-gallery-1' : resumeTargets.has(target) ? '20261107-resume-same-project-1' : brushCameraTargets.has(target) ? '20261107-brush-camera-1' : continuityTargets.has(target) ? '20261107-mode-continuity-1' : iconAuditTargets.has(target) ? '20261106-button-icon-audit-1' : target === 'js/creation/conversion-entry.mjs' ? '20261110-output-layout-7' : ['js/adsense-offerwall-policy.js', 'js/ads/conversion-display-ad.mjs', 'js/creation/output-page.mjs', 'js/tool-offerwall-entry.mjs', 'js/tool-start-routes.mjs'].includes(target) ? '20261110-output-result-1' : '20261024-common-tool-start-1';
    const next = /[?&]rev=/.test(query) ? query.replace(/([?&])rev=[^&]*/, '$1rev=' + revision) : query + (query ? '&' : '?') + 'rev=' + revision;
    return `${quote}${path}${next}${quote}`;
  });
  changed = changed.replace(/(["'`])([^"'`\s<>]+\.(?:mjs|js))(\?[^"'`\s<>]*)?\1/g, (whole, quote, path, query = '') => {
    if (/^[a-z][a-z\d+.-]*:/i.test(path)) return whole;
    const target = path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(relative(root, file)), path));
    if (!outputOfferwallTargets.has(target)) return whole;
    const revision = '20261111-output-offerwall-1';
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
