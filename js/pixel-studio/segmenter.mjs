const MODEL_ID = 'slimsam';
const MODEL_NAME = 'SlimSAM';
const MAX_INPUT_SIDE = 512;
const MAX_INPUT_PIXELS = MAX_INPUT_SIDE * MAX_INPUT_SIDE;
const POINT_GRID_SIDE = 4;
const POINT_BATCH_SIZE = 2;
const MIN_SCORE = 0.78;
const MIN_STABILITY = 0.82;
const MIN_MASK_FRACTION = 0.004;
const MAX_MASK_FRACTION = 0.94;
const DEDUPE_IOU = 0.86;

function validateFrame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > 16_000_000 ||
      !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
      frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('frame must contain a valid bounded RGBA buffer');
  }
}

function checkAbort(signal, disposed) {
  if (disposed) throw new DOMException('Segmenter disposed', 'AbortError');
  if (signal?.aborted) throw new DOMException('Segmentation aborted', 'AbortError');
}

function pointsForGrid(width, height) {
  const points = [];
  for (let gy = 0; gy < POINT_GRID_SIDE; gy++) {
    for (let gx = 0; gx < POINT_GRID_SIDE; gx++) {
      points.push([
        Math.min(width - 1, Math.floor((gx + 0.5) * width / POINT_GRID_SIDE)),
        Math.min(height - 1, Math.floor((gy + 0.5) * height / POINT_GRID_SIDE))
      ]);
    }
  }
  return points;
}

function makeResizedRgbImage(frame, RawImage) {
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const rgb = new Uint8Array(width * height * 3);

  if (width === frame.width && height === frame.height) {
    for (let src = 0, dst = 0; src < frame.data.length; src += 4, dst += 3) {
      const alpha = frame.data[src + 3] / 255;
      rgb[dst] = Math.round(frame.data[src] * alpha + 255 * (1 - alpha));
      rgb[dst + 1] = Math.round(frame.data[src + 1] * alpha + 255 * (1 - alpha));
      rgb[dst + 2] = Math.round(frame.data[src + 2] * alpha + 255 * (1 - alpha));
    }
  } else {
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) throw new Error('Canvas resizing is unavailable in this environment');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create the image resize canvas');
    const source = typeof ImageData === 'function'
      ? new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height)
      : context.createImageData(frame.width, frame.height);
    if (!(typeof ImageData === 'function')) source.data.set(frame.data);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sourceToCanvas(source, frame.width, frame.height), 0, 0, width, height);
    const resized = context.getImageData(0, 0, width, height).data;
    for (let src = 0, dst = 0; src < resized.length; src += 4, dst += 3) {
      const alpha = resized[src + 3] / 255;
      rgb[dst] = Math.round(resized[src] * alpha + 255 * (1 - alpha));
      rgb[dst + 1] = Math.round(resized[src + 1] * alpha + 255 * (1 - alpha));
      rgb[dst + 2] = Math.round(resized[src + 2] * alpha + 255 * (1 - alpha));
    }
  }
  return { image: new RawImage(rgb, width, height, 3), width, height };
}

function sourceToCanvas(imageData, width, height) {
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, height)
    : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas;
}

function tensorPlane(tensor, pointIndex, candidateIndex, candidatesPerPoint = 3) {
  const dims = tensor?.dims;
  if (!Array.isArray(dims) || dims.length < 4) return null;
  let planeIndex;
  if (dims.length >= 5) planeIndex = pointIndex * candidatesPerPoint + candidateIndex;
  else if (dims.length === 4 && dims[1] === candidatesPerPoint) {
    planeIndex = pointIndex * candidatesPerPoint + candidateIndex;
  } else planeIndex = candidateIndex;
  const height = dims.at(-2), width = dims.at(-1);
  const planeSize = width * height;
  const data = tensor.data;
  const offset = planeIndex * planeSize;
  if (!Number.isInteger(width) || !Number.isInteger(height) || offset + planeSize > data.length) return null;
  return { data, offset, width, height, planeSize };
}

function scoreAt(tensor, pointIndex, candidateIndex) {
  if (!tensor?.data || !Array.isArray(tensor.dims)) return 0;
  const candidates = tensor.dims.at(-1) ?? 3;
  const batch = tensor.dims.length >= 3 ? tensor.dims.at(-2) : 1;
  const index = batch > 1 ? (pointIndex * candidates + candidateIndex) : candidateIndex;
  const value = tensor.data[index];
  return Number.isFinite(value) ? value : 0;
}

