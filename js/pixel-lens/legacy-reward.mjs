import { hasSiteReward, isSiteRewardPolicyEnabled, mountSiteRewardUI, requireSiteReward, subscribeSiteReward } from '../ads/site-reward.mjs?rev=20261024-free-tools-1';
import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';

mountSiteRewardUI();
window.__pixieedLensRewardGate = (feature) => !isSiteRewardPolicyEnabled() || hasSiteReward() || requireSiteReward(feature);
window.__pixieedLensFreeGifFps = REWARD_LIMITS.lens.freeGifFps;
const note = document.querySelector('#lens-reward-note');
const fpsSelect = document.querySelector('#gifFpsSelect');
let previousFps = fpsSelect?.value || '10';
if (note) note.style.cssText = 'margin:0;padding:6px 10px;color:#465a5e;font-size:12px;line-height:1.45';

function renderNotice() {
  if (!note) return;
  note.hidden = !isSiteRewardPolicyEnabled();
  note.textContent = `静止画とPNG保存は無料です。GIFは${REWARD_LIMITS.lens.freeGifFps}FPSまで無料、${REWARD_LIMITS.lens.rewardGifFps}FPSは60分パスで利用できます。GIFの撮影時間は最大5秒です。`;
}

renderNotice();
subscribeSiteReward(renderNotice);

fpsSelect?.addEventListener('change', (event) => {
  if (!isSiteRewardPolicyEnabled()) {
    previousFps = fpsSelect.value;
    return;
  }
  const requested = Number(fpsSelect.value);
  if (requested > REWARD_LIMITS.lens.freeGifFps) {
    if (!window.__pixieedLensRewardGate('lens.gif-fps')) {
      fpsSelect.value = previousFps;
      event.stopImmediatePropagation();
      return;
    }
  }
  previousFps = fpsSelect.value;
}, true);
