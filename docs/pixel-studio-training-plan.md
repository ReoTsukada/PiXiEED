> **廃止方式の履歴記録（2026-09-23）**: ドット絵教材の学習と画風転写はユーザー指定で中止。教材・モデル・実行コードは撤去済み。この文書の旧パス・結果・計画は現行機能ではない。現在の方針は [写真の物体境界を扱う設計](pixel-studio-ai.md) を参照。

# Pixel Studio 専用AIの学習計画

この文書の大規模な教師・student構成は調査に基づく計画であり、品質保証ではない。端末内の小規模な合成教材学習は末尾の実験記録を優先する。研究資料と公開された実装の根拠を使って、端末内の低頻度プレビューに向けた実験順を定める。

## 現在の状態

| 区分 | 確認できること |
| --- | --- |
| 実装済み | `js/pixel-studio/local-ai.mjs` はMagenta系の事前学習済み汎用 arbitrary-style transfer を読み込み、写真と画風見本を組み合わせて変換する。これはPiXiEEDのドット絵専用モデルではない。写真自体を外部へ送る呼び出しは同ファイルにない。 |
| 素材記録 | `training/pixel-studio/dataset.example.json` は空テンプレート。`scripts/check-pixel-training-data.mjs` は素材記録・ファイル・SHA-256等の整合性検査だけを行い、学習も品質評価もしない。写真との対応素材は0件。別途、`generated/index.json` にassistantがコードで作った720枚の合成教材を記録している。 |
| 実施済み合成学習 | 720枚の合成教材でTensorFlow.js v1/v2の小型局所モデルを学習。v2の720 step validationは画素accuracy 90.0%、境界F1 35.8%、細線境界F1 25.0%。境界・細線の値は最近色基準の38.5%・31.8%を下回る。測定条件と詳細は [`pixel-studio-training-results.md`](pixel-studio-training-results.md) を参照。 |
| 未実装・未実行 | 実写真の意味に基づく専用学習、教師からの蒸留、量子化比較、写真での全スケール評価はない。作成済みの合成パターン復元モデルは写真用ではない。CPU・モバイル実機の測定も未実行。 |

## 学習する表現

目標は写真に既製画風を貼ることではなく、対象の意味、輪郭、細部を見分けて、指定したドット格子と色数で承認済みの描き方へ写すこと。初期出力は画像そのものに加え、格子上のpalette index、物体領域、線の種類を持つ中間表現にする。最終的な色数上限とPNG生成は決定的なレンダラーが適用する。

- **物体と場面**: 小物、人物、動物、室内、街、風景を別クラス・個体IDで注釈する。物体の一部（目、窓、取っ手、葉柄など）は、データで一貫して描けるものだけ部位ラベルにする。Meta SAM 2 は物体マスクと動画上の追跡候補、DINOv2 は画素レベルの特徴表現を作る教師候補になる。DINOv2自体を完成した物体マスクとして扱わず、分類・分割ヘッドと人の確認を重ねる。
- **ドットの線**: 写真上の輪郭をそのまま細く写すのでなく、目標格子に対し各線分を `keep`（残す）、`thicken`（意味を保つため格子上で太らせる）、`drop`（模様・ノイズとして省く）に分けて注釈する。外形線、内側の境界、細線、角・接続点、影の境界、線を引かない負例を区別し、目標グリッド上で作家が正解を描き直す。
- **小物から風景まで**: 同じ場面を全体の低解像度文脈と、重なりを持つ高解像度cropに分けて学習する。`small / medium / wide` はファイル寸法でなく、被写体が画面で占める大きさで定義する。小物は細部と識別、人物・動物は部位とシルエット、風景は遠景のまとまり・前景との分離を個別に見て、全体構図も同時に学習する。cropだけでは場面の文脈が失われるため、全体経路を残す。
- **動画**: 静止画の正解ペアに加え、連続フレームに共通の物体ID、遮蔽、画面外への移動、シーン切替を記録する。低頻度推論で前回のマスクや線を再利用し、対応点・マスクを使った時間的一貫性損失を補助的に加える。動画の隣接フレームを別splitへ入れない。

## 教師から端末用studentへ