function eligibleCandidates(predMasks, iouScores, pointCount) {
  const eligible = [];
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    for (let maskIndex = 0; maskIndex < 3; maskIndex++) {
      const score = scoreAt(iouScores, pointIndex, maskIndex);
      if (score < MIN_SCORE) continue;
      const stability = stabilityOf(tensorPlane(predMasks, pointIndex, maskIndex));
      if (stability < MIN_STABILITY) continue;
      eligible.push({ pointIndex, maskIndex, score, stability });
    }
  }
  return eligible;
}

function postProcessIfEligible(eligible, postProcess) {
  return eligible.length ? postProcess() : null;
}

function normalizedScore(rawScore) {
  return Math.max(0, Math.min(1, rawScore));
}

function product(values) {
  return values.reduce((value, next) => value * next, 1);
}

function sliceTensorBatch(source, axis, start, count, TensorConstructor) {
  const dims = source?.dims;
  const sourceData = source?.data;
  if (!Array.isArray(dims) || !Number.isInteger(axis) || axis < 0 || axis >= dims.length ||
      !Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 1 ||
      start + count > dims[axis] || !ArrayBuffer.isView(sourceData) ||
      typeof TensorConstructor !== 'function') {
    throw new TypeError(`Cannot slice tensor batch: axis=${axis}, start=${start}, count=${count}, dims=${JSON.stringify(dims ?? null)}`);
  }
  const outerSize = product(dims.slice(0, axis));
  const innerSize = product(dims.slice(axis + 1));
  const sourceBatch = dims[axis] * innerSize;
  const outputDims = dims.slice();
  outputDims[axis] = count;
  const data = new sourceData.constructor(outerSize * count * innerSize);
  for (let outer = 0; outer < outerSize; outer++) {
    const sourceOffset = outer * sourceBatch + start * innerSize;
    const targetOffset = outer * count * innerSize;
    data.set(sourceData.subarray(sourceOffset, sourceOffset + count * innerSize), targetOffset);
  }
  return new TensorConstructor(source.type, data, outputDims);
}

function assertPointTensorPair(points, labels, pointCount) {
  const pd = points?.dims, ld = labels?.dims;
  if (points?.type !== 'float32' || !Array.isArray(pd) || pd.length !== 4 ||
      pd[0] !== 1 || pd[1] !== pointCount || pd[2] !== 1 || pd[3] !== 2 ||
      !(points.data instanceof Float32Array) || points.data.length !== pointCount * 2) {
    throw new TypeError(`SlimSAM point tensors have unexpected shape or dtype; points=${JSON.stringify(pd ?? null)}/${points?.type ?? 'missing'}, labels=${JSON.stringify(ld ?? null)}/${labels?.type ?? 'missing'}`);
  }
  if (labels !== undefined && labels !== null &&
      (labels.type !== 'int64' || !Array.isArray(ld) || ld.length !== 3 ||
       ld[0] !== 1 || ld[1] !== pointCount || ld[2] !== 1 ||
       !(labels.data instanceof BigInt64Array) || labels.data.length !== pointCount)) {
    throw new TypeError(`SlimSAM label tensor has unexpected shape or dtype; points=${JSON.stringify(pd)}, labels=${JSON.stringify(ld ?? null)}/${labels?.type ?? 'missing'}`);
  }
}

function stabilityOf(plane) {
  if (!plane) return 0;
  let intersection = 0, union = 0;
  for (let i = 0; i < plane.planeSize; i++) {
    const value = plane.data[plane.offset + i];
    const positive = value > 0.5;
    const plausible = value > -0.5;
    if (positive && plausible) intersection++;
    if (positive || plausible) union++;
  }
  return union ? intersection / union : 0;
}

function maskFromPlane(plane, accepted, resizedWidth, resizedHeight) {
  const mask = new Uint8Array(plane.width * plane.height);
  for (let i = 0; i < mask.length; i++) mask[i] = accepted(plane.data[plane.offset + i]) ? 1 : 0;
  if (plane.width === resizedWidth && plane.height === resizedHeight) return mask;
  const scaled = new Uint8Array(resizedWidth * resizedHeight);
  for (let y = 0; y < resizedHeight; y++) {
    const sy = Math.min(plane.height - 1, Math.floor((y + 0.5) * plane.height / resizedHeight));
    for (let x = 0; x < resizedWidth; x++) {
      const sx = Math.min(plane.width - 1, Math.floor((x + 0.5) * plane.width / resizedWidth));
      scaled[y * resizedWidth + x] = mask[sy * plane.width + sx];
    }
  }
  return scaled;
}

