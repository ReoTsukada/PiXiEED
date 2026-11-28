import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTELLIGENCE_VERSION, PIXEL_ART_INTELLIGENCE } from "../../js/mcp/pixel-art-intelligence.mjs";

test("shared instructions follow the user-GPT conversation without a prescribed art workflow", () => {
  assert.equal(INTELLIGENCE_VERSION, "0.6.0");
  for (const tool of ["list_pixieed_tools", "get_pixel_art_guide", "get_pixel_art_techniques", "prepare_pixel_art", "review_pixel_art", "get_pixel_art_case", "connect_draw", "get_draw_state", "edit_draw", "save_draw", "disconnect_draw"]) {
    assert.ok(PIXEL_ART_INTELLIGENCE.includes(tool), tool);
  }
  assert.match(PIXEL_ART_INTELLIGENCE, /描き方や表現はユーザーとGPTの会話で決めます/);
  assert.match(PIXEL_ART_INTELLIGENCE, /Draw画面で利用者が一時接続を開始/);
  assert.match(PIXEL_ART_INTELLIGENCE, /描き方や表現の決め方はユーザーとGPTの会話に任せ/);
  assert.doesNotMatch(PIXEL_ART_INTELLIGENCE, /必ず.*get_pixel_art_guide|get_pixel_art_techniquesを先に呼び/);
  assert.doesNotMatch(PIXEL_ART_INTELLIGENCE, /原寸での修正前後比較を完了条件/);
});

test("learning materials and reviews are opt-in references", () => {
  assert.match(PIXEL_ART_INTELLIGENCE, /任意の参考情報です/);
  assert.match(PIXEL_ART_INTELLIGENCE, /ユーザーが求めたとき、または作業上必要なときだけ参照/);
  assert.match(PIXEL_ART_INTELLIGENCE, /一律に適用しません/);
  assert.match(PIXEL_ART_INTELLIGENCE, /review_pixel_art:.*任意/);
});

test("live Draw sessions are distinguished from image preview and browser-local save", () => {
  assert.match(PIXEL_ART_INTELLIGENCE, /prepare_pixel_art.*形式検査/);
  assert.match(PIXEL_ART_INTELLIGENCE, /preview_only/);
  assert.match(PIXEL_ART_INTELLIGENCE, /一度限りのコードをMCPの connect_draw に渡す/);
  assert.match(PIXEL_ART_INTELLIGENCE, /ブラウザー内保存/);
  assert.match(PIXEL_ART_INTELLIGENCE, /公開、クラウド同期/);
});

test("AI pages describe the existing receive flow and keep guides optional", () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
  const receive = read("../../ai/index.html");
  const retiredSettings = read("../../ai/settings/index.html");
  const guide = read("../../ai/guide/index.html");
  const examples = read("../../ai/examples/index.html");
  const receiverScript = read("../../js/mcp/receive-page.mjs");
  // Preserve the already shipped receive-and-import experience; live Draw editing
  // is a separate capability exposed from the editor after explicit pairing.
  assert.match(receive, /ChatGPTに言葉でドット絵を頼み/);
  assert.match(receive, /最大64×64px・32色/);
  assert.match(receive, /受取リンクを開くか/);
  assert.match(receive, /id="preview-card"/);
  assert.match(receive, /id="open-draw"/);
  assert.match(receive, /新しい作品として、このブラウザーに保存/);
  assert.match(receive, /開いている作品を直接編集する場合は/);
  assert.match(receive, /href="\/tools\/start\/draw\/"[^>]*>Drawを開いて「ChatGPTとつなぐ」から接続/);
  assert.match(receive, /id="sample-prompt"/);
  assert.match(receive, /id="copy-prompt"/);
  assert.match(receive + receiverScript, /sample-prompt|copy-prompt/);
  assert.match(receive, /id="mcp-connection"/);
  assert.match(receiverScript, /verifiedMcpEndpoint/);
  assert.match(retiredSettings, /端末に保存されたデータは変更・削除していません/);
  assert.match(retiredSettings, /制作資料/);
  assert.match(retiredSettings, /href="\/ai\/guide\//);
  assert.match(retiredSettings, /href="\/ai\/examples\//);
  assert.doesNotMatch(retiredSettings, /GPT連携|GPTとの作業はDrawから/);
  assert.match(retiredSettings, /href="\/tools\/start\/draw\//);
  assert.doesNotMatch(retiredSettings, /<script(?! type="module" src="\/js\/public-navigation-entry\.mjs\?)|localStorage|settings-reset/);
  assert.match(guide, /任意資料です/);
  assert.match(examples, /任意の参考資料/);
  assert.doesNotMatch(guide + examples, /href="\/ai\/settings\//);
});
