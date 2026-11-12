import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const html = read('profile/index.html');
const app = read('js/app.js');
const render = app.slice(app.indexOf('function renderProfile() {'), app.indexOf('function showToast('));
const css = read('css/profile-workspace.css');

test('profile keeps artwork hooks and routes while removing repeated overview links', () => {
  for (const hook of ['data-profile-root', 'data-profile-greeting', 'data-profile-post-count', 'data-profile-like-count', 'data-my-posts-root', 'data-profile-liked-posts', 'data-author-profiles-root', 'data-author-profiles-forms', 'data-legacy-placement-slot']) assert.ok(render.includes(hook), hook);
  for (const url of ['/profile/', '/profile/?view=posts', '/profile/?view=likes', '/profile/?view=history', '/globe/?post=1', '/globe/', '/collection/']) assert.ok(render.includes(url), url);
  assert.doesNotMatch(render, /class="profile-grid"/);
  assert.match(render, /pixieed:profile-rendered/);
  assert.match(render, /aria-current="page"/);
  assert.match(render, /aria-hidden="true"/);
});

test('settings use native closed disclosures without changing consent or storage controls', () => {
  assert.match(render, /<details class="profile-author-settings profile-disclosure" data-author-profiles-root hidden>/);
  assert.match(html, /<details class="profile-disclosure profile-sharing" id="profile-sharing">/);
  assert.match(html, /<section class="profile-disclosure__body" data-home-artwork-settings aria-label="ホームへの作品掲載">/);
  assert.match(html, /<details class="profile-disclosure profile-device" id="profile-device">/);
  for (const hook of ['data-local-work-summary', 'data-local-work-status']) assert.ok(html.includes(hook), hook);
  for (const url of ['/feed/?view=saved', '/feed/?view=drafts', '/tools/']) assert.ok(html.includes(url), url);
  assert.match(html, /関連付けても公開やクラウドへの送信は行いません/);
  assert.match(html, /別端末への同期は行いません/);
});

test('profile adds no runtime and preserves focus, touch targets and mobile input size', () => {
  assert.match(html, /profile-workspace\.css\?rev=20261112-profile-workspace-1/);
  assert.doesNotMatch(html, /<script[^>]*src="[^"?]*profile-workspace\.(?:m?js)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /input\{min-height:48px;font-size:16px/);
  assert.match(css, /@media\(forced-colors:active\)/);
  assert.doesNotMatch(css, /@import|animation:/);
});
