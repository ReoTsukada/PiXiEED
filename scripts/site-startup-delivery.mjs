import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SOURCE_ROOT = path.resolve(path.dirname(SCRIPT_FILE), '..');
const DEFAULT_REVISION = '20261020-site-startup-1';
const MODULE_SCRIPT = /<script\b(?=[^>]*\btype\s*=\s*(["'])module\1)(?=[^>]*\bsrc\s*=\s*(["'])([^"']+)\2)[^>]*>/gi;
const MODULE_PRELOAD = /<link\b(?=[^>]*\brel\s*=\s*(["'])modulepreload\1)(?=[^>]*\bhref\s*=\s*(["'])([^"']+)\2)[^>]*>/gi;
const SCRIPT_SRC = /<script\b(?=[^>]*\bsrc\s*=\s*(["'])([^"']+)\1)[^>]*>/gi;
const STATIC_IMPORT = /(?:^|\n)\s*(?:import\s+(?:(?:[\w*$\s{},]+)\s+from\s*)?|export\s+(?:\*|\{[^}]*\})\s+from\s*)['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function canonicalTarget(fromUrl, specifier) {
  const target = new URL(specifier, new URL(fromUrl, 'https://pixieed.jp/'));
  assert(target.origin === 'https://pixieed.jp', `Nonlocal module URL in site startup: ${specifier}`);
  assert(!target.username && !target.password, `Credentialed module URL in site startup: ${specifier}`);
  return `${target.pathname}${target.search}${target.hash}`;
}

export function createSiteStartupRevisions({ appSource, homeStartupSource, helperSource, esbuildVersion, revision = DEFAULT_REVISION }) {
  assert(/^[a-zA-Z0-9._-]+$/.test(revision), 'Invalid site startup base revision.');
  assert(typeof appSource === 'string' && typeof homeStartupSource === 'string' && typeof helperSource === 'string',
    'Site startup revision inputs must be source strings.');
  assert(esbuildVersion === '0.25.5', `Expected pinned esbuild 0.25.5, found ${esbuildVersion || 'unknown'}.`);
  const appRevision = `${revision}-app-${hash(`${appSource}\n${helperSource}\n${esbuildVersion}`)}`;
  const homeStartupRevision = `${revision}-home-${hash(`${homeStartupSource}\n${appRevision}\n${helperSource}\n${esbuildVersion}`)}`;
  return { appRevision, homeStartupRevision };
}

function collectModuleReferences(source, file) {
  const references = [];
  STATIC_IMPORT.lastIndex = 0;
  for (const match of source.matchAll(STATIC_IMPORT)) {
    references.push({ file, kind: 'static', specifier: match[1], index: match.index });
  }
  DYNAMIC_IMPORT.lastIndex = 0;
  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    references.push({ file, kind: 'dynamic', specifier: match[2], index: match.index });
  }
  return references;
}

async function deriveCallers({ root, files }) {
  const htmlCallers = [];
  const moduleCallers = [];
  for (const relative of files) {
    if (!/\.(?:html?|m?js)$/i.test(relative)) continue;
    const content = await readFile(path.join(root, relative), 'utf8');
    if (/\.html?$/i.test(relative)) {
      SCRIPT_SRC.lastIndex = 0;
      for (const match of content.matchAll(SCRIPT_SRC)) {
        const specifier = match[2];
        if (/^https?:\/\//i.test(specifier) && !specifier.startsWith('https://pixieed.jp/')) continue;
        const url = canonicalTarget(`/${relative}`, specifier);
        if (url.startsWith('/js/app.js') && !/\btype\s*=\s*(["'])module\1/i.test(match[0])) {
          throw new Error(`Unexpected non-module app.js script URL in ${relative}: ${specifier}`);
        }
      }
      MODULE_SCRIPT.lastIndex = 0;
      for (const match of content.matchAll(MODULE_SCRIPT)) {
        const url = canonicalTarget(`/${relative}`, match[3]);
        if (url.startsWith('/js/app.js?')) {
          htmlCallers.push({ file: relative, kind: 'script', url });
        } else if (url.startsWith('/js/app.js')) {
          throw new Error(`Unexpected app.js script URL in ${relative}: ${match[3]}`);
        }
      }
      MODULE_PRELOAD.lastIndex = 0;
      for (const match of content.matchAll(MODULE_PRELOAD)) {
        const url = canonicalTarget(`/${relative}`, match[3]);
        if (url.startsWith('/js/app.js?')) {
          htmlCallers.push({ file: relative, kind: 'preload', url });
        } else if (url.startsWith('/js/app.js')) {
          throw new Error(`Unexpected app.js preload URL in ${relative}: ${match[3]}`);
        }
      }
    } else {
      const references = collectModuleReferences(content, relative);
      const literalDynamicIndexes = new Set(references.filter(reference => reference.kind === 'dynamic').map(reference => reference.index));
      for (const match of content.matchAll(/\bimport\s*\(([^)]*)\)/g)) {
        if (match[1].includes('app.js')) {
          assert(literalDynamicIndexes.has(match.index), `Unexpected computed app.js import in ${relative}.`);
        }
      }
      for (const reference of references) {
        if (!reference.specifier.startsWith('./') && !reference.specifier.startsWith('../') && !reference.specifier.startsWith('/')) {
          assert(!reference.specifier.includes('app.js'), `Unexpected nonlocal app.js module reference in ${relative}.`);
          continue;
        }
        const url = canonicalTarget(`/${relative}`, reference.specifier);
        if (url.startsWith('/js/app.js?')) moduleCallers.push({ ...reference, url });
        else if (url.startsWith('/js/app.js')) throw new Error(`Unexpected app.js module URL in ${relative}: ${reference.specifier}`);
      }
    }
  }
  return { htmlCallers, moduleCallers };
}

function rewriteHtml(source, relative, appRevision, homeStartupRevision) {
  let appScripts = 0;
  let startupScripts = 0;
  let startupPreloads = 0;
  MODULE_SCRIPT.lastIndex = 0;
  let output = source.replace(MODULE_SCRIPT, (whole, _typeQuote, _srcQuote, specifier) => {
    const url = canonicalTarget(`/${relative}`, specifier);
    if (!url.startsWith('/js/app.js?')) {
      if (url.startsWith('/js/app.js')) throw new Error(`Unexpected app.js script URL in ${relative}: ${specifier}`);
      if (url.startsWith('/js/home-startup.mjs?')) {
        startupScripts += 1;
        const replacement = `/js/home-startup.mjs?rev=${homeStartupRevision}`;
        return whole.replace(specifier, replacement);
      }
      if (url.startsWith('/js/home-startup.mjs')) throw new Error(`Unexpected home startup URL in ${relative}: ${specifier}`);
      return whole;
    }
    appScripts += 1;
    return whole.replace(specifier, `/js/app.js?rev=${appRevision}`);
  });
  MODULE_PRELOAD.lastIndex = 0;
  output = output.replace(MODULE_PRELOAD, (whole, _relQuote, _hrefQuote, specifier) => {
    const url = canonicalTarget(`/${relative}`, specifier);
    if (url.startsWith('/js/home-startup.mjs?')) {
      startupPreloads += 1;
      return whole.replace(specifier, `/js/home-startup.mjs?rev=${homeStartupRevision}`);
    }
    if (url.startsWith('/js/home-startup.mjs')) throw new Error(`Unexpected home startup preload URL in ${relative}: ${specifier}`);
    if (url.startsWith('/js/app.js')) throw new Error(`Unexpected app.js modulepreload in ${relative}: ${specifier}`);
    return whole;
  });
  return { html: output, appScripts, startupScripts, startupPreloads };
}

function rewriteHomeStartup(source, appRevision) {
  let dynamicAppImports = 0;
  DYNAMIC_IMPORT.lastIndex = 0;
  const output = source.replace(DYNAMIC_IMPORT, (whole, _quote, specifier) => {
    const url = canonicalTarget('/js/home-startup.mjs', specifier);
    if (!url.startsWith('/js/app.js?')) {
      if (url.startsWith('/js/app.js')) throw new Error(`Unexpected app import in home startup: ${specifier}`);
      return whole;
    }
    dynamicAppImports += 1;
    return whole.replace(specifier, `./app.js?rev=${appRevision}`);
  });
  assert(dynamicAppImports === 1, `Expected one literal app.js import in home-startup.mjs, found ${dynamicAppImports}.`);
  return output;
}

function runEsbuild(esbuildPath, args) {
  const result = spawnSync(esbuildPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`esbuild failed (${result.status}): ${result.stderr || result.stdout}`);
  if (result.stderr?.trim()) process.stderr.write(result.stderr);
}

async function getEsbuildVersion(esbuildPath) {
  const result = spawnSync(esbuildPath, ['--version'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  assert(result.status === 0, 'Could not query the configured esbuild binary.');
  const version = result.stdout.trim();
  assert(version === '0.25.5', `Expected pinned esbuild 0.25.5, found ${version || 'unknown'}.`);
  return version;
}

async function minifyOwnedModule({ esbuildPath, root, relative, source, tempRoot }) {
  const sourceFile = path.join(tempRoot, relative);
  const outputFile = path.join(tempRoot, 'compiled', relative);
  await mkdir(path.dirname(sourceFile), { recursive: true });
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(sourceFile, source);
  runEsbuild(esbuildPath, [
    sourceFile,
    '--minify',
    '--keep-names',
    '--target=es2022',
    '--format=esm',
    '--tree-shaking=true',
    '--log-level=warning',
    `--outfile=${outputFile}`,
  ]);
  const output = await readFile(outputFile, 'utf8');
  assert(!output.includes(SOURCE_ROOT), `esbuild output leaked a repository path for ${relative}.`);
  assert(!output.includes(tempRoot), `esbuild output leaked a private temporary path for ${relative}.`);
  await writeFile(path.join(root, relative), output);
  return { inputBytes: Buffer.byteLength(source), outputBytes: Buffer.byteLength(output), gzipBytes: gzipSync(output, { mtime: 0 }).length };
}

/** Minify the shared app entry and its home-startup caller in an owned public build. */
export async function optimizeSiteStartupDelivery({ root, files, esbuildPath, revision = DEFAULT_REVISION } = {}) {
  assert(typeof root === 'string' && root, 'An explicit generated public-build root is required.');
  const absoluteRoot = path.resolve(root);
  const relativeToSource = path.relative(SOURCE_ROOT, absoluteRoot);
  const isWithinSourceCheckout = !relativeToSource || (relativeToSource !== '..'
    && !relativeToSource.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToSource));
  assert(!isWithinSourceCheckout,
    'Site startup optimization must only mutate an owned build output outside the source checkout.');
  assert(Array.isArray(files), 'The public build file list is required for caller discovery.');
  const appPath = path.join(absoluteRoot, 'js/app.js');
  const homeStartupPath = path.join(absoluteRoot, 'js/home-startup.mjs');
  const appSource = await readFile(appPath, 'utf8');
  const homeStartupSource = await readFile(homeStartupPath, 'utf8');
  const helperSource = await readFile(SCRIPT_FILE, 'utf8');
  const resolvedEsbuild = path.resolve(esbuildPath || path.join(SOURCE_ROOT, 'node_modules/.bin/esbuild'));
  const esbuildVersion = await getEsbuildVersion(resolvedEsbuild);
  const revisions = createSiteStartupRevisions({ appSource, homeStartupSource, helperSource, esbuildVersion, revision });
  const callers = await deriveCallers({ root: absoluteRoot, files });
  assert(callers.htmlCallers.some(caller => caller.kind === 'script'), 'No HTML app.js script roots were found.');
  assert(callers.moduleCallers.length === 1
    && callers.moduleCallers[0].file === 'js/home-startup.mjs'
    && callers.moduleCallers[0].kind === 'dynamic',
  `Unexpected app.js module caller set: ${callers.moduleCallers.map(item => `${item.file}:${item.kind}`).join(', ') || 'none'}.`);
  const homeHtml = await readFile(path.join(absoluteRoot, 'index.html'), 'utf8');
  const homeCounts = rewriteHtml(homeHtml, 'index.html', revisions.appRevision, revisions.homeStartupRevision);
  if (/data-social-page="home"/.test(homeHtml)) {
    assert(homeCounts.appScripts === 0 && homeCounts.startupScripts === 0 && homeCounts.startupPreloads === 0
      && [...homeHtml.matchAll(/<script\b[^>]*src="\/js\/social\/app\.mjs\?[^"<>]+"/g)].length === 1,
    'SNS home must expose exactly one social entry and no legacy home startup.');
    const welcomeHtml = await readFile(path.join(absoluteRoot, 'welcome/index.html'), 'utf8');
    const welcomeCounts = rewriteHtml(welcomeHtml, 'welcome/index.html', revisions.appRevision, revisions.homeStartupRevision);
    assert(welcomeCounts.appScripts === 0 && welcomeCounts.startupScripts === 1 && welcomeCounts.startupPreloads === 1,
      'The preserved welcome page must retain one matching legacy startup and preload.');
  } else if (/<body class="home-portal">/.test(homeHtml)) {
    assert(homeCounts.appScripts === 0 && homeCounts.startupScripts === 0 && homeCounts.startupPreloads === 0
      && [...homeHtml.matchAll(/<script\b[^>]*src="\/js\/home-portal\.mjs\?[^"<>]+"/g)].length === 1
      && !homeHtml.includes('/js/social/app.mjs'),
    'Portal home must have one dedicated entry, not load legacy editor or SNS startup.');
    const welcomeHtml = await readFile(path.join(absoluteRoot, 'welcome/index.html'), 'utf8');
    const welcomeCounts = rewriteHtml(welcomeHtml, 'welcome/index.html', revisions.appRevision, revisions.homeStartupRevision);
    assert(welcomeCounts.appScripts === 0 && welcomeCounts.startupScripts === 1 && welcomeCounts.startupPreloads === 1,
      'The preserved welcome page must retain its legacy startup and preload.');
  } else {
    assert(homeCounts.appScripts === 0 && homeCounts.startupScripts === 1 && homeCounts.startupPreloads === 1,
      'Home must expose exactly one startup module script and one matching modulepreload.');
  }

  const tempRoot = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(absoluteRoot, '.site-startup-')));
  try {
    const appMetrics = await minifyOwnedModule({ esbuildPath: resolvedEsbuild, root: absoluteRoot, relative: 'js/app.js', source: appSource, tempRoot });
    const rewrittenStartup = rewriteHomeStartup(homeStartupSource, revisions.appRevision);
    const startupMetrics = await minifyOwnedModule({ esbuildPath: resolvedEsbuild, root: absoluteRoot, relative: 'js/home-startup.mjs', source: rewrittenStartup, tempRoot });
    for (const relative of files.filter(file => /\.html?$/i.test(file))) {
      const htmlPath = path.join(absoluteRoot, relative);
      const source = relative === 'index.html' ? homeCounts.html : await readFile(htmlPath, 'utf8');
      const rewritten = relative === 'index.html' ? source : rewriteHtml(source, relative, revisions.appRevision, revisions.homeStartupRevision).html;
      await writeFile(htmlPath, rewritten);
    }
    return {
      revision: revisions.appRevision,
      homeStartupRevision: revisions.homeStartupRevision,
      esbuildVersion,
      htmlAppEntryCount: callers.htmlCallers.filter(caller => caller.kind === 'script').length,
      appModuleCallerCount: callers.moduleCallers.length,
      minifiedPaths: ['js/app.js', 'js/home-startup.mjs'],
      app: appMetrics,
      homeStartup: startupMetrics,
    };
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(tempRoot, { recursive: true, force: true });
  }
}
