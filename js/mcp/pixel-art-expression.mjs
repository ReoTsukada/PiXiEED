const ENUMS = Object.freeze({
  purpose: ['auto', 'sprite', 'icon', 'illustration', 'tile'],
  projection: ['auto', 'front', 'three_quarter', 'side', 'top_down', 'isometric'],
  form: ['auto', 'realistic', 'stylized', 'geometric'],
  outline: ['auto', 'continuous', 'selective', 'none'],
  palette: ['auto', 'vivid', 'muted', 'limited'],
  lighting: ['auto', 'diffuse', 'directional', 'rim', 'emissive'],
  detail: ['auto', 'sparse', 'dense']
});
const LABELS = Object.freeze({
  purpose: ['用途', ['自動', 'スプライト', 'アイコン', 'イラスト', 'タイル']],
  projection: ['視点', ['自動', '正面', '斜め前', '側面', '俯瞰', 'アイソメトリック']],
  form: ['形の表現', ['自動', '写実寄り', 'デフォルメ', '幾何学的']],
  outline: ['輪郭', ['自動', '連続', '部分的', 'なし']],
  palette: ['色調', ['自動', '鮮やか', '落ち着いた', '色数を抑える']],
  lighting: ['光', ['自動', '拡散光', '指向性', 'リムライト', '発光']],
  detail: ['情報量', ['自動', '少なめ', '多め']]
});
export const EXPRESSION_FIELDS = Object.freeze(Object.entries(ENUMS).map(([key, options]) => Object.freeze({
  key,
  label: LABELS[key][0],
  options: Object.freeze(options.map((value, index) => Object.freeze({ value, label: LABELS[key][1][index] })))
})));

export const EXPRESSION_INPUT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  properties: {
    ...Object.fromEntries(Object.entries(ENUMS).map(([key, values]) => [key, { type: 'string', enum: values }])),
    occupancy: { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: {
      width: { type: 'integer', minimum: 1, maximum: 64 }, height: { type: 'integer', minimum: 1, maximum: 64 }
    } },
    background: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
  }
});

function fail(message) { throw new TypeError(message); }

export function normalizeExpression(input, width, height) {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('expressionはオブジェクトで指定してください。');
  const allowed = new Set([...Object.keys(ENUMS), 'occupancy', 'background']);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail('expressionに未対応の項目があります。');
  const expression = {};
  for (const [key, values] of Object.entries(ENUMS)) {
    const value = input[key] === undefined ? 'auto' : input[key];
    if (!values.includes(value)) fail(`expression.${key}は対応する値から指定してください。`);
    expression[key] = value;
  }
  if (input.occupancy !== undefined) {
    const occupancy = input.occupancy;
    if (!occupancy || typeof occupancy !== 'object' || Array.isArray(occupancy) || Object.keys(occupancy).some((key) => !['width', 'height'].includes(key))) fail('expression.occupancyはwidthとheightのみ指定できます。');
    for (const key of ['width', 'height']) {
      if (!Number.isInteger(occupancy[key]) || occupancy[key] < 1 || occupancy[key] > 64) fail(`expression.occupancy.${key}は1〜64の整数で指定してください。`);
    }
    if (occupancy.width > width || occupancy.height > height) fail('expression.occupancyはキャンバス寸法以内で指定してください。');
    expression.occupancy = { width: occupancy.width, height: occupancy.height };
  }
  if (input.background !== undefined) {
    if (typeof input.background !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input.background)) fail('expression.backgroundは#RRGGBB形式で指定してください。');
    expression.background = input.background.toUpperCase();
  }
  return expression;
}

