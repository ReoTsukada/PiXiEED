import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const root of ['pixiedraw']) {
  const html = fs.readFileSync(`${root}/index.html`, 'utf8');
  const css = fs.readFileSync(`${root}/assets/css/style.css`, 'utf8');
  const quickActions = html.match(/<div aria-label="ファイルと外部ツール"[\s\S]*?<\/div>/)?.[0] || '';
  const toolGroups = html.match(/<div aria-label="ツールカテゴリ"[\s\S]*?<\/div>/)?.[0] || '';

  assert.match(quickActions, /class="chip canvas-quick-action"[^>]+data-ui-action="openLensCamera"/);
  assert.match(quickActions, /class="chip canvas-quick-action"[^>]+data-ui-action="openQrEditor"/);
  assert.doesNotMatch(toolGroups, /data-ui-action="openLensCamera"/);
  assert.doesNotMatch(toolGroups, /data-ui-action="openQrEditor"/);
  assert.match(html, /class="mobile-tab mobile-tab--action mobile-drawer__action"[^>]+data-ui-action="openLensCamera"/);
  assert.match(html, /class="mobile-tab mobile-tab--action mobile-drawer__action"[^>]+data-ui-action="openQrEditor"/);
  assert.doesNotMatch(
    css,
    /canvas-controls__quick-actions \[data-ui-action="openLensCamera"\][\s\S]*?display:\s*none/
  );
}

console.log('PiXiEEDraw camera and QR placement checks passed.');
