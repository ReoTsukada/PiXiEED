import { encodeGif } from './pixel-lens/gif.mjs?v=20260928-rewards-1';

self.onmessage = ({ data: { frames, delayMs, scale } }) => {
  try {
    const bytes = encodeGif(frames, { delayMs, scale });
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'GIFを作成できませんでした。' }); }
};
