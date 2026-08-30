(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createBinaryCodecs() {
    function encodeInt16Rle(view) {
      const length = view.length;
      if (length === 0) {
        return { type: 'int16-rle', length: 0, values: new Int16Array(0), counts: new Uint32Array(0) };
      }
      const values = [];
      const counts = [];
      let current = view[0];
      let count = 1;
      for (let i = 1; i < length; i += 1) {
        const value = view[i];
        if (value === current) {
          count += 1;
        } else {
          values.push(current);
          counts.push(count);
          current = value;
          count = 1;
        }
      }
      values.push(current);
      counts.push(count);
      const valueArray = new Int16Array(values.length);
      for (let i = 0; i < values.length; i += 1) {
        valueArray[i] = values[i];
      }
      const countArray = new Uint32Array(counts.length);
      for (let i = 0; i < counts.length; i += 1) {
        countArray[i] = counts[i];
      }
      return { type: 'int16-rle', length, values: valueArray, counts: countArray };
    }

    function decodeInt16Data(source) {
      if (!source) {
        return new Int16Array(0);
      }
      if (source instanceof Int16Array) {
        return new Int16Array(source);
      }
      if (ArrayBuffer.isView(source) && source.BYTES_PER_ELEMENT === 2) {
        return new Int16Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
      }
      if (typeof source === 'object' && source.type === 'int16-rle') {
        const { length, values, counts } = source;
        const output = new Int16Array(length);
        let offset = 0;
        for (let i = 0; i < values.length; i += 1) {
          const runValue = values[i];
          const runLength = counts[i];
          output.fill(runValue, offset, offset + runLength);
          offset += runLength;
        }
        return output;
      }
      throw new Error('Unsupported Int16 encoding');
    }

    function encodeUint8Rle(view) {
      const length = view.length;
      if (length === 0) {
        return { type: 'uint8-rle', length: 0, values: new Uint8Array(0), counts: new Uint32Array(0) };
      }
      const values = [];
      const counts = [];
      let current = view[0];
      let count = 1;
      for (let i = 1; i < length; i += 1) {
        const value = view[i];
        if (value === current) {
          count += 1;
        } else {
          values.push(current);
          counts.push(count);
          current = value;
          count = 1;
        }
      }
      values.push(current);
      counts.push(count);
      const valueArray = new Uint8Array(values.length);
      for (let i = 0; i < values.length; i += 1) {
        valueArray[i] = values[i];
      }
      const countArray = new Uint32Array(counts.length);
      for (let i = 0; i < counts.length; i += 1) {
        countArray[i] = counts[i];
      }
      return { type: 'uint8-rle', length, values: valueArray, counts: countArray };
    }

    function decodeUint8Data(source, { clamped = false } = {}) {
      if (!source) {
        return clamped ? new Uint8ClampedArray(0) : new Uint8Array(0);
      }
      if (ArrayBuffer.isView(source) && source.BYTES_PER_ELEMENT === 1 && source.constructor !== Uint32Array) {
        const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
        return clamped ? new Uint8ClampedArray(buffer) : new Uint8Array(buffer);
      }
      if (typeof source === 'object' && source.type === 'uint8-rle') {
        const { length, values, counts } = source;
        const shouldClamp = Object.prototype.hasOwnProperty.call(source, 'clamped') ? Boolean(source.clamped) : clamped;
        const output = shouldClamp ? new Uint8ClampedArray(length) : new Uint8Array(length);
        let offset = 0;
        for (let i = 0; i < values.length; i += 1) {
          const runValue = values[i];
          const runLength = counts[i];
          output.fill(runValue, offset, offset + runLength);
          offset += runLength;
        }
        return output;
      }
      throw new Error('Unsupported Uint8 encoding');
    }

    function compressInt16Array(view) {
      if (!view) {
        return new Int16Array(0);
      }
      if (!(view instanceof Int16Array)) {
        view = new Int16Array(view);
      }
      const encoded = encodeInt16Rle(view);
      const encodedBytes = encoded.values.byteLength + encoded.counts.byteLength;
      if (encodedBytes >= view.byteLength) {
        return view.slice();
      }
      return encoded;
    }

    function compressUint8Array(view, { clamped = false } = {}) {
      if (!view) {
        return clamped ? new Uint8ClampedArray(0) : new Uint8Array(0);
      }
      const source = clamped && view instanceof Uint8ClampedArray ? view : new Uint8Array(view);
      const encoded = encodeUint8Rle(source);
      const encodedBytes = encoded.values.byteLength + encoded.counts.byteLength;
      const originalBytes = source.byteLength;
      if (encodedBytes >= originalBytes) {
        if (clamped) {
          return view instanceof Uint8ClampedArray ? view.slice() : new Uint8ClampedArray(source);
        }
        return source.slice ? source.slice() : new Uint8Array(source);
      }
      return { ...encoded, clamped: Boolean(clamped) };
    }

    function estimateEncodedByteLength(data, elementSize) {
      if (!data) return 0;
      if (ArrayBuffer.isView(data)) {
        return data.byteLength;
      }
      if (typeof data === 'object') {
        if (data.type === 'int16-rle' || data.type === 'uint8-rle') {
          const valuesBytes = data.values?.byteLength || 0;
          const countsBytes = data.counts?.byteLength || 0;
          return valuesBytes + countsBytes;
        }
        if (typeof data.length === 'number' && data.BYTES_PER_ELEMENT) {
          return data.length * data.BYTES_PER_ELEMENT;
        }
      }
      if (typeof data.length === 'number' && Number.isFinite(elementSize)) {
        return data.length * elementSize;
      }
      if (typeof data === 'string') {
        return data.length;
      }
      return 0;
    }

    function encodeTypedArray(view) {
      if (!view) return '';
      const bytes = view instanceof Uint8Array
        ? view
        : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      if (typeof bytes.toBase64 === 'function') {
        return bytes.toBase64();
      }
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return window.btoa(binary);
    }

    function decodeBase64(value) {
      if (typeof value !== 'string' || value.length === 0) {
        return new Uint8Array(0);
      }
      try {
        if (typeof Uint8Array.fromBase64 === 'function') {
          return Uint8Array.fromBase64(value);
        }
        const binary = window.atob(value);
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      } catch (error) {
        return new Uint8Array(0);
      }
    }

    return Object.freeze({
      encodeInt16Rle,
      decodeInt16Data,
      encodeUint8Rle,
      decodeUint8Data,
      compressInt16Array,
      compressUint8Array,
      estimateEncodedByteLength,
      encodeTypedArray,
      decodeBase64,
    });
  }

  root.binaryCodecs = Object.freeze({
    createBinaryCodecs,
  });
})();
