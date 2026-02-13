# PiXFiND

ドット絵専用のブラウザゲームです。  
`間違い探し` と `もの探し` の2モードをサポートし、PNG 画像ペアの差分解析で判定領域を生成します。

## フォルダ構成

```
assets/
  puzzles/
    manifest.json        # 公式問題の一覧（自動生成）
    d1-maousama/         # 難易度1 (d1) の公式問題
      original.png
      diff.png
scripts/
  update-manifest.mjs    # 公式問題一覧を再生成
```

## 公式問題の追加方法

1. `assets/puzzles` 配下にフォルダを作成します。フォルダ名は `d1-forest` のように難易度を表す `d1`〜`d5` と任意のスラッグをハイフンで繋げてください。
2. 作成したフォルダ内に以下 2 ファイルを配置します。
   - `original.png` … 正しい画像
   - `diff.png` … 間違いを含んだ画像（RGBA のいずれかが異なるように加工）
3. `npm run puzzles` を実行すると `assets/puzzles/manifest.json` が自動生成されます。
4. `npm run dev` でサーバーを起動し、難易度とモードを選択すると公式問題が一覧に表示されます。

### manifest の任意フィールド

`manifest.json` の各問題には、以下を任意で追加できます。

- `mode`: `"spot-difference"` または `"hidden-object"`
- `targets`: もの探しモードで表示するお題名の配列（例: `["王冠", "しっぽ", "本"]`）

`mode` を省略した場合は `spot-difference` として扱われます。  
`targets` が不足している場合は `アイテム 1` 形式で自動補完されます。

> 2026年2月13日時点では、`hidden-object` の公式問題は未公開です。

> 公式問題は同一サイズの PNG である必要があります。差分は自動的に検出され、間違い数はプレイ時に表示されます。

## 開発

```bash
npm install
npm run dev
```

HTTP サーバーが `http://localhost:3000` で起動し、ブラウザが自動で開きます。

- `npm run puzzles` … 公式問題フォルダを走査して `manifest.json` を再生成

> カスタム問題ジェネレーターは調整中です。公式版が完成したら順次公開予定です。

## ライセンス

MIT
