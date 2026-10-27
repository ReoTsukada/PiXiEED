import { decodeExtraImage, encodeExtraImage, decodeExtraAudio, encodeExtraAudio } from './conversion-codecs.mjs?rev=20261028-formats-1';
self.onmessage = ({ data }) => {
  try {
    const methods = { 'decode-image': decodeExtraImage, 'encode-image': encodeExtraImage, 'decode-audio': decodeExtraAudio, 'encode-audio': encodeExtraAudio };
    const method = methods[data.operation]; if (!method) throw new Error('対応していない処理です。');
    const result = method(data.value, data.format);
    const transfer = result.data ? [result.data.buffer] : result.channels ? result.channels.map(c => c.buffer) : result.png ? [result.png.buffer] : [];
    self.postMessage({ result }, transfer);
  } catch (error) { self.postMessage({ error: error?.message || '変換できませんでした。元のファイルは変更していません。' }); }
};
