const MAX_PIXELS = 4_000_000;
const MAX_INSTANCES = 256;
const VISIBLE_CONFIDENCE = 0.5;

/**
 * Resolve externally supplied instance masks into one visible owner per pixel.
 * IDs are caller-managed identities; this function does not track objects
 * across frames and does not infer physical depth from scores or order values.
 */
export function composeVisibleLabels({ width, height, instances } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new RangeError(`width and height must be positive and contain at most ${MAX_PIXELS} pixels`);
  }
  const pixelCount = width * height;
  if (!Array.isArray(instances) || instances.length > MAX_INSTANCES) {
    throw new RangeError(`instances must be an array with at most ${MAX_INSTANCES} entries`);
  }

  const ids = new Set();
  const prepared = instances.map((instance) => {
    if (!instance || typeof instance !== 'object') throw new TypeError('each instance must be an object');
    const { id, score, mask, confidence, frontOrder } = instance;
    if (!Number.isInteger(id) || id < 1 || id > 0xffffffff) throw new RangeError('instance id must be a positive uint32');
    if (ids.has(id)) throw new RangeError(`duplicate instance id: ${id}`);
    ids.add(id);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new RangeError(`instance ${id} score must be between 0 and 1`);
    if (!(mask instanceof Uint8Array) || mask.length !== pixelCount) throw new TypeError(`instance ${id} mask must be a Uint8Array of width * height`);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0 && mask[i] !== 1) throw new RangeError(`instance ${id} mask values must be 0 or 1`);
    }
    if (confidence !== undefined) {
      if (!(confidence instanceof Float32Array) || confidence.length !== pixelCount) {
        throw new TypeError(`instance ${id} confidence must be a Float32Array of width * height`);
      }
      for (let i = 0; i < confidence.length; i++) {
        if (!Number.isFinite(confidence[i]) || confidence[i] < 0 || confidence[i] > 1) {
          throw new RangeError(`instance ${id} confidence values must be finite and between 0 and 1`);
        }
      }
    }
    if (frontOrder !== undefined && !Number.isFinite(frontOrder)) {
      throw new RangeError(`instance ${id} frontOrder must be finite when provided`);
    }
    return { id, score, mask, confidence, frontOrder };
  }).sort((a, b) => a.id - b.id);

  const labels = new Uint32Array(pixelCount);
  const ownerWeight = new Float64Array(pixelCount);
  const ownerOrder = new Float64Array(pixelCount);
  const hasOwnerOrder = new Uint8Array(pixelCount);

  for (const instance of prepared) {
    const { id, score, mask, confidence, frontOrder } = instance;
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      if (mask[pixel] !== 1) continue;
      const pixelConfidence = confidence ? confidence[pixel] : 1;
      if (pixelConfidence < VISIBLE_CONFIDENCE) continue;
      const candidateWeight = pixelConfidence * score;
      const currentId = labels[pixel];
      if (currentId === 0) {
        labels[pixel] = id;
        ownerWeight[pixel] = candidateWeight;
        if (frontOrder !== undefined) {
          hasOwnerOrder[pixel] = 1;
          ownerOrder[pixel] = frontOrder;
        }
        continue;
      }

      const bothOrdered = frontOrder !== undefined && hasOwnerOrder[pixel] === 1;
      const wins = bothOrdered
        ? frontOrder > ownerOrder[pixel] || (frontOrder === ownerOrder[pixel] && (candidateWeight > ownerWeight[pixel] || (candidateWeight === ownerWeight[pixel] && id < currentId)))
        : candidateWeight > ownerWeight[pixel] || (candidateWeight === ownerWeight[pixel] && id < currentId);
      if (wins) {
        labels[pixel] = id;
        ownerWeight[pixel] = candidateWeight;
        hasOwnerOrder[pixel] = Number(frontOrder !== undefined);
        ownerOrder[pixel] = frontOrder ?? 0;
      }
    }
  }

  return {
    width,
    height,
    labels,
    ownership: 'visible-mask',
    overlapResolution: 'provided-order-or-confidence'
  };
}
