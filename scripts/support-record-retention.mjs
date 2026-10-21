#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RETENTION_DAYS = 90;
export const MAX_LEDGER_BYTES = 1024 * 1024;
export const MAX_RECORDS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ROOT_KEYS = new Set(['schemaVersion', 'records']);
const RECORD_KEYS = new Set(['caseId', 'category', 'closedAt', 'legalHold']);
const HOLD_KEYS = new Set(['lawReference', 'reviewUntil']);
const CASE_ID = /^[A-Za-z0-9_-]{22,80}$/;
const LAW_REFERENCE = /^[A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]{1,24}){1,3}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CATEGORIES = new Set(['deletion', 'account', 'report']);
const USAGE = 'Usage: node scripts/support-record-retention.mjs --input PATH --now UTC [--output NEW_PATH --expect-sha256 HASH]';

function fail(message) { throw new Error(message); }
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} contains an unsupported field`);
}

export function parseUtcInstant(value, label = 'timestamp') {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) fail(`${label} must be a strict UTC instant`);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) fail(`${label} is invalid`);
  const normalized = new Date(millis).toISOString();
  const accepted = value.includes('.') ? normalized : normalized.replace('.000Z', 'Z');
  if (accepted !== value) fail(`${label} is invalid`);
  return millis;
}

export function validateSupportLedger(ledger, now) {
  const nowMs = typeof now === 'number' ? now : parseUtcInstant(now, '--now');
  if (!Number.isFinite(nowMs)) fail('--now is invalid');
  if (!isPlainObject(ledger)) fail('ledger must be an object');
  exactKeys(ledger, ROOT_KEYS, 'ledger');
  if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.records)) fail('ledger schema is invalid');
  if (ledger.records.length > MAX_RECORDS) fail('ledger has too many records');
  const seen = new Set();
  for (const record of ledger.records) {
    if (!isPlainObject(record)) fail('record must be an object');
    exactKeys(record, RECORD_KEYS, 'record');
    if (typeof record.caseId !== 'string' || !CASE_ID.test(record.caseId)) fail('caseId must be a bounded opaque ID');
    if (seen.has(record.caseId)) fail('duplicate caseId');
    seen.add(record.caseId);
    if (!CATEGORIES.has(record.category)) fail('category is invalid');
    if (record.closedAt !== null) {
      const closedAt = parseUtcInstant(record.closedAt, 'closedAt');
      if (closedAt > nowMs) fail('closedAt cannot be in the future');
    }
    if (Object.hasOwn(record, 'legalHold')) {
      if (!isPlainObject(record.legalHold)) fail('legalHold is invalid');
      exactKeys(record.legalHold, HOLD_KEYS, 'legalHold');
      if (typeof record.legalHold.lawReference !== 'string' || !LAW_REFERENCE.test(record.legalHold.lawReference)) {
        fail('legalHold requires a documented law-reference token');
      }
      parseUtcInstant(record.legalHold.reviewUntil, 'legalHold.reviewUntil');
    }
  }
  return ledger;
}

export function planSupportRecordRetention(ledger, now) {
  const nowMs = typeof now === 'number' ? now : parseUtcInstant(now, '--now');
  validateSupportLedger(ledger, nowMs);
  const eligible = [];
  const pendingCaseIds = [];
  const activeHoldReview = [];
  const expiredHoldReview = [];
  let notDueCount = 0;
  for (const record of ledger.records) {
    if (Object.hasOwn(record, 'legalHold')) {
      const reviewUntil = parseUtcInstant(record.legalHold.reviewUntil, 'legalHold.reviewUntil');
      const hold = { caseId: record.caseId, reviewUntil: new Date(reviewUntil).toISOString() };
      if (reviewUntil > nowMs) activeHoldReview.push(hold);
      else expiredHoldReview.push(hold);
      continue;
    }
    if (record.closedAt === null) {
      pendingCaseIds.push(record.caseId);
      continue;
    }
    const dueAt = parseUtcInstant(record.closedAt, 'closedAt') + RETENTION_DAYS * DAY_MS;
    if (nowMs >= dueAt) eligible.push({ caseId: record.caseId, dueAt: new Date(dueAt).toISOString() });
    else notDueCount += 1;
  }
  return Object.freeze({
    now: new Date(nowMs).toISOString(),
    recordCount: ledger.records.length,
    eligible,
    pendingCaseIds,
    notDueCount,
    activeHoldReview,
    expiredHoldReview,
  });
}

export function createSupportLedgerReplacement(ledger, now) {
  const plan = planSupportRecordRetention(ledger, now);
  const eligibleIds = new Set(plan.eligible.map((item) => item.caseId));
  return {
    schemaVersion: 1,
    records: ledger.records.filter((record) => !eligibleIds.has(record.caseId)),
  };
}

function parseArguments(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--help') return { help: true };
    if (!['--input', '--now', '--output', '--expect-sha256'].includes(option) || parsed[option]) fail('arguments are invalid');
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail('arguments are incomplete');
    parsed[option] = value;
    index += 1;
  }
  if (!parsed['--input'] || !parsed['--now']) fail(USAGE);
  if (Boolean(parsed['--output']) !== Boolean(parsed['--expect-sha256'])) fail('--output and --expect-sha256 must be supplied together');
  if (parsed['--expect-sha256'] && !/^[a-f0-9]{64}$/.test(parsed['--expect-sha256'])) fail('--expect-sha256 must be a lowercase SHA-256 digest');
  parseUtcInstant(parsed['--now'], '--now');
  return parsed;
}

async function readPrivateLedger(inputPath) {
  const absolute = path.resolve(inputPath);
  let before;
  try { before = await lstat(absolute); } catch { fail('input file is unavailable'); }
  if (before.isSymbolicLink() || !before.isFile()) fail('input must be a regular non-symlink file');
  if (before.size > MAX_LEDGER_BYTES) fail('input file is too large');
  let canonical;
  try { canonical = await realpath(absolute); } catch { fail('input file is unavailable'); }
  let handle;
  try { handle = await open(canonical, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); } catch { fail('input file is unavailable'); }
  let bytes;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > MAX_LEDGER_BYTES) fail('input file changed while opening');
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  let after;
  try { after = await lstat(absolute); } catch { fail('input file changed while reading'); }
  if (after.isSymbolicLink() || !after.isFile() || after.dev !== before.dev || after.ino !== before.ino || bytes.length > MAX_LEDGER_BYTES) {
    fail('input file changed while reading');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('input is not valid UTF-8'); }
  let ledger;
  try { ledger = JSON.parse(text); } catch { fail('input is not valid JSON'); }
  return { ledger, bytes, canonical };
}

async function createPrivateReplacement(outputPath, inputCanonical, replacement) {
  const absolute = path.resolve(outputPath);
  const parentPath = path.dirname(absolute);
  let realParent;
  try { realParent = await realpath(parentPath); } catch { fail('output directory is unavailable'); }
  let parentStat;
  try { parentStat = await lstat(realParent); } catch { fail('output directory is unavailable'); }
  if (!parentStat.isDirectory()) fail('output directory is not a directory');
  const canonicalOutput = path.join(realParent, path.basename(absolute));
  if (canonicalOutput === inputCanonical) fail('input and output paths must differ');
  try {
    const existing = await lstat(canonicalOutput);
    if (existing.isSymbolicLink()) fail('output must not be a symlink');
    fail('output already exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  // Keep valid maximum-size ledgers readable by the same 1 MiB input limit.
  const json = `${JSON.stringify(replacement)}\n`;
  if (Buffer.byteLength(json, 'utf8') > MAX_LEDGER_BYTES) fail('replacement is too large to be read safely');
  let handle;
  try {
    handle = await open(canonicalOutput, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    await handle.chmod(0o600);
    await handle.writeFile(json, 'utf8');
    await handle.sync();
  } catch {
    if (handle) await handle.close().catch(() => {});
    fail('replacement could not be written safely');
  }
  await handle.close();
  const stat = await lstat(canonicalOutput);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) fail('replacement permissions are unsafe');
}

function printJson(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

export async function runRetentionCli(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) { process.stdout.write(`${USAGE}\n`); return 0; }
  const { ledger, bytes, canonical } = await readPrivateLedger(options['--input']);
  const now = options['--now'];
  const plan = planSupportRecordRetention(ledger, now);
  if (!options['--output']) {
    printJson({ mode: 'dry-run', ...plan });
    return 0;
  }
  const actualDigest = createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== options['--expect-sha256']) fail('input SHA-256 did not match --expect-sha256');
  const replacement = createSupportLedgerReplacement(ledger, now);
  await createPrivateReplacement(options['--output'], canonical, replacement);
  printJson({ mode: 'replacement-written', inputSha256: actualDigest, removedCount: ledger.records.length - replacement.records.length, remainingCount: replacement.records.length });
  return 0;
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  runRetentionCli().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`Retention tool stopped safely: ${error.message}\n`);
    process.exitCode = 1;
  });
}
