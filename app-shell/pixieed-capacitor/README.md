# PiXiEED Capacitor App Shell

PiXiEED 全体を Google Play / App Store 向けにネイティブシェル化するための土台です。

## 前提

- Node.js 18 以上
- Xcode 16 以降（iOS ビルド時）
- Android Studio 最新版（Android ビルド時）
- Homebrew 管理の `openjdk`
- Homebrew 管理の `android-commandlinetools` / `android-platform-tools`

## 使い方

1. 依存関係をインストール

```bash
cd app-shell/pixieed-capacitor
npm install
```

2. Web アセットを staging

```bash
npm run build:web
```

3. ネイティブプロジェクトを生成

```bash
npm run cap:add:android
npm run cap:add:ios
```

4. Web 更新をネイティブへ反映

```bash
npm run cap:sync
```

5. IDE を開く

```bash
npm run cap:open:android
npm run cap:open:ios
```

## 1から進める手順

1. Web 側の修正を最新化する

```bash
cd app-shell/pixieed-capacitor
npm install
npm run cap:sync
```

2. Android 用の前提を確認して SDK を入れる

```bash
npm run doctor:android
npm run android:sdk:install
```

3. Android の debug APK を作る

```bash
npm run android:build:debug
```

- 出力先: `android/app/build/outputs/apk/debug/app-debug.apk`

4. Android Studio で署名付きリリースビルドを作る

```bash
npm run cap:open:android
```

- `Build > Generate Signed Bundle / APK...`
- Google Play 提出時は `Android App Bundle (.aab)` を選ぶ

5. Xcode で iOS 側を開く

```bash
npm run cap:open:ios
```

- `Signing & Capabilities` で Team / Bundle Identifier を確定
- 実機 Archive は `Product > Archive`
- App Store 提出は `Organizer` から行う

## この端末で使う補助コマンド

```bash
npm run doctor:android
npm run doctor:ios
npm run android:keystore:generate
npm run android:sdk:install
npm run android:build:debug
npm run android:build:release-apk
npm run android:build:aab
npm run ios:build:sim
npm run ios:archive:unsigned
npm run ios:archive
npm run ios:export:appstore
```

- `doctor:android`: `JAVA_HOME` と `ANDROID_SDK_ROOT` を app shell 用に補って確認します。
- `doctor:ios`: Xcode / iOS SDK / 利用可能 Simulator を確認します。
- `android:keystore:generate`: Android の upload keystore と `keystore.properties` をローカル生成します。
- `android:sdk:install`: `compileSdkVersion = 36` に必要な Android SDK パッケージを入れます。
- `android:build:debug`: Android の debug APK ビルドを実行します。
- `android:build:release-apk`: Android の release APK を作成します。
- `android:build:aab`: Google Play 提出用の `AAB` を作成します。
- `ios:build:sim`: iOS Simulator 向けのビルド確認を実行します。
- `ios:archive:unsigned`: 署名なしで iOS Archive のビルド確認を行います。
- `ios:archive`: App Store 提出用の iOS Archive を作成します。
- `ios:export:appstore`: Archive 済みビルドを App Store Connect 向けに export します。
- `ios:archive` で `No Accounts` が出る場合は、Xcode `Settings > Accounts` に Apple ID を追加してから再実行します。
- `ios:build:sim` で `iOS xx.x is not installed` が出る場合は、Xcode `Settings > Components` から iOS platform を追加します。

## このシェルの方針

- PiXiEED サイトの必要ページ群を `dist/web/` へローカル同梱します。
- アプリ起動時は PiXiEED のホームランチャーを開き、Draw / Lens / Tools / Public Room / Contest へ移動できます。
- ネイティブ実行時は PWA インストール案内を出しません。
- PiXiEELENS 起動は絶対 URL ではなく、同梱済みのローカルページを開きます。
- ネイティブ実行時の PiXiEEDraw 出力画像と PiXiEELENS 撮影結果は、まず写真アプリ / Gallery への保存を試し、失敗時は端末のネイティブ Documents 領域へ保存します。

## ストア提出前に必ず行う作業

- `capacitor.config.json` の `appId` を最終値に確定
- Android の署名設定
- iOS の Bundle Identifier / Team 設定
- アプリアイコン / スプラッシュ差し替え
- カメラ利用説明文を iOS `Info.plist` に追加
- Android 権限確認
- アプリ内に残す外部リンクと広告導線の審査確認

## release ビルドの作り方

### Android

1. `android/keystore.properties.example` をコピーして `android/keystore.properties` を作る
2. 実際の keystore 情報を入れる
3. 必要なら version を環境変数で上書きする

```bash
export PIXIEED_ANDROID_VERSION_CODE=1
export PIXIEED_ANDROID_VERSION_NAME=1.0.0
npm run android:build:aab
```

- 代わりに `PIXIEED_ANDROID_KEYSTORE_PATH` などの環境変数でも署名設定できます。
- 新規生成する場合は `npm run android:keystore:generate` が使えます。
- 出力先:
  - APK: `android/app/build/outputs/apk/release/app-release.apk`
  - AAB: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS

1. Xcode で `Signing & Capabilities` を開き、Team を設定する
2. 必要なら環境変数で Team / Bundle ID を上書きする
3. Archive を作る
4. App Store Connect 用に export する

```bash
export PIXIEED_IOS_DEVELOPMENT_TEAM=YOURTEAMID
export PIXIEED_IOS_BUNDLE_ID=jp.pixieed.app
npm run ios:archive
npm run ios:export:appstore
```

- 署名設定前のビルド確認だけなら `npm run ios:archive:unsigned` を使えます。
- unsigned archive 出力先: `ios/build/PiXiEED-unsigned.xcarchive`
- `No Accounts` が出る場合は、Xcode `Settings > Accounts` で Apple ID を追加してから `Signing & Capabilities` の Team を選択します。
- `PIXIEED_IOS_ALLOW_PROVISIONING_UPDATES=1` を付けると、CLI から provisioning 更新も許可できます。
- Archive 出力先: `ios/build/PiXiEED.xcarchive`
- Export 出力先: `ios/build/export/app-store-connect`

## 補足

- 依存バージョンは `latest` 指定です。初回 `npm install` 後は生成される lockfile をコミットして固定する運用を推奨します。
- `dist/web/index.html` はアプリ専用ランチャーとして自動生成されます。
- Android の debug ビルド成果物は `android/app/build/outputs/apk/debug/app-debug.apk` に出力されます。
- app shell の作業ディレクトリは `app-shell/pixieed-capacitor` です。
- ストア提出用の文言テンプレートは `store/` にまとめています。
