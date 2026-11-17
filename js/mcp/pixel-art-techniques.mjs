import { PIXEL_ART_CASE_INDEX } from './pixel-art-case-index.mjs';
const BASICS = 'https://www.androidarts.com/pixtut/pixelart.htm';
const LOW_RES = 'https://saint11.art/blog/thoughts_on_low_resolution/';

export const TECHNIQUES = Object.freeze([
  Object.freeze({ id: 'subject-footprint', title: '主役の占有範囲を先に決める', appliesWhen: '画面内で主役の大きさや余白が重要なとき。', avoidWhen: '占有範囲が既に明確で、画面内に収める問題がないとき。', steps: ['キャンバス寸法と主役の占有寸法を別々に決める。', '主役の外形と余白を仮配置し、指定範囲で読める特徴を選ぶ。'], checks: ['主役の大きさを守りながら、周囲の余白も意図に合っているか。'], sourceUrls: [LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'silhouette-negative-space', title: 'シルエットと抜けを確かめる', appliesWhen: '輪郭の読みにくさや隣接部の詰まりが気になるとき。', avoidWhen: '意図的に輪郭を背景へ溶かす表現で、単色形の確認が判断に役立たないとき。', steps: ['主役の外形を大きな面として置く。', '手足や部品の間に必要な背景の抜けを作り、原寸で再確認する。'], checks: ['隣り合う部位が一塊に見えず、必要な接続は切れていないか。'], sourceUrls: [BASICS, LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'shared-colors-boundaries', title: '共通色と境界を一緒に整理する', appliesWhen: '画面の色面が散らばる、またはパレットを整理したいとき。', avoidWhen: '共通色を使うと形・材質・焦点の区別が弱くなるとき。', steps: ['近い色面を見比べ、共有できる色を候補にする。', '共有後も輪郭、明暗、隣接色で必要な区別が保てるか確かめる。'], checks: ['色数を減らすこと自体を目標にせず、必要な境界が残っているか。'], sourceUrls: [BASICS], caseIds: [] }),
  Object.freeze({ id: 'lighting-markings', title: '光と模様の役割を分ける', appliesWhen: '陰影と模様が混ざって立体感や材質が読みにくいとき。', avoidWhen: '模様そのものが主役で、光源による整理が不要な平面表現のとき。', steps: ['光源と面の向きを決め、光による明暗を配置する。', '模様は固有色や表面情報として別に加え、明暗を壊す箇所を調整する。'], checks: ['模様を弱めても光の向きと大きな面が伝わるか。'], sourceUrls: [BASICS, LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'microdetail-contrast', title: '細部のコントラストを選ぶ', appliesWhen: '微細な点や模様が焦点を奪う、または表示倍率で消えるとき。', avoidWhen: '細部が意図した焦点で、実際の表示条件でも明瞭なとき。', steps: ['原寸と使用時の倍率で細部の見え方を比べる。', '弱める、まとめる、省く、重要箇所だけ強める案を並べて選ぶ。'], checks: ['細部が大きな形や焦点と競合していないか。'], sourceUrls: [LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'reflective-metal', title: '金属の映り込みで形を示す', appliesWhen: '金属を含み、平面の向きや反射が材質表現に必要なとき。', avoidWhen: '金属が画面で小さく、反射の追加が形の識別を助けないとき。', steps: ['周囲の明暗や色が金属面にどう映るかを大きく置く。', '縁や稜線の反射を選び、面の向きと仕上げに合わせて調整する。'], checks: ['白い点だけに頼らず、反射の配置が面の向きに沿っているか。'], sourceUrls: [BASICS], caseIds: [] }),
  Object.freeze({ id: 'transparency-edges', title: '透過と縁で透明物を示す', appliesWhen: 'ガラスや透明物があり、背景越しの形を示す必要があるとき。', avoidWhen: '透明性が題材の識別に関わらず、表現上省略する場合。', steps: ['実際に使う背景を通した色や形を決める。', '縁、厚み、反射を選び、背景に重ねて確認する。'], checks: ['予定した背景で形が読み取れ、汎用素材として使う場合は複数の背景でも要点が保てるか。'], sourceUrls: [BASICS, LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'natural-clusters', title: '自然物を群の形から組む', appliesWhen: '葉、毛、雲、果実など細かな要素の集まりを描くとき。', avoidWhen: '単独の自然物で、群としての配置がないとき。', steps: ['個々の要素より先に群全体の外形、向き、重なりを作る。', '大中小のまとまりと明暗を置いてから、識別に必要な要素を加える。'], checks: ['要素が均一な間隔や同じ形で反復していないか。'], sourceUrls: [BASICS, LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'ground-support', title: '接地と支持関係をつなぐ', appliesWhen: '物体が立つ、積む、持たれる、接合される場面。', avoidWhen: '浮遊や無重力が明示された表現のとき。', steps: ['重さを受ける接点と支える部位を決める。', '接触影や重なりを必要な分だけ加え、接合部を原寸で見る。'], checks: ['どこで支えられているかが伝わり、接点が切れて見えないか。'], sourceUrls: [BASICS], caseIds: [] }),
  Object.freeze({ id: 'depth-focus', title: '距離と焦点に密度差をつける', appliesWhen: '背景を含む場面で前後や主役の焦点を分けたいとき。', avoidWhen: '単体アイコンなど、距離の層が表現対象にないとき。', steps: ['手前・中景・奥を大きな形と重なりで配置する。', '焦点から離れるほど情報を整理する案を試し、意図に合わせる。'], checks: ['各層が同じコントラストと細かさで競い合っていないか。'], sourceUrls: [LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'emissive-core', title: '発光部と周囲の明暗を組む', appliesWhen: '光る物体や発光効果が題材の意味に関わるとき。', avoidWhen: '発光が主題でなく、光の追加が焦点を奪うとき。', steps: ['発光の芯と外側の光を分けて配置する。', '周囲の面に届く光を選び、色や明暗の変化を必要な範囲に置く。'], checks: ['芯が読めて、周囲の光が形や背景を潰していないか。'], sourceUrls: [LOW_RES], caseIds: [] }),
  Object.freeze({ id: 'contour-banding', title: '輪郭と明暗段階を題材に合わせる', appliesWhen: '形が背景へ埋もれる、輪郭が強すぎる、明暗段階がちらつくとき。', avoidWhen: '意図的な輪郭なし表現や滑らかな階調が題材に合っているとき。', steps: ['全周の輪郭、部分輪郭、輪郭なしを候補として比較する。', '明暗段階を面の向きに沿わせ、必要な部分だけ整理する。'], checks: ['輪郭や段階数を一律ルールにせず、題材の読みに結び付いているか。'], sourceUrls: [BASICS, LOW_RES], caseIds: [] })
]);

const order = TECHNIQUES.map(({ id }) => id);
const RELATED_FAMILIES={character:['character'],food:['food'],object:['object','machine','transparent'],scene:['scene'],other:['animal','effect']};
function caseRank(item,request) {
  const sameFamily=(RELATED_FAMILIES[request.subject]??[]).includes(item.family);
  return (sameFamily?0:1000)+Math.abs(item.width-request.width)+Math.abs(item.height-request.height)+(item.style===request.style?0:1);
}


export function selectPixelArtTechniques(request) {
  if (!request || typeof request !== 'object') return [];
  const expression = request.expression ?? {};
  const lighting = expression.lighting ?? 'auto';
  const palette = expression.palette ?? 'auto';
  const detail = expression.detail ?? 'auto';
  const outline = expression.outline ?? 'auto';
  const form = expression.form ?? 'auto';
  const projection = expression.projection ?? 'auto';
  const subject = request.subject;
  const materials = Array.isArray(request.materials) ? request.materials : [];
  const subjectWidth = expression.occupancy?.width ?? request.width ?? 0;
  const subjectHeight = expression.occupancy?.height ?? request.height ?? 0;
  const maxDim = Math.max(subjectWidth, subjectHeight);
  const minDim = Math.min(subjectWidth, subjectHeight);
  const scores = new Map(order.map((id) => [id, 0]));
  const add = (id, n = 1) => scores.set(id, scores.get(id) + n);
  if (expression.occupancy || minDim <= 16) add('subject-footprint', 4);
  if (['character', 'food', 'object'].includes(subject)) add('silhouette-negative-space', 2);
  if (projection !== 'auto') add('silhouette-negative-space', 3);
  if (palette === 'limited') add('shared-colors-boundaries', 4);
  if (lighting !== 'auto' || palette !== 'auto') add('lighting-markings', 2);
  if (detail === 'sparse' || detail === 'dense' || minDim <= 16) add('microdetail-contrast', 3);
  if (materials.includes('metal')) add('reflective-metal', 5);
  if (materials.includes('glass')) add('transparency-edges', 5);
  if (materials.includes('organic') || subject === 'food') add('natural-clusters', 4);
  if (subject === 'character' || subject === 'object' || subject === 'food') add('ground-support', 2);
  if (subject === 'scene') add('depth-focus', 5);
  if (lighting === 'emissive') add('emissive-core', 6);
  if (outline !== 'auto' || form !== 'auto') add('contour-banding', 3);
  if (maxDim >= 48) add('microdetail-contrast', 1);
  return TECHNIQUES
    .filter(({ id }) => scores.get(id) > 0)
    .sort((a, b) => scores.get(b.id) - scores.get(a.id) || order.indexOf(a.id) - order.indexOf(b.id))
    .slice(0, 6)
    .map((technique) => ({
      ...technique,
      steps: [...technique.steps], checks: [...technique.checks], sourceUrls: [...technique.sourceUrls],
      caseIds: PIXEL_ART_CASE_INDEX.filter(item=>item.userAcceptance==='accepted' && item.techniqueIds.includes(technique.id)).sort((a,b)=>caseRank(a,request)-caseRank(b,request)).slice(0,3).map(item=>item.id),
      comparisonCaseIds: PIXEL_ART_CASE_INDEX.filter(item=>item.userAcceptance==='pending' && item.techniqueIds.includes(technique.id)).sort((a,b)=>caseRank(a,request)-caseRank(b,request)).slice(0,3).map(item=>item.id)
    }));
}
