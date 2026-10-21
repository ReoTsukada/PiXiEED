import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, lstat, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createSupportLedgerReplacement,
  MAX_LEDGER_BYTES,
  planSupportRecordRetention,
  validateSupportLedger,
} from '../../scripts/support-record-retention.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/support-record-retention.mjs', import.meta.url));
const NOW = '2026-10-21T12:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const id = (prefix) => `${prefix.padEnd(22, 'x')}`;
const record = (caseId, values = {}) => ({ caseId: id(caseId), category: 'deletion', closedAt: null, ...values });
const ledger = (...records) => ({ schemaVersion: 1, records });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function closedDaysAgo(days, offsetMs = 0) {
  return new Date(Date.parse(NOW) - days * DAY + offsetMs).toISOString();
}
function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}
async function tempDirectory(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'support-retention-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function saveLedger(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  await writeFile(file, bytes, { mode: 0o600, flag: 'wx' });
  return bytes;
}

test('retention boundary is exactly 90 UTC days and pending/not-yet-due cases remain', () => {
  const nowMs = Date.parse(NOW);
  const records = [
    record('due-exact', { closedAt: closedDaysAgo(90) }),
    record('one-ms-early', { closedAt: closedDaysAgo(90, 1) }),
    record('pending'),
  ];
  const before = planSupportRecordRetention(ledger(...records), nowMs - 1);
  assert.deepEqual(before.eligible, []);
  const exact = planSupportRecordRetention(ledger(...records), nowMs);
  assert.deepEqual(exact.eligible, [{ caseId: id('due-exact'), dueAt: NOW }]);
  assert.deepEqual(exact.pendingCaseIds, [id('pending')]);
  assert.equal(exact.notDueCount, 1);
});

test('invalid timestamps, future closures, duplicate IDs, unknown fields, and non-opaque IDs fail closed', () => {
  const now = Date.parse(NOW);
  const invalid = [
    ledger({ ...record('invalid-date'), closedAt: '2026-02-30T00:00:00Z' }),
    ledger({ ...record('future-close'), closedAt: '2026-10-21T12:00:00.001Z' }),
    ledger(record('duplicate'), record('duplicate')),
    { ...ledger(record('unknown-root')), unexpected: true },
    ledger({ ...record('unknown-record'), email: 'fixture@example.invalid' }),
    ledger({ caseId: 'short', category: 'deletion', closedAt: null }),
    ledger({ ...record('bad-category'), category: 'other' }),
    ledger({ ...record('bad-hold'), legalHold: { lawReference: 'JP-APPI-17', reviewUntil: NOW, explanation: 'text' } }),
    ledger({ ...record('bad-reference'), legalHold: { lawReference: 'personal name', reviewUntil: NOW } }),
    ledger({ ...record('bad-review-date'), legalHold: { lawReference: 'JP-APPI-17', reviewUntil: 'not-a-date' } }),
  ];
  for (const value of invalid) assert.throws(() => validateSupportLedger(value, now));
});

test('finite holds defer until review time; expired holds are surfaced and retained for human review', () => {
  const active = record('active-hold', {
    closedAt: closedDaysAgo(100),
    legalHold: { lawReference: 'JP-APPI-17', reviewUntil: '2026-10-22T12:00:00Z' },
  });
  const expired = record('expired-hold', {
    closedAt: closedDaysAgo(100),
    legalHold: { lawReference: 'LAWREF-2026-01', reviewUntil: '2026-10-20T12:00:00Z' },
  });
  const source = ledger(active, expired);
  const plan = planSupportRecordRetention(source, NOW);
  assert.deepEqual(plan.eligible, []);
  assert.deepEqual(plan.activeHoldReview, [{ caseId: active.caseId, reviewUntil: '2026-10-22T12:00:00.000Z' }]);
  assert.deepEqual(plan.expiredHoldReview, [{ caseId: expired.caseId, reviewUntil: '2026-10-20T12:00:00.000Z' }]);
  assert.deepEqual(createSupportLedgerReplacement(source, NOW), source);
});

test('dry-run prints only aggregate status and opaque IDs/due instants without writing a file', async (t) => {
  const dir = await tempDirectory(t);
  const input = path.join(dir, 'cases.json');
  const out = path.join(dir, 'must-not-exist.json');
  await saveLedger(input, ledger(record('due', { closedAt: closedDaysAgo(91) })));
  const result = runCli(['--input', input, '--now', NOW]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'dry-run');
  assert.deepEqual(report.eligible, [{ caseId: id('due'), dueAt: new Date(Date.parse(closedDaysAgo(91)) + 90 * DAY).toISOString() }]);
  assert.equal(await lstat(out).then(() => true, () => false), false);
});

test('hash mismatch and existing output fail without changing input or output', async (t) => {
  const dir = await tempDirectory(t);
  const input = path.join(dir, 'cases.json');
  const bytes = await saveLedger(input, ledger(record('due', { closedAt: closedDaysAgo(91) })));
  const mismatchOut = path.join(dir, 'mismatch.json');
  const mismatch = runCli(['--input', input, '--now', NOW, '--output', mismatchOut, '--expect-sha256', '0'.repeat(64)]);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /SHA-256/);
  assert.equal(await readFile(input, 'utf8'), bytes.toString('utf8'));
  assert.equal(await lstat(mismatchOut).then(() => true, () => false), false);

  const existing = path.join(dir, 'existing.json');
  await writeFile(existing, 'keep-me', { mode: 0o600, flag: 'wx' });
  const refused = runCli(['--input', input, '--now', NOW, '--output', existing, '--expect-sha256', digest(bytes)]);
  assert.notEqual(refused.status, 0);
  assert.equal(await readFile(existing, 'utf8'), 'keep-me');
});

