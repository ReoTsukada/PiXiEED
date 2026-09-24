# Browser object-segmentation assets provenance

## Browser runtime

- `@huggingface/transformers@3.8.1` — Apache-2.0. npm tarball: https://registry.npmjs.org/@huggingface/transformers/-/transformers-3.8.1.tgz (SRI `sha512-tsTk4zVjImqdqjS8/AOZg2yNLd1z9S5v+7oUPpXaasDRwEDhB+xnglK1k5cad26lL5/ZIaeREgWWy0bs9y9pPA==`). Browser ESM build is based on `dist/transformers.web.min.js`; upstream SHA-256 `a8413eff44e055305b2028885b94caf591ce961b421e83b6d9f39fe8f29bda67`.
- Local `transformers.min.js` changes only the two external package specifiers so a module Worker needs no import map: `onnxruntime-common` → `./onnxruntime-common/dist/esm/index.js` and `onnxruntime-web` → `./ort.wasm.bundle.min.mjs`. The transformed file SHA-256 is `c8cc0d0c82effc31794453d4029e7f55a20c8867f809a132671823ad8aa10fff`. Hugging Face license text is retained as `TRANSFORMERS-LICENSE`.
- Transformers.js exact runtime dependency `onnxruntime-web@1.22.0-dev.20250409-89f8206ba4`, MIT. npm tarball: https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.22.0-dev.20250409-89f8206ba4.tgz (SRI `sha512-0uS76OPgH0hWCPrFKlL8kYVV7ckM7t/36HfbgoFw6Nd0CZVVbQC4PkrR8mBX8LtNUFZO25IQBqV2Hx2ho3FlbQ==`). `onnxruntime-common` at the same exact version is also MIT; the npm package SRI is `sha512-vDJMkfCfb0b1A836rgHj+ORuZf4B4+cc2bASQtpeoJLueuFc5DuYwjIZUBrSvx/fO5IrLjLz+oTrB3pcGlhovQ==`. Upstream MIT text is retained as `ONNXRUNTIME-LICENSE`.
- Only the WASM backend is staged: `ort.wasm.bundle.min.mjs`, `ort-wasm-simd-threaded.mjs`, and `ort-wasm-simd-threaded.wasm` are colocated so the ESM runtime resolves the adjacent WASM assets. WebGPU/JSEP, Node, and native runtime files are not included.

## SlimSAM model

- Repository: https://huggingface.co/Xenova/slimsam-77-uniform/tree/5850ab45f587c112167512ffef949107115e26a0 (immutable revision `5850ab45f587c112167512ffef949107115e26a0`; model-card license metadata: Apache-2.0).
- The model card says this repository repackages `nielsr/slimsam-77-uniform` ONNX weights for Transformers.js. This is a downloaded pretrained checkpoint, not a model trained for PiXiEED.
- Selected files: `config.json`, `preprocessor_config.json`, `quantize_config.json`, `onnx/vision_encoder_quantized.onnx`, and `onnx/prompt_encoder_mask_decoder_quantized.onnx`. The two ONNX files total 13,785,975 bytes. Apache-2.0 text and pinned model card are included in this model directory.
- ONNX encoder SHA-256: `cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971`; `prompt_encoder_mask_decoder_quantized.onnx` SHA-256: `cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2`. Config SHA-256: `config.json` 6339884f168658d3ca6473b486973913fb33e84e625e06ae2dd7b4a808187419; `preprocessor_config.json` 225545a743c654e3c495ec6f545a0eaba57c8ba3fbbd8483b3cb1c0fc58db517; `quantize_config.json` 2a1e2927485ff8675da940616e77578321e2083477d3fb22d2cfc53c604fb8ff.

## Worker integration boundary

Load `/vendor/object-camera/transformers.min.js` as a module from the worker. Point `env.localModelPath` at `/assets/object-camera/models/` and set `env.allowRemoteModels = false` before loading repository id `slimsam`. Transformers.js sets a CDN default for WASM; colocating files alone is not sufficient. Before model creation set `env.backends.onnx.wasm.wasmPaths = new URL('/vendor/object-camera/', globalThis.location.href).href`, `numThreads = 1`, and `proxy = false`. Keep `local_files_only: true` and `device: 'wasm'`. The camera adapter enforces these settings. Browser inference is recorded separately in `docs/pixel-camera-release.md`.
