import {
  REWARD_DURATION_MS, REWARD_WARNING_MS, SITE_REWARD_STORAGE_KEY,
  REWARDED_AD_UNIT
} from './site-reward-config.mjs?rev=20261016-color-capability-1';
import { rewardedAdsEnabled, featureRestrictionsEnabled } from './site-reward-rollout-v20261016.mjs';
import { createRewardedController } from './rewarded-controller.mjs?rev=20261016-color-capability-1';
import { createGptRewardedAdapter } from './gpt-rewarded-adapter.mjs?rev=20261016-gpt-command-ready-1';

const finiteTime = value => Number.isFinite(value) && value > 0 ? value : 0;
const FEATURE_LABELS = Object.freeze({
  draw: '描画', output: '画像出力', audio: '音楽（PiXiEEaudio）', music: '音楽（PiXiEEaudio）',
  camera: 'カメラ（PiXiEELENS）', lens: 'カメラ（PiXiEELENS）', puzzle: 'パズル', site: 'サイト全体'
});
const FEATURE_BENEFITS = Object.freeze({
  output: ['画像出力の追加枠', 'SVG・APNG・対応動画を新しく作成。生成済み項目は1件から8件までまとめて保存できます。'],
  audio: ['音楽（PiXiEEaudio）の追加枠', '基本音色4種類から56種類へ。シーケンサーは16列から128列になります。'],
  camera: ['カメラ（PiXiEELENS）の追加枠', 'GIFは3秒・10fpsから最大10秒・20fpsに。使用色は最大64色です。'],
  puzzle: ['パズルの追加枠', '無料の1回を使った後も追加ヒントを利用できます。']
});
export function getSiteRewardPresentation({ policyEnabled = false } = {}) {
  return policyEnabled
    ? Object.freeze({ openPeriod: false })
    : Object.freeze({
        openPeriod: true,
        title: '期間限定・全機能開放中',
        message: '機能制限なし・広告視聴不要',
        intro: '特典対象の機能を広告視聴なしで利用できます。広告が配信されない場合も、通常どおり利用できます。安全な最大値など各機能の技術上の上限は引き続き適用されます。',
        primaryAction: '制作を続ける'
      });
}
function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }

function parseRecord(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem?.(key) || 'null');
    if (!value || typeof value !== 'object') return { expiresAt: 0, receipts: [], grantedAt: null };
    return {
      expiresAt: finiteTime(value.expiresAt),
      receipts: Array.isArray(value.receipts) ? value.receipts.filter(item => typeof item === 'string').slice(-100) : [],
      grantedAt: finiteTime(value.grantedAt) || null
    };
  } catch { return { expiresAt: 0, receipts: [], grantedAt: null }; }
}

/**
 * Pure site reward state machine. Its only award input is the controller's
 * accepted-show `granted` receipt. Dependencies are injectable for unit tests.
 */
