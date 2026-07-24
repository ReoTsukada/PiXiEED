import assert from 'node:assert/strict';
import fs from 'node:fs';

const notifications = fs.readFileSync('scripts/shared-notifications.js', 'utf8');
const sharedNav = fs.readFileSync('scripts/shared-bottom-nav.js', 'utf8');
const drawUpdateDialog = fs.readFileSync('pixiedraw/assets/js/modules/export-dialog-workflow-utils.js', 'utf8');

assert.match(notifications, /UPDATE_NOTICE_STORAGE_KEY/);
assert.match(notifications, /data\/project-updates\.json/);
assert.match(notifications, /最新のアップデートがあります/);
assert.match(notifications, /hasUnreadAccountNotification \|\| hasUnreadProductUpdate/);
assert.match(notifications, /pixieed:open-update-history/);
assert.match(sharedNav, /shared-notifications\.js\?v=20260724-product-update-notice1/);
assert.match(drawUpdateDialog, /document\.addEventListener\('pixieed:open-update-history'/);

console.log('Shared product-update notification wiring passed.');