function assertMaskPlane(plane, tensor, pointIndex, maskIndex) {
  const dims = tensor?.dims;
  if (!plane || !(plane.data instanceof Uint8Array || plane.data instanceof Uint8ClampedArray) ||
      !Number.isInteger(plane.width) || !Number.isInteger(plane.height) ||
      plane.width < 1 || plane.height < 1 || plane.width * plane.height > 1024 * 1024 ||
      plane.planeSize !== plane.width * plane.height || plane.offset < 0 ||
      plane.offset + plane.planeSize > plane.data.length) {
    throw new TypeError(`SlimSAM mask output contract failed at point ${pointIndex}, mask ${maskIndex}; dims=${JSON.stringify(dims ?? null)}`);
  }
  for (let i = 0; i < plane.planeSize; i++) {
    const value = plane.data[plane.offset + i];
    if (value !== 0 && value !== 1) {
      throw new TypeError(`SlimSAM mask output is not binary at point ${pointIndex}, mask ${maskIndex}; dims=${JSON.stringify(dims)}`);
    }
  }
  return plane;
}

function maskStats(mask) {
  let area = 0;
  for (const value of mask) area += value;
  return { area, fraction: area / mask.length };
}

function containsPrompt(mask, width, point) {
  return mask[point[1] * width + point[0]] === 1;
}

function intersectionOverUnion(left, right) {
  let intersection = 0, union = 0;
  for (let i = 0; i < left.length; i++) {
    if (left[i] || right[i]) union++;
    if (left[i] && right[i]) intersection++;
  }
  return union ? intersection / union : 0;
}

function releaseTensor(tensor) {
  tensor?.dispose?.();
}

export const __segmenterTestUtils = Object.freeze({
  tensorPlane, stabilityOf, assertMaskPlane, normalizedScore, sliceTensorBatch,
  assertPointTensorPair, eligibleCandidates, postProcessIfEligible
});

