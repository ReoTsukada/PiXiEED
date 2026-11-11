import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_START_ROUTES, hasConversionRecoveryHistory, isFreshToolStartRequest, toolStartHref } from '../../js/tool-start-routes.mjs';
import { createWorkspaceHistoryEntry, isWorkspaceRequested } from '../../js/tool-workspace-state.mjs';

test('grouped editor pages open work directly; explicit explanation and history still win', () => {
  for (const id of ['draw','camera','audio']) {
    const url = `https://pixieed.jp/tools/start/${id}/`;
    assert.equal(isWorkspaceRequested(url, null), true);
    assert.equal(isWorkspaceRequested(url, { pixieedWorkspace: false }), false);
    assert.equal(isWorkspaceRequested(url + '?workspace=0', null), false);
    const description = createWorkspaceHistoryEntry(url + '?social=1', {}, false);
    assert.equal(description.url, `/tools/start/${id}/?social=1`);
    assert.equal(isWorkspaceRequested('https://pixieed.jp' + description.url, description.state), false);
  }
  assert.equal(isWorkspaceRequested('https://pixieed.jp/draw/', null), false);
});

test('fresh starts exclude saved pointers, collisions, fragments and replay history', () => {
  for (const route of TOOL_START_ROUTES) {
    const href = `https://pixieed.jp${route.startPath}`;
    assert.equal(isFreshToolStartRequest(href, null), true);
    assert.equal(isFreshToolStartRequest(href + '?social=1', null), true);
    for (const suffix of ['?pxd=private&pxdRevision=revision','?id=saved','?modePxd=private','?social=1&social=1','#saved','?workspace=0']) assert.equal(isFreshToolStartRequest(href + suffix, null), false, suffix);
    for (const state of [{pixieedWorkspace:true},{projectWorkspaceSelection:true},{toolStartActive:true}]) assert.equal(isFreshToolStartRequest(href,state),false);
    assert.equal(toolStartHref(route.legacyPath + '?pxd=private&pxdRevision=revision#saved'), route.legacyPath + '?pxd=private&pxdRevision=revision#saved');
  }
});

test('only the converter start accepts Google’s exact Offerwall preview pair', () => {
  const converter = TOOL_START_ROUTES.find(route => route.id === 'convert');
  const preview = `${converter.startPath}?fc=alwaysshow&fctype=monetization`;
  assert.equal(isFreshToolStartRequest(`https://pixieed.jp${preview}`, null), true);
  assert.equal(isFreshToolStartRequest(`https://pixieed.jp${preview}#preview`, null), false);
  for (const route of TOOL_START_ROUTES.filter(route => route.id !== 'convert')) {
    assert.equal(isFreshToolStartRequest(`https://pixieed.jp${route.startPath}?fc=alwaysshow&fctype=monetization`, null), false, route.id);
  }
  for (const suffix of [
    '?mode=convert', '?text=input', '?mode=convert&text=input',
    '?fc=alwaysshow&fctype=monetization&id=private',
    '?fc=alwaysshow&fctype=monetization&fctype=monetization',
    '?fc=alwaysshow&fctype=other',
    '?fc=alwaysshow',
    '?fc=alwaysshow&fctype=monetization&source=private',
  ]) assert.equal(isFreshToolStartRequest(`https://pixieed.jp${converter.startPath}${suffix}`, null), false, suffix);
  for (const flag of ['pixieedConversionRecovery', 'pixieedConversionRecoveryPrevious', 'pixieedConversionRecoveryPaused']) {
    assert.equal(isFreshToolStartRequest(`https://pixieed.jp${converter.startPath}`, { [flag]: flag === 'pixieedConversionRecoveryPaused' ? false : 'saved' }), false, flag);
  }
  assert.equal(isFreshToolStartRequest(`https://pixieed.jp${converter.startPath}`, { pixieedConversionRecovery: 'saved' }), false);
  assert.equal(hasConversionRecoveryHistory({}), false);
  assert.equal(hasConversionRecoveryHistory({ pixieedConversionRecovery: 'saved' }), true);
  for (const route of TOOL_START_ROUTES.filter(route => route.id !== 'convert')) {
    assert.equal(isFreshToolStartRequest(`https://pixieed.jp${route.startPath}`, { pixieedConversionRecovery: 'saved' }), true, route.id);
  }
});
