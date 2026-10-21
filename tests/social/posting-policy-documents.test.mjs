import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postingPolicy, isPostingPolicyReady } from '../../data/posting-policy.mjs';
import { policyArticle, policyDigest, verifyPolicyDocuments } from '../../scripts/check-posting-policy.mjs';
import { DRAW_CTA_EXCLUDED_ROUTES } from '../../scripts/site-draw-cta.mjs';

test('approved candidate has real routes, fixed versions/date and matching document hashes, without activating writes', async () => {
  const docs = await verifyPolicyDocuments();
  assert.equal(docs.length, 2);
  assert.equal(postingPolicy.effectiveCandidateDate, '2026-10-21');
  assert.equal(postingPolicy.state, 'draft');
  assert.equal(isPostingPolicyReady(), false);
  assert.deepEqual(docs.map(d => d.url), ['https://pixieed.jp/terms/', 'https://pixieed.jp/privacy/']);
  assert.equal(postingPolicy.terms.version, 'terms-20261021-1');
  assert.equal(postingPolicy.privacy.version, 'privacy-20261021-1');
});

test('legal content changes require a new digest; navigation and CRLF formatting do not alter the document identity', async () => {
  const html = await readFile(new URL('../../terms/index.html', import.meta.url), 'utf8');
  assert.equal(policyDigest(html.replace('TERMS', 'LOCAL NAVIGATION')), policyDigest(html));
  assert.equal(policyDigest(html.replaceAll('\n', '\r\n')), policyDigest(html));
  assert.notEqual(policyDigest(html.replace('著作権は作者に残ります', 'changed legal content')), policyDigest(html));
  assert.throws(() => policyArticle(html + '<!-- posting-policy:start -->'), /markers/);
  assert.throws(() => policyArticle(html.replace('<!-- posting-policy:end -->', '')), /markers/);
  const root = await mkdtemp(join(tmpdir(), 'pixieed-policy-synthetic-'));
  try {
    for (const kind of ['terms', 'privacy']) {
      await mkdir(join(root, kind));
      await writeFile(join(root, kind, 'index.html'), await readFile(new URL(`../../${kind}/index.html`, import.meta.url), 'utf8'));
    }
    await writeFile(join(root, 'terms/index.html'), html.replace('著作権は作者に残ります', 'changed legal content'));
    await assert.rejects(verifyPolicyDocuments({ root }), /digest/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('approved terms keep bounded future-game use, private choice, guardian condition and operator contact explicit', async () => {
  const terms = await readFile(new URL('../../terms/index.html', import.meta.url), 'utf8');
  const privacy = await readFile(new URL('../../privacy/index.html', import.meta.url), 'utf8');
  assert.match(terms, /今後追加されるゲーム・機能に適用/);
  assert.match(terms, /著作権は作者に残ります/);
  assert.match(terms, /既存の許諾範囲を超える利用や重要な条件変更には、別途説明して明示的な同意/);
  assert.match(terms, /サイト外での再利用、著作権の譲渡/);
  assert.match(terms, /自動公開しません/);
  assert.match(terms, /保護者の同意を得て/);
  for (const html of [terms, privacy]) {
    assert.match(html, /PiXiEED アルタ/);
    assert.match(html, /href="mailto:pixieed\.arta@gmail\.com"/);
    assert.match(html, /対応完了から原則90日/);
    assert.match(html, /法令により保存が必要な場合に限り/);
    assert.match(html, /第三者.*取得済み.*コピー/);
    assert.match(html, /永久消去.*保証/);
    assert.match(html, /assets\/brand\/pixieed-logo-48\.png/);
    assert.doesNotMatch(html, /保持期間.*未確定|運営主体.*未確定/);
  }
  assert.equal(DRAW_CTA_EXCLUDED_ROUTES['/terms/'], 'legal terms information');
  const sitemap = await readFile(new URL('../../sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /https:\/\/pixieed\.jp\/terms\//);
});

test('posting consent condition includes guardian approval, without adding age or identity collection', async () => {
  const ui = await readFile(new URL('../../js/posting-consent-ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /未成年の場合は保護者の同意を得ています/);
  assert.doesNotMatch(ui, /type\s*=\s*['"]date['"]|dateOfBirth|guardianEmail|fingerprint/);
});
