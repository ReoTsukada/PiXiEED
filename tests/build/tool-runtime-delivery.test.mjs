import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createToolRuntimeDeliveryRevision,
  deriveToolRuntimeDeliveryPlan,
  optimizeToolRuntimeDelivery,
} from '../../scripts/tool-runtime-delivery.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esbuildPath = path.join(repositoryRoot, 'node_modules/.bin/esbuild');
const guideMetricsUrl = '/js/output-guide-metrics.mjs?rev=20261028-discovery-1';
const metadataUrl = '/js/creation/output-record-metadata.mjs?rev=20261104-engine-boundaries-3';

test('delivery plan preserves runtime identities and bounds minification to startup/mode files', async () => {
  const plan = await deriveToolRuntimeDeliveryPlan({ root: repositoryRoot });

  // Manager ads add the guarded manager controller, shared chooser budget,
  // config, SDK loader and loader config to the previously bounded graph.
  // Lazy gallery loading adds one small shared request/cache controller.
  assert.equal(plan.runtimeGraph.modules.size, 115);
  assert.equal(plan.runtimeGraph.edges.length, 212);
  assert.equal(plan.dynamicRoots.length, 23);
  assert.equal(plan.dynamicGraph.modules.size, 112);
  assert.equal(plan.externalUrls.size, 63);
  assert.equal(plan.internalizedUrls.length, 52);
  const files = [...plan.runtimeGraph.modules.values()].map(module => module.file);
  assert(plan.pickerGraph.modules.has('/js/creation/project-start-picker.mjs?rev=20261112-creation-guidance-1'));
  assert(![...plan.pickerGraph.modules.values()].some(module => /(?:creation-runtime|draw-page|creation-modes|draw-music)\.mjs$/.test(module.file)), 'Choosing a work must not import editor or mode runtimes');
  assert(plan.physicalFiles.has('js/creation/project-start-picker.mjs'));
  assert(plan.pickerGraph.modules.has('/js/ads/project-gallery-ad.mjs?rev=20261108-gallery-canvas-viewport-1'));
  assert(plan.pickerGraph.modules.has('/data/project-gallery-ad-config.mjs?rev=20261108-gallery-canvas-viewport-1'));
  assert(plan.physicalFiles.has('js/ads/project-gallery-ad.mjs'));
  assert(plan.physicalFiles.has('data/project-gallery-ad-config.mjs'));
  assert(files.includes('js/ads/project-manager-ad.mjs'));
  assert(files.includes('js/ads/project-gallery-ad.mjs'));
  assert(files.includes('data/project-gallery-ad-config.mjs'));
  assert(files.includes('js/creation/project-gallery-data.mjs'), 'One small loader coordinates only visible gallery requests.');
  assert(files.includes('js/creation/project-gallery.mjs'), 'Windowed gallery accounts for one shared UI module and one import edge.');
  assert(files.includes('js/tool-start-routes.mjs'), 'the stateless route registry explains the additional module and dependency edge');
  assert(files.includes('js/creation/draw-render-optimization.mjs'));
  assert(files.includes('js/creation/output-entry-context.mjs'), 'The local-only handoff pointer module adds one shared external node and two import edges.');
  assert(files.includes('js/creation/output-router.mjs'), 'editor exports use the unified staging module');
  assert(files.includes('js/creation/output-handoff-core.mjs'), 'existing storage identity stays shared');
  assert.deepEqual([...plan.runtimeGraph.modules.values()].filter(module => module.file === 'js/creation/output-record-metadata.mjs').map(module => module.url), [metadataUrl]);
  assert.equal(plan.runtimeGraph.edges.filter(edge => edge.to === metadataUrl).length, 1);
  assert.equal(plan.runtimeGraph.edges.filter(edge => edge.from === metadataUrl).length, 0, 'Record validation must not pull codec, DOM or ad modules into shared startup.');
  assert(plan.externalUrls.has(metadataUrl));
  assert(plan.dynamicGraph.modules.has(metadataUrl));
  const videoSizeUrl = '/js/creation/video-output-size.mjs?rev=20261105-video-size-1';
  assert.deepEqual([...plan.dynamicGraph.modules.values()].filter(module => module.file === 'js/creation/video-output-size.mjs').map(module => module.url), [videoSizeUrl]);
  assert.equal(plan.dynamicGraph.edges.filter(edge => edge.to === videoSizeUrl).length, 1, 'The additional lazy module comes from the shared audio-video size verifier.');
  assert.equal(plan.dynamicGraph.edges.filter(edge => edge.from === videoSizeUrl).length, 0, 'Size verification must not import codecs, storage, or ad modules.');
  assert(!plan.runtimeGraph.modules.has(videoSizeUrl), 'Video metadata verification stays outside initial editor startup.');
  assert(files.includes('js/ads/site-feature-access-v20261024.mjs'));
  const guideModules = [...plan.runtimeGraph.modules.values()].filter(module => module.file === 'js/output-guide-metrics.mjs');
  assert.deepEqual(guideModules.map(module => module.url), [guideMetricsUrl], 'Guide metrics must retain one canonical module identity.');
  assert.equal(plan.runtimeGraph.edges.filter(edge => edge.to === guideMetricsUrl).length, 1);
  assert.equal(plan.runtimeGraph.edges.filter(edge => edge.from === guideMetricsUrl).length, 0, 'The metrics allowlist must not pull conversion or ad runtimes into editor startup.');
  assert(plan.externalUrls.has(guideMetricsUrl), 'Shared analytics helpers must not be duplicated inside the runtime bundle.');
  assert(plan.dynamicGraph.modules.has(guideMetricsUrl));
  for (const retired of ['gpt-rewarded-adapter.mjs', 'rewarded-controller.mjs', 'site-reward-rollout-v20261016.mjs', 'site-reward-runtime-v20261016-ads-only.mjs']) {
    assert(!files.some(file => file.endsWith('/' + retired)), `Retired advertising runtime must stay off the startup graph: ${retired}`);
  }
  assert(plan.externalUrls.has('/js/creation/pixel-canvas-surface.mjs?rev=20261015-alpha-opacity-1'));
  assert(plan.externalUrls.has('/js/creation/animation-core.mjs?rev=20261016-color-capability-1'));
  assert([...plan.modeGraph.modules.keys()].some(url => url.startsWith('/js/pixel-lens/app.mjs?')));
  assert([...plan.dynamicGraph.modules.keys()].some(url => url.startsWith('/js/creation/audio-export.mjs?')));
  assert(plan.physicalFiles.has('js/creation/creation-runtime.mjs'));
  const cameraSettings = '/js/creation/camera-canvas-settings.mjs?rev=20261021-camera-canvas-2';
  assert(plan.runtimeGraph.modules.has(cameraSettings));
  assert(plan.internalizedUrls.includes(cameraSettings));
  assert(plan.physicalFiles.has('js/creation/camera-canvas-settings.mjs'));
  const socialModules = [...plan.runtimeGraph.modules.keys()].filter(url => url.includes('/social/'));
  assert.deepEqual(socialModules, ['/js/social/tool-return.mjs?rev=20261021-jigsaw-public-1'],
    'Only the shared, versioned navigation helper belongs in the editor runtime; social UI/auth modules stay excluded.');
  assert(plan.physicalFiles.has('js/pixel-lens/app.mjs'));
  for (const optional of ['draw-text-panel.mjs', 'draw-color-adjustment-panel.mjs', 'draw-text-rasterizer.mjs', 'draw-color-adjustment.mjs']) {
    assert(![...plan.physicalFiles].some(file => file.endsWith('/' + optional)));
    assert(!Object.values(plan.selectedStartupUrls).flat().some(url => url.includes('/' + optional)));
  }
  assert(plan.selectedStartupUrls.camera.some(url => url.includes('/pixel-lens/app.mjs?')));
  assert(!plan.selectedStartupUrls.audio.some(url => url.includes('/pixel-lens/app.mjs?')));
  assert(!plan.physicalFiles.has('js/creation/audio-export.mjs'), 'Action-only export module should retain its canonical lazy URL and bytes.');
});

