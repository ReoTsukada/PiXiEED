# PiXiEED Figma import board

`pixieed-app-redesign-board.svg` は、Figmaへドラッグ＆ドロップして編集できる統合画面案です。

現在のブランド構成は **PiXiEEDstudio** を共通の制作入口とし、studio内のモードを **iDRAW / iAUDIO / iGAME** とします。

## 命名ルール

- ユーザーに見せる制作環境名は **PiXiEEDstudio** に統一する。
- 制作モードは **iDRAW / iAUDIO / iGAME** の3つに統一する。
- `PiXiEED Core` や `PiXiEEDCore` は製品名・画面名・ナビゲーション名として使用しない。
- 既存の内部スキーマキー、テスト識別子、互換性用URLに含まれる `Core` は、既存データを壊さないため変更しない。

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

## 実装トークン

公開シェルの実装は `site/public-design-system.css` を基準にします。

- `--pixieed-mode-draw`: iDRAW（エメラルド）
- `--pixieed-mode-audio`: iAUDIO（紫）
- `--pixieed-mode-game`: iGAME（黄色）
- `--pixieed-space-1/2/3`: 8 / 16 / 24px
- `--pixieed-radius-card`: 16px

画面固有のCSSで同じ値を再定義せず、共通シェルとStudio入口からこのトークンを参照します。
