import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const modulePath = join(repoRoot, 'pixiedraw/assets/js/modules/core-account-permission-utils.js');
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.coreAccountPermissionUtils;`);
const api = load(appWindow);

const validClaims = {
  iss: 'https://example.supabase.co/auth/v1',
  aud: 'authenticated',
  sub: 'auth-user-a',
  session_id: 'session-a',
  exp: 200,
  role: 'authenticated',
  aal: 'aal2',
  is_anonymous: false,
};
const validate = (claims, options = {}) => api.validateSessionClaims({
  claims,
  expectedIssuer: validClaims.iss,
  expectedAudience: validClaims.aud,
  nowSeconds: 100,
  signatureVerified: true,
  ...options,
});

assert.equal(validate(validClaims).valid, true);
assert.equal(validate({ ...validClaims, aud: ['anon', 'authenticated'] }).valid, true);
assert.equal(validate({ ...validClaims, exp: 100 }).diagnostics[0].code, 'ACCOUNT_JWT_EXPIRED');
assert.equal(validate({ ...validClaims }, { signatureVerified: false }).diagnostics[0].code, 'ACCOUNT_JWT_SIGNATURE_INVALID');
assert.equal(validate({ ...validClaims, iss: 'https://other.example/auth/v1' }).diagnostics[0].code, 'ACCOUNT_JWT_ISSUER_MISMATCH');
assert.equal(validate({ ...validClaims, aud: 'other' }).diagnostics[0].code, 'ACCOUNT_JWT_AUDIENCE_MISMATCH');
assert.equal(validate({ ...validClaims, sub: '' }).diagnostics[0].code, 'ACCOUNT_JWT_SUB_MISSING');
assert.equal(validate({ ...validClaims, session_id: '' }).diagnostics[0].code, 'ACCOUNT_JWT_SESSION_ID_MISSING');
assert.equal(validate({ ...validClaims, role: 'admin' }).diagnostics[0].code, 'ACCOUNT_JWT_ROLE_UNKNOWN');
assert.equal(validate({ ...validClaims, aal: 'aal1' }, { requiredAal: 'aal2' }).diagnostics[0].code, 'ACCOUNT_JWT_AAL_INSUFFICIENT');
const tamperedProfileClaims = { ...validClaims, user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } };
assert.equal(validate(tamperedProfileClaims).valid, true, 'profile metadata is not treated as the authorization decision');

const account = api.createCoreAccountPermission({
  identities: [
    { principalId: 'user-a', kind: 'user', authUserId: 'auth-user-a', emailConfirmed: true },
    { principalId: 'user-buyer', kind: 'user', authUserId: 'auth-buyer', emailConfirmed: true },
    { principalId: 'user-reviewer', kind: 'user', authUserId: 'auth-reviewer', emailConfirmed: true },
    { principalId: 'user-finance', kind: 'user', authUserId: 'auth-finance', emailConfirmed: true },
    { principalId: 'user-seller', kind: 'user', authUserId: 'auth-seller', emailConfirmed: true },
    { principalId: 'user-stranger', kind: 'user', authUserId: 'auth-stranger', emailConfirmed: true },
  ],
  resources: [
    { resourceType: 'project', resourceId: 'project-1', visibility: 'private' },
    { resourceType: 'market_product', resourceId: 'product-1', visibility: 'public' },
    { resourceType: 'market_purchase', resourceId: 'purchase-1', visibility: 'private' },
    { resourceType: 'entitlement', resourceId: 'paid-entitlement-1', visibility: 'private' },
    { resourceType: 'subscription', resourceId: 'monthly-plan-1', visibility: 'private' },
    { resourceType: 'commission', resourceId: 'commission-1', visibility: 'private' },
    { resourceType: 'admin', resourceId: 'admin-console', visibility: 'private' },
  ],
  grants: [
    { grantId: 'project-editor-current', resourceType: 'project', resourceId: 'project-1', principalId: 'user-a', role: 'editor', capabilities: ['read', 'update'], source: 'database-membership' },
    { grantId: 'seller-current', resourceType: 'market_product', resourceId: 'product-1', principalId: 'user-seller', role: 'seller', capabilities: ['manage', 'publish'], source: 'database-seller-verification' },
    { grantId: 'purchase-buyer-current', resourceType: 'market_purchase', resourceId: 'purchase-1', principalId: 'user-buyer', role: 'buyer', capabilities: ['read'], source: 'database-purchase' },
    { grantId: 'paid-entitlement-current', resourceType: 'entitlement', resourceId: 'paid-entitlement-1', principalId: 'user-buyer', role: 'buyer', capabilities: ['read', 'download'], source: 'database-entitlement' },
    { grantId: 'subscription-current', resourceType: 'subscription', resourceId: 'monthly-plan-1', principalId: 'user-buyer', role: 'subscriber', capabilities: ['read'], source: 'database-subscription' },
    { grantId: 'reviewer-current', resourceType: 'admin', resourceId: 'admin-console', principalId: 'user-reviewer', role: 'market_reviewer', capabilities: ['read', 'market_review'], source: 'database-staff-role' },
    { grantId: 'finance-current', resourceType: 'admin', resourceId: 'admin-console', principalId: 'user-finance', role: 'finance_operator', capabilities: ['audit_read', 'payout_change', 'royalty_adjust'], source: 'database-staff-role' },
  ],
});

const allowed = (principalId, type, id, action) => account.authorize({ principalId, resource: { type, id }, action });
assert.equal(allowed('user-a', 'project', 'project-1', 'read').ok, true);
account.setGrantActive({ grantId: 'project-editor-current', active: false });
assert.equal(allowed('user-a', 'project', 'project-1', 'read').ok, false, 'current DB membership revocation must defeat a still-valid JWT');
assert.equal(validate(validClaims).valid, true, 'JWT validity does not make a stale membership authoritative');
assert.equal(allowed('user-seller', 'market_product', 'product-1', 'manage').ok, true);
assert.equal(allowed('user-stranger', 'market_product', 'product-1', 'manage').ok, false);
assert.equal(allowed('user-stranger', 'project', 'project-1', 'read').ok, false);
assert.equal(account.authorize({ principalId: 'user-a', resource: { type: 'project', id: 'project-999' }, action: 'read' }).decision, 'unknown');
assert.equal(allowed('user-buyer', 'entitlement', 'paid-entitlement-1', 'download').ok, true);
account.setGrantActive({ grantId: 'subscription-current', active: false });
assert.equal(allowed('user-buyer', 'subscription', 'monthly-plan-1', 'read').ok, false);
assert.equal(allowed('user-buyer', 'entitlement', 'paid-entitlement-1', 'download').ok, true, 'subscription revocation must not remove paid Market entitlement');
assert.equal(allowed('user-reviewer', 'admin', 'admin-console', 'market_review').ok, true);
assert.equal(allowed('user-reviewer', 'admin', 'admin-console', 'payout_change').ok, false);
assert.equal(allowed('user-finance', 'admin', 'admin-console', 'payout_change').ok, true);
assert.equal(allowed('user-finance', 'admin', 'admin-console', 'ownership_transfer').ok, false);
assert.equal(allowed('user-stranger', 'commission', 'commission-1', 'read').ok, false);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '_backup' || entry.name === 'build' || entry.name === 'dist') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(?:html|js|mjs|ts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const browserRoots = ['account', 'market', 'pixiedraw', 'pixfind', 'pixiee-lens', 'scripts'];
for (const root of browserRoots) {
  for (const path of await walk(join(repoRoot, root))) {
    if (path.includes('/test-')) continue;
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|\bservice_role\b/i, `service role secret must not reach browser source: ${path}`);
  }
}

const migrationFiles = await readdir(join(repoRoot, 'supabase/migrations'));
for (const file of migrationFiles.filter((name) => name.endsWith('.sql'))) {
  const text = await readFile(join(repoRoot, 'supabase/migrations', file), 'utf8');
  assert.doesNotMatch(text, /raw_user_meta_data/i, `raw user metadata must not be used in migration authorization: ${file}`);
  assert.doesNotMatch(text, /auth\.jwt\(\)[\s\S]{0,200}user_metadata|user_metadata[\s\S]{0,200}auth\.jwt\(\)/i, `Auth JWT user metadata must not be used in migration authorization: ${file}`);
}
const secureServer = await readFile(join(repoRoot, 'supabase/functions/_shared/market-stripe.ts'), 'utf8');
assert.match(secureServer, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(source, /user_metadata|service_role|auth\.role\(\)/i);
console.log('WP-060 supplemental security tests passed: JWT envelope failures, stale-JWT/current-DB revocation, subscription/paid-entitlement separation, scoped admin roles, ID substitution denial, browser service-role isolation, and untrusted metadata exclusion');
