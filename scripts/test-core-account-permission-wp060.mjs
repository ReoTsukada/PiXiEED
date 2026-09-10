import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../core-shell/assets/core-account-permission-utils.js', import.meta.url));
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.coreAccountPermissionUtils;`);
const api = load(appWindow);

const account = api.createCoreAccountPermission({
  identities: [
    { principalId: 'user-owner', kind: 'user', authUserId: 'auth-owner', emailConfirmed: true },
    { principalId: 'creator-owner', kind: 'creator' },
    { principalId: 'user-editor', kind: 'user', authUserId: 'auth-editor', emailConfirmed: true },
    { principalId: 'user-buyer', kind: 'user', authUserId: 'auth-buyer', emailConfirmed: true },
    { principalId: 'user-stranger', kind: 'user', authUserId: 'auth-stranger', emailConfirmed: true },
    { principalId: 'user-suspended', kind: 'user', authUserId: 'auth-suspended', emailConfirmed: true, status: 'suspended' },
  ],
  resources: [
    { resourceType: 'project', resourceId: 'project-1', ownerPrincipalId: 'user-owner', visibility: 'private' },
    { resourceType: 'asset', resourceId: 'asset-1', ownerPrincipalId: 'creator-owner', visibility: 'private' },
    { resourceType: 'package', resourceId: 'package-1', ownerPrincipalId: 'user-owner', visibility: 'public' },
    { resourceType: 'market_product', resourceId: 'product-1', ownerPrincipalId: 'creator-owner', visibility: 'public' },
    { resourceType: 'market_product', resourceId: 'product-unverified', ownerPrincipalId: 'creator-owner', visibility: 'public' },
    { resourceType: 'market_purchase', resourceId: 'purchase-1', ownerPrincipalId: 'user-buyer', visibility: 'private' },
    { resourceType: 'entitlement', resourceId: 'entitlement-1', ownerPrincipalId: 'user-buyer', visibility: 'private' },
    { resourceType: 'post', resourceId: 'post-1', ownerPrincipalId: 'creator-owner', visibility: 'public' },
    { resourceType: 'commission', resourceId: 'commission-1', ownerPrincipalId: 'user-owner', visibility: 'private' },
    { resourceType: 'admin', resourceId: 'admin-console', visibility: 'private' },
  ],
  grants: [
    { grantId: 'project-editor-read', resourceType: 'project', resourceId: 'project-1', principalId: 'user-editor', role: 'editor', capabilities: ['read'], source: 'membership' },
    { grantId: 'product-seller-manage', resourceType: 'market_product', resourceId: 'product-1', principalId: 'creator-owner', role: 'seller', capabilities: ['manage', 'update', 'publish'], source: 'verified-seller' },
    { grantId: 'purchase-buyer-read', resourceType: 'market_purchase', resourceId: 'purchase-1', principalId: 'user-buyer', role: 'buyer', capabilities: ['read'], source: 'purchase-record' },
    { grantId: 'entitlement-buyer-download', resourceType: 'entitlement', resourceId: 'entitlement-1', principalId: 'user-buyer', role: 'buyer', capabilities: ['read', 'download'], source: 'purchase-entitlement' },
    { grantId: 'commission-requester', resourceType: 'commission', resourceId: 'commission-1', principalId: 'user-owner', role: 'requester', capabilities: ['read', 'negotiate', 'accept'], source: 'commission-participant' },
    { grantId: 'commission-creator', resourceType: 'commission', resourceId: 'commission-1', principalId: 'creator-owner', role: 'creator', capabilities: ['read', 'negotiate', 'deliver'], source: 'commission-participant' },
    { grantId: 'admin-reviewer', resourceType: 'admin', resourceId: 'admin-console', principalId: 'user-editor', role: 'reviewer', capabilities: ['read', 'review'], source: 'staff-role' },
  ],
  legacyMappings: [
    { system: 'legacy-draw', entityType: 'account', legacyId: 'old-owner', canonicalId: 'user-owner' },
  ],
});

const allowed = (principalId, type, id, action) => {
  const result = account.authorize({ principalId, resource: { type, id }, action });
  assert.equal(result.ok, true, `${principalId || 'anonymous'} should be allowed to ${action} ${type}:${id}`);
  assert.equal(result.decision, 'allow');
  return result;
};
const denied = (principalId, type, id, action, code = null) => {
  const result = account.authorize({ principalId, resource: { type, id }, action });
  assert.equal(result.ok, false, `${principalId || 'anonymous'} should be denied to ${action} ${type}:${id}`);
  assert.notEqual(result.decision, 'allow');
  if (code) assert.equal(result.diagnostics[0].code, code);
  return result;
};

allowed('user-owner', 'project', 'project-1', 'update');
allowed('user-editor', 'project', 'project-1', 'read');
denied('user-editor', 'project', 'project-1', 'publish', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
account.setGrantActive({ grantId: 'project-editor-read', active: false });
denied('user-editor', 'project', 'project-1', 'read', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
denied('user-stranger', 'project', 'project-1', 'read', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
allowed(null, 'package', 'package-1', 'read');
denied(null, 'project', 'project-1', 'read', 'ACCOUNT_PERMISSION_AUTHENTICATION_REQUIRED');
denied('user-suspended', 'project', 'project-1', 'read', 'ACCOUNT_PERMISSION_IDENTITY_NOT_ACTIVE');
denied('user-unknown', 'project', 'project-1', 'read', 'ACCOUNT_PERMISSION_IDENTITY_UNKNOWN');

allowed('creator-owner', 'market_product', 'product-1', 'manage');
denied('creator-owner', 'market_product', 'product-unverified', 'manage', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
allowed('user-buyer', 'market_purchase', 'purchase-1', 'read');
allowed('user-buyer', 'entitlement', 'entitlement-1', 'download');
denied('user-stranger', 'market_purchase', 'purchase-1', 'read', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
denied('user-buyer', 'market_product', 'product-1', 'manage', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');

allowed('user-owner', 'commission', 'commission-1', 'negotiate');
denied('user-owner', 'commission', 'commission-1', 'manage', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
allowed('creator-owner', 'commission', 'commission-1', 'deliver');
denied('creator-owner', 'commission', 'commission-1', 'purchase', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
denied('user-owner', 'post', 'post-1', 'manage', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');
allowed('user-editor', 'admin', 'admin-console', 'review');
denied('user-owner', 'admin', 'admin-console', 'review', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING');

const session = account.resolveSession({ authUserId: 'auth-owner', emailConfirmed: true });
assert.equal(session.principalId, 'user-owner');
assert.equal(session.identity.authUserId, 'auth-owner');
assert.equal(account.resolveSession({ authUserId: 'auth-unknown' }).principalId, null);
assert.equal(account.resolveSession({ isAnonymous: true }).anonymous, true);

assert.equal(account.resolveLegacyIdentity({ system: 'legacy-draw', entityType: 'account', legacyId: 'old-owner' }).canonicalId, 'user-owner');
const forwardQuarantine = account.mapLegacyIdentity({ system: 'legacy-draw', entityType: 'account', legacyId: 'old-owner', canonicalId: 'user-buyer' });
assert.equal(forwardQuarantine.status, 'QUARANTINED');
assert.equal(account.resolveLegacyIdentity({ system: 'legacy-draw', entityType: 'account', legacyId: 'old-owner' }).status, 'QUARANTINED');
const reverseQuarantine = account.mapLegacyIdentity({ system: 'legacy-draw', entityType: 'account', legacyId: 'new-owner', canonicalId: 'user-owner' });
assert.equal(reverseQuarantine.status, 'QUARANTINED');
assert.equal(account.snapshot().resources['market_product:product-1'].ownerPrincipalId, 'creator-owner', 'legacy conflict must not move ownership');
assert.throws(() => account.resolveQuarantinedLegacyMapping({ system: 'legacy-draw', entityType: 'account', legacyId: 'old-owner', canonicalId: 'user-buyer', resolutionActorId: 'operator-1', resolutionSource: 'automatic' }), /explicit admin/);
assert.equal(account.resolveQuarantinedLegacyMapping({ system: 'legacy-draw', entityType: 'account', legacyId: 'new-owner', canonicalId: 'user-stranger', resolutionActorId: 'operator-1' }).status, 'RESOLVED');
assert.equal(account.authorize({ principalId: 'user-owner', resource: { type: 'unknown', id: 'x' }, action: 'read' }).ok, false);
assert.equal(account.authorize({ principalId: 'user-owner', resource: { type: 'project', id: 'missing' }, action: 'read' }).decision, 'unknown');

assert.equal(account.inspect().identityCount, 6);
assert.equal(account.inspect().activeGrantCount, 6);
assert.equal(account.inspect().legacyQuarantineCount, 1);
assert.doesNotMatch(source, /\b(indexedDB|fetch|XMLHttpRequest|Date|Math\.random|user_metadata)\b/i, 'Account permission adapter must remain storage/network/time/random and untrusted-profile independent');
console.log('WP-060 Core Account/Permission tests passed: canonical identity, session mapping, scoped capabilities, public/private access, Market entitlement, commission separation, admin denial, legacy conflict, and unknown rejection');