test('unsupported esbuild version rejects before mutating the owned build root', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pixieed-delivery-version-test-'));
  try {
    const markerPath = path.join(tempRoot, 'input-marker.txt');
    await writeFile(markerPath, 'leave this build untouched');
    await assert.rejects(
      optimizeToolRuntimeDelivery({ root: tempRoot, esbuildPath: process.execPath }),
      /Expected pinned esbuild 0\.25\.5/,
    );
    assert.equal(await readFile(markerPath, 'utf8'), 'leave this build untouched');
    await assert.rejects(readFile(path.join(tempRoot, 'js/creation/creation-runtime.bundle.mjs')),
      error => error.code === 'ENOENT');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('optimized owned build carries one fingerprinted bundle and no private source paths', async t => {
  const plan = await deriveToolRuntimeDeliveryPlan({ root: repositoryRoot });
  const tempBase = await mkdtemp(path.join(os.tmpdir(), 'pixieed-delivery-test-'));
  const buildRoot = path.join(tempBase, 'public');
  const graphFiles = new Set();
  for (const graph of [plan.runtimeGraph, plan.modeGraph, plan.hostGraph, plan.dynamicGraph]) {
    for (const module of graph.modules.values()) graphFiles.add(module.file);
  }
  for (const route of plan.htmlRoutes) graphFiles.add(route);
  try {
    for (const relative of [...graphFiles].sort()) {
      const output = path.join(buildRoot, relative);
      await mkdir(path.dirname(output), { recursive: true });
      await cp(path.join(repositoryRoot, relative), output);
    }

    const shellPath = path.join(buildRoot, 'js/tool-shell.mjs');
    // A code-only source change must alter the delivery URL so the browser
    // cannot keep a stale optimized graph under the old revision.
    const originalPlan = await deriveToolRuntimeDeliveryPlan({ root: buildRoot });
    const originalRevision = createToolRuntimeDeliveryRevision(originalPlan, '0.25.5');
    await writeFile(shellPath, `${await readFile(shellPath, 'utf8')}\n// revision input\n`);
    const changedPlan = await deriveToolRuntimeDeliveryPlan({ root: buildRoot });
    const expectedRevision = createToolRuntimeDeliveryRevision(changedPlan, '0.25.5');
    assert.notEqual(expectedRevision, originalRevision, 'A code-only source change must change the cache fingerprint.');
    const report = await optimizeToolRuntimeDelivery({ root: buildRoot, esbuildPath });

    assert.equal(report.revision, expectedRevision);
    assert.equal(report.addedFiles, 1);
    assert.equal(report.bundlePath, 'js/creation/creation-runtime.bundle.mjs');
    assert.equal(report.externalCount, 63);
    assert.equal(report.internalizedCount, 52);
    assert(report.startupStandaloneMinifiedCount >= 129);
    assert.match(report.revision, /^20261020-staged-startup-1-[a-f0-9]{12}$/);

    const bundle = await readFile(path.join(buildRoot, report.bundlePath), 'utf8');
    assert(bundle.length > 1000);
    assert(!bundle.includes(repositoryRoot), 'Compiler leaked a local repository path into public output.');
    assert(!bundle.includes(tempBase), 'Compiler leaked its private temporary path into public output.');
    const direct = await readFile(path.join(buildRoot, 'js/tool-direct.mjs'), 'utf8');
    assert(direct.includes(`./creation/creation-runtime.bundle.mjs?rev=${report.revision}`));
    assert(direct.includes('/js/creation/pixel-canvas-surface.mjs?rev=20261015-alpha-opacity-1'));
    assert(direct.includes(guideMetricsUrl), 'Public-guide metrics must keep its shared canonical URL in the optimized delivery.');
    for (const route of plan.htmlRoutes) {
      const html = await readFile(path.join(buildRoot, route), 'utf8');
      assert(html.includes(`/js/tool-shell.mjs?rev=${report.revision}`), `Missing cache revision in ${route}`);
    }
  } finally {
    await rm(tempBase, { recursive: true, force: true });
  }
});
