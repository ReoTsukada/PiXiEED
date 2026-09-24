const TFJS_URL = new URL('../../vendor/pixel-studio/tf.min.js', import.meta.url);
const FACE_DETECTION_URL = new URL('../../vendor/face-camera/face-detection-1.0.3.min.js', import.meta.url);
const FACE_LANDMARKS_URL = new URL('../../vendor/face-camera/face-landmarks-detection-1.0.6.min.js', import.meta.url);
const DETECTOR_MODEL_URL = new URL('../../assets/face-camera/face-detection/model.json', import.meta.url).href;
const LANDMARK_MODEL_URL = new URL('../../assets/face-camera/attention-mesh/model.json', import.meta.url).href;

let runtimePromise = null;

async function importGlobalBundle(url, name) {
  const module = await import(url.href);
  const scope = globalThis;
  if (!scope[name]) {
    const exported = module.default ?? module;
    if (Object.keys(exported).length) scope[name] = exported;
  }
  if (!scope[name]) throw new Error(`Local ${name} bundle did not register its browser global`);
  return scope[name];
}

async function loadRuntime(onProgress) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      onProgress?.({ phase: 'runtime' });
      const tf = await importGlobalBundle(TFJS_URL, 'tf');
      await importGlobalBundle(FACE_DETECTION_URL, 'faceDetection');
      const faceLandmarks = await importGlobalBundle(FACE_LANDMARKS_URL, 'faceLandmarksDetection');

      // Prefer WebGL where a worker/browser supports it. The bundled TFJS also
      // contains the CPU backend, so unsupported worker GL falls back locally.
      let backendReady = false;
      try { backendReady = await tf.setBackend('webgl'); } catch { /* CPU fallback below. */ }
      if (!backendReady) await tf.setBackend('cpu');
      await tf.ready();
      return { tf, faceLandmarks };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

async function createDetector(faceLandmarks) {
  return faceLandmarks.createDetector(
    faceLandmarks.SupportedModels.MediaPipeFaceMesh,
    {
      runtime: 'tfjs',
      maxFaces: 1,
      refineLandmarks: true,
      detectorModelUrl: DETECTOR_MODEL_URL,
      landmarkModelUrl: LANDMARK_MODEL_URL,
    },
  );
}

function asImageData(frame) {
  const { data, width, height } = frame ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
      || width > 8192 || height > 8192 || width * height > 4_194_304) {
    throw new RangeError('frame dimensions must be positive integers with at most 4,194,304 pixels');
  }
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new TypeError('frame.data must be an RGBA byte array');
  }
  if (data.length !== width * height * 4) throw new RangeError('frame.data length must equal width * height * 4');

  const pixels = new Uint8ClampedArray(data);
  if (typeof ImageData === 'function') return new ImageData(pixels, width, height);
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas 2D context is unavailable');
    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
    return canvas;
  }
  throw new Error('ImageData or OffscreenCanvas is required for face detection');
}

/** Load the self-hosted, on-device TensorFlow.js FaceMesh detector. */
export async function createFaceLandmarker({ onProgress } = {}) {
  const { faceLandmarks } = await loadRuntime(onProgress);
  onProgress?.({ phase: 'model' });
  const detector = await createDetector(faceLandmarks);
  onProgress?.({ phase: 'ready' });
  let disposed = false;
  return {
    async detect(frame, { timestamp } = {}) {
      if (disposed) throw new Error('face landmarker has been disposed');
      const image = asImageData(frame);
      const { width, height } = frame;
      const time = Number.isFinite(timestamp) ? timestamp : performance.now();
      const faces = await detector.estimateFaces(image, {
        flipHorizontal: false,
        staticImageMode: false,
      }, time);
      const landmarks = faces.slice(0, 1).map((face) => face.keypoints
        .map((point) => ({ x: point.x / width, y: point.y / height, z: point.z })));
      return { landmarks, width, height };
    },
    reset() {
      if (!disposed) detector.reset?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detector.dispose();
    },
  };
}
