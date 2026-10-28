import { encodeRestore, decodeRestore, toBase64, decodeDataUrl, fromBase64, encodePixels, decodePixels, imageToArt, encodeDocument, decodeDocument } from './text-codec.mjs?rev=20261028-text-1';
self.onmessage = async ({ data: { operation, data, options = {} } }) => {
  try {
    let result;
    if (operation === 'encode') result = await encodeRestore(data, options.name, options.type);
    else if (operation === 'restore') result = await decodeRestore(data);
    else if (operation === 'base64') result = toBase64(data);
    else if (operation === 'dataurl') result = `data:${/^[\w.+-]+\/[\w.+-]+$/.test(options.type) ? options.type : 'application/octet-stream'};base64,${toBase64(data)}`;
    else if (operation === 'decode-dataurl') result = decodeDataUrl(data);
    else if (operation === 'decode-base64') result = { bytes: fromBase64(data), name: 'restored.bin', type: 'application/octet-stream', verified: false };
    else if (operation === 'pixels') result = encodePixels(data);
    else if (operation === 'decode-pixels') result = decodePixels(data);
    else if (operation === 'art') result = imageToArt(data, options);
    else if (operation === 'document') result = encodeDocument(data, options);
    else if (operation === 'decode-document') result = decodeDocument(data);
    else throw new Error('未対応の処理です。');
    self.postMessage({ ok: true, result });
  } catch (error) { self.postMessage({ ok: false, message: error?.message || '変換できませんでした。' }); }
};
