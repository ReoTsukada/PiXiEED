// PiXiEELENS shrank the camera image directly to its dot grid before colour
// reduction. Average each integer source tile here so the worker can do the
// same work without another canvas readback or a dependency on object masks.
export function sampleLensFrame(frame, size) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 ||
      !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
      frame.data.length !== frame.width * frame.height * 4 ||
      !Number.isInteger(size) || size < 1 || size > 512) {
    throw new TypeError('frame and output size must describe bounded RGBA pixels');
  }
  const scale = Math.min(1, size / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  if (width === frame.width && height === frame.height) {
    data.set(frame.data);
    for (let p = 3; p < data.length; p += 4) data[p] = 255;
    return { width, height, data, labels: null, stats: { sampling: 'lens-direct' } };
  }
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * frame.height / height);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * frame.height / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * frame.width / width);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * frame.width / width));
      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const p = (sy * frame.width + sx) * 4;
        r += frame.data[p]; g += frame.data[p + 1]; b += frame.data[p + 2]; count++;
      }
      const p = (y * width + x) * 4;
      data[p] = Math.round(r / count); data[p + 1] = Math.round(g / count);
      data[p + 2] = Math.round(b / count); data[p + 3] = 255;
    }
  }
  return { width, height, data, labels: null, stats: { sampling: 'lens-direct' } };
}