1. **教師は学習側だけで使う。** SAM 2の大きなセグメンターやDINOv2の特徴モデルをオフラインの仮ラベル作成・特徴蒸留に使う。DINOv2の特徴やSAM系のマスクは正解とは限らないので、小物・細線・境界の全例を作家が確認または修正する。教師出力を保存し、毎epoch大モデルを再推論する費用を避ける。
2. **端末studentは小さく専用化する。** MobileNetV4のようなモバイル向けencoderを候補とし、軽量な多段解像度decoderで物体マスク、線の `keep / thicken / drop`、palette-index格子を同時に出す。MobileSAMの研究は大きなSAM encoderから小さなencoderへ知識を移す実例だが、公開ベンチマークの速度・精度はPiXiEEDの保証値ではない。
3. **蒸留信号を分ける。** 教師の特徴またはlogits、領域マスク、境界、作家が確定したpalette indexを別の損失で扱う。小物の正例・難例を均等に見せ、クラス頻度の高い空・床・葉のテクスチャが細部ラベルを押し流さないよう、scale別サンプリングと損失重みを実験する。
4. **LoRAは軽量化の代用にしない。** MicrosoftのLoRA論文は主に大規模言語Transformerで、更新する学習パラメータと学習メモリを減らす方法を示す。LoRAで大きな基底モデルを微調整しても、基底モデルを端末へ配布する重さや推論演算は自動で小さくならない。画像モデルへの適用は探索案に留め、採用する場合もcompact studentを別に作って評価する。

## 教師データと権利

教師targetは人手作画に加えて、assistant等が生成した候補pixel artも使える。16×16から512×512まで複数の格子寸法・色数・画風・小物から風景を揃え、各候補を人がpixel gridへの整列、色数、輪郭の読みやすさ、細線（keep / thicken / drop）、部位・接続、意図しないアンチエイリアスや孤立pixelについて確認・修正してから正解targetにする。生成しただけの画像を正解とは見なさず、生成元モデル・出力の利用条件も確認して記録する。AI生成targetを増やしても権利確認済み写真とのpaired例がなければ、写真中の物体識別を学んだことにはならない。

初期の低費用実験では、承認済みpixel artを元に合成inputを作る。例として拡大縮小・再標本化、ぼかし、色ずれ、圧縮、ノイズ、部分遮蔽や背景混合を適用し、元のpixel artを復元targetとしてpixel grid・palette・細線表現を学ばせる。この合成劣化→clean pixel-art課題は描画規則の事前学習候補であり、実写真の意味を読む能力の代替ではない。実写真では照明・材質・背景 clutter・視点・形状変化が合成劣化と異なるため、次段階で権利許諾済み写真と同構図の承認済みpixel-art出力を対にしたreal-photo finetuning/evaluationを行い、合成のみの性能と分けて報告する。物体識別を主張するにはphoto側の物体・部位・scene labelsも必要。細線の正負例や線を省略した例をtargetに含める。

写真の撮影者、pixel-art作家、候補生成に使うモデル提供者について、学習利用、派生モデルの配布、商用利用の可否を個別に記録し、必要な許諾を得る。写真と正解画像の双方で、肖像・プライバシー、再配布、モデル配布条件を確認する。教師モデル、重み、元データの条件も別々に監査する。素材は公開サイト用リポジトリではなく、許諾とアクセスを管理できる保管先に置く。

train / validation / test は **元scene単位** で分ける。同じ物体の連写、別crop、拡大縮小、色違いtarget、同じ動画の全フレームは一つのsceneGroupに束ねて一split内に置く。作家またはスタイルの持ち主がsplitをまたぐ場合も記録し、評価結果が未知の場面や画風へ一般化したと誤認しないようにする。既存のmanifest例とcheckerは権利記録・sceneGroupの出発点であり、画素ラベルや近似画像漏れの正しさまでは検査しない。

## 損失と品質評価

初期の教師あり損失候補は、物体・部位のCE/Dice、境界・線種の分類、palette-index分類。細線の接続にはclDice等の骨格・位相損失を補助的に比較する。色数はpalette indexを固定上限のクラスとして出し、レンダラー側でも実出力を検査する。トポロジー損失は特定の二値構造で接続性を評価する研究があるが、有限データ・最適化・多クラスの絵で、作家が意図した全ての輪郭や角を数学的に完全保証するものではない。シーン切替や遮蔽をまたいで前フレームを無条件に維持させない。

評価は合成スコア1本へ畳まず、次を別々に比較する。

