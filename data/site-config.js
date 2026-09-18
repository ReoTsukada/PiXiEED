/* PiXiEED の公開サイト設定。地図はローカルの独自マップで表示します。 */
export const mapConfig = {
  // Google Apps Script の doGet 公開URL。空欄ならローカルのサンプルデータを使います。
  publicDataEndpoint: 'https://script.google.com/macros/s/AKfycbx7C-Ppij26RiPcmdeXKQUseTo7wG9x81pmN7CuQ4aShbrmScaF5V8_PbK20bEbwA/exec',
  // 公開データを表示中に確認する間隔。0ならページを開いたときだけ取得します。
  publicDataRefreshMs: 15 * 60 * 1000,
  // Google Apps Script の doPost 公開URL。空欄なら計測を送信しません。
  analyticsEndpoint: 'https://script.google.com/macros/s/AKfycbx7C-Ppij26RiPcmdeXKQUseTo7wG9x81pmN7CuQ4aShbrmScaF5V8_PbK20bEbwA/exec'
};

/*
 * ユーザー投稿用の公開設定。
 *
 * ここに置いてよいのは、ブラウザへ公開してもよいURLと
 * Supabaseのpublishable keyだけです。secret key / service_role keyは
 * Edge Functionの環境変数にのみ置き、絶対にこのファイルへ書きません。
 * 未設定の間は投稿フォームを接続待ちとして扱い、データを外へ送信しません。
 */
export const supabaseConfig = {
  // Supabaseプロジェクトの公開URL。publishable keyが空欄の間は接続しません。
  url: 'https://kyyiuakrqomzlikfaire.supabase.co',
  publishableKey: 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4',
  createPostFunction: 'create-post',
  moderationFunction: 'moderate-post',
  publicMapTable: 'post_map_points',
  publicStorageBucket: 'post-public',
  publicMapLimit: 500
};
