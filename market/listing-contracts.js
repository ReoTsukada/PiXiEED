(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PiXiEEDMarketListingContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MODES = Object.freeze({
    SHOWCASE: 'showcase',
    ACQUIRE: 'acquire',
  });
  const USE_PRESETS = Object.freeze({
    VIEW_ONLY: 'view-only',
    USE_IN_WORK: 'use-in-work',
    MODIFY_AND_DERIVE: 'modify-and-derive',
  });
  const PARTICIPANT_ROLES = Object.freeze({
    OWNER: 'owner',
    CREATOR: 'creator',
    CREDIT_ONLY: 'credit-only',
  });
  const MIN_PAID_PRICE_YEN = 500;
  const PRICE_STEP_YEN = 100;
  const MAX_PRICE_YEN = 99_999_900;
  const MAX_PARTICIPANTS = 32;

  const text = (value, maximum = 160) => {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
  };
  const accountId = (value) => text(value, 120).replace(/[^a-zA-Z0-9._:@/-]/g, '_');
  const integer = (value) => {
    const normalized = String(value ?? '').replace(/[,，\s]/g, '');
    return /^[0-9]+$/.test(normalized) ? Number(normalized) : NaN;
  };

  function normalizePrice(value, { minimumPaid = MIN_PAID_PRICE_YEN, maximum = MAX_PRICE_YEN } = {}) {
    const parsed = integer(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    if (parsed === 0) return 0;
    const floor = Math.max(MIN_PAID_PRICE_YEN, Number(minimumPaid) || 0);
    const ceiling = Math.floor(maximum / PRICE_STEP_YEN) * PRICE_STEP_YEN;
    return Math.min(ceiling, Math.max(floor, Math.ceil(parsed / PRICE_STEP_YEN) * PRICE_STEP_YEN));
  }

  function normalizeParticipant(value, index = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = accountId(value.accountId ?? value.account_id);
    if (!id) return null;
    const role = Object.values(PARTICIPANT_ROLES).includes(value.role) ? value.role : PARTICIPANT_ROLES.CREATOR;
    const explicit = value.explicit === true;
    const accepted = value.accepted === true;
    const revenueShareBps = Number.isInteger(value.revenueShareBps)
      ? Math.max(0, Math.min(10_000, value.revenueShareBps))
      : null;
    return {
      participantId: text(value.participantId ?? `participant-${index + 1}`, 80),
      accountId: id,
      displayName: text(value.displayName ?? value.display_name, 80) || '制作参加者',
      role,
      explicit,
      accepted,
      ...(revenueShareBps === null ? {} : { revenueShareBps }),
    };
  }

  function normalizeParticipants(values, ownerAccountId) {
    const owner = accountId(ownerAccountId);
    const candidates = Array.isArray(values) ? values : [];
    const seen = new Set();
    const participants = [];
    candidates.slice(0, MAX_PARTICIPANTS).forEach((value, index) => {
      const participant = normalizeParticipant(value, index);
      if (!participant || !participant.explicit || !participant.accepted || seen.has(participant.accountId)) return;
      seen.add(participant.accountId);
      participants.push(participant);
    });
    if (owner && !seen.has(owner)) {
      participants.unshift({
        participantId: 'owner',
        accountId: owner,
        displayName: '出品者',
        role: PARTICIPANT_ROLES.OWNER,
        explicit: true,
        accepted: true,
        revenueShareBps: 10_000,
      });
    }
    return participants;
  }

  function buildListingPolicy(input = {}) {
    const mode = input.mode === MODES.SHOWCASE ? MODES.SHOWCASE : MODES.ACQUIRE;
    const usePreset = Object.values(USE_PRESETS).includes(input.usePreset)
      ? input.usePreset
      : USE_PRESETS.USE_IN_WORK;
    const acquisitionEnabled = mode === MODES.ACQUIRE;
    const priceYen = acquisitionEnabled ? normalizePrice(input.priceYen, input) : 0;
    const participants = normalizeParticipants(input.participants, input.ownerAccountId);
    const limited = input.limited === true && acquisitionEnabled && priceYen > 0
      ? { enabled: true, quantity: integer(input.limitedQuantity) }
      : { enabled: false };
    return {
      schema: `pixieed-listing-policy/v${SCHEMA_VERSION}`,
      mode,
      acquisitionEnabled,
      priceYen,
      usePreset,
      derivativeSalesAllowed: usePreset === USE_PRESETS.MODIFY_AND_DERIVE,
      participantPolicy: 'EXPLICIT_ONLY',
      participants,
      limited,
    };
  }

  function validateListingPolicy(policy) {
    const errors = [];
    if (!policy || typeof policy !== 'object') return ['出品設定を読み込めませんでした'];
    if (![MODES.SHOWCASE, MODES.ACQUIRE].includes(policy.mode)) errors.push('公開方法が不正です');
    if (!Number.isInteger(policy.priceYen) || policy.priceYen < 0) errors.push('価格が不正です');
    if (policy.acquisitionEnabled && policy.priceYen > 0 && (policy.priceYen < MIN_PAID_PRICE_YEN || policy.priceYen % PRICE_STEP_YEN !== 0)) {
      errors.push('有料価格は500円以上・100円単位で設定してください');
    }
    if (!policy.acquisitionEnabled && policy.priceYen !== 0) errors.push('見るだけの作品に価格は設定できません');
    if (policy.limited?.enabled && (!policy.acquisitionEnabled || policy.priceYen === 0)) errors.push('無料・見るだけの作品には取得数制限を設定できません');
    if (policy.limited?.enabled && (!Number.isInteger(policy.limited.quantity) || policy.limited.quantity < 1 || policy.limited.quantity > 100_000)) {
      errors.push('取得数は1〜100,000名で設定してください');
    }
    if (policy.participantPolicy !== 'EXPLICIT_ONLY') errors.push('制作参加者は明示登録方式でのみ扱います');
    if (!Array.isArray(policy.participants) || policy.participants.some((participant) => !participant.explicit || !participant.accepted)) {
      errors.push('制作参加者は明示登録と承認が必要です');
    }
    return errors;
  }

  function summarize(policy) {
    const value = policy || {};
    const mode = value.mode === MODES.SHOWCASE ? '見るだけ' : '取得できる';
    const price = value.mode === MODES.SHOWCASE || Number(value.priceYen) === 0
      ? '無料'
      : `${Number(value.priceYen).toLocaleString('ja-JP')}円`;
    const use = value.usePreset === USE_PRESETS.MODIFY_AND_DERIVE
      ? '加工・派生販売も可能'
      : value.usePreset === USE_PRESETS.USE_IN_WORK
        ? '作品に使える'
        : '見るだけ';
    return `${mode}・${price}・${use}`;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    MODES,
    USE_PRESETS,
    PARTICIPANT_ROLES,
    MIN_PAID_PRICE_YEN,
    PRICE_STEP_YEN,
    MAX_PRICE_YEN,
    normalizePrice,
    normalizeParticipant,
    normalizeParticipants,
    buildListingPolicy,
    validateListingPolicy,
    summarize,
  });
});
