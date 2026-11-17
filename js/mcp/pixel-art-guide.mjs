import {
  PIXEL_ART_STYLE_INPUT_PROPERTIES,
  buildPixelArtStyleSteps,
  getPixelArtStyleLimitations,
  normalizePixelArtStyle
} from './pixel-art-style.mjs';
import { EXPRESSION_INPUT_SCHEMA, buildExpressionSteps, normalizeExpression } from './pixel-art-expression.mjs';
import { selectPixelArtTechniques } from './pixel-art-techniques.mjs';

export const GUIDE_VERSION = '1.1.0';

const SUBJECTS = Object.freeze(['character', 'food', 'object', 'scene', 'other']);
const MATERIALS = Object.freeze(['cloth', 'metal', 'glass', 'organic', 'stone']);

export const PIXEL_ART_GUIDE_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'width', 'height'],
  properties: {
    subject: { type: 'string', enum: SUBJECTS, description: '主題の種類。' },
    width: { type: 'integer', minimum: 1, maximum: 64, description: 'キャンバス幅。1〜64。' },
    height: { type: 'integer', minimum: 1, maximum: 64, description: 'キャンバス高さ。1〜64。' },
    materials: { type: 'array', uniqueItems: true, maxItems: 4, items: { type: 'string', enum: MATERIALS }, description: '必要な材質。省略時は空配列。' },
    animated: { type: 'boolean', description: 'アニメーションを作る場合はtrue。省略時はfalse。' },
    normalMap: { type: 'boolean', description: '法線マップの利用を検討する場合はtrue。省略時はfalse。' },
    expression: EXPRESSION_INPUT_SCHEMA,
    ...PIXEL_ART_STYLE_INPUT_PROPERTIES
  }
});

const SOURCE = Object.freeze({
  worldFlipperDesign: { title: 'ワールドフリッパー公式資料：ドット制作と画面設計', url: 'https://worldflipper.jp/assets/pdf/top_pdf4.pdf' },
  workflow: { title: 'ワールドフリッパー公式制作資料：キャラクター開発秘話', url: 'https://worldflipper.jp/assets/pdf/top_pdf1.pdf' },
  identity: { title: 'ワールドフリッパー開発インタビュー', url: 'https://www.inside-games.jp/article/2020/02/17/127472.html' },
  method: { title: 'Celeste’s Pixel Art', url: 'https://exok.com/posts/2019-12-10-celeste-pixel-art/' },
  pose: { title: 'Dead Cells: Using a 3D pipeline for 2D animation', url: 'https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-' },
  color: { title: 'Dead Cells: Giving back colors to cryptic worlds', url: 'https://www.gamedeveloper.com/production/art-design-deep-dive-giving-back-colors-to-cryptic-worlds-in-i-dead-cells-i-' },
  lowResolution: { title: '低解像度でのピクセルアート', url: 'https://saint11.art/blog/thoughts_on_low_resolution/' },
  pixelArtBasics: { title: 'ピクセルアートの基本教材', url: 'https://www.androidarts.com/pixtut/pixelart.htm' }
});

function fail(message) { throw new TypeError(message); }

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('入力はオブジェクトで指定してください。');
  const allowed = new Set(['subject', 'width', 'height', 'materials', 'animated', 'normalMap', 'style', 'referenceStyle', 'expression']);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail('未対応の入力項目があります。');
  if (!SUBJECTS.includes(input.subject)) fail('subjectはcharacter、food、object、scene、otherから指定してください。');
  for (const key of ['width', 'height']) {
    if (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > 64) fail(`${key}は1〜64の整数で指定してください。`);
  }
  const materials = input.materials === undefined ? [] : input.materials;
  const normalizedMaterials = Array.isArray(materials) ? Array.from(materials) : null;
  if (!normalizedMaterials || normalizedMaterials.length > 4 || normalizedMaterials.some((item) => !MATERIALS.includes(item)) || new Set(normalizedMaterials).size !== normalizedMaterials.length) {
    fail('materialsは重複のない対応材質を4つ以内で指定してください。');
  }
  const animated = input.animated === undefined ? false : input.animated;
  const normalMap = input.normalMap === undefined ? false : input.normalMap;
  if (typeof animated !== 'boolean' || typeof normalMap !== 'boolean') fail('animatedとnormalMapはbooleanで指定してください。');
  const styleRequest = normalizePixelArtStyle({ style: input.style, referenceStyle: input.referenceStyle });
  const expression = normalizeExpression(input.expression, input.width, input.height);
  return { subject: input.subject, width: input.width, height: input.height, materials: normalizedMaterials, animated, normalMap, ...styleRequest, ...(expression ? { expression } : {}) };
}

