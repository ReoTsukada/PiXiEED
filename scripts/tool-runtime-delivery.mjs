import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const PUBLIC_ORIGIN = 'https://pixieed.jp/';
const DEFAULT_REVISION = '20261020-staged-startup-1';
const SCRIPT_FILE = fileURLToPath(import.meta.url);
const STATIC_IMPORT = /(?:^|\n)\s*(?:import\s+(?:(?:[\w*$\s{},]+)\s+from\s*)?|export\s+(?:\*|\{[^}]*\})\s+from\s*)['"]([^'"]+)['"]/g;
const MODULE_SCRIPT = /<script\b(?=[^>]*\btype\s*=\s*(["'])module\1)(?=[^>]*\bsrc\s*=\s*(["'])([^"']+)\2)[^>]*>/gi;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalTarget(fromUrl, specifier) {
  const target = new URL(specifier, new URL(fromUrl, PUBLIC_ORIGIN));
  assert(target.origin === new URL(PUBLIC_ORIGIN).origin, `Nonlocal module URL in tool runtime: ${specifier}`);
  assert(!target.username && !target.password, `Credentialed module URL in tool runtime: ${specifier}`);
  return `${target.pathname}${target.search}${target.hash}`;
}

function localFileFor(root, canonicalUrl) {
  const parsed = new URL(canonicalUrl, PUBLIC_ORIGIN);
  assert(parsed.origin === new URL(PUBLIC_ORIGIN).origin, `Unexpected module origin: ${canonicalUrl}`);
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  const relativeCheck = path.relative(path.resolve(root), file);
  assert(relativeCheck && !relativeCheck.startsWith(`..${path.sep}`) && relativeCheck !== '..', `Unsafe module path: ${canonicalUrl}`);
  return { relative: relative.split(path.sep).join('/'), file };
}

async function walkStaticGraph(root, entryUrls) {
  const modules = new Map();
  const edges = [];
  const pending = [...new Set(entryUrls)];
  while (pending.length) {
    const url = pending.shift();
    if (modules.has(url)) continue;
    const { relative, file } = localFileFor(root, url);
    const source = await readFile(file, 'utf8');
    modules.set(url, { url, file: relative, source });
    STATIC_IMPORT.lastIndex = 0;
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const target = canonicalTarget(url, match[1]);
      edges.push({ from: url, to: target, specifier: match[1] });
      if (!modules.has(target)) pending.push(target);
    }
  }
  return { modules, edges };
}

function literalDynamicRoots(graph) {
  const roots = [];
  const seen = new Set();
  for (const module of graph.modules.values()) {
    DYNAMIC_IMPORT.lastIndex = 0;
    for (const match of module.source.matchAll(DYNAMIC_IMPORT)) {
      const specifier = match[2];
      if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('/')) continue;
      const url = canonicalTarget(module.url, specifier);
      const key = `${module.url}\n${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push({ from: module.url, specifier, url });
    }
  }
  return roots;
}

function rewriteExternalStaticImports(source, sourceUrl, externalUrls) {
  STATIC_IMPORT.lastIndex = 0;
  return source.replace(STATIC_IMPORT, (whole, specifier) => {
    const target = canonicalTarget(sourceUrl, specifier);
    return externalUrls.has(target) ? whole.replace(specifier, target) : whole;
  });
}

function rewriteLiteralDynamicImports(source, sourceUrl) {
  DYNAMIC_IMPORT.lastIndex = 0;
  return source.replace(DYNAMIC_IMPORT, (whole, _quote, specifier) => {
    if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('/')) return whole;
    return whole.replace(specifier, canonicalTarget(sourceUrl, specifier));
  });
}

function wrapLazyTemplateImports(source) {
  const music = /await\s+import\((`\.\/draw-music\.mjs\?[^`]+`)\)/g;
  const camera = /await\s+import\((`\.\/creation-camera\.mjs\?[^`]+`)\)/g;
  assert([...source.matchAll(music)].length === 1 && [...source.matchAll(camera)].length === 1,
    'Creation mode source drifted: expected one lazy draw-music and one lazy camera import.');
  let output = source.replace(music, 'await importLazyModule($1)').replace(camera, 'await importLazyModule($1)');
  const marker = '/** One shell, project, palette and history.';
  assert(output.includes(marker), 'Could not locate safe lazy-import wrapper insertion point.');
  output = output.replace(marker, 'const importLazyModule = specifier => import(specifier);\n\n' + marker);
  return output;
}

function modeEntryUrls(runtimeGraph) {
  const module = [...runtimeGraph.modules.values()].find(item => item.file === 'js/creation/creation-modes.mjs');
  assert(module, 'Runtime graph is missing creation-modes.mjs.');
  const templates = [...module.source.matchAll(/import\((`[^`]+`)\)/g)].map(match => match[1].slice(1, -1));
  const music = templates.find(specifier => specifier.startsWith('./draw-music.mjs?') && specifier.includes('${audioLoadAttempt++}'));
  const camera = templates.find(specifier => specifier.startsWith('./creation-camera.mjs?') && specifier.includes('${version}'));
  assert(music && camera && templates.length === 2, 'Creation mode lazy-entry contract changed; review delivery graph before building.');
  return [canonicalTarget(module.url, music.replace('${audioLoadAttempt++}', '0')),
    canonicalTarget(module.url, camera.replace('${version}', '1'))];
}

