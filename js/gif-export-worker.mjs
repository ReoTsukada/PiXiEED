import { encodeGif } from './pixel-lens/gif.mjs?v=20261001-animation-1';

self.onmessage = ({ data: { frames, delayMs, scale } }) => {
  try {
    // Frame objects keep their optional delayMs through postMessage; delayMs is the legacy fallback.
    const bytes = encodeGif(frames, { delayMs, scale });
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) { self.postMessage({ error: error.message || 'GIFを作成できませんでした。' }); }
};
