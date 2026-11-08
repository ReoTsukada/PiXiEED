import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workspace = read('js/creation/project-workspace.mjs');
const functions = workspace.slice(workspace.indexOf('  function syncInputLock()'), workspace.indexOf('  let listEpoch'));
function fixture() {
  return runInNewContext(`let locked = true, initialRestoreError = '', modeTransitionActive = false;
    const main = { inert: true, setAttribute(name, value) { this[name] = value; } };
    ${functions}
    ({ main, mode: setModeTransitionActive, workspace(value) { locked = value; syncInputLock(); }, error(value) { initialRestoreError = value; syncInputLock(); } });`);
}
test('mode and workspace locks are independent for both completion orders', () => {
  for (const first of ['mode', 'workspace']) {
    const f = fixture(); f.mode(true); f.workspace(true);
    f[first](false); assert.equal(f.main.inert, true); assert.equal(f.main['aria-busy'], 'true');
    f[first === 'mode' ? 'workspace' : 'mode'](false);
    assert.equal(f.main.inert, false); assert.equal(f.main['aria-busy'], 'false');
  }
});
test('restore protection cannot be cleared by mode completion or repeated cleanup', () => {
  const f = fixture(); f.workspace(false); f.error('saved work could not be restored');
  f.mode(true); f.mode(false); f.mode(false);
  assert.equal(f.main.inert, true); assert.equal(f.main['aria-busy'], 'false');
  f.error(''); assert.equal(f.main.inert, false);
});
test('workspace, mode loader and direct shell share the current lock state', () => {
  assert.equal([...workspace.matchAll(/main\.inert\s*=/g)].length, 2, 'only initial lock and the combined-state writer remain');
  const modes = read('js/creation/creation-modes.mjs');
  assert.doesNotMatch(modes, /wasInert|startupInert|main\.inert\s*=/);
  assert.match(modes, /finally \{ draw\.workspace\.setModeTransitionActive\(false\); \}/);
  assert.match(read('js/tool-direct.mjs'), /if \(open\) runtime\.draw\.workspace\.syncInputLock\(\)/);
});
test('startup image choice can be cancelled before and after it is shown', () => {
  const draw = read('js/creation/draw-page.mjs'), direct = read('js/tool-direct.mjs');
  assert.match(draw, /async function chooseProjectRole\(project, roles\) \{\s*if \(!canShowProjectChoice\(\)\) throw new Error/);
  assert.match(read('js/creation/creation-runtime.mjs'), /canShowProjectChoice: hostActive/);
  assert.match(draw, /dialog\.addEventListener\('close', \(\) => finish\(null\)\)/);
  assert.match(direct, /if \(mounting && !runtime\) \{[\s\S]*?querySelector\('body > #creation-project-role\[open\]'\)\?\.close\(\);\s*await mounting\.catch/);
});
test('phone recovery text wraps without an ellipsis and invalidates its stylesheet', () => {
  const css = read('css/tool-direct.css');
  assert.match(css, /\.tool-direct__bar--recovery \.tool-direct__status \{[^}]*max-width:none;[^}]*white-space:normal;/);
  const revision = JSON.parse(read('tests/runtime-cache-revisions.json'))['css/tool-direct.css'];
  assert.equal(revision, '20261108-inline-gallery-ad-1');
  for (const mode of ['draw','audio','camera']) assert.ok(read(`${mode}/index.html`).includes(`/css/tool-direct.css?rev=${revision}`));
});


test('closing during mount does not save shell-imposed hidden and inert as editor state', () => {
  const source = read('js/tool-direct.mjs');
  assert.match(source, /owned\.set\(node, \{ hidden: node\.hidden, inert: node\.inert, suppressed: !open \}\)/);
  assert.match(source, /if \(!state\.suppressed\) \{ state\.hidden = node\.hidden; state\.inert = node\.inert; \}/);
  assert.match(source, /node\.hidden = state\.hidden; node\.inert = state\.inert; state\.suppressed = false/);
});
