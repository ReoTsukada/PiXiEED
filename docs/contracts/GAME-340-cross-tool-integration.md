# GAME-340 Cross-tool integration contract

GAME-340 は pure TypeScript の Game package boundary であり、Draw2/PiXiAudio の canonical asset revision を参照 lock として Scene/Entity、preview、package manifest に結び付ける。raw pixel/audio bytes、DOM、network、filesystem、Storage、Registry、Queue、State、Context、Market、publish はこの層の authority ではない。

`LIVE` は canonical current revision のみを追従し、caller の revision/hash override を拒否する。`PINNED` は revision/hash を固定し、`REVIEW` は `APPROVED` revision、`FORKED` は canonical fork binding を要求する。全 mode は owner/project/license/permission を canonical record と照合する。

Package manifest は project revision/hash、resolved asset locks、dependency locks、license snapshots を canonical order で hash 化する。欠落、stale/wrong caller、duplicate/cycle、partial lock、hash/license/mode mismatch は manifest/preview を生成せず fail-closed にする。

Preview update は project/owner/revision、asset kind/id、sequence、event id を持つ immutable event とする。LIVE Draw/Audio の更新は source project を変更せず、PINNED/REVIEW/FORKED は hot update を拒否する。duplicate/out-of-order event は拒否し、state rollback は preview state のみを戻す。

この契約は package/build integration contract のみで、publish、production runtime、browser/device UX、native build、real asset registry qualification は `UNTESTED` である。
