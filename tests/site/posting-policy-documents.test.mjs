import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postingPolicy } from '../../data/posting-policy.mjs';
import { policyDigest, verifyPolicyDocuments } from '../../scripts/check-posting-policy.mjs';

test('prepared privacy date is independent of the unchanged terms date and hashes', async () => {
  const documents = await verifyPolicyDocuments();
  assert.equal(postingPolicy.effectiveCandidateDate, '2026-10-24');
  assert.equal(postingPolicy.terms.version, 'terms-20261022-1');
  assert.equal(postingPolicy.terms.effectiveDate, '2026-10-22');
  assert.equal(postingPolicy.terms.sha256, '4ef3e799ee9828c3797b0fdb0dfc52528313f054eda54421f487d5bf13d436d3');
  assert.equal(postingPolicy.privacy.version, 'privacy-20261024-1');
  assert.equal(postingPolicy.privacy.effectiveDate, '2026-10-24');
  assert.equal(documents.find(document => document.kind === 'terms')?.effectiveDate, '2026-10-22');
  assert.equal(documents.find(document => document.kind === 'privacy')?.effectiveDate, '2026-10-24');
});

test('older policy metadata without document dates still falls back to the shared candidate date', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixieed-policy-date-'));
  try {
    const effectiveCandidateDate = '2026-10-22';
    const document = (kind, version) => {
      const html = `<!-- posting-policy:start -->\n<article data-policy-version="${version}"><p>版：${version}。2026年10月22日から適用します。</p></article>\n<!-- posting-policy:end -->`;
      return { url: `https://pixieed.jp/${kind}/`, version, sha256: policyDigest(html), html };
    };
    const terms = document('terms', 'terms-old-1');
    const privacy = document('privacy', 'privacy-old-1');
    for (const [kind, doc] of [['terms', terms], ['privacy', privacy]]) {
      await mkdir(join(root, kind), { recursive: true });
      await writeFile(join(root, kind, 'index.html'), doc.html);
    }
    const checked = await verifyPolicyDocuments({
      root,
      policy: { effectiveCandidateDate, terms: { url: terms.url, version: terms.version, sha256: terms.sha256 }, privacy: { url: privacy.url, version: privacy.version, sha256: privacy.sha256 } }
    });
    assert.deepEqual(checked.map(item => item.effectiveDate), [effectiveCandidateDate, effectiveCandidateDate]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