test('same input/output path, symlink input, and symlink output are rejected safely', async (t) => {
  const dir = await tempDirectory(t);
  const input = path.join(dir, 'cases.json');
  const bytes = await saveLedger(input, ledger(record('due', { closedAt: closedDaysAgo(91) })));
  const same = runCli(['--input', input, '--now', NOW, '--output', path.join(dir, '.', 'cases.json'), '--expect-sha256', digest(bytes)]);
  assert.notEqual(same.status, 0);
  assert.equal(await readFile(input, 'utf8'), bytes.toString('utf8'));

  const inputLink = path.join(dir, 'input-link.json');
  await symlink(input, inputLink);
  const linkedInput = runCli(['--input', inputLink, '--now', NOW]);
  assert.notEqual(linkedInput.status, 0);
  assert.match(linkedInput.stderr, /non-symlink/);

  const target = path.join(dir, 'target.json');
  await writeFile(target, 'protected', { mode: 0o600, flag: 'wx' });
  const outputLink = path.join(dir, 'output-link.json');
  await symlink(target, outputLink);
  const linkedOutput = runCli(['--input', input, '--now', NOW, '--output', outputLink, '--expect-sha256', digest(bytes)]);
  assert.notEqual(linkedOutput.status, 0);
  assert.equal(await readFile(target, 'utf8'), 'protected');
});

test('replacement is exclusive, owner-only, leaves source untouched, and reruns idempotently', async (t) => {
  const dir = await tempDirectory(t);
  const input = path.join(dir, 'cases.json');
  const output = path.join(dir, 'replacement.json');
  const source = ledger(
    record('due', { closedAt: closedDaysAgo(91) }),
    record('pending'),
    record('active-hold', { closedAt: closedDaysAgo(100), legalHold: { lawReference: 'JP-APPI-17', reviewUntil: '2026-10-22T12:00:00Z' } }),
    record('expired-hold', { closedAt: closedDaysAgo(100), legalHold: { lawReference: 'LAWREF-2026-01', reviewUntil: '2026-10-20T12:00:00Z' } }),
  );
  const sourceBytes = await saveLedger(input, source);
  const first = runCli(['--input', input, '--now', NOW, '--output', output, '--expect-sha256', digest(sourceBytes)]);
  assert.equal(first.status, 0, first.stderr);
  assert.doesNotMatch(first.stdout, new RegExp(id('due')));
  assert.equal(JSON.parse(first.stdout).removedCount, 1);
  assert.equal(await readFile(input, 'utf8'), sourceBytes.toString('utf8'));
  const outputStat = await lstat(output);
  assert.equal(outputStat.isFile(), true);
  assert.equal(outputStat.mode & 0o777, 0o600);
  const replacement = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(replacement.records.map((item) => item.caseId), [id('pending'), id('active-hold'), id('expired-hold')]);

  const retryOutput = path.join(dir, 'replacement-retry.json');
  const retryBytes = await readFile(output);
  const retry = runCli(['--input', output, '--now', NOW, '--output', retryOutput, '--expect-sha256', digest(retryBytes)]);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).removedCount, 0);
  assert.deepEqual(JSON.parse(await readFile(retryOutput, 'utf8')), replacement);
});

test('maximum record-count replacement stays within the ledger byte limit and can be safely reread', async (t) => {
  const dir = await tempDirectory(t);
  const input = path.join(dir, 'large-cases.json');
  const output = path.join(dir, 'large-replacement.json');
  const records = Array.from({ length: 10_000 }, (_, index) => record(index.toString().padStart(22, '0')));
  const source = ledger(...records);
  const sourceBytes = await saveLedger(input, source);
  assert.ok(sourceBytes.length < MAX_LEDGER_BYTES);

  const first = runCli(['--input', input, '--now', NOW, '--output', output, '--expect-sha256', digest(sourceBytes)]);
  assert.equal(first.status, 0, first.stderr);
  const outputBytes = await readFile(output);
  assert.ok(outputBytes.length <= MAX_LEDGER_BYTES);
  assert.equal(outputBytes.toString('utf8').endsWith('\n'), true);
  assert.equal(await readFile(input, 'utf8'), sourceBytes.toString('utf8'));

  const reread = runCli(['--input', output, '--now', NOW]);
  assert.equal(reread.status, 0, reread.stderr);
  assert.equal(JSON.parse(reread.stdout).recordCount, 10_000);
  const retryOutput = path.join(dir, 'large-replacement-retry.json');
  const retry = runCli(['--input', output, '--now', NOW, '--output', retryOutput, '--expect-sha256', digest(outputBytes)]);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).removedCount, 0);
  assert.deepEqual(JSON.parse(await readFile(retryOutput, 'utf8')), source);
});
