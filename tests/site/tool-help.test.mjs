import test from 'node:test';
import assert from 'node:assert/strict';
import { isToolsHubPath, mountToolHelp } from '../../js/tool-help.mjs?rev=20261003-tool-help-1';

test('tool help module imports without a browser document', () => {
  assert.equal(typeof mountToolHelp, 'function');
});

test('tool help mount is inert when its browser hosts are unavailable', () => {
  assert.equal(mountToolHelp({ document: null, window: null }), null);
  assert.equal(mountToolHelp({ document: {}, window: {}, menu: null }), null);
});

test('tools hub detection normalizes directory and index document routes', () => {
  for (const pathname of ['/tools', '/tools/', '/tools/index.html', '/tools/index.html/']) assert.equal(isToolsHubPath(pathname), true, pathname);
  for (const pathname of ['/tool', '/toolshed/', '/draw/']) assert.equal(isToolsHubPath(pathname), false, pathname);
});
