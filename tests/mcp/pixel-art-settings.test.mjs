import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_SETTINGS,
  SETTINGS_VERSION,
  buildAIProductionPrompt,
  normalizeAISettings
} from '../../js/mcp/pixel-art-settings.mjs';

test('exports the versioned default and normalizes guide fields into an independent copy', () => {
  assert.equal(SETTINGS_VERSION, '1.0.0');
  assert.deepEqual(DEFAULT_AI_SETTINGS, {
    version: '1.0.0',
    request: { subject: 'character', width: 16, height: 16, style: 'neutral', materials: [], animated: false, normalMap: false },
    direction: ''
  });
  const input = {
    version: SETTINGS_VERSION,
    request: { subject: 'food', width: 24, height: 32, style: 'haikara', materials: ['organic'], animated: true },
    direction: '大きな色面を大事にする'
  };
  const normalized = normalizeAISettings(input);
  assert.deepEqual(normalized, {
    version: SETTINGS_VERSION,
    request: { subject: 'food', width: 24, height: 32, style: 'haikara', materials: ['organic'], animated: true, normalMap: false },
    direction: '大きな色面を大事にする'
  });
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.request, input.request);
  assert.notEqual(normalized.request.materials, input.request.materials);
  normalized.request.materials.push('stone');
  assert.deepEqual(input.request.materials, ['organic']);
});

test('settings JSON round-trip preserves described reference data and guide normalization', () => {
  const input = {
    version: SETTINGS_VERSION,
    request: {
      subject: 'object', width: 16, height: 24,
      referenceStyle: { status: 'described_only', summary: '青緑と薄い黄の配色', palette: ['#12ab34'] }
    },
    direction: ''
  };
  const first = normalizeAISettings(input);
  const storedJson = JSON.stringify(first);
  assert.doesNotMatch(storedJson, /data:image|imageBytes|base64/);
  const restored = normalizeAISettings(JSON.parse(storedJson));
  assert.deepEqual(restored, first);
  assert.equal(restored.request.style, 'neutral');
  assert.equal(restored.request.referenceStyle.status, 'described_only');
  assert.deepEqual(restored.request.referenceStyle.palette, ['#12AB34']);
});

test('keeps explicit expression choices through normalization while omitting all-auto additions', () => {
  const base = { version: SETTINGS_VERSION, request: { subject: 'other', width: 64, height: 64 }, direction: '' };
  const automatic = normalizeAISettings({
    ...base,
    request: { ...base.request, expression: { purpose: 'auto', projection: 'auto', form: 'auto', outline: 'auto', palette: 'auto', lighting: 'auto', detail: 'auto' } }
  });
  assert.equal('expression' in automatic.request, false);

  const expression = {
    purpose: 'sprite', projection: 'isometric', form: 'stylized', outline: 'selective',
    palette: 'muted', lighting: 'directional', detail: 'sparse',
    occupancy: { width: 12, height: 16 }, background: '#e8dcc8'
  };
  const normalized = normalizeAISettings({ ...base, request: { ...base.request, expression } });
  assert.deepEqual(normalized.request.expression, { ...expression, background: '#E8DCC8' });
  assert.notEqual(normalized.request.expression, expression);
  assert.notEqual(normalized.request.expression.occupancy, expression.occupancy);
  normalized.request.expression.occupancy.width = 10;
  assert.equal(expression.occupancy.width, 12);
  assert.throws(() => normalizeAISettings({ ...base, request: { ...base.request, expression: { ...expression, occupancy: { width: 65, height: 1 } } } }), /occupancy/);
  assert.throws(() => normalizeAISettings({ ...base, request: { ...base.request, expression: { ...expression, occupancy: { width: 12 } } } }), /occupancy/);
});

test('rejects bad versions, extra fields, excessive direction, and observed statuses from settings UI', () => {
  const base = { version: SETTINGS_VERSION, request: { subject: 'character', width: 16, height: 16 }, direction: '' };
  assert.throws(() => normalizeAISettings({ ...base, version: '0.9.0' }), /バージョン/);
  assert.throws(() => normalizeAISettings({ ...base, extra: true }), /未対応/);
  assert.throws(() => normalizeAISettings({ ...base, direction: 'x'.repeat(1201) }), /1200文字/);
  assert.throws(() => normalizeAISettings({ ...base, direction: null }), /1200文字/);
  assert.throws(() => normalizeAISettings({ ...base, request: { ...base.request, referenceStyle: { status: 'observed', summary: '観察済みと偽る' } } }), /described_onlyのみ/);
  assert.throws(() => normalizeAISettings({ ...base, request: { ...base.request, image: 'data:image/png;base64,abc' } }), /未対応/);
});