function buildSteps(request) {
  const steps = [
    { id: 'intent', title: '意図を決める', body: '何を描き、どんな印象や行動を伝えるかを一文にします。用途、背景、実際の表示倍率も確認し、残したい特徴を選びます。' },
    { id: 'references', title: '形と画素密度の参考を観察する', body: '構造や光を知るための実物写真と、省略や色面を見るための同程度の占有PXの作例を、目的を分けて確かめます。画像を実際に見ていない場合は、観察した根拠として扱いません。' },
    { id: 'method-order', title: '大きな形から原寸比較まで進める', body: '制作順は題材に合わせて選びます。資料を実見できたら特徴を記録し、指定実寸で形・接合・支持・負の形を組み、大きな明暗面と必要な反射を決め、材質を見分ける特徴を必要な分だけ加えて、原寸カラーと使用条件で前後を比べます。色、輪郭、材質の手法を固定テンプレートにせず、合わない手法は使いません。' },
    { id: 'large-forms', title: '大きな形と関係を組む', body: '指定サイズのまま主役、余白、重なり、前後関係を仮色で配置します。接地・接合・支持が必要な形は、どこで支え合うかも見ます。単色シルエットだけで読めない題材は、粗い明暗や反射を含めて確認します。' },
    { id: 'palette-light', title: '色と光を整理する', body: '色は固有色、面の陰、接触、反射、模様の役割から選びます。共通色は境界や材質が保てる場所で使い、見た目の色面の整理と実際の色数は別々に見ます。色数や彩度の少なさ自体を品質条件にしません。光源と面の向きを決め、金属・ガラスなど反射が形を伝える材質は初めから反射も組み込みます。' },
    { id: 'detail', title: '細部を選ぶ', body: '大きな形が読めてから中・小の情報へ進みます。残すと決めた顔・接合・材質の特徴が、塗りや輪郭を重ねた後の実画素にも残っているかを確かめます。小さい形では輪郭が内側を埋めてしまうため、必要なら最終画素を直接調整します。小さな模様や点は、弱める・面へまとめる・省く・重要箇所だけ誇張する案を比べます。2×2、孤立1px、輪郭、ディザに一律の禁止や合格条件はありません。' },
    { id: 'review', title: '原寸で見直す', body: '原寸カラーと実際の倍率・背景で、形、材質、狙った印象を別々に確認します。拡大・グレー・シルエットは原因を探す補助です。技術的に作れること、表現として採用すること、依頼者が受け入れることは別の判定です。気になる症状から戻り先を選びます。形の崩れは構造、材質の弱さは光や反射、ノイズは画素整理、保存後の差異は出力条件を見直します。' }
  ];
  steps.splice(1, 0, ...buildPixelArtStyleSteps(request));
  const expressionSteps = buildExpressionSteps(request.expression, request.width, request.height);
  if (expressionSteps.length) {
    const largeFormsIndex = steps.findIndex((step) => step.id === 'large-forms');
    steps.splice(largeFormsIndex, 0, ...expressionSteps);
  }
  const techniques = selectPixelArtTechniques(request);
  if (techniques.length) {
    const largeFormsIndex = steps.findIndex((step) => step.id === 'large-forms');
    const techniqueNames = techniques.map(({ title }) => title).join('、');
    const techniqueIds = techniques.map(({ id }) => id).join(', ');
    steps.splice(largeFormsIndex + 1, 0, {
      id: 'technique-selection', title: '条件に合う技法を比べる',
      body: `今回の条件に関係する技法候補: ${techniqueNames}。選択ID: ${techniqueIds}。各技法は当てはまる部分だけ使います。制作中の絵で候補の方法と簡潔な方法を見比べ、原寸で違いを確かめてから採用します。`
    });
  }
  const footprint = request.expression?.occupancy ?? request;
  const footprintLabel = request.expression?.occupancy ? '主役の占有範囲' : 'キャンバス';
  if (Math.max(footprint.width, footprint.height) <= 16) {
    steps.splice(1, 0, { id: 'small-canvas', title: '小さな画面へ情報を配る', body: `${footprintLabel}${footprint.width}×${footprint.height}では、1pxの変化が形に大きく響きます。対象が占める面積と実表示も考え、識別に必要な特徴を残す・まとめる・省く・必要な箇所だけ誇張する案を選びます。特定の色数や顔パーツ数は決めません。` });
  } else if (Math.min(footprint.width, footprint.height) <= 16) {
    steps.splice(1, 0, { id: 'narrow-canvas', title: '細長い寸法に合わせる', body: `${footprintLabel}${footprint.width}×${footprint.height}の短辺に入る形を先に考えます。極小キャンバス全体向けの注意をそのまま当てず、長辺と短辺それぞれに必要な情報を配ります。` });
  } else if (Math.min(footprint.width, footprint.height) >= 48) {
    steps.splice(1, 0, { id: 'large-canvas', title: '使える画素を目的に合わせる', body: `${footprintLabel}${footprint.width}×${footprint.height}でも細部を均一に増やさず、主役の形と焦点を先に作ります。必要な構造や材質に画素を配り、細部が実表示で役立つか原寸で確認します。` });
  }
  const subjectSteps = {
    character: ['character', '人物の姿勢と個性を残す', '頭・胸・腰・支持脚の大きな関係から姿勢を作り、向きの違いは意図した動きとしてつながるか見ます。髪、服、装備など識別に効く特徴へ場所を配り、それ以外の細部を省いて個性を保つ案を比べます。顔の全パーツや細かな服模様を必須にしません。'],
    food: ['food', '食べ物の形と熟度を示す', '外形、支え合う接点、重なり、熟度を担う色面を先に作ります。果実などの群は均一な円で並べず、参考写真で遮蔽や支持を確かめます。細かな斑点は果皮の模様か反射かを見分け、目立ちすぎる場合は弱める・統合する・省きます。'],
    object: ['object', '道具や物の構造を示す', '穴、薄い縁、接合、厚み、持ち手など、その物を識別する構造を先に選びます。平面の向きや部品の前後が伝わる配置を優先し、表面模様は形が読めてから加えます。'],
    scene: ['scene', '場面の前後と焦点を組む', '手前・中景・奥の大きな形と明暗を整理し、主役へ視線が向かう密度差を作ります。各所を同じ細かさで埋めず、距離や用途に合う背景との対比を確かめます。']
  };
  const subjectStep = subjectSteps[request.subject];
  if (subjectStep) {
    const largeFormsIndex = steps.findIndex((step) => step.id === 'large-forms');
    steps.splice(largeFormsIndex + 1, 0, { id: subjectStep[0], title: subjectStep[1], body: subjectStep[2] });
  }
  const materialSteps = {
    cloth: ['cloth', '布の面を描く', '布は支持点や張力に沿う広い面と、必要な折れで示します。すべてのしわを線や模様にしません。'],
    metal: ['metal', '金属の反射を設計する', '仕上げに合わせて周囲の映り込み、薄い縁、稜線や凹面の反射を選びます。白点や青灰色だけで金属と決めません。'],
    glass: ['glass', 'ガラスの縁と透過を設計する', '背景がどう透けるか、縁の厚み、液面や反射の役割を決めます。実際に使う背景でも形が読めるか確認します。'],
    organic: ['organic', '自然物のまとまりを作る', '葉・毛などの群は個々の点を並べる前に、群全体の外形、向き、重なり、明暗のまとまりを作ります。'],
    stone: ['stone', '石の面と質感を整理する', '大きな面の向きや割れ目を先に選び、すべての傷や亀裂を描かず、形を支えるものに絞ります。']
  };
  for (const material of request.materials) {
    const [id, title, body] = materialSteps[material];
    const detailIndex = steps.findIndex((step) => step.id === 'detail');
    steps.splice(detailIndex, 0, { id: `material-${id}`, title, body });
  }
  if (request.animated) steps.splice(steps.findIndex((step) => step.id === 'review'), 0, { id: 'animation', title: '主要ポーズから動きを作る', body: 'まず動作を代表する主要ポーズと時間配分を決めます。接地、重心、体積、髪や持ち物など識別特徴の連続性を確認し、静止画だけで動きの完成を判断しません。' });
  if (request.normalMap) steps.splice(steps.findIndex((step) => step.id === 'review'), 0, { id: 'normal-map', title: '法線の用途と範囲を確認する', body: '法線は形の向きや凹凸の表現に使い、色模様をそのまま凹凸へ置き換えません。原画・光源・座標系と実際の照明結果を別々に確認します。' });
  return steps;
}

