import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGACY_MCP_ENDPOINT, MCP_ENDPOINT, STORE_MCP_ENDPOINT, PLUGIN_PUBLICATION, verifiedPublicPluginUrl } from '../../js/mcp/connection-config.mjs';

const cacheRevisions = JSON.parse(readFileSync(new URL('../runtime-cache-revisions.json', import.meta.url), 'utf8'));

test('public installation link stays disabled until a published HTTPS ChatGPT URL is configured', () => {
  assert.equal(PLUGIN_PUBLICATION.status, 'not_published');
  assert.equal(verifiedPublicPluginUrl(), null);
  const publicUrl = 'https://chatgpt.com/plugins/example';
  assert.equal(verifiedPublicPluginUrl({ status: 'published', publicPluginUrl: publicUrl }), publicUrl);
  for (const value of [null, '', 'not a URL', 'http://chatgpt.com/plugins/example', 'https://example.com/pixieed', 'https://chatgpt.com.example.com/pixieed', 'https://name:secret@chatgpt.com/plugins/example']) {
    assert.equal(verifiedPublicPluginUrl({ status: 'published', publicPluginUrl: value }), null);
  }
  for (const status of ['not_published', 'draft', 'in_review', undefined]) {
    assert.equal(verifiedPublicPluginUrl({ status, publicPluginUrl: publicUrl }), null);
  }
});

test('ChatGPT store and manual MCP endpoints stay distinct while sharing the same service origin', () => {
  assert.equal(LEGACY_MCP_ENDPOINT, 'https://pixieed-mcp.rgaydm03.workers.dev/mcp');
  assert.equal(MCP_ENDPOINT, LEGACY_MCP_ENDPOINT);
  assert.equal(STORE_MCP_ENDPOINT, 'https://pixieed-mcp.rgaydm03.workers.dev/mcp/store');
  assert.equal(new URL(STORE_MCP_ENDPOINT).origin, new URL(LEGACY_MCP_ENDPOINT).origin);
});

test('all onboarding stylesheet and module consumers carry the canonical cache revisions', () => {
  for (const page of ['../../ai/index.html', '../../ai/guide/index.html', '../../ai/settings/index.html']) {
    const html = readFileSync(new URL(page, import.meta.url), 'utf8');
    assert.match(html, /ai-connect\.css\?rev=20261117-store-onboarding-1/);
  }
  const receivePage = readFileSync(new URL('../../js/mcp/receive-page.mjs', import.meta.url), 'utf8');
  const drawPanel = readFileSync(new URL('../../js/creation/draw-live-session-panel.mjs', import.meta.url), 'utf8');
  const aiPage = readFileSync(new URL('../../ai/index.html', import.meta.url), 'utf8');
  assert.match(aiPage, /receive-page\.mjs\?rev=20261117-store-onboarding-1/);
  assert.match(receivePage, /connection-config\.mjs\?rev=20261117-store-onboarding-1/);
  assert.match(drawPanel, /connection-config\.mjs\?rev=20261117-store-onboarding-1/);
  assert.match(drawPanel, /client\.start\(\{ mode: 'oauth' \}\)/);
  assert.match(drawPanel, /client\.start\(\{ mode: 'legacy' \}\)/);
  assert.match(drawPanel, /チャット本文には貼らないでください/);
  assert.match(drawPanel, /state\.pairingCode && state\.mode === 'legacy'/);
  for (const asset of ['js/mcp/connection-config.mjs', 'js/mcp/receive-page.mjs', 'css/ai-connect.css']) {
    assert.equal(cacheRevisions[asset], '20261117-store-onboarding-1', asset);
  }
});
