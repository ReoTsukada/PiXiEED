import { spawnSync } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = '/js/social/app.mjs';
const ORIGIN = 'https://pixieed.jp';
// Source modules are inspected before the other delivery passes minify shared files.
const STATIC_IMPORT = /(?:^|\n)\s*(?:import\s+(?:(?:[\w*$\s{},]+)\s+from\s*)?|export\s+(?:\*|\{[^}]*\})\s+from\s*)['"]([^'"]+)['"]/g;
const MODULE_SCRIPT = /<script\b(?=[^>]*\btype\s*=\s*(["'])module\1)(?=[^>]*\bsrc\s*=\s*(["'])([^"']+)\2)[^>]*>/gi;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function localUrl(specifier, from) {
  const url = new URL(specifier, new URL(from, ORIGIN));
  assert(url.origin === ORIGIN && !url.username && !url.password && !/[<>"'&]/.test(url.href), `Unsafe social module URL: ${specifier}`);
  return url.pathname + url.search + url.hash;
}
function moduleFile(root, url) {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(url, ORIGIN).pathname));
  const relative = path.relative(root, file);
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Social module escapes build root.');
  return file;
}
function compile(esbuildPath, args, input) {
  const result = spawnSync(esbuildPath, args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert(result.status === 0, `Social startup esbuild failed: ${result.stderr}`);
  return result.stdout;
}

/** Keep module identity and lazy imports intact, but discover the entire static graph from HTML. */
export async function prepareSocialStartupDelivery({ root, files, esbuildPath } = {}) {
  assert(typeof root === 'string' && root && Array.isArray(files), 'An owned build root and file list are required.');
  const absoluteRoot = await realpath(root);
  const sourceRoot = await realpath(SOURCE_ROOT);
  const relative = path.relative(sourceRoot, absoluteRoot);
  assert(relative && (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)), 'Social startup optimization must only mutate an owned build output outside the source checkout.');
  const callers = [];
  for (const file of files.filter(file => /\.html?$/i.test(file))) {
    const html = await readFile(path.join(absoluteRoot, file), 'utf8');
    const entries = [...html.matchAll(MODULE_SCRIPT)].map(match => match[3]).filter(src => new URL(src, new URL('/' + file, ORIGIN)).pathname === ENTRY);
    if (!entries.length) continue;
    assert(entries.length === 1 && /<\/head\s*>/i.test(html), `Expected one social entry and head in ${file}.`);
    callers.push({ file, html, entry: localUrl(entries[0], '/' + file) });
  }
  assert(callers.length, 'No social HTML entry found.');
  const modules = new Map();
  async function visit(url, ancestors = []) {
    assert(!ancestors.includes(url), 'Unexpected cycle in social startup graph.');
    if (modules.has(url)) return;
    const file = moduleFile(absoluteRoot, url);
    assert(await realpath(file) === file, 'Social module must not be a symlink.');
    const source = await readFile(file, 'utf8');
    const imports = [...source.matchAll(STATIC_IMPORT)].map(match => localUrl(match[1], url));
    modules.set(url, { file, source, imports });
    for (const dependency of imports) await visit(dependency, [...ancestors, url]);
  }
  for (const caller of callers) await visit(caller.entry);
  const binary = path.resolve(esbuildPath || path.join(SOURCE_ROOT, 'node_modules/.bin/esbuild'));
  assert(compile(binary, ['--version']).trim() === '0.25.5', 'Expected pinned esbuild 0.25.5.');
  const compiled = new Map();
  for (const { file, source } of modules.values()) {
    if (compiled.has(file)) continue;
    // No bundle or tree shaking: shared state, exports, and dynamic boundaries are unchanged.
    const output = compile(binary, ['--loader=js', '--format=esm', '--target=es2022', '--minify', '--keep-names', '--tree-shaking=false', '--log-level=warning'], source);
    compiled.set(file, output);
  }
  const depth = url => 1 + Math.max(0, ...modules.get(url).imports.map(depth));
  const graphMetrics = [...modules.values()].reduce((total, module) => {
    total.beforeRawBytes += Buffer.byteLength(module.source);
    total.beforeGzipBytes += gzipSync(module.source).length;
    total.afterRawBytes += Buffer.byteLength(compiled.get(module.file));
    total.afterGzipBytes += gzipSync(compiled.get(module.file)).length;
    return total;
  }, { beforeRawBytes: 0, beforeGzipBytes: 0, afterRawBytes: 0, afterGzipBytes: 0 });
  // Defer mutation until other build passes have inspected the original shared modules.
  return async () => {
    for (const [file, output] of compiled) await writeFile(file, output);
    for (const caller of callers) {
      const dependencies = new Set();
      function collect(url) { for (const dependency of modules.get(url).imports) { if (dependencies.has(dependency)) continue; dependencies.add(dependency); collect(dependency); } }
      collect(caller.entry);
      const hints = [...dependencies].sort().map(url => `<link rel="modulepreload" href="${url}" data-social-startup>`).join('\n');
      const currentHtml = await readFile(path.join(absoluteRoot, caller.file), 'utf8');
      await writeFile(path.join(absoluteRoot, caller.file), currentHtml.replace(/<\/head\s*>/i, `${hints}\n</head>`));
    }
    return { ...graphMetrics, moduleRequestsBefore: modules.size, moduleRequestsAfter: modules.size,
      discoveryRoundsBefore: Math.max(...callers.map(caller => depth(caller.entry))), discoveryRoundsAfter: 1,
      htmlRoutes: callers.map(caller => caller.file), minifiedPaths: [...compiled.keys()].map(file => path.relative(absoluteRoot, file)).sort(),
      esbuildVersion: '0.25.5' };
  };
}

export async function optimizeSocialStartupDelivery(options) {
  return (await prepareSocialStartupDelivery(options))();
}
