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
  const main = node(), startup = node(), heading = node(), status = node(), basic = node(), technical = node(), technicalText = node(), skip = node();
  const elements = { main, 'conversion-startup': startup, 'conversion-startup-status': status };
  startup.prepend(heading); startup.querySelector = () => heading;
  const doc = { body: node(), getElementById: id => elements[id],
    querySelector: selector => ({'[data-conversion-basic]':basic,'[data-conversion-technical]':technical,'[data-conversion-error]':technicalText,'.output-skip':skip})[selector] || null,
    createElement: tag => Object.assign(node(),{tag}), };
  return { main, startup, heading, status, basic, technical, technicalText, skip, doc, view: createConversionStartupView(doc) };
}

test('a failed UI mount remains quarantined and exposes no basic fallback', async () => {
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
  assert.match(f.status.textContent, /保存操作をせず/);
  assert.equal(f.startup.children[0], f.heading);
  assert.equal(f.basic.hidden,true);
  assert.equal(f.main.children[0], originalControl); assert.equal(originalControl.value, 'edited');
  assert.equal(f.main.dataset.smartConversion, 'true', 'no misleading rollback of an adapter with attached listeners');
});

test('only a UI import failure offers an explicit basic-screen continuation with readable Japanese guidance', async () => {
  const g=fixtureWithEvents();g.view.begin();g.view.fail(new Error('chunk failed'),{stage:'ui-import'});
  assert.equal(g.main.hidden,true);assert.equal(g.main.inert,true);assert.equal(g.basic.hidden,false);
  assert.match(g.status.textContent,/操作パネル/);assert.match(g.status.textContent,/保存/);
  assert.equal(g.technical.hidden,false);
  assert.equal(g.technical.open,false,'technical details remain closed until requested');
  assert.equal(g.technicalText.textContent,'chunk failed');
  assert.equal(g.basic.click(),true);
  assert.equal(g.main.hidden,false);assert.equal(g.main.inert,false);assert.equal(g.startup.hidden,true);
  assert.equal(g.doc.body.dataset.conversionStartup,'basic');
  assert.match(g.main.children[1].textContent,/必要なファイルを保存/);
  assert.equal(g.basic.click(),false,'the continuation is one-shot');
});

function fixtureWithEvents(){
  const node=()=>({hidden:false,inert:false,dataset:{},attributes:{},children:[],listeners:{},
    setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},click(){return this.listeners.click?.() ?? false;},
    prepend(child){if(child.parent)child.parent.children.splice(child.parent.children.indexOf(child),1);this.children.unshift(child);child.parent=this;},
    insertBefore(child,ref){const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,child);child.parent=this;},append(child){this.children.push(child);child.parent=this;},
    get firstChild(){return this.children[0]||null;},set innerHTML(_value){assert.fail('No HTML injection');}});
  const main=node(),startup=node(),heading=node(),status=node(),basic=node(),technical=node(),technicalText=node(),skip=node();technical.open=false;startup.prepend(heading);startup.querySelector=()=>heading;
  const ids={main,'conversion-startup':startup,'conversion-startup-status':status};
  const doc={body:node(),getElementById:id=>ids[id],querySelector:s=>({'[data-conversion-basic]':basic,'[data-conversion-technical]':technical,'[data-conversion-error]':technicalText,'.output-skip':skip})[s]||null,createElement:tag=>Object.assign(node(),{tag})};
  return {main,startup,heading,status,basic,technical,technicalText,skip,doc,view:createConversionStartupView(doc)};
}

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


test('explicit reload uses location.reload so history-based recovery identity is retained',()=>{
  let click,reloads=0,prevented=0;const f=fixture();const original=f.doc.querySelector;
  f.doc.querySelector=selector=>selector==='[data-conversion-reload]'?{addEventListener:(_type,fn)=>{click=fn;}}:original(selector);
  f.doc.defaultView={location:{reload:()=>{reloads++;}}};createConversionStartupView(f.doc);click({preventDefault:()=>{prevented++;}});assert.equal(prevented,1);assert.equal(reloads,1);
});
