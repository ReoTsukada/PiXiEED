# PiXiEED 地図素材

## 世界GeoJSON

`world-countries-110m.geojson` は Natural Earth 1:110m の Admin 0 Countries を
GeoJSON形式で同梱したものです。PiXiEEDではWGS84の経度・緯度を球面上の正射図法へ
投影し、日本を基準にした100%表示から、ズームアウトで地球全体へ連続表示します。

- 出典: [Natural Earth 1:110m Cultural Vectors](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/) — Admin 0 Countries
- 投影: orthographic globe / WGS84 longitude-latitude
- 表示: `js/app.js` がGeoJSONから球面SVGパスを生成し、ドラッグで中心経度・緯度を回転
- セル: ズームアウトした22%以下では、国土を判定した128×128の固定セルを表示。縮小時に中心を自動変更せず、回転した視点をそのまま保持
- 目的: 外部地図APIに依存しない軽量な世界地図

## 日本地図

`japan-prefectures.geojson` は [Geolonia prefecture-tiles](https://github.com/geolonia/prefecture-tiles) の都道府県GeoJSONを、PiXiEEDの経緯度セル判定用に同梱したものです。47都道府県をWGS84の経度・緯度で保持しているため、セルの内外判定と県フォーカスの基準が実際の地理形状に一致します。

- 出典: [Geolonia prefecture-tiles](https://github.com/geolonia/prefecture-tiles) — `prefectures.geojson`
- 投影: WGS84 longitude-latitude → PiXiEEDの正射図法へ変換
- 表示: `js/app.js` がGeoJSONを透明な判定レイヤーへ変換し、128×128の固定セルを生成
- 日本表示: 日本を中心とする24度の表示範囲にも同じ固定セル密度で国土セルを描画し、韓国・中国・ロシアなど周辺国を途切れさせない
- 軽量化: JSONの空白のみを除去。座標と47フィーチャーは保持

`japan-prefectures.svg` は旧来の表示用素材として残していますが、現在の公開マップのセル判定には使用していません。

沖縄・琉球列島もGeoJSONの経度・緯度をそのまま投影するため、九州の南西にある実際の位置関係で表示されます。手動のインセット配置は行いません。

旧SVG素材の原作者・ライセンスの案内は、旧素材の元リポジトリに従います。現在の公開画面では、使用中のデータに合わせて `Natural Earth / Geolonia GeoJSON` を出典表示しています。