- 小物 / 人物 / 動物 / 室内 / 街 / 風景 × small / medium / wide ごとの物体・部位認識、領域の欠落・混同。
- `keep / thicken / drop` の判断、細線の残存率・途切れ・誤った線追加、輪郭のずれ、palette indexの色数上限。
- 作家による、元写真への識別可能性、格子上の読みやすさ、意図しないノイズ、画風の一貫性の盲検比較。
- 動画は物体IDの継続、遮蔽後の復帰、線やpalette indexのちらつき、scene cut直後の更新。
- 指定端末ごとの初回モデル読込み、推論時間、メモリ、発熱・電力傾向、実際に達成した低頻度更新間隔。

合格基準はデータとベースラインを見てから事前登録する。未測定の精度・FPS・品質値を目標達成済みとして記さず、評価対象sceneを限定して結論を出す。

## 端末実行と量子化

写真の意味推論を毎カメラフレームで行う要件は置かない。初期の端末モードは全体を小さい入力で低頻度に更新し、必要な時だけ対象cropを追加処理し、忙しい間は前回結果を表示し続ける方式を試す。更新頻度は実機ベンチ後に決める。狭い領域だけを再計算できるモデルなら一回あたりの演算は減り得るが、全画面segmentationを毎回実行して結果の一部だけ使う方式は安くならない。全体文脈用encoder、crop処理回数、メモリ転送の固定費があり、領域面積に比例して総費用が必ず下がるわけではない。

- 最初はfloat基準モデルを固定して、post-training quantization（PTQ）で重みまたは重みとactivationを圧縮し、画質・細線・速度・メモリの差を見る。
- PTQで許容できない細線やpalette indexの崩れが出たとき、代表的な小物・暗部・色・scaleを含む校正データとquantization-aware training（QAT）を比較する。TensorFlowの公式ガイドもPTQを始めやすい選択、QATを精度維持が必要な候補と説明するが、対象モデルでの優位を保証しない。
- iOSネイティブへ配るならCore ML変換・量子化・対応演算・deployment targetを確認する。Web版は現在のコードがTensorFlow.js runtimeでWebGLからCPUへfallbackする構成であり、Core MLで測った数値はそのまま使えない。実際のブラウザー、OS、GPU/CPU、画面サイズで別々に測る。モバイルWebのfallback時FPSや消費電力は未検証。

## 段階計画と費用

| 段階 | 作業 | 続行判断 |
| --- | --- | --- |
| 0. データ定義 | 画風ルール、格子、色数、対象カテゴリー、scale、細線の3判断、権利条件を固定。 | 同一sceneの権利確認済み写真と人手またはAI候補をreviewした承認済みtargetを対にできるか、許諾・保管手順を確認。 |
| 1. 合成静止画pilot（実施済み） | 720枚のコード生成教材でTensorFlow.js v1/v2の局所palette-index復元を学習し、v2を720 stepでvalidation評価した。 | v2は画素accuracy 90.0%だが、境界F1 35.8%・細線境界F1 25.0%で最近色基準38.5%・31.8%に届かない。結果は合成教材内の未使用seedだけに限り、品質採用・実写真への汎化を示さない。詳細は [`pixel-studio-training-results.md`](pixel-studio-training-results.md)。次段階は教師候補レビューと、別課題としてscene-disjoint実写真・承認target pairを整えること。 |
| 2. compact student | MobileNetV4級の小型encoder/多段decoderを通常教師あり学習とteacher-distillationで比較。全体＋crop、palette index/線種出力を試す。 | scene-disjoint testで作家判断が改善するモデルだけ残す。 |
| 3. 端末圧縮 | PTQを先行し、必要な時だけQAT。Web runtimeとiOS Core MLは別artifactとしてexport・比較。 | 各配布先で品質・低頻度更新・メモリが要件を満たすか実測。 |
| 4. 動画 | 権利確認済みclipをscene単位で分割し、追跡マスクと時間損失を追加。 | scene cut、遮蔽、短い物体出現を含むholdoutでちらつきと更新遅れを比較。 |

見積りは実測で単価を差し替える式にする。ドル価格は未調査・未契約のため記載しない。

`総費用 = 権利確認・素材準備 + 作家の正解target制作 + 注釈・レビュー + 教師ラベル生成 + student学習 + 量子化・変換 + 実機評価 + 再作業枠`

`学習費用の見積り = Σ(実験run数 × epochs × 1 epochの実測時間 × 使用acceleratorの実際の時間単価) + storage / transfer`

