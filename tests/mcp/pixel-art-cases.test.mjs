import test from 'node:test';
import assert from 'node:assert/strict';
import { PIXEL_ART_CASES, getAcceptedPixelArtCases, getComparisonPixelArtCases, getPendingPixelArtCases, getUserAcceptedPixelArtCases, getVisiblePixelArtCases, CASE_LIBRARY_STATUS } from '../../js/mcp/pixel-art-cases.mjs';
test('unreviewed and rejected cases are excluded from usable examples',()=>{
  const cases=[{id:'draft'},{id:'pending',acceptance:'pending'},{id:'rejected',acceptance:'rejected'},{id:'accepted',acceptance:'accepted'}];
  assert.deepEqual(getAcceptedPixelArtCases(cases).map(c=>c.id),['accepted']);
  assert.equal(getAcceptedPixelArtCases().length,CASE_LIBRARY_STATUS.acceptedCount);
});

test('keeps all 24 studies, marks only the deer user accepted, and retains 23 pending slots',()=>{
  assert.equal(PIXEL_ART_CASES.length,24);
  assert.equal(getPendingPixelArtCases().length,23);
  assert.equal(CASE_LIBRARY_STATUS.remainingCount,23);
  assert.equal(CASE_LIBRARY_STATUS.pendingAcceptanceCount,23);
  assert.deepEqual(getUserAcceptedPixelArtCases().map(item=>item.id),['animal-64']);
  assert.equal(getVisiblePixelArtCases()[0].id,'animal-64');
  assert.equal(CASE_LIBRARY_STATUS.comparisonCount,23);
  assert.equal(getComparisonPixelArtCases().length,23);
  assert.equal(getVisiblePixelArtCases().length,24);
  assert.ok(getComparisonPixelArtCases().every(item=>item.userAcceptance==='pending' && item.beforePng && item.afterPng && item.verification?.pixelMatch));
});

test('legacy acceptance remains readable but missing userAcceptance is never user approval',()=>{
  const legacy={id:'legacy',acceptance:'accepted'};
  assert.deepEqual(getAcceptedPixelArtCases([legacy]),[legacy]);
  assert.deepEqual(getUserAcceptedPixelArtCases([legacy]),[]);
  const comparison={id:'pending-study',acceptance:'accepted',userAcceptance:'pending',studyStatus:'reviewed',internalDecision:'improved',beforePng:'before',afterPng:'after'};
  assert.deepEqual(getComparisonPixelArtCases([comparison]),[comparison]);
  assert.deepEqual(getUserAcceptedPixelArtCases([comparison]),[]);
});