export function buildExpressionSteps(expression, width, height) {
  if (!expression) return [];
  const fieldLabels = Object.fromEntries(EXPRESSION_FIELDS.map(({ key, options }) => [key, Object.fromEntries(options.map(({ value, label }) => [value, label]))]));
  const choices = Object.keys(ENUMS).map((key) => `${LABELS[key][0]}: ${fieldLabels[key][expression[key]]}`).join('、');
  const guidance = {
    purpose: {
      sprite: 'ゲーム中の背景と実表示倍率で輪郭と向きを確かめます。動く場合は静止画の確認と別にコマ間も検証します。',
      icon: '小さく表示したときの識別を優先し、周辺の余白と隣り合うアイコンとの見分けを確認します。',
      illustration: '一枚絵として焦点と周辺の情報量を分け、視線の流れと大きな色面を組みます。',
      tile: 'タイルを繰り返して敷き、端の接続、反復の目立ち方、配置時の方向を確認します。単体表示だけでは完了にしません。'
    },
    projection: {
      front: '正面から見せる面を選び、重なる部品は前後を明確にします。',
      three_quarter: '正面と側面の見える割合を揃え、部品の向きと重なりを統一します。',
      side: '見える面の向きを揃え、部品の接合位置と重なりを確かめます。',
      top_down: '上から見える面と隠れる面を分け、配置の向きを揃えます。',
      isometric: '等角投影の軸と面の向きを全体で揃え、接合部も同じ投影に合わせます。'
    },
    form: {
      realistic: '実物の構造を参考にしつつ、識別に必要な形を画面寸法に合わせて選びます。',
      stylized: '印象を支える輪郭や比率を選んで強め、細部は主役の形を助ける分だけ残します。',
      geometric: '大きな面と角度を整理し、丸みや不規則さは題材に必要な箇所へ残します。'
    },
    outline: {
      continuous: '連続輪郭が背景からの分離に役立つ箇所と、内部の線の強さを見比べます。',
      selective: '境界が必要な箇所だけ輪郭を置き、光や接触に応じて途切れを調整します。',
      none: '輪郭線の代わりに隣接色や明暗差で形を分け、読みにくい境界だけ補います。'
    },
    palette: {
      vivid: '鮮やかさを焦点や意味のある色面へ配り、周囲との明度差も確認します。',
      muted: '落ち着いた彩度を基調にし、焦点に必要な色差やアクセントは残します。',
      limited: '使う色を整理しつつ、材質や隣接面の境界を保てる色は無理に統合しません。'
    },
    lighting: {
      diffuse: '柔らかな明暗で面を分け、輪郭に強い光を足しすぎないようにします。',
      directional: '光源の向きを決め、面ごとの明暗と接触影を同じ方向に揃えます。',
      rim: '輪郭光を受ける側を絞り、主役の外形と背景の分離に使います。',
      emissive: '発光の芯を明瞭にし、周囲へ回り込む光は接する面に必要な分だけ加えます。'
    },
    detail: {
      sparse: '少ない情報で読める大きな形を保ち、識別に欠かせない細部だけ残します。',
      dense: '細部を増やしても主役と補助情報の差を保ち、焦点から遠い箇所は整理します。'
    }
  };
  const selectedGuidance = Object.entries(guidance)
    .filter(([key]) => expression[key] !== 'auto')
    .map(([key, byValue]) => byValue[expression[key]])
    .filter(Boolean);
  const steps = [{
    id: 'expression', title: '表現の方向を選ぶ',
    body: `指定: ${choices}。各項目は題材と意図に合わせて調整します。autoは技法を固定しません。${selectedGuidance.length ? ` 指針: ${selectedGuidance.join(' ')}` : ''}`
  }];
  if (expression.occupancy) {
    const { width: subjectWidth, height: subjectHeight } = expression.occupancy;
    steps.push({ id: 'expression-occupancy', title: '主役の占有範囲を守る', body: `キャンバス${width}×${height}pxの中で主役は約${subjectWidth}×${subjectHeight}pxに収めます。小さな主役の指定をキャンバス拡大で置き換えず、余白と識別に必要な形をこの範囲内で調整します。` });
  }
  if (expression.background) steps.push({ id: 'expression-background', title: '指定背景との見え方を確かめる', body: `背景色${expression.background}上で、輪郭・色面・透明箇所の見分けやすさを原寸で確認します。背景色に合わせて必要な境界だけ調整します。` });
  return steps;
}
