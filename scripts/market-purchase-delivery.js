(function () {
  'use strict';

  const TRANSFER_DB = 'pixieed-market-import-v1';
  const TRANSFER_STORE = 'imports';
  let crcTable = null;

  function normalizePath(value, fallback = 'asset.bin') {
    const parts = String(value || '')
      .replaceAll('\\', '/')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .map((part) => part.normalize('NFC').replace(/[\u0000-\u001f:*?"<>|]/g, '_').slice(0, 120));
    return parts.join('/') || fallback;
  }

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1F),
      date: (((year - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F)
    };
  }

  async function buildZipBlob(tasks) {
    if (!Array.isArray(tasks) || !tasks.length) throw new Error('ZIPに入れるファイルがありません。');
    if (tasks.length > 65535) throw new Error('ZIPのファイル数が多すぎます。');
    const encoder = new TextEncoder();
    const timestamp = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let localSize = 0;
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const filename = normalizePath(task.filename, `asset-${index + 1}.bin`);
      const filenameBytes = encoder.encode(filename);
      const bytes = new Uint8Array(await task.blob.arrayBuffer());
      const checksum = crc32(bytes);
      const local = new Uint8Array(30 + filenameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034B50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, timestamp.time, true);
      localView.setUint16(12, timestamp.date, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, bytes.length, true);
      localView.setUint32(22, bytes.length, true);
      localView.setUint16(26, filenameBytes.length, true);
      local.set(filenameBytes, 30);
      localParts.push(local, bytes);

      const central = new Uint8Array(46 + filenameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014B50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, timestamp.time, true);
      centralView.setUint16(14, timestamp.date, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, bytes.length, true);
      centralView.setUint32(24, bytes.length, true);
      centralView.setUint16(28, filenameBytes.length, true);
      centralView.setUint32(42, localSize, true);
      central.set(filenameBytes, 46);
      centralParts.push(central);
      localSize += local.length + bytes.length;
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(8, tasks.length, true);
    endView.setUint16(10, tasks.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, localSize, true);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = normalizePath(filename, 'pixieed-market.zip').replaceAll('/', '_');
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function openTransferDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(TRANSFER_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TRANSFER_STORE)) request.result.createObjectStore(TRANSFER_STORE, { keyPath: 'token' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('端末内の受け渡し領域を開けませんでした。'));
    });
  }

  async function stagePiXiEEDrawFile(blob, metadata = {}) {
    if (!(blob instanceof Blob)) throw new Error('PiXiEEDrawで開く素材を準備できませんでした。');
    const token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const db = await openTransferDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(TRANSFER_STORE, 'readwrite');
        transaction.objectStore(TRANSFER_STORE).put({
          token,
          blob,
          filename: normalizePath(metadata.filename, 'purchased.pixieedraw').split('/').pop(),
          assetId: String(metadata.assetId || ''),
          traceId: String(metadata.traceId || ''),
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000
        });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('PiXiEEDrawへの受け渡しを保存できませんでした。'));
        transaction.onabort = () => reject(transaction.error || new Error('PiXiEEDrawへの受け渡しが中断されました。'));
      });
    } finally {
      db.close();
    }
    return token;
  }

  window.PiXiEEDMarketDelivery = Object.freeze({
    buildZipBlob,
    normalizePath,
    saveBlob,
    stagePiXiEEDrawFile
  });
})();