export function getPixelArtGuide(input) {
  const request = normalize(input);
  const steps = buildSteps(request);
  const reviewChecklist = [
    '指定した寸法と題材、用途、背景に合っているか。',
    '原寸で必要な形、重なり、接続、支持が読み取れるか。',
    '色と明暗が材質や主役の意図を支えているか。',
    '細部を足す前に大きな形が成立し、不要な点を整理できているか。',
    '原寸カラーと実際の表示条件で狙った印象を確認したか。',
    '選んだ技法が題材と用途に役立つかを原寸で比較し、不要または悪化した効果を戻したか。',
    '技術的な作成可否、表現の採用、依頼者の受け入れを混同していないか。'
  ];
  if (request.animated) reviewChecklist.push('予定の速度で動かし、接地・体積・特徴の連続性を確認したか。');
  const limitations = [
    'このガイドは制作判断の手引きで、画像を生成・編集せず、作品の品質や依頼者の採用を保証しません。',
    '1〜64pxはこの入力契約の範囲であり、創作上の推奨サイズや品質基準ではありません。',
    '各項目は独自の実務判断と参考資料の要約で、商業作品に共通する公式ルールではありません。一般的な色の使い方は出発点で、共通色を使う義務、色数の合格基準、2×2や孤立画素や輪郭の禁止はありません。'
  ];
  if (request.animated || request.normalMap) limitations.push('現行MCPの転送対象は単一の静止カラー画像です。アニメーションや法線マップの編集・転送機能はありません。');
  limitations.push(...getPixelArtStyleLimitations(request.referenceStyle));
  const sourceSet = [SOURCE.lowResolution, SOURCE.pixelArtBasics];
  if (request.subject === 'character') sourceSet.push(SOURCE.worldFlipperDesign, SOURCE.workflow, SOURCE.identity, SOURCE.method);
  if (request.subject === 'scene') sourceSet.push(SOURCE.worldFlipperDesign);
  if (request.animated) sourceSet.push(SOURCE.pose, SOURCE.color);
  const sources = sourceSet.map(({ title, url }) => ({ title, url }));
  return { guideVersion: GUIDE_VERSION, request, steps, reviewChecklist, limitations, sources };
}