export function createSiteRewardService({
  storage = browserStorage(),
  eventTarget = globalThis.window,
  now = Date.now,
  createAdapter,
  enabled = rewardedAdsEnabled,
  restrictionsEnabled = featureRestrictionsEnabled,
  locks = globalThis.navigator?.locks,
  storageKey = SITE_REWARD_STORAGE_KEY,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  schedule = setInterval,
  cancelSchedule = clearInterval,
  timeoutSchedule = setTimeout,
  cancelTimeoutSchedule = clearTimeout
} = {}) {
  const makeAdapter = createAdapter || (options => createGptRewardedAdapter({
    ...options, enabled: Boolean(enabled), adUnitPath: REWARDED_AD_UNIT, windowRef, documentRef
  }));
  const sessionId = `sr-${Math.random().toString(36).slice(2)}-${Math.floor(now()).toString(36)}`;
  let memoryRecord = { expiresAt: 0, receipts: [], grantedAt: null };
  let record = parseRecord(storage, storageKey);
  let disposed = false;
  let ui = null;
  let timer = null;
  let requestedFeature = '';
  let warnedForExpiry = 0;
  let expiredNoticeFor = 0;
  let modalReleasedForAd = false;
  const listeners = new Set();
  const snapshot = () => {
    const current = parseRecord(storage, storageKey);
    // Keep the most recent usable state if persistence is inaccessible.
    record = current.expiresAt || current.receipts.length ? current : record;
    const remainingMs = Math.max(0, record.expiresAt - Number(now()));
    return Object.freeze({
      policyEnabled: Boolean(enabled && restrictionsEnabled),
      expiresAt: record.expiresAt || null,
      remainingMs,
      active: record.expiresAt > Number(now()),
      grantedAt: record.grantedAt || null,
      receiptCount: record.receipts.length
    });
  };
  const publish = () => {
    const state = snapshot();
    for (const listener of [...listeners]) { try { listener(state); } catch { /* Isolate consumers. */ } }
    render();
  };
  const persist = next => {
    record = next; memoryRecord = next;
    try { storage?.setItem?.(storageKey, JSON.stringify(next)); } catch { /* In-memory behavior remains available for this page. */ }
  };
  const serialized = callback => {
    if (locks?.request) return locks.request(`${storageKey}:grant`, { mode: 'exclusive' }, callback);
    // Without a cross-tab lock, an accepted ad could be consumed while a
    // competing tab overwrites its timer update. Callers prevent ad startup.
    return Promise.reject(new Error('Cross-tab reward serialization is unavailable.'));
  };
  const grant = ({ attempt }) => serialized(() => {
    const fresh = parseRecord(storage, storageKey);
    const base = fresh.expiresAt || fresh.receipts.length ? fresh : memoryRecord;
    const receipt = `${sessionId}:${attempt}`;
    if (base.receipts.includes(receipt)) return;
    const expiry = Math.max(Number(now()), base.expiresAt) + REWARD_DURATION_MS;
    persist({ expiresAt: expiry, receipts: [...base.receipts, receipt].slice(-100), grantedAt: Number(now()) });
    warnedForExpiry = 0; expiredNoticeFor = 0;
    publish();
  });
  const controller = createRewardedController({
    createAdapter: makeAdapter,
    onGrant: grant,
    onChange: publish,
    schedule: timeoutSchedule,
    cancelSchedule: cancelTimeoutSchedule
  });

  function render() {
    if (!ui || disposed) return;
    const state = snapshot();
    const presentation = getSiteRewardPresentation(state);
    const remaining = state.remainingMs;
    const mm = Math.floor(remaining / 60_000);
    const ss = Math.floor((remaining % 60_000) / 1000);
    ui.status.textContent = presentation.openPeriod ? '期間限定・全機能開放中' : state.active ? `リワード有効 ${mm}:${String(ss).padStart(2, '0')}` : 'リワードなし';
    ui.mobileStatus.textContent = presentation.openPeriod ? '開放中' : state.active ? `${mm}:${String(ss).padStart(2, '0')}` : '特典';
    ui.desktopStatus.textContent = presentation.openPeriod ? '開放中' : '特典を確認';
    ui.renew.setAttribute('aria-label', presentation.openPeriod
      ? '期間限定・全機能開放中。機能制限なし・広告視聴不要。詳細を確認'
      : `${state.active ? `リワード有効、残り約${Math.ceil(remaining / 60_000)}分` : 'リワードなし'}。詳細と延長`);
    ui.renew.hidden = !enabled;
    ui.renew.disabled = modalReleasedForAd;
    ui.message.textContent = presentation.openPeriod
      ? presentation.message
      : restrictionsEnabled
      ? state.active
        ? `このサイト全体のリワードが有効です。残り ${mm}分${String(ss).padStart(2, '0')}秒。`
        : 'リワードは有効ではありません。通常の機能はそのまま利用できます。'
      : 'このリワードは任意です。現在、機能制限は適用していません。描画・作成・保存・共有は広告を見なくても利用できます。';
    ui.remaining.textContent = state.active
      ? `残り ${mm}分${String(ss).padStart(2, '0')}秒`
      : state.expiresAt ? '期限切れ' : '未有効';
    ui.remaining.setAttribute('data-active', String(state.active));
    ui.remaining.hidden = presentation.openPeriod;
    ui.intro.textContent = presentation.openPeriod
      ? presentation.intro
      : restrictionsEnabled
      ? 'PiXiEEDrawをはじめ、対応する制作ツールで共通のリワードが60分間有効です。'
      : '広告視聴は任意です。リワードは60分間記録されますが、現在は機能制限を適用していません。描画・作成・保存・共有は広告を見なくても利用できます。広告が配信されない場合も、通常どおり利用できます。';
    ui.metrics.hidden = !restrictionsEnabled;
    ui.details.hidden = !restrictionsEnabled;
    ui.retention.hidden = !restrictionsEnabled;
    ui.title.textContent = presentation.openPeriod ? presentation.title : '広告1回で、サイト全体を60分拡張';
    ui.root.setAttribute('data-open-period', String(presentation.openPeriod));
    ui.dialog.setAttribute('aria-describedby', presentation.openPeriod ? 'site-reward-intro' : 'site-reward-intro site-reward-retention');
    ui.dialog.hidden = !ui.open;
    const descriptionIds = presentation.openPeriod ? 'site-reward-intro' : 'site-reward-intro site-reward-retention';
    ui.dialog.setAttribute('aria-describedby', descriptionIds);
    ui.card.setAttribute('aria-describedby', descriptionIds);
    ui.accept.textContent = state.active ? '同意して広告を見て60分延長' : '同意して広告を見る';
    ui.accept.hidden = presentation.openPeriod;
    ui.cancel.textContent = presentation.openPeriod ? presentation.primaryAction : '通常の制作を続ける';
    if (presentation.openPeriod) {
      ui.notice.hidden = true;
    } else if (state.active && remaining <= REWARD_WARNING_MS && warnedForExpiry !== state.expiresAt) {
      warnedForExpiry = state.expiresAt;
      ui.notice.textContent = 'リワードの有効期限が2分以内です。';
      ui.notice.hidden = false;
    } else if (!state.active && state.expiresAt && expiredNoticeFor !== state.expiresAt) {
      expiredNoticeFor = state.expiresAt;
      ui.notice.textContent = 'リワードの有効期限が切れました。通常の保存データはそのままです。';
      ui.notice.hidden = false;
    } else if (state.active && remaining > REWARD_WARNING_MS) ui.notice.hidden = true;
    ui.accept.disabled = presentation.openPeriod || controller.state.phase === 'loading' || controller.state.phase === 'showing';
    let feedback = '';
    if (presentation.openPeriod) feedback = '';
    else if (controller.state.phase === 'no-fill') feedback = '広告がありませんでした。少し後で再度お試しください。';
    else if (controller.state.phase === 'unsupported') feedback = 'この環境ではリワード広告を表示できません。';
    else if (controller.state.phase === 'error') feedback = '広告を準備できませんでした。リワードは付与されていません。';
    else if (controller.state.phase === 'granted') feedback = restrictionsEnabled ? 'リワードを受け取りました。サイト全体で60分間有効です。' : 'リワードを受け取りました。制作ツールは広告なしでも引き続き利用できます。';
    else if (controller.state.phase === 'loading') feedback = '広告を準備しています。';
    else if (controller.state.phase === 'showing') feedback = '広告を表示しています。';
    else if (controller.state.phase === 'closed') feedback = '広告を閉じました。リワードは付与されていません。';
    else if (controller.state.phase === 'timeout') feedback = '広告の応答がありませんでした。リワードは付与されていません。';
    if (ui.feedback.textContent !== feedback) ui.feedback.textContent = feedback;
  }

  function restoreConsentAfterAd() {
    if (!ui || disposed || !modalReleasedForAd) return;
    modalReleasedForAd = false;
    ui.open = true;
    documentRef?.dispatchEvent?.(new CustomEvent('pixieed:site-reward-open'));
    ui.setBackgroundInert?.(true);
    render();
    setTimeout(() => { if (ui?.open) ui.title?.focus?.({ preventScroll: true }); }, 0);
  }

  function mount() {
    if (ui || !documentRef?.body || disposed || !enabled) return ui?.root || null;
    const root = documentRef.createElement('aside');
    root.setAttribute('aria-label', 'PiXiEED リワード');
    root.innerHTML = `<style>
      .pixieed-site-reward{--reward-ink:#202b3c;--reward-muted:#596779;--reward-line:#dfe5eb;--reward-paper:#fff;--reward-tint:#f4f7fa;--reward-accent:#276c65;position:fixed;right:16px;bottom:16px;z-index:2147483000;color:var(--reward-ink);font:14px/1.5 system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif}
      .pixieed-site-reward *{box-sizing:border-box}
      .pixieed-site-reward [hidden]{display:none!important}
      .pixieed-site-reward [data-metrics][hidden],.pixieed-site-reward [data-details][hidden],.pixieed-site-reward [data-retention][hidden]{display:none}
      .pixieed-site-reward:has([data-dialog]:not([hidden])){z-index:2147483000}
      [data-header-entry-active] .pixieed-site-reward-status,[data-embedded-frame] .pixieed-site-reward-status{display:none}
      .pixieed-site-reward button{font:inherit;cursor:pointer;border:1px solid #aebac6;border-radius:10px;background:var(--reward-paper);color:inherit;padding:9px 13px}
      .pixieed-site-reward button:focus-visible{outline:3px solid #68a79e;outline-offset:3px}
      .pixieed-site-reward-status{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--reward-line);border-radius:12px;padding:8px 10px;box-shadow:0 3px 16px #18283b20}
      .pixieed-site-reward-status [data-status]{font-size:12px;color:var(--reward-muted)}
      .pixieed-site-reward-status [data-status]:empty{display:none}
      .pixieed-site-reward-status [data-renew]{border-color:#b8d1cb;color:#185e56;font-weight:650;padding:8px 12px}
      .pixieed-site-reward-notice{position:fixed;right:16px;bottom:68px;background:#fff8e7;border:1px solid #e6d29e;border-radius:10px;padding:10px 13px;max-width:min(360px,calc(100vw - 32px));box-shadow:0 3px 14px #18283b18;color:#483a1a}
      .pixieed-site-reward-dialog{position:fixed;inset:0;display:grid;place-items:center;background:#17223080;padding:20px}
      .pixieed-site-reward-dialog[hidden],.pixieed-site-reward-notice[hidden]{display:none}
      .pixieed-site-reward-card{width:min(700px,100%);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow:auto;background:var(--reward-paper);border:1px solid #e2e7ec;border-radius:20px;padding:clamp(20px,4vw,34px);box-shadow:0 20px 70px #10192355;text-align:left}
      .pixieed-site-reward-kicker-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px}
      .pixieed-site-reward-kicker{margin:0;color:var(--reward-accent);font-size:12px;font-weight:750;letter-spacing:.08em}
      .pixieed-site-reward-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:17px}
      .pixieed-site-reward-card h2{font:750 clamp(21px,4vw,28px)/1.3 system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;margin:0;color:var(--reward-ink);letter-spacing:normal;text-wrap:balance}
      .pixieed-site-reward-card h2:focus{outline:none}
      .pixieed-site-reward-clock{flex:none;padding:7px 10px;border-radius:999px;background:#eef5f2;color:#245b50;font-size:12px;font-weight:700;white-space:nowrap}
      .pixieed-site-reward-clock[data-active="false"]{background:#f1f3f5;color:#596779}
      .pixieed-site-reward-intro{margin:0 0 18px;color:var(--reward-muted);font-size:14px;line-height:1.7}
      .pixieed-site-reward-context{display:grid;gap:4px;margin:-4px 0 16px;padding:12px 14px;border:1px solid #cbded9;border-radius:12px;background:#f2f8f6;color:#334b46;font-size:13px;line-height:1.6}
      .pixieed-site-reward-context strong{color:#1d554d;font-size:13px}
      .pixieed-site-reward-context[hidden]{display:none}
      .pixieed-site-reward-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 20px}
      .pixieed-site-reward-metric{min-width:0;padding:14px 12px;border:1px solid #dfe8e5;border-radius:13px;background:#f7faf9}
      .pixieed-site-reward-metric-label{display:block;margin-bottom:7px;color:#52655f;font-size:12px;font-weight:650}
      .pixieed-site-reward-metric-value{display:flex;align-items:baseline;gap:5px;white-space:nowrap;font-size:clamp(17px,3.5vw,24px);font-weight:780;letter-spacing:-.04em;color:#1d554d}
      .pixieed-site-reward-metric-value span{color:#82908b;font-size:12px;font-weight:500;letter-spacing:0}
      .pixieed-site-reward-section-title{margin:0 0 9px;font-size:13px;font-weight:750;color:#303e4d}
      .pixieed-site-reward-benefits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}
      .pixieed-site-reward-benefit{padding:10px 11px;border-radius:10px;background:var(--reward-tint);font-size:12px;line-height:1.55;color:#344253}
      .pixieed-site-reward-benefit strong{display:block;margin-bottom:2px;color:#263849;font-size:12px}
      .pixieed-site-reward-details{margin-top:16px;border-top:1px solid #e8edf0;padding-top:11px}
      .pixieed-site-reward-details summary{width:max-content;max-width:100%;cursor:pointer;color:#315d57;font-size:12px;font-weight:700}
      .pixieed-site-reward-details summary:focus-visible{outline:3px solid #68a79e;outline-offset:3px;border-radius:3px}
      .pixieed-site-reward-details[open] summary{margin-bottom:14px}
      .pixieed-site-reward-detail{margin:14px 0 0;padding:12px 13px;border-left:3px solid #b7d3cd;background:#f7faf9;color:#506058;font-size:12px;line-height:1.65}
      .pixieed-site-reward-retention{margin:14px 0 0;color:#536071;font-size:12px;line-height:1.65}
      .pixieed-site-reward-message{margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#f3f6f8;color:#344253;font-size:13px;line-height:1.55}
      .pixieed-site-reward-feedback{min-height:1.4em;margin:8px 0 0;color:#235f56;font-size:13px;line-height:1.5}
      .pixieed-site-reward-actions{position:sticky;bottom:0;z-index:1;display:flex;gap:10px;justify-content:flex-end;margin-top:18px;padding:16px 0 2px;border-top:1px solid #e8edf0;background:#fff}
      .pixieed-site-reward-actions [data-cancel]{color:#344253}
      .pixieed-site-reward-actions [data-accept]{border-color:#276c65;background:#276c65;color:#fff;font-weight:700;padding-inline:17px}
      .pixieed-site-reward-actions [data-accept]:hover:not(:disabled){background:#205b55}
      .pixieed-site-reward-actions button:disabled{cursor:wait;opacity:.58}
      .pixieed-site-reward-mobile{display:none}
      @media(max-width:600px){
        .pixieed-site-reward{right:12px;top:calc(var(--px-header-height,56px) + 8px);bottom:auto;z-index:36}
        .pixieed-site-reward-status{gap:0;padding:0;background:transparent;border:0;box-shadow:none}
        .pixieed-site-reward-status [data-status]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .pixieed-site-reward-status [data-renew]{box-sizing:border-box;width:66px;height:38px;padding:0;border-radius:20px;background:#fff;box-shadow:0 2px 12px #18283b24}
        .pixieed-site-reward-desktop{display:none}
        .pixieed-site-reward-mobile{display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0 4px;font-size:11px;font-weight:700;white-space:nowrap}
        .pixieed-site-reward-notice{top:54px;bottom:auto;right:12px;max-width:calc(100vw - 24px)}
        .pixieed-site-reward-dialog{padding:12px;align-items:center}
        .pixieed-site-reward-card{max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);border-radius:17px;padding:20px 17px}
        .pixieed-site-reward-heading{gap:8px;margin-bottom:12px}
        .pixieed-site-reward-clock{padding:6px 8px;font-size:11px}
        .pixieed-site-reward-intro{font-size:13px;margin-bottom:14px}
        .pixieed-site-reward-metrics{gap:6px;margin-bottom:16px}
        .pixieed-site-reward-metric{padding:11px 8px;border-radius:11px}
        .pixieed-site-reward-metric-label{font-size:11px}
        .pixieed-site-reward-metric-value{gap:3px;font-size:clamp(15px,5vw,21px)}
        .pixieed-site-reward-metric-value span{font-size:10px}
        .pixieed-site-reward-benefits{gap:6px}
        .pixieed-site-reward-benefit{padding:9px;font-size:11px}
        .pixieed-site-reward-detail,.pixieed-site-reward-retention{font-size:11px}
        .pixieed-site-reward-actions{gap:8px;margin-top:14px;padding-top:13px}
        .pixieed-site-reward-actions button{padding:9px 10px;font-size:12px}
      }
      @media(max-width:360px){
        .pixieed-site-reward-card{padding:17px 13px}
        .pixieed-site-reward-card h2{font-size:20px}
        .pixieed-site-reward-metric{padding:10px 6px}
        .pixieed-site-reward-metric-value{font-size:15px}
        .pixieed-site-reward-benefits{grid-template-columns:1fr}
        .pixieed-site-reward-actions [data-accept]{padding-inline:8px}
      }
    </style><div class="pixieed-site-reward">
      <div class="pixieed-site-reward-status"><span data-status aria-live="off"></span><button type="button" data-renew aria-haspopup="dialog"><span class="pixieed-site-reward-desktop" data-desktop-status>特典を確認</span><span class="pixieed-site-reward-mobile" data-mobile-status aria-hidden="true">特典</span></button></div>
      <div class="pixieed-site-reward-notice" data-notice role="status" hidden></div>
      <div class="pixieed-site-reward-dialog" id="site-reward-dialog" data-dialog role="dialog" aria-modal="true" aria-labelledby="site-reward-title" hidden>
        <section class="pixieed-site-reward-card" data-card aria-describedby="site-reward-intro site-reward-retention">
          <div class="pixieed-site-reward-kicker-row"><p class="pixieed-site-reward-kicker" data-requested></p><span class="pixieed-site-reward-clock" data-remaining data-active="false" role="status" aria-live="off">未有効</span></div>
          <div class="pixieed-site-reward-heading"><h2 id="site-reward-title" tabindex="-1">広告を見て、60分のリワード</h2></div>
          <p class="pixieed-site-reward-intro" id="site-reward-intro">広告視聴は任意です。リワードは60分間記録されますが、現在は機能制限を適用していません。描画・作成・保存・共有は広告を見なくても利用できます。広告が配信されない場合も、通常どおり利用できます。</p>
          <div class="pixieed-site-reward-context" data-context hidden><strong data-context-title></strong><span data-context-copy></span></div>
          <div class="pixieed-site-reward-metrics" data-metrics aria-label="描画の追加上限">
            <div class="pixieed-site-reward-metric"><span class="pixieed-site-reward-metric-label">使用できる色</span><strong class="pixieed-site-reward-metric-value">32 → 64<span>色</span></strong></div>
            <div class="pixieed-site-reward-metric"><span class="pixieed-site-reward-metric-label">レイヤー</span><strong class="pixieed-site-reward-metric-value">3 → 8<span>枚</span></strong></div>
            <div class="pixieed-site-reward-metric"><span class="pixieed-site-reward-metric-label">アニメのコマ</span><strong class="pixieed-site-reward-metric-value">16 → 128<span>コマ</span></strong></div>
          </div>
          <details class="pixieed-site-reward-details" data-details>
            <summary>ほかの機能と上限を確認</summary>
            <h3 class="pixieed-site-reward-section-title">ほかの制作ツールにも、60分の追加枠</h3>
            <ul class="pixieed-site-reward-benefits" data-benefits>
              <li class="pixieed-site-reward-benefit" data-benefit="output"><strong>画像をつくる・保存する</strong>SVG・APNG・対応動画の新規作成、静止画の整数倍拡大（長辺2048→4096px）、生成済み項目のまとめ保存1→8件</li>
              <li class="pixieed-site-reward-benefit" data-benefit="audio"><strong>音楽（PiXiEEaudio）</strong>基本音色4→56種類、シーケンサー16→128列。描画とカメラ（PiXiEELENS）の使用色も最大64色に</li>
              <li class="pixieed-site-reward-benefit" data-benefit="camera"><strong>カメラ（PiXiEELENS）</strong>GIFは3秒・10fps→最大10秒・20fps。使用色は最大64色</li>
              <li class="pixieed-site-reward-benefit" data-benefit="puzzle"><strong>パズルのヒント</strong>無料の1回を使った後も追加ヒントを利用</li>
            </ul>
            <p class="pixieed-site-reward-detail">色数は完全透明・未使用の色・合成色を除いた上限です。GIF・動画は各形式の安全なサイズ・画素数上限が適用されます。既存の原本や保存データは無断で縮小・変更しません。</p>
          </details>
          <p class="pixieed-site-reward-retention" data-retention id="site-reward-retention">期限が切れると追加枠はロックされます。追加枠で作った内容は読み取り専用で保持され、通常の保存データとプロジェクトのバックアップもそのままです。再度リワードを受け取ると追加枠を編集できます。</p>
          <p class="pixieed-site-reward-message" data-message></p><p class="pixieed-site-reward-feedback" data-feedback role="status" aria-live="polite"></p>
          <div class="pixieed-site-reward-actions"><button type="button" data-cancel>通常の制作を続ける</button><button type="button" data-accept>同意して広告を見る</button></div>
        </section>
      </div>
    </div>`;
    documentRef.body.append(root);
    try { if (windowRef?.top !== windowRef?.self) root.setAttribute('data-embedded-frame', ''); } catch { root.setAttribute('data-embedded-frame', ''); }
    const query = selector => root.querySelector(selector);
    ui = { root, status: query('[data-status]'), desktopStatus: query('[data-desktop-status]'), mobileStatus: query('[data-mobile-status]'), renew: query('[data-renew]'), notice: query('[data-notice]'),
      dialog: query('[data-dialog]'), requested: query('[data-requested]'), context: query('[data-context]'), contextTitle: query('[data-context-title]'), contextCopy: query('[data-context-copy]'), message: query('[data-message]'),
      remaining: query('[data-remaining]'), title: query('#site-reward-title'), card: query('[data-card]'), intro: query('#site-reward-intro'), metrics: query('[data-metrics]'), details: query('[data-details]'), retention: query('[data-retention]'), benefits: query('[data-benefits]'), feedback: query('[data-feedback]'), accept: query('[data-accept]'), cancel: query('[data-cancel]'), open: false, returnFocus: null, inertSiblings: new Map(), backgroundObserver: null };
    const setBackgroundInert = inert => {
      if (!documentRef.body?.children) return;
      if (inert) {
        const sync = () => {
          for (const node of documentRef.body.children) {
            if (node === root || !('inert' in node)) continue;
            if (!ui.inertSiblings.has(node)) ui.inertSiblings.set(node, node.inert);
            if (!node.inert) node.inert = true;
          }
        };
        sync();
        const Observer = documentRef.defaultView?.MutationObserver || globalThis.MutationObserver;
        if (!ui.backgroundObserver && Observer) {
          ui.backgroundObserver = new Observer(sync);
          ui.backgroundObserver.observe(documentRef.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
        }
      } else {
        ui.backgroundObserver?.disconnect(); ui.backgroundObserver = null;
        for (const [node, wasInert] of ui.inertSiblings) node.inert = wasInert;
        ui.inertSiblings.clear();
      }
    };
    ui.setBackgroundInert = setBackgroundInert;
    const close = () => {
      if (!ui.open) return;
      ui.open = false;
      if (['loading', 'ready'].includes(controller.state.phase)) controller.cancel();
      setBackgroundInert(false); render();
      documentRef?.dispatchEvent?.(new CustomEvent('pixieed:site-reward-close'));
      if (ui.returnFocus?.isConnected) ui.returnFocus.focus();
    };
    ui.renew.addEventListener('click', () => openConsent(requestedFeature || 'site'));
    query('[data-cancel]').addEventListener('click', close);
    ui.dialog.addEventListener('click', event => { if (event.target === ui.dialog) close(); });
    ui.dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...ui.dialog.querySelectorAll('summary,button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        .filter(element => {
          if (element.getAttribute('aria-hidden') === 'true') return false;
          for (let node = element; node && node !== ui.dialog; node = node.parentElement) {
            if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
          }
          return typeof element.getClientRects !== 'function' || element.getClientRects().length > 0;
        });
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && documentRef.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    ui.accept.addEventListener('click', async () => {
      if (!restrictionsEnabled) {
        render();
        return;
      }
      if (enabled && !locks?.request) {
        render();
        ui.feedback.textContent = 'この環境ではリワードを安全に同期できないため、広告を開始できません。通常の機能は利用できます。';
        return;
      }
      ui.feedback.textContent = '広告を準備しています。';
      render();
      await controller.run({
        optIn: true,
        onReady: ({ show }) => {
          // GPT can add its own body-level ad surface. Release inert modal
          // isolation before calling show so that surface remains interactive.
          modalReleasedForAd = true;
          ui.open = false; ui.setBackgroundInert(false); render();
          documentRef?.dispatchEvent?.(new CustomEvent('pixieed:site-reward-close'));
          if (!show()) {
            restoreConsentAfterAd();
            ui.feedback.textContent = '広告を開始できませんでした。リワードは付与されていません。';
            render();
          }
        },
        onRestore: restoreConsentAfterAd
      });
      restoreConsentAfterAd();
      render();
    });
    render();
    return root;
  }
  function openConsent(feature = 'site') {
    if (modalReleasedForAd) return false;
    const returnFocus = documentRef?.activeElement;
    requestedFeature = String(feature || 'site');
    mount();
    if (!ui) return false;
    ui.requested.textContent = `対象機能: ${FEATURE_LABELS[requestedFeature] || FEATURE_LABELS[requestedFeature.split('.')[0]] || '対象機能'}`;
    ui.returnFocus = returnFocus;
    const requestedKey = requestedFeature.split('.')[0];
    const featureKey = requestedKey === 'lens' ? 'camera' : requestedKey === 'music' ? 'audio' : requestedKey;
    const contextBenefit = FEATURE_BENEFITS[featureKey];
    ui.context.hidden = !restrictionsEnabled || !contextBenefit;
    if (contextBenefit) { ui.contextTitle.textContent = contextBenefit[0]; ui.contextCopy.textContent = contextBenefit[1]; }
    const benefitOrder = { draw: [], output: ['output'], audio: ['audio'], camera: ['camera'], puzzle: ['puzzle'] }[featureKey] || [];
    if (ui.benefits && benefitOrder.length) {
      const items = [...ui.benefits.children];
      const rank = item => { const index = benefitOrder.indexOf(item.getAttribute('data-benefit')); return index < 0 ? 100 : index; };
      items.sort((a, b) => rank(a) - rank(b));
      for (const item of items) ui.benefits.append(item);
    }
    ui.open = true;
    documentRef?.dispatchEvent?.(new CustomEvent('pixieed:site-reward-open'));
    setTimeout(() => { if (ui?.open) ui.title?.focus?.({ preventScroll: true }); }, 0);
    ui.setBackgroundInert(true); render();
    return true;
  }
  // Entitlement reports the actual receipt ledger. Feature access is handled
  // separately so an ads-only rollout never manufactures a reward receipt.
  function hasReward() { return !enabled || snapshot().active; }
  function requireReward(feature) {
    if (!enabled || !restrictionsEnabled || snapshot().active) return true;
    openConsent(feature);
    return false;
  }
  function onStorage(event) {
    if (event?.key !== storageKey) return;
    record = parseRecord(storage, storageKey); publish();
  }
  eventTarget?.addEventListener?.('storage', onStorage);
  if (enabled && documentRef?.body && typeof schedule === 'function') timer = schedule(() => {
    if (!disposed) publish();
  }, 1000);

  return {
    hasSiteReward: hasReward,
    requireSiteReward: requireReward,
    isSiteRewardPolicyEnabled: () => Boolean(enabled && restrictionsEnabled),
    getSiteRewardState: snapshot,
    subscribeSiteReward(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener); try { listener(snapshot()); } catch {}
      return () => listeners.delete(listener);
    },
    mountSiteRewardUI: mount,
    requestSiteReward: openConsent,
    dispose() {
      if (disposed) return;
      disposed = true; controller.dispose();
      if (timer !== null) { try { cancelSchedule(timer); } catch {} timer = null; }
      eventTarget?.removeEventListener?.('storage', onStorage);
      ui?.root?.remove(); ui = null; listeners.clear();
    }
  };
}

const siteReward = createSiteRewardService();
export const hasSiteReward = () => siteReward.hasSiteReward();
/** Synchronous access check; locked features open an opt-in dialog and stay blocked. */
export const requireSiteReward = feature => siteReward.requireSiteReward(feature);
export const isSiteRewardPolicyEnabled = () => siteReward.isSiteRewardPolicyEnabled();
export const getSiteRewardState = () => siteReward.getSiteRewardState();
export const subscribeSiteReward = listener => siteReward.subscribeSiteReward(listener);
export const mountSiteRewardUI = () => siteReward.mountSiteRewardUI();
export const requestSiteReward = feature => siteReward.requestSiteReward(feature);
