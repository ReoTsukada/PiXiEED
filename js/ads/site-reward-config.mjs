/** Site-wide reward policy. Real rewarded delivery stays disabled until explicitly approved. */
export const REWARD_DURATION_MS = 60 * 60 * 1000;
export const REWARD_WARNING_MS = 2 * 60 * 1000;
export const SITE_REWARD_STORAGE_KEY = 'pixieed:site-reward:v1';
export const REWARDED_AD_UNIT = '/23379831154/pixieed_rewarded';
export const productionEnabled = false;

export const REWARD_LIMITS = Object.freeze({
  draw: Object.freeze({ colors: 32, rewardColors: 64, layers: 3, rewardLayers: 8, frames: 16, rewardFrames: 128 }),
  output: Object.freeze({ freeBatch: 1, rewardBatch: 8 }),
  staticImage: Object.freeze({ freeLongEdge: 2048, rewardLongEdge: 4096 }),
  audio: Object.freeze({ columns: 16, rewardColumns: 128 }),
  camera: Object.freeze({ freeGifSeconds: 3, freeGifFps: 10, rewardGifSeconds: 10, rewardGifFps: 20 }),
  lens: Object.freeze({ freeGifFps: 10, rewardGifFps: 30 }),
  puzzle: Object.freeze({ freeHints: 1 })
});
