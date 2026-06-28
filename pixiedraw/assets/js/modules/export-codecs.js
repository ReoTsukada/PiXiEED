(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportCodecs({
    clamp: clampValue = (value, min, max) => Math.min(Math.max(value, min), max),
    sanitizeFilename = value => String(value || 'export.bin'),
  } = {}) {
    let zipCrc32Table = null;

    function getZipCrc32Table() {
      if (zipCrc32Table) {
        return zipCrc32Table;
      }
      zipCrc32Table = new Uint32Array(256);
      for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
          value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        zipCrc32Table[index] = value >>> 0;
      }
      return zipCrc32Table;
    }

    function computeCrc32(bytes) {
      const table = getZipCrc32Table();
      let crc = 0xFFFFFFFF;
      for (let index = 0; index < bytes.length; index += 1) {
        crc = table[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function createZipDosDateTime(date = new Date()) {
      const year = Math.max(1980, date.getFullYear());
      const month = clampValue(date.getMonth() + 1, 1, 12);
      const day = clampValue(date.getDate(), 1, 31);
      const hours = clampValue(date.getHours(), 0, 23);
      const minutes = clampValue(date.getMinutes(), 0, 59);
      const seconds = clampValue(Math.floor(date.getSeconds() / 2), 0, 29);
      return {
        time: ((hours & 0x1F) << 11) | ((minutes & 0x3F) << 5) | (seconds & 0x1F),
        date: (((year - 1980) & 0x7F) << 9) | ((month & 0x0F) << 5) | (day & 0x1F),
      };
    }

    async function buildZipBlobFromTasks(tasks) {
      const encoder = new TextEncoder();
      const now = createZipDosDateTime(new Date());
      const localParts = [];
      const centralParts = [];
      let localSize = 0;
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index];
        const filename = sanitizeFilename(task.filename || `export_${index + 1}.bin`);
        const filenameBytes = encoder.encode(filename);
        const dataBytes = new Uint8Array(await task.blob.arrayBuffer());
        const crc32 = computeCrc32(dataBytes);
        const localHeader = new Uint8Array(30 + filenameBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034B50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, now.time, true);
        localView.setUint16(12, now.date, true);
        localView.setUint32(14, crc32, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, filenameBytes.length, true);
        localView.setUint16(28, 0, true);
        localHeader.set(filenameBytes, 30);
        localParts.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + filenameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014B50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, now.time, true);
        centralView.setUint16(14, now.date, true);
        centralView.setUint32(16, crc32, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, filenameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, localSize, true);
        centralHeader.set(filenameBytes, 46);
        centralParts.push(centralHeader);

        localSize += localHeader.length + dataBytes.length;
      }
      const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
      const endRecord = new Uint8Array(22);
      const endView = new DataView(endRecord.buffer);
      endView.setUint32(0, 0x06054B50, true);
      endView.setUint16(4, 0, true);
      endView.setUint16(6, 0, true);
      endView.setUint16(8, tasks.length, true);
      endView.setUint16(10, tasks.length, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, localSize, true);
      endView.setUint16(20, 0, true);
      return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
    }

    return Object.freeze({
      getZipCrc32Table,
      computeCrc32,
      createZipDosDateTime,
      buildZipBlobFromTasks,
    });
  }

  root.exportCodecs = Object.freeze({
    createExportCodecs,
  });
})();
