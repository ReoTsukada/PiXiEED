# PiXiEED Figma import board

`pixieed-app-redesign-board.svg` は、Figmaへドラッグ＆ドロップして編集できる統合画面案です。

## 収録画面

- PC: ホーム、マーケット、商品詳細、マイページ
- スマホ: ホーム、マーケット、商品詳細、マイページ、QR、PiXiEEDraw、カメラ
- 共通デザインシステムと既存URLの対応

## Figmaへの取り込み

1. Figmaで新規Design fileを開く。
2. SVGファイルをキャンバスへドラッグ＆ドロップする。
3. 必要に応じてグループを解除し、各画面をFrame化する。
4. Auto Layout、Component、VariablesはFigma上で付け直す。

Figmaは画面構成と見た目の検討に使い、実装は既存のHTML/CSS/JavaScriptと遷移先を維持して段階的に移植する。
