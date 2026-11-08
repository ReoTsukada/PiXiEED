import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectManagerAdConfig } from '../../data/project-gallery-ad-config.mjs';
import { isProjectManagerAdEligible, hasManagerArtwork, projectGalleryAdPositions, getInlineGalleryAdLayout } from '../../js/ads/project-manager-ad.mjs';
import { claimProjectGalleryAdRequest, hasProjectGalleryAdRequest } from '../../js/ads/project-gallery-ad.mjs';
const eligible = { config: projectManagerAdConfig, origin: 'https://pixieed.jp', protocol: 'https:', pathname: '/tools/start/draw/',
  search: '?workspace=1&runtime=direct', topLevel: true, pageVisible: true, libraryVisible: true, settled: true, enoughArtwork: true };

test('manager gate admits only settled gallery content on clean production URLs', () => {
  assert.equal(isProjectManagerAdEligible(eligible), true);
  assert.equal(isProjectManagerAdEligible({ ...eligible, search: '?workspace=1&runtime=direct&mode=audio' }), true);
  for (const search of ['?pxd=secret', '?pxdRevision=r1', '?modePxd=work', '?workspace=1&workspace=1', '?runtime=unknown', '?title=private', '?mode=unknown', '?constructor=1', '?__proto__=1', '?toString=1'])
    assert.equal(isProjectManagerAdEligible({ ...eligible, search }), false, search);
  for (const patch of [{ origin: 'http://localhost:4188' }, { origin: 'https://preview.pixieed.jp' }, { pathname: '/profile/' }, { hash: '#work' },
    { topLevel: false }, { pageVisible: false }, { libraryVisible: false }, { settled: false }, { enoughArtwork: false },
    { searching: true }, { selecting: true }, { importing: true }, { hasErrors: true }, { busy: true }, { restoring: true }, { dirty: true }, { fullscreen: true }, { privateContext: true },
    { config: { ...projectManagerAdConfig, enabled: false } }, { config: { ...projectManagerAdConfig, minimumArtwork: 6 } }])
    assert.equal(isProjectManagerAdEligible({ ...eligible, ...patch }), false, JSON.stringify(patch));
});

test('one valid saved preview qualifies; empty placeholders and damaged rows fail closed', () => {
  const image = () => ({ summary: { thumbnail: { width: 2, height: 2, rgb: new Uint8Array(12) } } });
  assert.equal(hasManagerArtwork([]), false);
  assert.equal(hasManagerArtwork(Array.from({ length: 6 }, image)), true);
  assert.equal(hasManagerArtwork(Array.from({ length: 1 }, image)), true);
  assert.equal(hasManagerArtwork([...Array.from({ length: 5 }, image), {}]), false);
  assert.equal(hasManagerArtwork(Array.from({ length: 6 }, () => ({ summary: { thumbnail: { width: 2, height: 2, rgb: new Uint8Array(3) } } }))), false);
});

test('each logical placement has an irreversible reservation across module instances', async () => {
  const doc = {}, chooser = {}, manager = {};
  const otherModule = await import('../../js/ads/project-gallery-ad.mjs?separate-test-instance');
  assert.equal(hasProjectGalleryAdRequest(doc), false);
  assert.equal(claimProjectGalleryAdRequest(doc, chooser), true);
  assert.equal(otherModule.hasProjectGalleryAdRequest(doc), true);
  assert.equal(otherModule.claimProjectGalleryAdRequest(doc, manager), false);
  assert.equal(claimProjectGalleryAdRequest(doc, chooser), false);
  assert.equal(claimProjectGalleryAdRequest(doc, manager, 'manager:1'), true);
  assert.equal(otherModule.claimProjectGalleryAdRequest(doc, manager, 'manager:1'), false);
  assert.equal(claimProjectGalleryAdRequest(doc, manager, 'manager:7'), true);
  assert.equal(claimProjectGalleryAdRequest({}, manager, 'manager:1'), true, 'a genuinely new document gets a new placement budget');
});

test('manager placement leaves history, project storage and pixels outside the SDK interface', async () => {
  const source = await readFile(new URL('../../js/ads/project-manager-ad.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /history\.(?:replaceState|pushState)|localStorage|indexedDB|getImageData|toDataURL|JSON\.stringify/);
  assert.match(source, /claimProjectGalleryAdRequest\(doc, host, placementKey\)/);
  assert.match(source, /win\.adsbygoogle\.push\(\{\}\)/);
  assert.match(source, /host\.style\.visibility = 'hidden'; \/\/ Keep normal-flow geometry/);
  const workspace = await readFile(new URL('../../js/creation/project-workspace.mjs', import.meta.url), 'utf8');
  assert.match(workspace, /mountProjectGalleryAdSeries\(/);
  assert.match(workspace, /retireManagerAd\('operation'\);\s+locked = true/);
  assert.match(workspace, /dialog\.addEventListener\('pointerdown', retireBeforeManagerControl, \{ capture: true/);
  const css = await readFile(new URL('../../css/project-workspace.css', import.meta.url), 'utf8');
  const region = css.match(/\.project-manager-ad \{([^}]+)\}/)?.[1];
  assert.match(region, /margin:48px 0/); assert.doesNotMatch(region, /position:(fixed|sticky|absolute)/);
});

test('ad positions are after one artwork and then every six, with small fixed units', () => {
  for (const [count, expected] of [[0,[]],[1,[1]],[6,[1]],[7,[1,7]],[12,[1,7]],[13,[1,7,13]]]) assert.deepEqual(projectGalleryAdPositions(count), expected);
  assert.deepEqual(getInlineGalleryAdLayout(356), {width:320,height:50});
  assert.deepEqual(getInlineGalleryAdLayout(286), {width:250,height:50});
  assert.deepEqual(getInlineGalleryAdLayout(722), {width:468,height:60});
  assert.equal(getInlineGalleryAdLayout(249),null);
  assert.equal(isProjectManagerAdEligible({...eligible,surface:'chooser',search:'?workspace=1'}),true);
  assert.equal(isProjectManagerAdEligible({...eligible,surface:'chooser'}),false);
  assert.equal(isProjectManagerAdEligible({...eligible,surface:'chooser',search:'?workspace=1',editor:true}),false);
});
