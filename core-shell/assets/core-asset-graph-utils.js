(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const REFERENCE_MODES = Object.freeze(['LIVE', 'PINNED', 'REVIEW', 'FORKED']);

  function clone(value) {
    if (typeof structuredClone !== 'function') throw new Error('structuredClone is required for Asset Graph isolation.');
    return structuredClone(value);
  }

  function requireId(value, field) {
    if (typeof value !== 'string' || !value.trim() || value.length > 256) {
      throw Object.assign(new Error(`${field} must be a non-empty stable ID.`), { code: 'ASSET_GRAPH_ID_INVALID', field });
    }
    return value;
  }

  function requireMode(mode) {
    if (!REFERENCE_MODES.includes(mode)) throw Object.assign(new Error(`Unsupported reference mode: ${mode}`), { code: 'ASSET_GRAPH_MODE_UNSUPPORTED' });
    return mode;
  }

  function createCoreAssetGraph() {
    const graph = {
      assets: {},
      blobs: {},
      references: {},
    };

    function registerBlob({ contentHash, byteLength, mimeType = 'application/octet-stream' } = {}) {
      requireId(contentHash, 'contentHash');
      if (!/^[0-9a-f]{64}$/i.test(contentHash)) throw Object.assign(new Error('contentHash must be a SHA-256 hex digest.'), { code: 'ASSET_GRAPH_HASH_INVALID' });
      if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw Object.assign(new Error('byteLength must be a non-negative safe integer.'), { code: 'ASSET_GRAPH_BYTE_LENGTH_INVALID' });
      const current = graph.blobs[contentHash];
      if (current) {
        if (current.byteLength !== byteLength || current.mimeType !== mimeType) throw Object.assign(new Error('Existing Blob metadata conflicts with content hash.'), { code: 'ASSET_GRAPH_BLOB_METADATA_CONFLICT' });
        return { created: false, blob: clone(current) };
      }
      const blob = { contentHash: contentHash.toLowerCase(), byteLength, mimeType };
      graph.blobs[contentHash] = blob;
      return { created: true, blob: clone(blob) };
    }

    function registerAsset({ assetId, kind, ownerId, provenance = null } = {}) {
      requireId(assetId, 'assetId');
      requireId(kind, 'kind');
      requireId(ownerId, 'ownerId');
      if (graph.assets[assetId]) throw Object.assign(new Error(`Asset already exists: ${assetId}`), { code: 'ASSET_GRAPH_ASSET_DUPLICATE' });
      graph.assets[assetId] = {
        assetId,
        kind,
        ownerId,
        status: 'active',
        latestRevisionId: null,
        revisions: {},
        provenance: provenance ? clone(provenance) : null,
      };
      return clone(graph.assets[assetId]);
    }

    function publishRevision({ assetId, revisionId, contentHash, blobRef = null, parentRevisionId = null, metadata = {} } = {}) {
      requireId(assetId, 'assetId');
      requireId(revisionId, 'revisionId');
      requireId(contentHash, 'contentHash');
      const asset = graph.assets[assetId];
      if (!asset) throw Object.assign(new Error(`Asset not found: ${assetId}`), { code: 'ASSET_GRAPH_ASSET_NOT_FOUND' });
      if (asset.status !== 'active') throw Object.assign(new Error(`Asset is not active: ${assetId}`), { code: 'ASSET_GRAPH_ASSET_TOMBSTONED' });
      if (!graph.blobs[contentHash]) throw Object.assign(new Error(`Blob is not registered: ${contentHash}`), { code: 'ASSET_GRAPH_BLOB_NOT_FOUND' });
      if (asset.revisions[revisionId]) throw Object.assign(new Error(`Revision already exists: ${revisionId}`), { code: 'ASSET_GRAPH_REVISION_DUPLICATE' });
      if (Object.values(asset.revisions).some(revision => revision.contentHash === contentHash)) throw Object.assign(new Error('Identical content already has a revision for this Asset.'), { code: 'ASSET_GRAPH_REVISION_CONTENT_DUPLICATE' });
      if (parentRevisionId !== null && !asset.revisions[parentRevisionId]) throw Object.assign(new Error(`Parent revision not found: ${parentRevisionId}`), { code: 'ASSET_GRAPH_PARENT_REVISION_NOT_FOUND' });
      const revision = {
        revisionId,
        assetId,
        contentHash: contentHash.toLowerCase(),
        blobRef: blobRef ? clone(blobRef) : { contentHash: contentHash.toLowerCase() },
        parentRevisionId,
        metadata: clone(metadata),
        immutable: true,
      };
      asset.revisions[revisionId] = revision;
      asset.latestRevisionId = revisionId;
      return clone(revision);
    }

    function assertRevision(assetId, revisionId) {
      const asset = graph.assets[assetId];
      if (!asset) throw Object.assign(new Error(`Asset not found: ${assetId}`), { code: 'ASSET_GRAPH_ASSET_NOT_FOUND' });
      if (!asset.revisions[revisionId]) throw Object.assign(new Error(`Revision not found: ${revisionId}`), { code: 'ASSET_GRAPH_REVISION_NOT_FOUND' });
      return asset.revisions[revisionId];
    }

    function createReference({ edgeId, sourceId, targetAssetId, targetRevisionId = null, mode = 'LIVE', candidateRevisionId = null, derivedAssetId = null, licenseId = null } = {}) {
      requireId(edgeId, 'edgeId');
      requireId(sourceId, 'sourceId');
      requireId(targetAssetId, 'targetAssetId');
      requireMode(mode);
      if (graph.references[edgeId]) throw Object.assign(new Error(`Reference already exists: ${edgeId}`), { code: 'ASSET_GRAPH_REFERENCE_DUPLICATE' });
      const asset = graph.assets[targetAssetId];
      if (!asset) throw Object.assign(new Error(`Target Asset not found: ${targetAssetId}`), { code: 'ASSET_GRAPH_ASSET_NOT_FOUND' });
      if (mode === 'LIVE' && targetRevisionId !== null) assertRevision(targetAssetId, targetRevisionId);
      if (mode === 'PINNED' || mode === 'FORKED') assertRevision(targetAssetId, targetRevisionId);
      if (mode === 'REVIEW') assertRevision(targetAssetId, candidateRevisionId || targetRevisionId);
      if (mode === 'FORKED') requireId(derivedAssetId, 'derivedAssetId');
      const reference = {
        edgeId,
        sourceId,
        targetAssetId,
        targetRevisionId: mode === 'LIVE' ? (targetRevisionId || asset.latestRevisionId) : targetRevisionId,
        mode,
        candidateRevisionId: mode === 'REVIEW' ? (candidateRevisionId || targetRevisionId) : null,
        derivedAssetId: mode === 'FORKED' ? derivedAssetId : null,
        licenseId,
        approvedBy: null,
      };
      graph.references[edgeId] = reference;
      return clone(reference);
    }

    function transitionReference(edgeId, { mode, targetRevisionId = null, candidateRevisionId = null, derivedAssetId = null, approvedBy = null } = {}) {
      const reference = graph.references[edgeId];
      if (!reference) throw Object.assign(new Error(`Reference not found: ${edgeId}`), { code: 'ASSET_GRAPH_REFERENCE_NOT_FOUND' });
      requireMode(mode);
      const nextRevision = targetRevisionId || candidateRevisionId || reference.targetRevisionId;
      if (mode === 'PINNED') {
        assertRevision(reference.targetAssetId, targetRevisionId);
        requireId(approvedBy, 'approvedBy');
      }
      if (mode === 'REVIEW') assertRevision(reference.targetAssetId, candidateRevisionId || nextRevision);
      if (mode === 'FORKED') {
        assertRevision(reference.targetAssetId, targetRevisionId || reference.targetRevisionId);
        requireId(derivedAssetId, 'derivedAssetId');
      }
      reference.mode = mode;
      reference.targetRevisionId = mode === 'REVIEW' ? reference.targetRevisionId : nextRevision;
      reference.candidateRevisionId = mode === 'REVIEW' ? (candidateRevisionId || nextRevision) : null;
      reference.derivedAssetId = mode === 'FORKED' ? derivedAssetId : null;
      reference.approvedBy = mode === 'PINNED' ? approvedBy : null;
      return clone(reference);
    }

    function tombstoneAsset(assetId, reason = 'retired') {
      const asset = graph.assets[assetId];
      if (!asset) throw Object.assign(new Error(`Asset not found: ${assetId}`), { code: 'ASSET_GRAPH_ASSET_NOT_FOUND' });
      asset.status = 'tombstoned';
      asset.tombstoneReason = String(reason || 'retired');
      return clone(asset);
    }

    function snapshot() {
      return clone(graph);
    }

    function inspect() {
      return {
        assetCount: Object.keys(graph.assets).length,
        blobCount: Object.keys(graph.blobs).length,
        referenceCount: Object.keys(graph.references).length,
        modes: REFERENCE_MODES.reduce((result, mode) => ({ ...result, [mode]: Object.values(graph.references).filter(reference => reference.mode === mode).length }), {}),
      };
    }

    return Object.freeze({ registerBlob, registerAsset, publishRevision, createReference, transitionReference, tombstoneAsset, snapshot, inspect });
  }

  root.coreAssetGraphUtils = Object.freeze({ REFERENCE_MODES, createCoreAssetGraph });
})();
