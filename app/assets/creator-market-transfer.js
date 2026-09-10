(() => {
  "use strict";

  // Creator AppからMarketへ端末内の生成物を一時的に渡す。
  // 認証・権利・決済は代替せず、Marketとサーバー側で再確認する。
  const DATABASE_NAME = "pixieed-market-project-transfers";
  const STORE_NAME = "transfers";
  const DATABASE_VERSION = 1;
  const TRANSFER_TTL_MS = 15 * 60 * 1000;
  const MAX_FILE_COUNT = 32;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
  const MAX_METADATA_STRING = 240;
  const SOURCE_KINDS = new Set(["DRAW", "AUDIO", "GAME", "WRITING", "VISUAL", "EXTERNAL"]);

  const safeString = (value, maximum = MAX_METADATA_STRING) => {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
  };

  const sourceKindFor = (value) => {
    const kind = safeString(value, 32).toUpperCase();
    if (SOURCE_KINDS.has(kind)) return kind;
    if (kind === "NOVEL" || kind === "TEXT" || kind === "DOCUMENT") return "WRITING";
    return "EXTERNAL";
  };

  const asFile = (value, name, type) => {
    if (!(value instanceof Blob)) return null;
    if (typeof File === "function" && value instanceof File) return value;
    try {
      return new File([value], String(name || "asset.bin"), {
        type: String(type || value.type || "application/octet-stream"),
        lastModified: Date.now(),
      });
    } catch (_error) {
      return value;
    }
  };

  const openDatabase = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("このブラウザではMarketへの引き渡しを利用できません"));
      return;
    }
    let request;
    try {
      request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("引き渡し保存を開けませんでした"));
  });

  const transferId = () => window.crypto?.randomUUID?.()
    || `creator-transfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  const normalizeEntries = (entries) => {
    const normalized = (Array.isArray(entries) ? entries : [])
      .map((entry, index) => {
        const value = entry && typeof entry === "object" && !Array.isArray(entry)
          ? entry
          : { file: entry };
        const file = asFile(value.file || value.blob, value.name || value.path, value.mimeType);
        if (!file) return null;
        const path = String(value.path || value.name || file.name || `asset-${index + 1}`)
          .replace(/[\\\u0000-\u001f]/g, "_")
          .slice(0, 180);
        return { file, path: path || `asset-${index + 1}` };
      })
      .filter(Boolean);
    if (!normalized.length || normalized.length > MAX_FILE_COUNT) {
      throw new Error(`Marketへ渡せるファイルは1〜${MAX_FILE_COUNT}件です`);
    }
    const totalBytes = normalized.reduce((sum, entry) => sum + entry.file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Marketへ渡せるファイルの合計は50MBまでです");
    }
    return normalized;
  };

  const safeMetadata = (metadata) => {
    const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const normalized = {};
    for (const key of ["kind", "projectId", "assetId", "projectName", "revisionId", "contentHash"]) {
      const item = safeString(value[key], key === "projectName" ? 160 : MAX_METADATA_STRING);
      if (item) normalized[key] = item;
    }
    return normalized;
  };

  const manifestFromFiles = (files, metadata, manifestId, runtime) => {
    const sourceKind = sourceKindFor(metadata.kind);
    const projectBacked = sourceKind !== "EXTERNAL" && Boolean(metadata.projectId);
    return runtime.createManifest({
      manifestId,
      selectionKind: projectBacked ? "TOOL_SET" : "EXTERNAL_BUNDLE",
      project: projectBacked ? {
        projectId: metadata.projectId,
        ...(metadata.revisionId ? { revisionId: metadata.revisionId } : {}),
        ...(metadata.projectName ? { name: metadata.projectName } : {}),
      } : null,
      entries: files.map((entry, index) => ({
        entryId: `file-${index + 1}`,
        sourceKind,
        source: {
          ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
          ...(metadata.assetId ? { assetId: metadata.assetId } : {}),
          ...(metadata.revisionId ? { revisionId: metadata.revisionId } : {}),
          ...(metadata.contentHash ? { contentHash: metadata.contentHash } : {}),
          path: entry.path,
          fileName: entry.file.name,
          mimeType: entry.file.type,
          byteLength: entry.file.size,
        },
        selection: { kind: "FILE", label: entry.path, locator: entry.path },
        provenance: {
          originKind: projectBacked ? "LOCAL_PROJECT" : "EXTERNAL_FILE",
          rightsStatus: "CREATOR_DECLARATION_REQUIRED",
        },
        capabilities: {},
        dependencyIds: [],
      })),
      dependencies: [],
      summary: { labels: [projectBacked ? "Projectの制作結果" : "外部ファイル"] },
    });
  };

  const put = async ({ entries, metadata = {} }) => {
    const runtime = window.PiXiEEDCreatorMarketDeliveryManifest;
    if (!runtime || typeof runtime.normalize !== "function" || typeof runtime.createManifest !== "function") {
      throw new Error("販売内容manifestの共通契約を読み込めませんでした");
    }
    const files = normalizeEntries(entries);
    const id = transferId();
    const createdAt = Date.now();
    const metadataRecord = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const normalizedMetadata = safeMetadata(metadataRecord);
    const suppliedManifest = metadataRecord.deliveryManifest ?? metadataRecord.delivery_manifest;
    const deliveryManifest = suppliedManifest === undefined
      ? manifestFromFiles(files, normalizedMetadata, `manifest:${id}`, runtime)
      : runtime.normalize(suppliedManifest);
    if (!deliveryManifest) {
      throw new Error("販売内容manifestを確認できません。権利・由来・依存関係を見直してください");
    }
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put({
          id,
          // fileは既存のPXD受け取り実装との互換用。新しい画面はfilesを優先する。
          file: files[0].file,
          files,
          metadata: { ...normalizedMetadata, deliveryManifest },
          createdAt,
          expiresAt: createdAt + TRANSFER_TTL_MS,
        });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Marketへの引き渡し保存に失敗しました"));
        transaction.onabort = () => reject(transaction.error || new Error("Marketへの引き渡しが中断されました"));
      });
      return id;
    } finally {
      database.close();
    }
  };

  const putFile = (file, metadata = {}) => put({
    entries: [{ file, path: metadata.path || file?.name }],
    metadata,
  });

  window.PiXiEEDCreatorMarketTransfer = Object.freeze({ put, putFile });
})();
