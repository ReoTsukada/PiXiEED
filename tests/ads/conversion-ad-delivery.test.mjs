import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionAdDeliveryState, conversionAdEligible, conversionAdLayout } from '../../js/ads/conversion-display-ad.mjs';

test('only filled reports a delivered creative', () => {
  assert.equal(conversionAdDeliveryState('filled'), 'filled');
  for (const status of ['unfilled','unfill-optimized','done','requested','',undefined,null]) {
    assert.notEqual(conversionAdDeliveryState(status), 'filled');
  }
});
test('Google optimized empty units remain distinguishable from fill', () => {
  assert.equal(conversionAdDeliveryState('unfill-optimized'), 'unfill-optimized');
  assert.equal(conversionAdDeliveryState('unfilled'), 'unfilled');
});
test('unknown processing states do not establish delivery', () => {
  for (const status of ['done','requested','ready','',undefined,null,{},true]) {
    assert.equal(conversionAdDeliveryState(status), 'pending');
  }
});
const base = {origin:'https://pixieed.jp',pathname:'/tools/start/convert/',topLevel:true};
test('manual ad remains allowed on public converter routes', () => {
  for (const search of ['', '?text=output','?mode=convert']) assert.equal(conversionAdEligible({...base,search}),true);
});
test('private handoffs and frames still cannot request this ad', () => {
  for (const search of ['?id=private','?file=private','?text=input&text=output','?unknown=private']) assert.equal(conversionAdEligible({...base,search}),false);
  assert.equal(conversionAdEligible({...base,topLevel:false}),false);
});
test('mobile sizes remain unchanged', () => {
  assert.equal(conversionAdLayout({viewportWidth:320,viewportHeight:740,mainRight:320}).width,250);
  assert.equal(conversionAdLayout({viewportWidth:390,viewportHeight:844,mainRight:390}).width,300);
});
test('desktop rail does not narrow the work area', () => {
  assert.equal(conversionAdLayout({viewportWidth:1366,viewportHeight:768,mainRight:1323}).rail,false);
  const layout=conversionAdLayout({viewportWidth:1920,viewportHeight:1080,mainRight:1600});
  assert.equal(layout.rail,true); assert.equal(layout.width,160);
});
test('served size stays frozen without a second request', () => {
  const layout=conversionAdLayout({viewportWidth:390,viewportHeight:844,mainRight:390,frozenSize:{width:160,height:600}});
  assert.equal(layout.width,160); assert.equal(layout.height,600); assert.equal(layout.rail,false);
});
