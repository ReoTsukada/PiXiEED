import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConversionStartupView } from '../../js/creation/conversion-startup-view.mjs';
import { runConversionStartup } from '../../js/creation/conversion-startup.mjs';

function fixture() {
  const node = () => ({ hidden: false, inert: false, dataset: {}, attributes: {}, children: [],
    setAttribute(name, value) { this.attributes[name] = value; },
    prepend(child) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); this.children.unshift(child); child.parent = this; },
    set innerHTML(value) { assert.fail('Startup errors must never use HTML injection'); },
  });
  const main = node(), startup = node(), heading = node(), status = node();
  startup.prepend(heading); startup.querySelector = () => heading;
  const elements = { main, 'conversion-startup': startup, 'conversion-startup-status': status };
  const doc = { body: node(), getElementById: id => elements[id] };
  return { main, startup, heading, status, doc, view: createConversionStartupView(doc) };
}

test('the real failure view quarantines partially moved controls and returns the authored heading', async () => {
  const f = fixture(), originalControl = { value: 'edited', original: true };
  f.main.children.push(originalControl);
  const result = await runConversionStartup({
    view: f.view,
    loadEngine: async () => {},
    loadText: async () => ({ installTextTools() {} }),
    loadIntent: async () => ({ installConversionIntent() {} }),
    loadUI: async () => ({ mountSmartConversion() {
      f.main.prepend(f.heading); f.main.dataset.smartConversion = 'true';
      throw new Error('<img src=x onerror=alert(1)>');
    } }),
  });
  assert.equal(result.status, 'error'); assert.equal(result.stage, 'ui-mount');
  assert.equal(f.main.hidden, true); assert.equal(f.main.inert, true);
  assert.equal(f.startup.hidden, false); assert.equal(f.status.attributes.role, 'alert');
  assert.equal(f.status.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(f.startup.children[0], f.heading);
  assert.equal(f.main.children[0], originalControl); assert.equal(originalControl.value, 'edited');
  assert.equal(f.main.dataset.smartConversion, 'true', 'no misleading rollback of an adapter with attached listeners');
});

test('the ready view reveals only a completed workspace; native views retain a heading', () => {
  const f = fixture(); f.view.begin();
  assert.equal(f.main.hidden, true); assert.equal(f.main.inert, true);
  assert.equal(f.startup.attributes['aria-busy'], 'true');
  f.view.ready(null, { native: true });
  assert.equal(f.main.hidden, false); assert.equal(f.main.inert, false);
  assert.equal(f.startup.hidden, true); assert.equal(f.main.children[0], f.heading);
  assert.equal(f.doc.body.dataset.conversionStartup, 'ready');
});

test('an unavailable exception uses an actionable, text-only error message', () => {
  const f = fixture(); f.view.fail(null);
  assert.match(f.status.textContent, /再読み込み/);
  assert.equal(f.startup.attributes['aria-busy'], 'false');
  assert.equal(f.doc.body.dataset.conversionStartup, 'error');
});

const html = readFileSync(new URL('../../output/work/index.html', import.meta.url), 'utf8');
const template = html.match(/<template id="output-engine-template">([\s\S]*?)<\/template>/)?.[1];
const activeHtml = html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, '');
test('initial HTML authors the new heading, status and inert engine boundary without old interactive controls', () => {
  assert.ok(template);
  assert.equal((activeHtml.match(/<h1\b/g) || []).length, 1);
  assert.match(activeHtml, /data-conversion-heading/);
  assert.match(activeHtml, /id="conversion-startup-status" role="status" aria-live="polite"/);
  assert.match(activeHtml, /<main id="main"[^>]* hidden inert><\/main>/);
  assert.doesNotMatch(activeHtml, /id="output-(?:format-select|download|apply-settings)"/);
  assert.doesNotMatch(html, /class="output-intro"|class="task-flow"/);
  for (const id of ['output-format-select', 'output-download', 'output-apply-settings', 'output-return']) assert.ok(template.includes(`id="${id}"`), id);
});

test('critical presentation styles exist before the entry script, with recovery if modules fail', () => {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head.includes('/css/conversion-smart-ui.css?rev='));
  assert.ok(head.includes('/css/conversion-startup.css?rev='));
  assert.match(activeHtml, /data-conversion-reload/);
  assert.match(activeHtml, /<noscript>/);
  assert.match(activeHtml, /conversion-entry\.mjs[^>]+onerror=/);
});
