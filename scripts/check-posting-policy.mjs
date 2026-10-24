#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { postingPolicy } from '../data/posting-policy.mjs';

// Only the marked legal article is hashed. Navigation/style-only edits do not
// silently change the legal version; article edits require a new version/hash.
export function policyArticle(html) {
  const start = '<!-- posting-policy:start -->';
  const end = '<!-- posting-policy:end -->';
  if (html.split(start).length !== 2 || html.split(end).length !== 2) throw new Error('policy_markers_invalid');
  const article = html.split(start)[1].split(end)[0].replace(/\r\n?/g, '\n');
  if (!/^\n<article\b[\s\S]*<\/article>\n$/.test(article)) throw new Error('policy_article_invalid');
  return article;
}
export const policyDigest = html => createHash('sha256').update(policyArticle(html), 'utf8').digest('hex');
export async function verifyPolicyDocuments({ root = fileURLToPath(new URL('../', import.meta.url)), policy = postingPolicy } = {}) {
  const result = [];
  for (const [kind, doc] of [['terms', policy.terms], ['privacy', policy.privacy]]) {
    if (doc.url !== `https://pixieed.jp/${kind}/`) throw new Error('policy_url_mismatch');
    const html = await readFile(resolve(root, kind, 'index.html'), 'utf8');
    const article = policyArticle(html);
    if (!article.includes(`data-policy-version="${doc.version}"`)) throw new Error('policy_version_mismatch');
    const sha256 = policyDigest(html);
    if (sha256 !== doc.sha256) throw new Error('policy_digest_mismatch');
    const effectiveDate = doc.effectiveDate || policy.effectiveCandidateDate;
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveDate || '');
    if (!date || !article.includes(`${date[1]}年${Number(date[2])}月${Number(date[3])}日`)) throw new Error('policy_candidate_date_mismatch');
    result.push({ kind, url: doc.url, version: doc.version, effectiveDate, sha256 });
  }
  return result;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Only --check is supported');
  console.log(JSON.stringify({ state: postingPolicy.state, effectiveCandidateDate: postingPolicy.effectiveCandidateDate, documents: await verifyPolicyDocuments() }));
}