async function htmlModuleRoots(root, routes) {
  const roots = [];
  for (const route of routes) {
    const html = await readFile(path.join(root, route), 'utf8');
    MODULE_SCRIPT.lastIndex = 0;
    for (const match of html.matchAll(MODULE_SCRIPT)) roots.push(canonicalTarget('/' + route, match[3]));
  }
  return roots;
}

function directEntrypointFromShell(shellGraph) {
  const candidates = literalDynamicRoots(shellGraph).filter(item => item.specifier.startsWith('./tool-direct.mjs?'));
  assert(candidates.length === 1, `Expected one tool-direct dynamic entry in shell; got ${candidates.length}.`);
  return candidates[0].url;
}

/** Derive canonical ESM identity boundaries and the exact startup minification set from the copied build. */
export async function deriveToolRuntimeDeliveryPlan({ root }) {
  const directSource = await readFile(path.join(root, 'js/tool-direct.mjs'), 'utf8');
  const runtimeMatches = [...directSource.matchAll(/import\((['"])(\.\/creation\/creation-runtime\.mjs\?[^'"]+)\1\)/g)];
  assert(runtimeMatches.length === 1, 'Expected one explicit-start creation runtime import in tool-direct.mjs.');
  const runtimeEntry = canonicalTarget('/js/tool-direct.mjs', runtimeMatches[0][2]);
  const runtimeGraph = await walkStaticGraph(root, [runtimeEntry]);
  const runtimeUrls = new Set(runtimeGraph.modules.keys());

  const modeEntries = modeEntryUrls(runtimeGraph);
  const firstModeGraph = await walkStaticGraph(root, modeEntries);
  const cameraAppRoots = literalDynamicRoots(firstModeGraph).filter(item =>
    item.from.includes('/js/creation/creation-camera.mjs?') && item.specifier.startsWith('../pixel-lens/app.mjs?'));
  assert(cameraAppRoots.length === 1, `Expected one selected camera-mode app entry; got ${cameraAppRoots.length}.`);
  const modeGraph = await walkStaticGraph(root, [...firstModeGraph.modules.keys(), ...cameraAppRoots.map(item => item.url)]);
  const audioStartup = await walkStaticGraph(root, [modeEntries[0]]);
  const cameraStartup = await walkStaticGraph(root, [modeEntries[1], cameraAppRoots[0].url]);
  const hostRoutes = ['draw/index.html', 'camera/index.html', 'audio/index.html'];
  const htmlRoots = await htmlModuleRoots(root, hostRoutes);
  const shellRoots = [...new Set(htmlRoots.filter(url => url.startsWith('/js/tool-shell.mjs?')))];
  assert(shellRoots.length === 1, 'Dedicated tools must share one canonical shell URL.');
  const shellRoot = shellRoots[0];
  const shellGraph = await walkStaticGraph(root, [shellRoot]);
  const directRoot = directEntrypointFromShell(shellGraph);
  const nonShellRoots = htmlRoots.filter(url => !url.startsWith('/js/tool-shell.mjs?'));
  const hostGraph = await walkStaticGraph(root, [...new Set([shellRoot, directRoot, ...nonShellRoots])]);

  const combined = { modules: new Map([...runtimeGraph.modules, ...modeGraph.modules]) };
  const dynamicRoots = literalDynamicRoots(combined);
  const dynamicGraph = dynamicRoots.length
    ? await walkStaticGraph(root, dynamicRoots.map(item => item.url))
    : { modules: new Map(), edges: [] };
  const externalUrls = new Set();
  for (const graph of [dynamicGraph, modeGraph, hostGraph]) {
    for (const url of graph.modules.keys()) if (runtimeUrls.has(url)) externalUrls.add(url);
  }
  assert(externalUrls.has(runtimeEntry) === false, 'Runtime entry was unexpectedly made external.');
  assert(externalUrls.size > 0, 'Dynamic identity boundary is empty; refusing to bundle without canonical cut.');

  const requiredUrls = new Set([...runtimeUrls, ...modeGraph.modules.keys(), ...hostGraph.modules.keys()]);
  const physicalFiles = new Set([...requiredUrls].map(url => localFileFor(root, url).relative));
  const sourceFingerprintInputs = new Map();
  for (const graph of [runtimeGraph, modeGraph, hostGraph, dynamicGraph]) {
    for (const module of graph.modules.values()) sourceFingerprintInputs.set(module.file, module.source);
  }
  return {
    root: path.resolve(root),
    runtimeEntry,
    runtimeGraph,
    runtimeUrls,
    modeGraph,
    hostGraph,
    dynamicGraph,
    dynamicRoots,
    externalUrls,
    internalizedUrls: [...runtimeUrls].filter(url => !externalUrls.has(url)).sort(),
    physicalFiles,
    sourceFingerprintInputs,
    shellRoot,
    directRoot,
    selectedStartupUrls: { audio: [...audioStartup.modules.keys()], camera: [...cameraStartup.modules.keys()] },
    htmlRoutes: hostRoutes,
  };
}

function runEsbuild(esbuild, args) {
  const result = spawnSync(esbuild, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`esbuild failed (${result.status}): ${result.stderr || result.stdout}`);
  if (result.stderr?.trim()) process.stderr.write(result.stderr);
}

async function getEsbuildVersion(esbuildPath) {
  const result = spawnSync(esbuildPath, ['--version'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  assert(result.status === 0, 'Could not query the configured esbuild binary version.');
  const version = result.stdout.trim();
  assert(version === '0.25.5', `Expected pinned esbuild 0.25.5, found ${version || 'unknown'}.`);
  return version;
}

function rewriteToolDirect(source, externalUrls, selectedStartupUrls, bundleSpecifier) {
  const preloadLoop = /    for \(const source of template\.head\.querySelectorAll\('link\[rel="modulepreload"\]\[href\]'\)\) \{[\s\S]*?\n    \}\n/;
  assert([...source.matchAll(new RegExp(preloadLoop.source, 'g'))].length === 1, 'Expected one template modulepreload loop.');
  const urls = JSON.stringify([...externalUrls].sort());
  const withList = source.replace(/^(import[^\n]*\n)/, `$1\nconst STARTUP_EXTERNALS = ${urls};\nconst SELECTED_STARTUP = ${JSON.stringify(selectedStartupUrls)};\n`);
  assert(withList !== source, 'Could not add derived startup external URL list.');
  const preloaded = withList.replace(preloadLoop,
    '    for (const href of new Set([...STARTUP_EXTERNALS, ...(SELECTED_STARTUP[mode] || [])])) addStartupHint(\'modulepreload\', new URL(href, location.origin).href);\n');
  const importPattern = /import\((['"])(\.\/creation\/creation-runtime\.mjs\?[^'"]+)\1\)/g;
  assert([...preloaded.matchAll(importPattern)].length === 1, 'Expected one runtime import in tool-direct.mjs.');
  return preloaded.replace(importPattern, `import('${bundleSpecifier}')`);
}

async function copyBundleSources(plan, tempRoot) {
  for (const module of plan.runtimeGraph.modules.values()) {
    const { file } = localFileFor(tempRoot, module.url);
    await mkdir(path.dirname(file), { recursive: true });
    let source = module.source;
    if (module.file === 'js/creation/creation-modes.mjs') source = wrapLazyTemplateImports(source);
    source = rewriteExternalStaticImports(source, module.url, plan.externalUrls);
    source = rewriteLiteralDynamicImports(source, module.url);
    assert(!source.includes('import.meta.url'), `Bundled source depends on import.meta.url: ${module.file}`);
    STATIC_IMPORT.lastIndex = 0;
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const target = canonicalTarget(module.url, match[1]);
      if (plan.externalUrls.has(target)) assert(match[1] === target, `External static import was not canonicalized: ${module.url} -> ${target}`);
    }
    await writeFile(file, source);
  }
}

function validateBundleMetafile(metafile, plan, tempRoot) {
  assert(metafile && metafile.inputs && typeof metafile.inputs === 'object', 'esbuild metafile has no input graph.');
  const internalFiles = new Set([...plan.runtimeGraph.modules.values()]
    .filter(module => !plan.externalUrls.has(module.url)).map(module => module.file));
  const externalFiles = new Set([...plan.externalUrls].map(url => localFileFor(plan.root, url).relative));
  const seen = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const withoutQuery = input.replace(/[?#].*$/, '');
    const absolute = path.resolve(process.cwd(), withoutQuery);
    const relative = path.relative(tempRoot, absolute);
    assert(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative),
      `Bundle input escaped private compiler source tree: ${input}`);
    const normalized = relative.split(path.sep).join('/');
    assert(internalFiles.has(normalized), `Bundle included an unknown or canonical-external runtime module: ${normalized}`);
    assert(!externalFiles.has(normalized), `Canonical external module was bundled: ${normalized}`);
    seen.add(normalized);
  }
  assert(seen.has(localFileFor(tempRoot, plan.runtimeEntry).relative), 'Bundle metafile does not include the runtime entry.');
}

export function createToolRuntimeDeliveryRevision(plan, esbuildVersion, baseRevision = DEFAULT_REVISION) {
  const hash = createHash('sha256');
  hash.update(`${baseRevision}\n${esbuildVersion}\n`);
  hash.update(readFileSyncForFingerprint(SCRIPT_FILE));
  for (const [file, source] of [...plan.sourceFingerprintInputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    hash.update(`${file}\0${source}\0`);
  }
  return `${baseRevision}-${hash.digest('hex').slice(0, 12)}`;
}

function readFileSyncForFingerprint(file) {
  return readFileSync(file);
}

async function minifyFile(esbuildPath, sourceFile, outputFile) {
  await mkdir(path.dirname(outputFile), { recursive: true });
  runEsbuild(esbuildPath, [sourceFile, '--minify', '--keep-names', '--target=es2022', '--log-level=warning', '--allow-overwrite', `--outfile=${outputFile}`]);
}

/** Optimize an owned public build directory in place. The return value is an in-memory build report. */
export async function optimizeToolRuntimeDelivery({ root, esbuildPath, revision = DEFAULT_REVISION } = {}) {
  assert(typeof root === 'string' && root, 'An explicit generated public-build root is required.');
  assert(/^[a-zA-Z0-9._-]+$/.test(revision), 'Invalid base cache revision.');
  const absoluteRoot = path.resolve(root);
  const resolvedEsbuild = path.resolve(esbuildPath || fileURLToPath(new URL('../node_modules/.bin/esbuild', import.meta.url)));
  const esbuildVersion = await getEsbuildVersion(resolvedEsbuild);
  const plan = await deriveToolRuntimeDeliveryPlan({ root: absoluteRoot });
  const effectiveRevision = createToolRuntimeDeliveryRevision(plan, esbuildVersion, revision);
  const bundleRelative = 'js/creation/creation-runtime.bundle.mjs';
  const bundleSpecifier = `./creation/creation-runtime.bundle.mjs?rev=${effectiveRevision}`;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'pixieed-runtime-delivery-'));
  try {
    await copyBundleSources(plan, tempRoot);
    const bundleInput = localFileFor(tempRoot, plan.runtimeEntry).file;
    const bundleOutput = path.join(absoluteRoot, bundleRelative);
    const metafilePath = path.join(tempRoot, 'runtime-bundle-metafile.json');
    await mkdir(path.dirname(bundleOutput), { recursive: true });
    runEsbuild(resolvedEsbuild, [
      bundleInput, '--bundle', '--format=esm', '--platform=browser', '--target=es2022', '--minify', '--keep-names',
      '--external:/js/*', '--external:/data/*',
      '--external:./draw-music.mjs*', '--external:./creation-camera.mjs*',
      '--external:../ads/site-reward.mjs*', '--external:./draw-camera-handoff.mjs*', '--external:./draw-camera-core.mjs*',
      '--external:./draw-import.mjs*', '--external:./pxd-ui.mjs*', '--external:../animated-export.mjs*',
      '--external:./spot-difference-core.mjs*', '--external:./pxd-puzzles.mjs*', '--external:./pxd-draw-audio.mjs*',
      '--external:./audio-animation.mjs*', '--external:./draw-music-core.mjs*', '--external:./audio-core.mjs*',
      '--external:../globe/post-supabase.mjs*', '--external:./display-ads.mjs*',
      '--log-level=warning', `--metafile=${metafilePath}`, `--outfile=${bundleOutput}`,
    ]);
    validateBundleMetafile(JSON.parse(await readFile(metafilePath, 'utf8')), plan, await realpath(tempRoot));

    for (const relative of [...plan.physicalFiles].sort()) {
      const target = path.join(absoluteRoot, relative);
      if (relative === 'js/tool-direct.mjs') {
        const source = await readFile(target, 'utf8');
        const rewritten = rewriteToolDirect(source, plan.externalUrls, plan.selectedStartupUrls, bundleSpecifier);
        const tempSource = path.join(tempRoot, 'tool-direct.mjs');
        await writeFile(tempSource, rewritten);
        await minifyFile(resolvedEsbuild, tempSource, target);
      } else if (relative === 'js/tool-shell.mjs') {
        let source = await readFile(target, 'utf8');
        const oldRef = plan.directRoot.replace('/js/', './');
        assert(source.split(oldRef).length === 2, 'tool-shell cache reference changed; refusing stale delivery rewrite.');
        source = source.replace(oldRef, `./tool-direct.mjs?rev=${effectiveRevision}`);
        const tempSource = path.join(tempRoot, 'tool-shell.mjs');
        await writeFile(tempSource, source);
        await minifyFile(resolvedEsbuild, tempSource, target);
      } else {
        const sourceCopy = path.join(tempRoot, relative);
        await mkdir(path.dirname(sourceCopy), { recursive: true });
        await copyFile(path.join(absoluteRoot, relative), sourceCopy);
        await minifyFile(resolvedEsbuild, sourceCopy, path.join(absoluteRoot, relative));
      }
    }
    for (const route of plan.htmlRoutes) {
      const file = path.join(absoluteRoot, route);
      const source = await readFile(file, 'utf8');
      const oldRef = plan.shellRoot;
      assert(source.split(oldRef).length === 2, `Expected exactly one tool shell entry in ${route}.`);
      await writeFile(file, source.replace(oldRef, `/js/tool-shell.mjs?rev=${effectiveRevision}`));
    }
    const bundleBytes = await readFile(bundleOutput);
    const externalGzipBytes = [...plan.externalUrls].reduce((sum, url) => {
      const { file } = localFileFor(absoluteRoot, url);
      return sum + gzipSync(readFileSyncForFingerprint(file), { mtime: 0 }).length;
    }, 0);
    return {
      addedFiles: 1,
      bundlePath: bundleRelative,
      revision: effectiveRevision,
      runtimeModuleCount: plan.runtimeGraph.modules.size,
      runtimeEdgeCount: plan.runtimeGraph.edges.length,
      externalModuleCount: plan.externalUrls.size,
      externalCount: plan.externalUrls.size,
      internalizedCount: plan.internalizedUrls.length,
      dynamicBoundaryModuleCount: plan.dynamicGraph.modules.size,
      startupStandaloneMinifiedCount: plan.physicalFiles.size,
      minifiedPaths: [...plan.physicalFiles].sort(),
      bundleRawBytes: bundleBytes.length,
      bundleGzipBytes: gzipSync(bundleBytes, { mtime: 0 }).length,
      externalGzipBytes,
      esbuildVersion,
      cacheFingerprint: effectiveRevision.slice(revision.length + 1),
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