export function createSegmenter({ onProgress } = {}) {
  let modulePromise = null;
  let modelPromise = null;
  let model = null;
  let processor = null;
  let activeJob = null;
  let disposed = false;

  async function loadModule() {
    if (!modulePromise) {
      modulePromise = import('/vendor/object-camera/transformers.min.js').catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }

  async function loadModel() {
    if (!modelPromise) {
      modelPromise = (async () => {
        const runtime = await loadModule();
        runtime.env.allowRemoteModels = false;
        runtime.env.allowLocalModels = true;
        runtime.env.useBrowserCache = true;
        runtime.env.localModelPath = '/assets/object-camera/models/';
        if (runtime.env.backends?.onnx?.wasm) {
          runtime.env.backends.onnx.wasm.wasmPaths = new URL('/vendor/object-camera/', globalThis.location.href).href;
          runtime.env.backends.onnx.wasm.numThreads = 1;
          runtime.env.backends.onnx.wasm.proxy = false;
        }
        onProgress?.({ stage: 'loading', model: MODEL_NAME });
        const loadedModel = await runtime.SamModel.from_pretrained(MODEL_ID, {
          local_files_only: true, device: 'wasm', dtype: 'q8'
        });
        let loadedProcessor;
        try {
          loadedProcessor = await runtime.AutoProcessor.from_pretrained(MODEL_ID, { local_files_only: true });
        } catch (error) {
          await loadedModel.dispose?.();
          throw error;
        }
        if (disposed) {
          await loadedModel.dispose?.();
          throw new DOMException('Segmenter disposed', 'AbortError');
        }
        model = loadedModel;
        processor = loadedProcessor;
        return { runtime, model: loadedModel, processor: loadedProcessor };
      })().catch((error) => {
        modelPromise = null;
        model = null;
        processor = null;
        throw error;
      });
    }
    return modelPromise;
  }

  async function runSegment(frame, { signal } = {}) {
    validateFrame(frame);
    checkAbort(signal, disposed);
    const { runtime, model: activeModel, processor: activeProcessor } = await loadModel();
    checkAbort(signal, disposed);
    onProgress?.({ stage: 'preparing', model: MODEL_NAME });
    const prepared = makeResizedRgbImage(frame, runtime.RawImage);
    if (prepared.width * prepared.height > MAX_INPUT_PIXELS) throw new RangeError('resized model input exceeds pixel limit');

    let imageInputs = null, embeddings = null;
    try {
      const points = pointsForGrid(prepared.width, prepared.height);
      const candidates = [];
      imageInputs = await activeProcessor(prepared.image, {
        input_points: [points.map((point) => [point])]
      });
      assertPointTensorPair(imageInputs.input_points, imageInputs.input_labels, points.length);
      checkAbort(signal, disposed);
      embeddings = await activeModel.get_image_embeddings({ pixel_values: imageInputs.pixel_values });
      checkAbort(signal, disposed);
      onProgress?.({ stage: 'segmenting', completed: 0, total: points.length, model: MODEL_NAME });

      for (let start = 0; start < points.length; start += POINT_BATCH_SIZE) {
        checkAbort(signal, disposed);
        const batchPoints = points.slice(start, start + POINT_BATCH_SIZE);
        let pointBatch = null, labelBatch = null, outputs = null, processed = null;
        try {
          checkAbort(signal, disposed);
          pointBatch = sliceTensorBatch(imageInputs.input_points, 1, start, batchPoints.length, runtime.Tensor);
          if (imageInputs.input_labels) {
            labelBatch = sliceTensorBatch(imageInputs.input_labels, 1, start, batchPoints.length, runtime.Tensor);
          }
          outputs = await activeModel({
            input_points: pointBatch,
            ...(labelBatch ? { input_labels: labelBatch } : {}),
            image_embeddings: embeddings.image_embeddings,
            image_positional_embeddings: embeddings.image_positional_embeddings
          });
          checkAbort(signal, disposed);
          const eligible = eligibleCandidates(outputs.pred_masks, outputs.iou_scores, batchPoints.length);
          processed = await postProcessIfEligible(eligible, () => activeProcessor.post_process_masks(
            outputs.pred_masks,
            imageInputs.original_sizes,
            imageInputs.reshaped_input_sizes
          ));
          checkAbort(signal, disposed);
          const postBatch = Array.isArray(processed) ? processed[0] : processed;

          let eligibleOffset = 0;
          for (let localPoint = 0; localPoint < batchPoints.length; localPoint++) {
            let best = null;
            while (eligibleOffset < eligible.length && eligible[eligibleOffset].pointIndex === localPoint) {
              const { maskIndex, score, stability } = eligible[eligibleOffset++];
              const point = batchPoints[localPoint];
              const binary = assertMaskPlane(
                tensorPlane(postBatch, localPoint, maskIndex), postBatch, localPoint, maskIndex
              );
              const mask = maskFromPlane(binary, (value) => value !== 0, prepared.width, prepared.height);
              const { fraction } = maskStats(mask);
              if (fraction < MIN_MASK_FRACTION || fraction > MAX_MASK_FRACTION || !containsPrompt(mask, prepared.width, point)) continue;
              const candidate = { mask, score, stability };
              if (!best || candidate.score * candidate.stability > best.score * best.stability) best = candidate;
            }
            if (best) candidates.push(best);
          }
        } finally {
          releaseTensor(pointBatch);
          releaseTensor(labelBatch);
          releaseTensor(outputs?.pred_masks);
          releaseTensor(outputs?.iou_scores);
          if (processed) {
            if (Array.isArray(processed)) for (const tensor of processed) releaseTensor(tensor);
            else releaseTensor(processed);
          }
        }
        onProgress?.({ stage: 'segmenting', completed: Math.min(points.length, start + batchPoints.length), total: points.length, model: MODEL_NAME });
      }

      checkAbort(signal, disposed);
      candidates.sort((a, b) => b.score * b.stability - a.score * a.stability);
      const accepted = [];
      for (const candidate of candidates) {
        if (accepted.some((previous) => intersectionOverUnion(candidate.mask, previous.mask) >= DEDUPE_IOU)) continue;
        accepted.push(candidate);
      }
      const instances = accepted.map((candidate, index) => ({
        id: index + 1,
        score: normalizedScore(candidate.score),
        rawScore: candidate.score,
        mask: candidate.mask
      }));
      onProgress?.({ stage: 'complete', completed: points.length, total: points.length, instances: instances.length, model: MODEL_NAME });
      return { width: prepared.width, height: prepared.height, instances, model: MODEL_NAME, tracked: false };
    } finally {
      releaseTensor(embeddings?.image_embeddings);
      releaseTensor(embeddings?.image_positional_embeddings);
      if (imageInputs) for (const tensor of Object.values(imageInputs)) releaseTensor(tensor);
    }
  }

  return {
    async segment(frame, options = {}) {
      if (disposed) throw new DOMException('Segmenter disposed', 'AbortError');
      if (activeJob) throw new Error('Segmenter already has an active job');
      const job = runSegment(frame, options);
      activeJob = job;
      try { return await job; }
      finally { if (activeJob === job) activeJob = null; }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (activeJob) await activeJob.catch(() => {});
      if (model) await model.dispose?.();
      model = null;
      processor = null;
      modelPromise = null;
      modulePromise = null;
    }
  };
}