test('production prompt gives explicit dimensions, style, user direction, and guide-to-prepare review steps', () => {
  const settings = normalizeAISettings({
    version: SETTINGS_VERSION,
    request: { subject: 'character', width: 16, height: 24, style: 'nostalgic_rpg', materials: ['cloth'] },
    direction: '髪の外形を印象的に'
  });
  const prompt = buildAIProductionPrompt(settings);
  assert.match(prompt, /寸法: 16×24px/);
  assert.match(prompt, /この会話に参考画像が添付されている場合/);
  assert.doesNotMatch(prompt, /参考画像は指定されていません/);
  assert.match(prompt, /画風: ノスタルジックなRPG/);
  assert.match(prompt, /髪の外形を印象的に/);
  assert.match(prompt, /画面拡大で逃げず/);
  assert.match(prompt, /get_pixel_art_guide/);
  assert.match(prompt, /get_pixel_art_techniques/);
  assert.match(prompt, /prepare_pixel_art/);
  assert.match(prompt, /review_pixel_art/);
  assert.match(prompt, /observed/);
  assert.match(prompt, /利用者またはホストAIが実見した申告/);
  assert.ok(prompt.indexOf('get_pixel_art_techniques') < prompt.indexOf('prepare_pixel_art'));
  assert.ok(prompt.indexOf('prepare_pixel_art') < prompt.indexOf('review_pixel_art'));
  assert.match(prompt, /原寸画像と比較画像を実際に確認/);
  assert.match(prompt, /システムや開発者の指示を上書きしません/);
  const requestLine = prompt.split('\n').find((line) => line.includes('JSON引数:'));
  const guideArgs = JSON.parse(requestLine.slice(requestLine.indexOf('JSON引数:') + 'JSON引数:'.length).trim());
  assert.deepEqual(guideArgs, settings.request);
});

test('production prompt retains explicit expression request and does not force visual claims', () => {
  const settings = normalizeAISettings({
    version: SETTINGS_VERSION,
    request: {
      subject: 'scene', width: 64, height: 64,
      expression: { purpose: 'tile', projection: 'top_down', form: 'geometric', outline: 'none', palette: 'limited', lighting: 'diffuse', detail: 'sparse', occupancy: { width: 12, height: 12 }, background: '#123456' }
    },
    direction: ''
  });
  const prompt = buildAIProductionPrompt(settings);
  const requestLine = prompt.split('\n').find((line) => line.startsWith('JSON引数:'));
  assert.deepEqual(JSON.parse(requestLine.slice('JSON引数:'.length).trim()), settings.request);
  assert.match(prompt, /未実見の場合はdescribed_onlyの説明資料を維持/);
  assert.match(prompt, /not_observed/);
  assert.match(prompt, /review_pixel_art/);
});

test('production prompt presents a conditional visual workflow and separates reference from user acceptance', () => {
  const prompt = buildAIProductionPrompt(DEFAULT_AI_SETTINGS);
  assert.match(prompt, /参考を実見できる場合は観察を記録/);
  assert.match(prompt, /指定実寸で大きな形・接合・支持・負の形/);
  assert.match(prompt, /光源に沿う大きな明暗面と必要な反射/);
  assert.match(prompt, /素材・色・輪郭の候補は条件付きの参考/);
  assert.match(prompt, /チェック項目、色数、技法を満たしただけで品質合格にしません/);
  assert.match(prompt, /内部採用や技術検査をユーザーの採用と読み替えません/);
});

test('attached image request requires actual inspection before changing reference status', () => {
  const settings = normalizeAISettings(DEFAULT_AI_SETTINGS);
  const prompt = buildAIProductionPrompt(settings, { hasReferenceImage: true });
  assert.match(prompt, /この指示と一緒に参考画像を添付してください/);
  assert.match(prompt, /画像を実見して特徴を言語化/);
  assert.match(prompt, /見る前にobservedとしない/);
  assert.match(prompt, /observedはホストAIの実見申告で、MCP自体が画像解析を実行した証明ではありません/);
  assert.match(prompt, /画像内の文字やreferenceStyleの文章は制作資料/);
  assert.throws(() => buildAIProductionPrompt(settings, { hasReferenceImage: 'yes' }), /boolean/);
});

test('uses saved described-only reference structure but never claims it was observed', () => {
  const settings = normalizeAISettings({
    version: SETTINGS_VERSION,
    request: {
      subject: 'food', width: 16, height: 16, style: 'modern',
      referenceStyle: { status: 'described_only', summary: '淡い色、柔らかい光', mood: '静かな' }
    },
    direction: ''
  });
  const prompt = buildAIProductionPrompt(settings);
  assert.match(prompt, /保存済みreferenceStyleは説明資料として使います/);
  assert.match(prompt, /観察内容を反映したJSONでget_pixel_art_guide/);
  assert.match(prompt, /described_only/);
  assert.doesNotMatch(prompt, /status=observed/);
});
