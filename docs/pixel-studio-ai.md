# 写真の物体境界を扱うカメラ

2026-09-24更新。ローカル未公開。ユーザー指定で、ドット絵教材を正解とした学習・Magenta画風転写を廃止した。

## 目的と役割

写真を意味のある物体領域に分け、その可視境界を保ったまま格子化・減色する。AIの仕事はマスク提案。色数、排他的な画素所有、補間なし描画、処理順はアプリが制御する。物体分類名の出力や、隠れた形の補完は目的に含めない。

1. 端末内SlimSAMで4×4の自動点プロンプトから物体候補を提案。利用者のクリック・設定操作は増やさない。小さな物体・細線・反射・重なりの完全検出は保証しない。
2. 同じ物体らしい前後マスクを、重なり・形・移動量・色から保守的に対応付ける。同種個体も別IDとし、曖昧なら新ID。これは学習済み動画追跡ではない。消失した物体を推測して描き足さない。
3. 各画素の可視所有を1つのIDへ確定。0は背景。重複マスクは明示された前後順、または確信度で解決する。SlimSAMは物理的な深度を出さないので、確信度を「本当の前後関係」と呼ばない。
4. 各出力セルは1つのIDからだけ実画素の代表色を選ぶ。髪と背景など異なるIDのRGBを平均しない。境界の縮小では細い前景が消えないよう前景IDを優先するが、格子より細かな複数物体を同時に表現する保証はない。
5. カメラでは局所的な色領域ごとに最大3色（基本色・影・ハイライト）、全体48色を上限として色枠を配る。同一領域の実色参照とパレットを小変動では保ち、大変化・場面切替・撮り直しでは更新する。色枠より領域が多い場合は不足を統計へ明示する。旧sampled描画の既定24色は互換用。詳細と検証は `pixel-camera-three-tone.md`。
6. 現在画像の減色とAIの物体分割を別Workerで並行処理する。AI未準備・マスク失効時も通常減色で表示を更新。有効なマスクがある時だけ領域別描画を適用する。画像・AIとも待ちフレームは蓄積しない。ナビ中央の撮影ボタンは表示中の完成フレームを固定する。

## 実装契約

- `segmenter.mjs`: 自己ホストしたSlimSAM/Transformers.js/ONNX Runtime Webを遅延ロード。写真送信・外部推論APIを使わない。画素とマスクの縮尺を明示する。
- `object-tracker.mjs`: マスクごとの幾何・色対応。短い移動の高い一致だけIDを再利用。30秒を超える間隔・場面変化・カメラ切替・曖昧対応では過去を使わない。
- `instance-masks.mjs`: 1画素1可視IDの排他的ラベル地図。柔らかいalphaを出力しない。
- `object-renderer.mjs`: IDを越えて色を集めない代表色、領域別パレット、RGBに基づく時間安定化。出力RGBAは完全不透明、表示は最近傍。
- `preview-worker.mjs` / `segmentation-worker.mjs`: 表示の減色と背景AIを分離。`mask-cache.mjs`で参照画像との変化と期限を確認してマスクを使う。モデル障害時はマスクなし減色に戻し、内部状態に記録する。旧`worker.mjs`は保管のみ。
- `app.mjs` / `frame-loop.mjs`: 撮影・前後切替・停止・完成フレーム表示・PNG・既存地球handoff。詳細設定・学習画面・取消は撮影UIに出さない。

写真の元のエッジに含まれる光学的な混色やISP処理は、この実装だけで完全除去できない。「アンチエイリアスなし」は出力ラベル・合成・表示で補間色を足さないことを指す。時間安定化もちらつきゼロの保証ではなく、残像との両立を実映像で評価する。

## モデル選定と独自性

SlimSAMは既存SAMを圧縮したモデル。学習済みの物体領域提案を土台とし、境界処理・色最適化・対応付け・撮影フローをPiXiEED独自のシステムとして実装する。ゼロから独自に学習したモデル、全写真の物体理解が完成したAIとは記載しない。

候補を比較した結果、SlimSAMにはTransformers.js互換のONNX配布とブラウザー実例がある。SAM 2/EdgeTAMは動画追跡の参考だが、調査した公式配布物ではWeb ONNX実装とモバイルWeb性能を確認できなかった。EdgeTAMのCore ML性能をブラウザーのFPSとして引用しない。

追加学習を行う場合の正解は、写真・動画の物体ID、可視マスク、細い境界、遮蔽、前後フレームの対応。ドット絵の作例や画風見本は教師にしない。まず既存モデルの実写真の失敗を測り、必要な部分だけ追加学習・蒸留する。今回、新方式のモデルの追加学習は行っていない。

## 費用と利用条件

SlimSAMとTransformers.jsはApache 2.0、ONNX RuntimeはMITとして配布される固定版を使う。取得したモデル・コードを自己ホストし、ライセンス表示等の条件を守る構成で、推論のライセンス料・従量API料を設けない。土台の著作権がPiXiEEDへ移転するわけではない。配布サーバー、通信、端末電力、開発・追加学習の費用は別。

配布元・固定版・SHA-256・取得サイズ・改変点は新資産のprovenanceに記録する。共有TFJSランタイムと研究記録は保管するが、カメラからロードしない。旧ドット絵学習用733ファイル、Magenta重み、画風見本、専用アダプターと教材検査コードは撤去した。

## 一次資料

- [SlimSAM 著者実装](https://github.com/czg1225/SlimSAM): pruning/distillation、point/box/everything推論。物体名の分類器ではない。
- [Transformers.js向けSlimSAM配布](https://huggingface.co/Xenova/slimsam-77-uniform): 第三者変換ONNX、Apache 2.0表示、SamModel/processor利用例。
- [固定モデルファイル](https://huggingface.co/Xenova/slimsam-77-uniform/tree/5850ab45f587c112167512ffef949107115e26a0/onnx): 量子化encoder+decoderを選択。量子化は実行メモリ上限や高速化の保証ではない。
- [Transformers.js](https://huggingface.co/docs/transformers.js/en/index) / [Apache 2.0](https://github.com/huggingface/transformers.js/blob/main/LICENSE)
- [ONNX Runtime MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)
- [SAM 2](https://github.com/facebookresearch/sam2) / [EdgeTAM](https://github.com/facebookresearch/EdgeTAM)

初期検証は `pixel-studio-object-validation.md`、最新の速度・中央操作は `pixel-camera-navigation-performance.md` に記録する。合成テストだけを実写真・スマートフォン・量産品質の合格と扱わない。
