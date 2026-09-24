# Face camera runtime provenance

All runtime code and model graphs in this directory are Apache-2.0. The TensorFlow.js runtime is reused from `vendor/pixel-studio/tf.min.js` (version 4.22.0); no remote inference endpoint or CDN is used.

## Runtime bundles

| File | Pinned source | License | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| `face-landmarks-detection-1.0.6.min.js` | [`@tensorflow-models/face-landmarks-detection` 1.0.6](https://registry.npmjs.org/@tensorflow-models/face-landmarks-detection/-/face-landmarks-detection-1.0.6.tgz) | Apache-2.0 | 127342 | `4b203ef4ff3a71db3486134184211ced51d944c3e4059358eff54c79fbf6e5e9` |
| `face-detection-1.0.3.min.js` | [`@tensorflow-models/face-detection` 1.0.3](https://registry.npmjs.org/@tensorflow-models/face-detection/-/face-detection-1.0.3.tgz) | Apache-2.0 | 17930 | `fd4d7802308ce764cfb9c5702885fff681537fe6b3f478de7babf12834d6d49f` |

Source npm archive checksums: `face-landmarks-detection-1.0.6.tgz` (1707156 bytes), `6701f287a3e7de0c774263fa33181450cab480eb4b482d77287c68fc99864ccd`; `face-detection-1.0.3.tgz` (133047 bytes), `61124203f7e2ffba31197d414d48ef61949440b5b632cd39b8a9a74accf84945`.

The package metadata declares Apache-2.0. Their TensorFlow.js peer range starts at 4.13; this project reuses the local 4.22.0 bundle. The upstream modules and Apache license are available from the [TensorFlow.js Models repository](https://github.com/tensorflow/tfjs-models).

## Model graphs

| Files | Pinned Kaggle handle and official download route | License and output | Archive SHA-256 |
| --- | --- | --- | --- |
| `../../assets/face-camera/attention-mesh/*` | `mediapipe/face-landmarks-detection/tfJs/attention-mesh/1`; [model page](https://www.kaggle.com/models/mediapipe/face-landmarks-detection/tfJs/attention-mesh/1); API `https://www.kaggle.com/api/v1/models/mediapipe/face-landmarks-detection/tfJs/attention-mesh/1/download` | Apache 2.0 per Kaggle model page; 478 landmarks | 2238537-byte archive; `746d41ced73260e5b60465dada5c1611722ad42fd25cd15cc99620b96707a3a9` |
| `../../assets/face-camera/face-detection/*` | `mediapipe/face-detection/tfJs/short/1`; [model page](https://www.kaggle.com/models/mediapipe/face-detection/tfJs/short/1); API `https://www.kaggle.com/api/v1/models/mediapipe/face-detection/tfJs/short/1/download` | Apache 2.0 per [BlazeFace Short Range model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf) | 194021-byte archive; `0ed428c45a8c14bf85722c23645212a501c9a2d112c525c3a2a8790da0e15ede` |

Model graph file checksums:

- Attention mesh `model.json` (934817 bytes): `df2f0944de7d65f8ce0377deb2ee658e24eca778f8e4d6fd70689e2d59f9634b`
- Attention mesh `group1-shard1of1.bin` (2382414 bytes): `1ae49614abaa80c6efce9b39e2ec316314fc4d6fab183409afb0a97ae13ba892`
- Face detector `model.json` (75722 bytes): `c131145fade749f714d39811f282e973760a69cb9e1a9c22f91e132bd8dcd396`
- Face detector `group1-shard1of1.bin` (201268 bytes): `e9b69ee1c1f8cd33c58120bcd75bf8c56bfba20c880f447e9d293ec102059d4b`

The model page identifies attention-mesh as the 478-point TF.js model. The separate short-range face detector is used only to locate a face before landmark inference. Model files are local relative to the web app, and inference stays in the browser worker.

`LICENSE-APACHE-2.0.txt` is the Apache 2.0 text (11358 bytes; SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`). Model-graph provenance and the package's declared license are recorded separately because the Kaggle model artifacts are distinct from the runtime source package.
