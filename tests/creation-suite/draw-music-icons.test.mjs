import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const music = read('js/creation/draw-music.mjs');
const css = read('css/draw-tool-picker.css');
const modeCss = read('css/creation-modes.css');

test('music page and preview/output actions pair decorative SVGs with readable labels', () => {
  const ids = [
    'draw-music-page-add', 'draw-music-page-copy', 'draw-music-page-delete',
    'draw-music-preview', 'draw-music-stop-loop', 'draw-music-wav', 'draw-music-video'
  ];
  for (const id of ids) {
    const button = music.slice(music.indexOf(`id="${id}"`), music.indexOf('</button>', music.indexOf(`id="${id}"`)));
    assert.ok(button.includes('musicActionIcon('), `${id} includes its decorative SVG`);
    assert.match(button, /<span>[^<]+<\/span>/, `${id} keeps a concise visible label`);
    assert.match(button, /aria-label="[^"]+"/, `${id} has a clear accessible name`);
    assert.match(button, /title="[^"]+"/, `${id} has a tooltip`);
  }
  assert.match(music, /class="draw-music-action-icon" viewBox="0 0 24 24" aria-hidden="true"/);
});

test('music action icon sizing leaves the existing button hit areas intact', () => {
  assert.match(css, /\.draw-music-panel :is\(#draw-music-page-add,[\s\S]*?#draw-music-video\)\s*\{\s*display:inline-flex; align-items:center; justify-content:center; gap:6px;/);
  assert.match(css, /\.draw-music-action-icon\s*\{[^}]*flex:0 0 18px; width:18px; height:18px;/);
  assert.match(modeCss, /body\.creation-suite \.draw-music-panel :is\(input,select,button\) \{[^}]*min-height:40px/);
});

test('music feedback icons use the same bounded sizing as settings actions', () => {
  assert.match(css, /body\.creation-suite :is\(\.draw-music-panel,\.draw-music-feedback\) \.draw-music-action-icon\s*\{[^}]*width:18px; height:18px;[^}]*stroke:currentColor;/);
  for (const id of ['draw-music-voice-cta', 'draw-music-recovery-cta', 'draw-music-feedback-dismiss']) {
    const start = music.indexOf(`.id = '${id}'`);
    assert.ok(start >= 0, `${id} exists`);
    assert.match(music.slice(start, music.indexOf('\n', start)), /musicActionIcon\(/, `${id} uses the bounded shared icon`);
  }
});

test('music value fields retain readable dark controls against global light input defaults', () => {
  const rule = css.match(/body\.creation-suite \.draw-music-panel :is\(input\[type=number\],select\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, 'scope override to music values, never checkboxes or buttons');
  assert.match(rule, /background:#293742\s*!important/);
  assert.match(rule, /color:#f4f0e4\s*!important/);
  assert.match(rule, /-webkit-text-fill-color:currentColor/);
  assert.match(rule, /caret-color:currentColor/);
  assert.match(rule, /color-scheme:dark/);
});

test('music control fixes invalidate the retained editor stylesheet URL', () => {
  const revision = '20261108-music-controls-1';
  assert.equal(JSON.parse(read('tests/runtime-cache-revisions.json'))['css/draw-tool-picker.css'], revision);
  assert.ok(read('draw/editor.html').includes(`/css/draw-tool-picker.css?rev=${revision}`));
});
