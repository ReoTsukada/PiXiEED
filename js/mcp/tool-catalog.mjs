import { TOOL_START_ROUTES } from '../tool-start-routes.mjs?rev=20261110-output-result-1';

// Only public destinations and descriptions: this catalog grants no editor access.
const descriptions = {
  draw: ['Draw', 'ドット絵とアニメーションを編集する。AIの絵はプレビューを確認して新規作品として取り込む。', ['camera', 'audio', 'convert', 'jigsaw'], 'pixel_art_preview'],
  camera: ['Camera', '写真や撮影画像をドット絵に変換し、共有キャンバスでDrawへ引き継ぐ。撮影と画像選択は利用者が行う。', ['draw', 'audio', 'convert'], 'guide_only'],
  audio: ['Audio', '共有作品の音楽レイヤーを編集する。曲・テンポの編集はサイト上で行う。', ['draw', 'camera', 'convert'], 'guide_only'],
  convert: ['変換・書き出し', '画像や音声の変換・書き出しを行う。素材は利用者が選ぶ。', ['draw', 'audio', 'camera'], 'guide_only'],
  jigsaw: ['ジグソー', '画像からジグソーパズルを作る。Drawで書き出した画像を利用できる。', ['draw'], 'guide_only'],
  'spot-difference': ['間違い探し', '画像を編集して間違い探しを作る。問題の確認と公開は利用者が行う。', ['draw'], 'guide_only'],
  'hidden-object': ['もの探し', '画像を使ってもの探しを作る。問題の確認と公開は利用者が行う。', ['draw'], 'guide_only']
};

export function getToolCatalog() {
  return TOOL_START_ROUTES.map(({ id, startPath }) => {
    const [name, description, relatedTools, mcpSupport] = descriptions[id];
    return { id, name, url: `https://pixieed.jp${startPath}`, description, relatedTools: [...relatedTools], mcpSupport };
  });
}