狭いROIで対象画素だけを計算する実装は、全画面より一回のFLOPsやactivation memoryを減らせる可能性がある。一方で全体文脈経路、重なりcrop、細線の人手確認・paired target制作は残る。必要なscene数と作家レビューが支配的なら、学習総額は面積比ほど下がらない。まず小規模pilotの時間・作画時間・修正率を実測し、段階ごとに予算を承認する。

## 調査した一次資料

| 資料・公開日 | 計画に使う根拠 |
| --- | --- |
| Google et al., [MobileNetV4: Universal Models for the Mobile Ecosystem](https://arxiv.org/abs/2404.10518), 2024-04-16. | UIB / mobile accelerator向け構成とteacher distillationを報告。本文の各端末計測は著者条件であり、PiXiEEDの速度予測には転用しない。 |
| Zhang et al., [Faster Segment Anything: Towards Lightweight SAM for Mobile Applications](https://arxiv.org/abs/2306.14289), 2023-06-25. | 大きなSAM画像encoderから軽量encoderへ分離蒸留する設計例。報告速度は同論文環境だけの結果。 |
| Meta FAIR, [SAM 2: Segment Anything in Images and Videos](https://arxiv.org/abs/2408.00714), 2024-08-01. | 動画のstreaming memory、物体masklet、model-in-the-loopで作られた動画注釈の参考。学習教師候補としてだけ扱う。 |
| Oquab et al. / Meta FAIR, [DINOv2: Learning Robust Visual Features without Supervision](https://arxiv.org/abs/2304.07193), 2023-04-14. | 大規模teacherの特徴をpixel-level課題へ転用し、小型モデルへ蒸留する研究。特徴抽出器単体はpixel-artの物体maskや線の正解ではない。 |
| TensorFlow Model Optimization, [Quantization aware training](https://www.tensorflow.org/model_optimization/guide/quantization/training), 参照 2026-09-23. | PTQとQATの区別。PTQから始め、量子化で精度が落ちる場合にQATを評価する根拠。 |
| Apple Core ML Tools, [Optimization Workflow](https://apple.github.io/coremltools/docs-guides/source/opt-workflow.html), 参照 2026-09-23. | 重みのpalettization/quantization、activation校正やfine-tuningのworkflowとdeployment target例。圧縮効果と対応はCore ML runtimeに依存する。 |
| Hu et al. / Microsoft, [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685), 2021-06-17; ICLR 2022. | 基底Transformerを凍結し更新パラメータを減らす方法。元研究はLLMであり、端末用vision studentを小さくする方法とは別。 |
| Shit et al., [clDice: A Novel Topology-Preserving Loss Function for Tubular Structure Segmentation](https://arxiv.org/abs/2003.07311), 2020-03-16. | 骨格と二値構造の接続性を評価する補助損失候補。線画の全ての作家的判断を保証するものではない。 |



## 今回の合成教材実験

これは上記のMobileNet/SAM/DINOの学習済み構成ではない。整数格子に直接描いた基礎パターンを、既存のTensorFlow.jsだけで小さな局所畳み込みモデルへ学習させる初期実験である。元の基礎パターンにぼかし・ノイズを加えた入力から、固定16色のpalette indexを復元する。

- 12種 × 10シーンseed × 6サイズ = 720枚。各16/32/64/128/256/512pxに120枚ずつ。
- train 576、validation 72、test 72。各シーンの全サイズは同じ分割に入る。PNGのSHA-256で分割をまたぐ同一画像は0件。全PNGのCRC・寸法・パレットを独立に確認。
- 教材は線、曲線、色面、ディザ、木・家・カップ・単純な風景の基礎図形。人物、顔、動物、材質、複雑な街や自然、透過、動画は含まない。コード描画であり、画像生成モデルが描いた完成作品ではない。
- 単純拡大はしていないが、同じ12種類の描画ルールを全分割で共有する。分割で測るのは同じルール内の未使用seedへの復元であり、未知のドット絵技法や実写真への汎化ではない。
- 512px教材もモデルには64pxの局所cropとして入力する。512px全景を意味的に認識して描き直すモデルを学習したという意味ではない。

実測結果・保存重み・採否は `pixel-studio-training-results.md` に記録する。初期checkpointは実写真品質が確認されていないため、撮影UIへ自動採用しない。
