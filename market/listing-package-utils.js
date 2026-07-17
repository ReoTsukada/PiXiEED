(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PiXiEEDMarketPackage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const hasSequence = (bytes, sequence) => {
    for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
      if (sequence.every((value, offset) => bytes[index + offset] === value)) return true;
    }
    return false;
  };
  const hasSignature = (bytes, signature) => signature.every((value, index) => bytes[index] === value);
  const extensionOf = (file) => (file.name.split('.').pop() || '').toLowerCase();
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  async function detectFormat(file) {
    const extension = extensionOf(file);
    const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer());
    const isPng = hasSignature(bytes, PNG_SIGNATURE);
    const isGif = hasSignature(bytes, [71, 73, 70, 56]);
    const isWebp = hasSignature(bytes, [82, 73, 70, 70])
      && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;

    if (extension === 'pixieedraw') return 'pixiedraw-project';
    if (extension === 'gif' && isGif) return 'gif';
    if (extension === 'webp' && isWebp) return 'webp';
    if ((extension === 'png' || extension === 'apng') && isPng) {
      if (extension === 'apng' || hasSequence(bytes, [97, 99, 84, 76])) return 'apng';
      if (/(?:sprite[-_ ]?(?:sheet|map)|sprites?)(?:[._ -]|$)/i.test(file.name)) return 'sprite-sheet-png';
      return 'png';
    }
    return null;
  }

  async function collectFilesFromHandle(handle, prefix = '') {
    if (!handle) return [];
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      return [{ file, path: `${prefix}${file.name}` }];
    }
    if (handle.kind !== 'directory') return [];
    const childPrefix = `${prefix}${handle.name}/`;
    const files = [];
    if (typeof handle.values === 'function') {
      for await (const child of handle.values()) files.push(...await collectFilesFromHandle(child, childPrefix));
      return files;
    }
    if (typeof handle.entries === 'function') {
      for await (const [, child] of handle.entries()) files.push(...await collectFilesFromHandle(child, childPrefix));
    }
    return files;
  }

  function decodeText(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function findStoredZipEntry(bytes, expectedName) {
    if (!hasSignature(bytes, [80, 75, 3, 4])) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
      const compressionMethod = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const nameEnd = nameStart + fileNameLength;
      const dataStart = nameEnd + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > bytes.length) return null;
      const name = decodeText(bytes.subarray(nameStart, nameEnd));
      if (name === expectedName) {
        if (compressionMethod !== 0) return null;
        return bytes.subarray(dataStart, dataEnd);
      }
      offset = dataEnd;
    }
    return null;
  }

  function previewDataUrlFromValue(value) {
    const candidates = [
      value?.previewThumbnail,
      value?.manifest?.previewThumbnail,
      value?.project?.previewThumbnail
    ];
    return candidates.find((candidate) => (
      typeof candidate === 'string'
      && candidate.length <= 400000
      && /^data:image\/png;base64,/i.test(candidate)
    )) || '';
  }

  function pngBlobFromDataUrl(dataUrl) {
    const encoded = String(dataUrl || '').replace(/^data:image\/png;base64,/i, '');
    if (!encoded) return null;
    let binary = '';
    try { binary = atob(encoded); } catch (_error) { return null; }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (!hasSignature(bytes, PNG_SIGNATURE)) return null;
    return new Blob([bytes], { type: 'image/png' });
  }

  async function extractPixieeDrawPreviewPng(file) {
    if (!file || typeof file.slice !== 'function') return null;
    const headerBytes = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
    let parsed = null;
    if (hasSignature(headerBytes, [80, 75, 3, 4])) {
      const manifestBytes = findStoredZipEntry(headerBytes, 'manifest.json');
      if (!manifestBytes) return null;
      try { parsed = JSON.parse(decodeText(manifestBytes)); } catch (_error) { return null; }
      if (parsed?.format !== 'pixieedraw' || Number(parsed?.version) !== 2) return null;
    } else {
      try { parsed = JSON.parse(await file.text()); } catch (_error) { return null; }
    }
    return pngBlobFromDataUrl(previewDataUrlFromValue(parsed));
  }

  return { detectFormat, collectFilesFromHandle, extractPixieeDrawPreviewPng };
});
