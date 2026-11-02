import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureConversionNavigation } from '../../js/creation/conversion-smart-ui.mjs';
import { PUBLIC_NAV_ITEMS, currentPublicNavKey } from '../../js/page-navigation.mjs';

function linksFromHtml(html) {
  const attribute = (source, name) => source.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attrs,body]) => ({
    dataset: { publicNav: attribute(attrs,'data-public-nav') }, href: attribute(attrs,'href'),
    label: attribute(attrs,'aria-label'), icon: body.match(/<img\b[^>]*src="([^"]+)"/)?.[1],
    text: body.match(/<span\b[^>]*>(.*?)<\/span>/)?.[1], attributes: {},
    setAttribute(name,value) { this.attributes[name]=value; }, removeAttribute(name) { delete this.attributes[name]; },
  }));
}
function fixture(path='/output/work/') {
  let mounted=null;
  const classNames=new Set();classNames.contains=key=>classNames.has(key);
  const body={classList:classNames,hasAttribute:()=>false,querySelector:()=>null,prepend(node){mounted=node;}};
  classNames.add=Set.prototype.add.bind(classNames);
  const doc={body,querySelector(selector){if(selector==='.public-destination-nav')return mounted?.className.includes('public-destination-nav')?mounted:null;return null;},createElement(){return {className:'',attributes:{},setAttribute(name,value){this.attributes[name]=value;},set innerHTML(value){this.links=linksFromHtml(value);this.html=value;},querySelectorAll(){return this.links;}};}};
  const win={location:new URL(`https://example.test${path}`)};win.top=win.self=win;
  return {doc,win,get nav(){return mounted;}};
}
const expected=PUBLIC_NAV_ITEMS.map(({key,href,label,icon})=>({key,href,label,icon:`/assets/icons/pixieed/${icon}.svg`}));
const description=links=>links.map(link=>({key:link.dataset.publicNav,href:link.href,label:link.label,icon:link.icon}));

test('output adapter mounts canonical links and keeps the same nodes on refresh',()=>{
  const f=fixture(),nav=ensureConversionNavigation(f.doc,f.win);
  assert.deepEqual(description(nav.links),expected);
  const focusedLink=nav.links[2];nav.focused=focusedLink;
  assert.equal(ensureConversionNavigation(f.doc,f.win),nav);
  assert.equal(nav.focused,focusedLink);
  assert.equal(nav.links[2],focusedLink);
  assert.ok(nav.links.every(link=>!link.attributes['aria-current']),'output is not falsely marked as one of the five destination pages');
});

test('adapter uses canonical active-state classification and honors the frame boundary',()=>{
  const f=fixture('/tools/'),nav=ensureConversionNavigation(f.doc,f.win);
  assert.equal(nav.links.find(link=>link.attributes['aria-current']==='page').dataset.publicNav,currentPublicNavKey(f.win.location));
  const embedded=fixture();embedded.win.top={};
  assert.equal(ensureConversionNavigation(embedded.doc,embedded.win),null);
});

test('both output pages author the same accessible initial navigation as the shared model',()=>{
  for(const path of ['output/index.html','output/work/index.html']) {
    const html=readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
    const nav=html.match(/<nav class="mobile-nav public-destination-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav,path);assert.deepEqual(description(linksFromHtml(nav)),expected,path);
    assert.equal((nav.match(/<a\b/g)||[]).length,5,path);
    assert.equal(nav.includes('output-nav-export'),false,'save remains outside ordinary navigation');
  }
});
