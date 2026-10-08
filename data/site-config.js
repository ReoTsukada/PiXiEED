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
  // Set true only after the puzzle database migration and all three production Edge Functions are confirmed live.
  puzzlePublicationEnabled: true,
  publicMapTable: 'post_map_points',
  publicStorageBucket: 'post-public',
  publicMapLimit: 500
};

/*
 * 旧パス設定との互換用。現在は全機能を無料で利用でき、広告視聴や期限による制限はありません。
 */
export const passConfig = {
  passHours: 1
};

/* 通常のディスプレイ広告。AdSenseで作った広告ユニットの数字のIDだけを入れます。
 * 空欄の枠は表示もリクエストもしません。報酬型広告・パスとは独立しています。
 */
export const displayAdConfig = {
  client: 'ca-pub-9801602250480253',
  slots: {
    home: '8825932060',
    tools: '8825932060',
    info: '8825932060', // About・利用ガイド
    stores: '8825932060',
    'store-detail': '8825932060', // 公開中の実店舗詳細
    'map-detail': '8825932060', // 公開イベント詳細を選択中の地図
    'camera-result': '2995020884', // 撮影結果
    'draw-result': '2995020884', // PNG・GIF書き出し後
    'audio-result': '2995020884', // PNG・音・動画の書き出し後
    'jigsaw-result': '2995020884', // パズル完成後
    'spot-result': '2995020884', // 間違い探しの結果
    'find-result': '2995020884' // もの探しの結果
  }
};

/* Google アナリティクス（GA4）の測定ID。全ページ共通（js/site-analytics.mjs）。空欄なら送信しません。 */
export const analyticsConfig = {
  measurementId: 'G-SZPVXMX85G'
};
