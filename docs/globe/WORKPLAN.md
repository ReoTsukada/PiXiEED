# PiXiEED Globe workplan

## G0 geometry / topology — IMPLEMENTED

正射投影、逆投影、GeoJSONの明示所属、境界トポロジーを依存なしで使用する。地理セルは経度・緯度境界の固定IDを持つ。

## G1 meridian-parallel prototype — IMPLEMENTED

0.5度緯度帯ごとの適応経度分割、赤道付近の約0.5度経度幅、極セル、球面四辺形の投影、Canvas単一描画、中心固定ズーム、ドラッグ回転、共有クリック処理を実装した。旧square-raster専用の描画とスクリーン矩形hit regionはプロトタイプ経路から除外した。

## G2 hierarchy and content hooks — IMPLEMENTED

world/country/region/prefecture/cellのLODヒステリシス、日本9地域・47都道府県の明示階層、activeLayer/contentCountsによる空データ対応、spaceTextureフックを実装した。

## G2.5 bounded precision and repaint slice — IMPLEMENTED

可視経度区間の事前絞り込み、球の可視半径に基づく4度先読み、上限付きセルキャッシュ、セルID Mapピッキング、DPR上限2、色・透明度バケット描画を追加した。計画生成と再描画を分離し、ホバー・選択は計画を再構築せず再描画だけを行う。1度・0.75度・0.5度の候補数、描画数、切り捨ての比較と、planBuilds、repaints、キャッシュ統計をローカルスナップショットへ出力する。

## G3 browser / device / performance — UNTESTED

複数DPR、実機、長時間回転、極・日付変更線の画素監査、フレーム時間、メモリ収束は未検証。Nodeテストの合格をブラウザ性能の証拠とは扱わない。

## G4 product integration — UNIMPLEMENTED

公開runtime、投稿導線、イベント・店舗・ユーザー投稿の集約、server validation、legacy adapter、Realtimeは別作業。今回のprototypeから接続しない。

## G5 release decision — UNTESTED

commit、push、deploy、publishは行わない。公開統合前にSOLの受入確認を行い、難しい性能・地理監査のみAstraへ再依頼する。
