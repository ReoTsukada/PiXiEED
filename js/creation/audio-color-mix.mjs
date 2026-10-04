/** Plan equal per-color amplitude budgets without changing stored notes. */
export function createAudioColorMixPlan(scheduled) {
  if (!Array.isArray(scheduled)) throw new TypeError('音量計画の音符が不正です');
  const curves = scheduled.map(() => null);
  const boundaries = new Map();
  const weights = new Map();
  const boundary = (tick) => {
    if (!boundaries.has(tick)) boundaries.set(tick, { start: [], end: [] });
    return boundaries.get(tick);
  };
  scheduled.forEach(({ event, onsetTick, endTick }, index) => {
    if (!event?.sourceCell || typeof event.colorId !== 'string') return;
    const weight = event.groupGain ?? 1;
    if (!Number.isFinite(onsetTick) || !Number.isFinite(endTick) || endTick <= onsetTick || !Number.isFinite(weight) || weight <= 0) throw new RangeError('音量計画の範囲が不正です');
    weights.set(index, weight);
    curves[index] = [];
    boundary(onsetTick).start.push(index);
    boundary(endTick).end.push(index);
  });
  const active = new Map();
  const append = (index, tick, gain) => {
    const curve = curves[index];
    if (!curve.length || Math.abs(curve.at(-1).gain - gain) > 1e-12) curve.push({ tick, gain });
  };
  for (const [tick, changes] of [...boundaries].sort(([a], [b]) => a - b)) {
    const previousColorCount = active.size;
    const dirtyColors = new Set();
    for (const index of changes.end) {
      const color = scheduled[index].event.colorId;
      const group = active.get(color);
      group.voices.delete(index);
      group.weight -= weights.get(index);
      if (!group.voices.size) active.delete(color);
      dirtyColors.add(color);
      append(index, tick, 0);
    }
    for (const index of changes.start) {
      const color = scheduled[index].event.colorId;
      if (!active.has(color)) active.set(color, { voices: new Set(), weight: 0 });
      const group = active.get(color);
      group.voices.add(index);
      group.weight += weights.get(index);
      dirtyColors.add(color);
    }
    const affected = active.size !== previousColorCount ? active.keys() : dirtyColors;
    for (const color of affected) {
      const group = active.get(color);
      if (!group) continue;
      for (const index of group.voices) append(index, tick, weights.get(index) / (active.size * group.weight));
    }
  }
  return curves;
}
