(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const IDENTITY_KINDS = Object.freeze(['user', 'creator', 'service']);
  const IDENTITY_STATUSES = Object.freeze(['active', 'suspended', 'deleted']);
  const RESOURCE_TYPES = Object.freeze([
    'project',
    'asset',
    'package',
    'market_product',
    'market_purchase',
    'entitlement',
    'subscription',
    'post',
    'community',
    'commission',
    'admin',
  ]);
  const RESOURCE_VISIBILITIES = Object.freeze(['private', 'public']);
  const KNOWN_ACTIONS = Object.freeze([
    'read',
    'create',
    'update',
    'delete',
    'publish',
    'manage',
    'invite',
    'export',
    'purchase',
    'download',
    'moderate',
    'review',
    'negotiate',
    'deliver',
    'accept',
    'refund',
    'payout_change',
    'royalty_adjust',
    'entitlement_grant',
    'legacy_identity_resolve',
    'ownership_transfer',
    'account_suspend',
    'audit_read',
    'support_read',
    'security_review',
    'copyright_review',
    'market_review',
  ]);

  const OWNER_CAPABILITIES = Object.freeze({
    project: Object.freeze(['read', 'update', 'delete', 'publish', 'manage', 'invite']),
    asset: Object.freeze(['read', 'update', 'publish', 'manage', 'export']),
    package: Object.freeze(['read', 'update', 'publish', 'manage', 'export']),
    market_product: Object.freeze(['read']),
    market_purchase: Object.freeze([]),
    entitlement: Object.freeze([]),
    subscription: Object.freeze([]),
    post: Object.freeze(['read', 'update', 'publish', 'manage']),
    community: Object.freeze(['read', 'update', 'manage']),
    commission: Object.freeze(['read']),
    admin: Object.freeze([]),
  });

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function fail(message, code, field = null) {
    throw Object.assign(new Error(message), { code, field });
  }

  function requireText(value, field, maxLength = 256) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
      fail(`${field} must be a non-empty stable string.`, 'ACCOUNT_PERMISSION_VALUE_INVALID', field);
    }
    return value.trim();
  }

  function requireEnum(value, field, values) {
    if (!values.includes(value)) fail(`${field} is unsupported: ${String(value)}`, 'ACCOUNT_PERMISSION_ENUM_INVALID', field);
    return value;
  }

  function normalizeCapabilities(capabilities) {
    if (!Array.isArray(capabilities)) fail('capabilities must be an array.', 'ACCOUNT_PERMISSION_CAPABILITIES_INVALID', 'capabilities');
    const normalized = [...new Set(capabilities.map((action) => requireText(action, 'capability', 64)))];
    for (const action of normalized) {
      if (!KNOWN_ACTIONS.includes(action)) fail(`Unsupported capability: ${action}`, 'ACCOUNT_PERMISSION_ACTION_UNSUPPORTED', 'capabilities');
    }
    return normalized.sort();
  }

  function legacyKey({ system, entityType, legacyId } = {}) {
    return [
      requireText(system, 'legacySystem', 64),
      requireText(entityType, 'legacyEntityType', 64),
      requireText(legacyId, 'legacyId', 256),
    ].join(':');
  }

  function validateSessionClaims({ claims, expectedIssuer, expectedAudience, nowSeconds, requiredAal = null, signatureVerified = true, allowedRoles = ['authenticated'] } = {}) {
    const diagnostics = [];
    const add = (code, message) => diagnostics.push({ code, severity: 'error', message });
    const isObject = claims && typeof claims === 'object' && !Array.isArray(claims);
    if (!isObject) return { valid: false, subject: null, sessionId: null, anonymous: false, diagnostics: [{ code: 'ACCOUNT_JWT_INVALID', severity: 'error', message: 'JWT claims must be an object.' }] };
    if (signatureVerified !== true) add('ACCOUNT_JWT_SIGNATURE_INVALID', 'JWT signature verification failed.');
    if (typeof expectedIssuer !== 'string' || !expectedIssuer.trim() || claims.iss !== expectedIssuer) add('ACCOUNT_JWT_ISSUER_MISMATCH', 'JWT issuer does not match the trusted project issuer.');
    const audienceMatches = Array.isArray(claims.aud) ? claims.aud.includes(expectedAudience) : claims.aud === expectedAudience;
    if (typeof expectedAudience !== 'string' || !expectedAudience.trim() || !audienceMatches) add('ACCOUNT_JWT_AUDIENCE_MISMATCH', 'JWT audience does not match the trusted audience.');
    if (typeof claims.sub !== 'string' || !claims.sub.trim()) add('ACCOUNT_JWT_SUB_MISSING', 'JWT subject is required.');
    if (typeof claims.session_id !== 'string' || !claims.session_id.trim()) add('ACCOUNT_JWT_SESSION_ID_MISSING', 'JWT session_id is required for session-bound authorization.');
    if (!Number.isSafeInteger(nowSeconds)) add('ACCOUNT_JWT_CLOCK_INVALID', 'A trusted current timestamp is required.');
    else if (!Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds) add('ACCOUNT_JWT_EXPIRED', 'JWT is expired or has no valid expiration.');
    if (typeof claims.role !== 'string' || !allowedRoles.includes(claims.role)) add('ACCOUNT_JWT_ROLE_UNKNOWN', 'JWT role is not an allowed user-session role.');
    if (!['aal1', 'aal2'].includes(claims.aal)) add('ACCOUNT_JWT_AAL_INVALID', 'JWT authentication assurance level is invalid.');
    if (requiredAal !== null && claims.aal !== requiredAal) add('ACCOUNT_JWT_AAL_INSUFFICIENT', `JWT authentication assurance level must be ${requiredAal}.`);
    if (typeof claims.is_anonymous !== 'undefined' && typeof claims.is_anonymous !== 'boolean') add('ACCOUNT_JWT_ANONYMOUS_INVALID', 'JWT anonymous marker must be boolean.');
    return {
      valid: diagnostics.length === 0,
      subject: typeof claims.sub === 'string' ? claims.sub : null,
      sessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
      anonymous: claims.is_anonymous === true,
      role: typeof claims.role === 'string' ? claims.role : null,
      aal: typeof claims.aal === 'string' ? claims.aal : null,
      diagnostics,
    };
  }

  function createCoreAccountPermission({ identities = [], resources = [], grants = [], legacyMappings = [] } = {}) {
    const state = {
      identities: Object.create(null),
      authUsers: Object.create(null),
      resources: Object.create(null),
      grants: Object.create(null),
      legacy: Object.create(null),
      legacyByCanonical: Object.create(null),
      legacyQuarantines: Object.create(null),
      audit: [],
    };

    function registerIdentity({ principalId, kind, authUserId = null, status = 'active', provider = null, emailConfirmed = false } = {}) {
      principalId = requireText(principalId, 'principalId');
      requireEnum(kind, 'kind', IDENTITY_KINDS);
      requireEnum(status, 'status', IDENTITY_STATUSES);
      if (authUserId !== null) authUserId = requireText(authUserId, 'authUserId');
      if (typeof emailConfirmed !== 'boolean') fail('emailConfirmed must be boolean.', 'ACCOUNT_PERMISSION_VALUE_INVALID', 'emailConfirmed');
      if (state.identities[principalId]) fail(`Identity already exists: ${principalId}`, 'ACCOUNT_PERMISSION_IDENTITY_DUPLICATE', 'principalId');
      if (authUserId && state.authUsers[authUserId]) fail(`Auth user is already mapped: ${authUserId}`, 'ACCOUNT_PERMISSION_AUTH_USER_DUPLICATE', 'authUserId');
      const identity = {
        principalId,
        kind,
        authUserId,
        status,
        provider: provider === null ? null : requireText(provider, 'provider', 64),
        emailConfirmed,
      };
      state.identities[principalId] = identity;
      if (authUserId) state.authUsers[authUserId] = principalId;
      return clone(identity);
    }

    function registerResource({ resourceType, resourceId, ownerPrincipalId = null, visibility = 'private', parent = null } = {}) {
      resourceType = requireEnum(resourceType, 'resourceType', RESOURCE_TYPES);
      resourceId = requireText(resourceId, 'resourceId');
      requireEnum(visibility, 'visibility', RESOURCE_VISIBILITIES);
      if (ownerPrincipalId !== null) {
        ownerPrincipalId = requireText(ownerPrincipalId, 'ownerPrincipalId');
        if (!state.identities[ownerPrincipalId]) fail(`Owner identity not found: ${ownerPrincipalId}`, 'ACCOUNT_PERMISSION_IDENTITY_UNKNOWN', 'ownerPrincipalId');
      }
      if (parent !== null) {
        if (!parent || typeof parent !== 'object') fail('parent must be an object or null.', 'ACCOUNT_PERMISSION_RESOURCE_INVALID', 'parent');
        requireEnum(parent.resourceType, 'parent.resourceType', RESOURCE_TYPES);
        requireText(parent.resourceId, 'parent.resourceId');
      }
      const key = `${resourceType}:${resourceId}`;
      if (state.resources[key]) fail(`Resource already exists: ${key}`, 'ACCOUNT_PERMISSION_RESOURCE_DUPLICATE', 'resourceId');
      const resource = { resourceType, resourceId, ownerPrincipalId, visibility, parent: parent ? clone(parent) : null };
      state.resources[key] = resource;
      return clone(resource);
    }

    function registerGrant({ grantId, resourceType, resourceId, principalId, role = null, capabilities = [], source = 'membership', active = true } = {}) {
      grantId = requireText(grantId, 'grantId');
      resourceType = requireEnum(resourceType, 'resourceType', RESOURCE_TYPES);
      resourceId = requireText(resourceId, 'resourceId');
      principalId = requireText(principalId, 'principalId');
      if (!state.resources[`${resourceType}:${resourceId}`]) fail(`Resource not found: ${resourceType}:${resourceId}`, 'ACCOUNT_PERMISSION_RESOURCE_UNKNOWN', 'resourceId');
      if (!state.identities[principalId]) fail(`Identity not found: ${principalId}`, 'ACCOUNT_PERMISSION_IDENTITY_UNKNOWN', 'principalId');
      if (state.grants[grantId]) fail(`Grant already exists: ${grantId}`, 'ACCOUNT_PERMISSION_GRANT_DUPLICATE', 'grantId');
      if (role !== null) role = requireText(role, 'role', 64);
      source = requireText(source, 'source', 64);
      if (typeof active !== 'boolean') fail('active must be boolean.', 'ACCOUNT_PERMISSION_VALUE_INVALID', 'active');
      const grant = { grantId, resourceType, resourceId, principalId, role, capabilities: normalizeCapabilities(capabilities), source, active };
      state.grants[grantId] = grant;
      return clone(grant);
    }

    function setGrantActive({ grantId, active } = {}) {
      grantId = requireText(grantId, 'grantId');
      if (typeof active !== 'boolean') fail('active must be boolean.', 'ACCOUNT_PERMISSION_VALUE_INVALID', 'active');
      const grant = state.grants[grantId];
      if (!grant) fail(`Grant not found: ${grantId}`, 'ACCOUNT_PERMISSION_GRANT_UNKNOWN', 'grantId');
      grant.active = active;
      return clone(grant);
    }

    function quarantineLegacy({ key, system, entityType, legacyId, requestedCanonicalId, existingCanonicalId = null, reason }) {
      const current = state.legacyQuarantines[key];
      if (current) return clone(current);
      const quarantine = {
        status: 'QUARANTINED',
        key,
        system,
        entityType,
        legacyId,
        requestedCanonicalId,
        existingCanonicalId,
        reason: requireText(reason, 'reason', 512),
        auditId: `legacy-quarantine:${key}`,
      };
      state.legacyQuarantines[key] = quarantine;
      state.audit.push({ auditId: quarantine.auditId, event: 'legacy_mapping_quarantined', key, reason: quarantine.reason });
      return clone(quarantine);
    }

    function mapLegacyIdentity({ system, entityType, legacyId, canonicalId } = {}) {
      const key = legacyKey({ system, entityType, legacyId });
      canonicalId = requireText(canonicalId, 'canonicalId');
      if (!state.identities[canonicalId]) fail(`Identity not found: ${canonicalId}`, 'ACCOUNT_PERMISSION_IDENTITY_UNKNOWN', 'canonicalId');
      const existing = state.legacy[key];
      if (existing && existing.canonicalId !== canonicalId) return quarantineLegacy({ key, system, entityType, legacyId, requestedCanonicalId: canonicalId, existingCanonicalId: existing.canonicalId, reason: 'forward_mapping_conflict' });
      const reverseKey = `${system}:${entityType}:${canonicalId}`;
      const reverse = state.legacyByCanonical[reverseKey];
      if (reverse && reverse !== key) return quarantineLegacy({ key, system, entityType, legacyId, requestedCanonicalId: canonicalId, existingCanonicalId: state.legacy[reverse]?.canonicalId || null, reason: 'reverse_mapping_conflict' });
      const mapping = { system, entityType, legacyId, canonicalId };
      state.legacy[key] = mapping;
      state.legacyByCanonical[reverseKey] = key;
      return clone(mapping);
    }

    function resolveQuarantinedLegacyMapping({ system, entityType, legacyId, canonicalId, resolutionActorId, resolutionSource = 'admin' } = {}) {
      const key = legacyKey({ system, entityType, legacyId });
      const quarantine = state.legacyQuarantines[key];
      if (!quarantine) fail(`Legacy mapping is not quarantined: ${key}`, 'ACCOUNT_PERMISSION_QUARANTINE_UNKNOWN', 'legacyId');
      canonicalId = requireText(canonicalId, 'canonicalId');
      resolutionActorId = requireText(resolutionActorId, 'resolutionActorId');
      if (resolutionSource !== 'admin') fail('Only an explicit admin resolution may clear a quarantine.', 'ACCOUNT_PERMISSION_QUARANTINE_RESOLUTION_FORBIDDEN', 'resolutionSource');
      if (!state.identities[canonicalId]) fail(`Identity not found: ${canonicalId}`, 'ACCOUNT_PERMISSION_IDENTITY_UNKNOWN', 'canonicalId');
      const reverseKey = `${system}:${entityType}:${canonicalId}`;
      if (state.legacyByCanonical[reverseKey] && state.legacyByCanonical[reverseKey] !== key) fail(`Canonical identity still has a conflicting legacy mapping: ${canonicalId}`, 'ACCOUNT_PERMISSION_LEGACY_REVERSE_CONFLICT', 'canonicalId');
      const previous = state.legacy[key];
      if (previous && previous.canonicalId !== canonicalId) delete state.legacyByCanonical[`${system}:${entityType}:${previous.canonicalId}`];
      const mapping = { system, entityType, legacyId, canonicalId };
      state.legacy[key] = mapping;
      state.legacyByCanonical[reverseKey] = key;
      delete state.legacyQuarantines[key];
      state.audit.push({ auditId: `legacy-resolve:${key}`, event: 'legacy_mapping_resolved', key, canonicalId, resolutionActorId });
      return { status: 'RESOLVED', mapping: clone(mapping) };
    }

    function resolveSession({ authUserId, isAnonymous = false, emailConfirmed = null } = {}) {
      if (isAnonymous === true) return { authenticated: true, anonymous: true, principalId: null, identity: null, diagnostics: [{ code: 'ACCOUNT_ANONYMOUS_SESSION', severity: 'info', message: 'Anonymous sessions have no canonical User identity.' }] };
      if (typeof authUserId !== 'string' || !authUserId.trim()) return { authenticated: false, anonymous: false, principalId: null, identity: null, diagnostics: [{ code: 'ACCOUNT_SESSION_MISSING', severity: 'error', message: 'An authenticated session is required.' }] };
      const principalId = state.authUsers[authUserId];
      if (!principalId) return { authenticated: true, anonymous: false, principalId: null, identity: null, diagnostics: [{ code: 'ACCOUNT_AUTH_USER_UNMAPPED', severity: 'error', message: 'The Auth user has no canonical identity mapping.' }] };
      const identity = state.identities[principalId];
      const diagnostics = [];
      if (identity.status !== 'active') diagnostics.push({ code: 'ACCOUNT_IDENTITY_NOT_ACTIVE', severity: 'error', message: `Identity status is ${identity.status}.` });
      if (emailConfirmed !== null && emailConfirmed !== identity.emailConfirmed) diagnostics.push({ code: 'ACCOUNT_SESSION_CONFIRMATION_MISMATCH', severity: 'error', message: 'Session confirmation does not match the trusted account projection.' });
      return { authenticated: true, anonymous: false, principalId, identity: clone(identity), diagnostics };
    }

    function resolveLegacyIdentity({ system, entityType, legacyId } = {}) {
      const key = legacyKey({ system, entityType, legacyId });
      if (state.legacyQuarantines[key]) return { ok: false, status: 'QUARANTINED', canonicalId: null, mapping: null, quarantine: clone(state.legacyQuarantines[key]), diagnostics: [{ code: 'ACCOUNT_LEGACY_MAPPING_QUARANTINED', severity: 'error', message: `Legacy mapping is quarantined: ${key}.` }] };
      const mapping = state.legacy[key];
      if (!mapping) return { ok: false, canonicalId: null, mapping: null, diagnostics: [{ code: 'ACCOUNT_LEGACY_ID_UNMAPPED', severity: 'error', message: `No legacy mapping exists for ${key}.` }] };
      return { ok: true, canonicalId: mapping.canonicalId, mapping: clone(mapping), diagnostics: [] };
    }

    function authorize({ principalId = null, resource, action, context = {} } = {}) {
      if (!resource || typeof resource !== 'object') return denial('deny', 'ACCOUNT_PERMISSION_RESOURCE_INVALID', 'A resource reference is required.');
      let resourceType;
      let resourceId;
      try {
        resourceType = requireEnum(resource.type || resource.resourceType, 'resource.type', RESOURCE_TYPES);
        resourceId = requireText(resource.id || resource.resourceId, 'resource.id');
        action = requireEnum(action, 'action', KNOWN_ACTIONS);
      } catch (error) {
        return denial('deny', error.code || 'ACCOUNT_PERMISSION_INPUT_INVALID', error.message);
      }
      const resourceRecord = state.resources[`${resourceType}:${resourceId}`];
      if (!resourceRecord) return denial('unknown', 'ACCOUNT_PERMISSION_RESOURCE_UNKNOWN', `Resource is not registered: ${resourceType}:${resourceId}`);
      if (principalId !== null && (typeof principalId !== 'string' || !principalId.trim())) return denial('deny', 'ACCOUNT_PERMISSION_PRINCIPAL_INVALID', 'principalId must be a stable canonical ID or null.');
      const identity = principalId === null ? null : state.identities[principalId];
      if (principalId !== null && !identity) return denial('deny', 'ACCOUNT_PERMISSION_IDENTITY_UNKNOWN', `Identity is not registered: ${principalId}`);
      if (identity && identity.status !== 'active') return denial('deny', 'ACCOUNT_PERMISSION_IDENTITY_NOT_ACTIVE', `Identity status is ${identity.status}.`);
      if (principalId === null && resourceRecord.visibility === 'public' && action === 'read') {
        return allow('ACCOUNT_PERMISSION_PUBLIC_READ', 'Public read is allowed without an account.');
      }
      if (!identity) return denial('deny', 'ACCOUNT_PERMISSION_AUTHENTICATION_REQUIRED', 'An active canonical identity is required for this action.');
      if (resourceRecord.ownerPrincipalId === principalId) {
        const ownerCapabilities = OWNER_CAPABILITIES[resourceType] || [];
        if (ownerCapabilities.includes(action)) return allow('ACCOUNT_PERMISSION_OWNER_CAPABILITY', `Owner capability ${action} is allowed.`);
      }
      const matchingGrants = Object.values(state.grants).filter((grant) => grant.active && grant.resourceType === resourceType && grant.resourceId === resourceId && grant.principalId === principalId);
      const grant = matchingGrants.find((candidate) => candidate.capabilities.includes(action));
      if (grant) return allow('ACCOUNT_PERMISSION_GRANT_CAPABILITY', `Grant ${grant.grantId} allows ${action}.`, { grantId: grant.grantId, role: grant.role, source: grant.source, context: clone(context) });
      return denial('deny', 'ACCOUNT_PERMISSION_CAPABILITY_MISSING', `No active grant allows ${action} on ${resourceType}:${resourceId}.`, { principalId, resourceType, resourceId, action });
    }

    function snapshot() {
      return clone({ identities: state.identities, resources: state.resources, grants: state.grants, legacy: state.legacy, legacyQuarantines: state.legacyQuarantines, audit: state.audit });
    }

    function inspect() {
      return {
        identityCount: Object.keys(state.identities).length,
        resourceCount: Object.keys(state.resources).length,
        activeGrantCount: Object.values(state.grants).filter((grant) => grant.active).length,
        legacyMappingCount: Object.keys(state.legacy).length,
        legacyQuarantineCount: Object.keys(state.legacyQuarantines).length,
        auditCount: state.audit.length,
      };
    }

    function denial(decision, code, message, metadata = {}) {
      return { ok: false, decision, diagnostics: [{ code, severity: 'error', message, metadata: clone(metadata) }] };
    }

    function allow(code, message, metadata = {}) {
      return { ok: true, decision: 'allow', diagnostics: [{ code, severity: 'info', message, metadata: clone(metadata) }] };
    }

    for (const identity of identities) registerIdentity(identity);
    for (const resource of resources) registerResource(resource);
    for (const grant of grants) registerGrant(grant);
    for (const mapping of legacyMappings) mapLegacyIdentity(mapping);

    return Object.freeze({
      registerIdentity,
      registerResource,
      registerGrant,
      setGrantActive,
      mapLegacyIdentity,
      resolveQuarantinedLegacyMapping,
      resolveSession,
      resolveLegacyIdentity,
      authorize,
      snapshot,
      inspect,
    });
  }

  root.coreAccountPermissionUtils = Object.freeze({
    IDENTITY_KINDS,
    IDENTITY_STATUSES,
    RESOURCE_TYPES,
    RESOURCE_VISIBILITIES,
    KNOWN_ACTIONS,
    OWNER_CAPABILITIES,
    validateSessionClaims,
    createCoreAccountPermission,
  });
})();
