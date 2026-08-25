# ADR-20260825: PiXiEEDstudio naming boundary

## 決定

公開するブランド名は **PiXiEEDstudio** とする。制作モードは **iDRAW / iAUDIO / iGAME** の3つに限定する。

画面見出し、共通ナビゲーション、Figmaボード、SEOの主要な表示名、アプリシェルの名称には、`PiXiEED Core` と `PiXiEEDCore` を使用しない。

## 互換性境界

既存の内部契約、スキーマプロパティ、テスト用識別子、旧URLに含まれる `Core` や `PiXiEEDraw2` は、データ・履歴・リンクを壊さないため、この決定だけでは改名しない。これらは実装上の識別子であり、ユーザー向けの製品名ではない。

## UIでの表記

| 用途 | 正式表記 |
| --- | --- |
| 共通制作環境 | PiXiEEDstudio |
| ドット絵・アニメーション | iDRAW |
| 音楽・SE・ミックス | iAUDIO |
| ゲーム・プレビュー | iGAME |

この命名は、Web、PWA、デスクトップシェル、将来のiOS/Androidシェルで共通に扱う。
