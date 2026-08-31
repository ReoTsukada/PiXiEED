# PiXiEEDraw2 Icon System / Stroke Rules

Version 0.4.0

## 基準

- 原稿グリッドは24×24px。
- strokeは2pxを基準にする。
- `stroke-linecap="round"`、`stroke-linejoin="round"`を共通化する。
- safe areaは20×20px。strokeの外周を含めてx2..22 / y2..22に収める。
- `shape-rendering="geometricPrecision"`を使い、SVGとFigmaで同じviewBoxを使う。
- 通常状態はoutline。Active/強調状態以外で不要な面塗りを増やさない。
- 色は`currentColor`を受け、ライト・ダークの背景に依存しない。

## 形状

- 角は1〜2px相当の硬い丸み。完全な円形の角丸にはしない。
- 直線、矩形、三角形、円、最小限の曲線を同一座標でつなぐ。
- 線の終点と矢印の根元を離さない。矢印の先端は実際の操作方向へ向ける。
- Undoは左、Redoは右、Rollbackは折り返しの左向き矢印。reloadの円形矢印とは分ける。
- ループ、音符、PiXYNC波形は線と補助図形が別物に見えないよう、接点を共有する。
- ペン・ブラシ・消しゴムは斜め軸をそろえ、アイコンだけがツールバー上で大きく見えないようにする。

## Fill例外

次だけは意味または16px判別のためにfillを許可する。

- 操作そのものが塗りを示すもの: `icon-rect-fill`、`icon-ellipse-fill`、`icon-circle-fill`
- 16pxで輪郭だけでは落ちるもの: play / pause / stop / record / more / brush / color / select-color / manual / opacity
- 状態を示す最小マーカー: warningの点、PiXYNCの接続点

例外は増やさない。新しい例外を追加する場合は、16px白黒テストと理由をaudit JSONへ追加する。

## State / Size

Figmaの公開コンポーネントは次の契約にする。

- `State`: Default / Active / Hover / Disabled
- `Size`: 16 / 20 / 24 / 32
- `Color`: Current Color
- 個別glyphは`Tool Icon / {Tool Name}`、状態とサイズは`Tool Icon / Control`のvariantで管理する。
- 104 glyph × 16 variantを個別生成せず、INSTANCE_SWAPでglyphを差し替える。

## QA

各アイコンを16 / 20 / 24 / 32pxで確認し、次を満たすこと。

1. 白黒で意味が残る。
2. 16pxで線が潰れない。
3. safe areaからstrokeが出ない。
4. ライト・ダークで同じ形状のまま視認できる。
5. SVGとFigmaの重心、方向、線幅、viewBoxが一致する。
