const pulseWaveCache = new WeakMap();
const noiseBufferCache = new WeakMap();

function register(node, add) { add?.(node); return node; }

function getPulseWave(context, duty = 0.25, frequency = 440) {
  if (typeof context.createPeriodicWave !== 'function') return null;
  let waves = pulseWaveCache.get(context);
  if (!waves) { waves = new Map(); pulseWaveCache.set(context, waves); }
  const maxHarmonic = Math.max(1, Math.min(256, Math.floor(context.sampleRate / (2 * frequency))));
  const key = `${duty}:${maxHarmonic}`;
  if (waves.has(key)) return waves.get(key);
  const real = new Float32Array(maxHarmonic + 1); const imag = new Float32Array(maxHarmonic + 1);
  for (let n = 1; n <= maxHarmonic; n += 1) {
    const angle = 2 * Math.PI * n * duty;
    real[n] = Math.sin(angle) / (Math.PI * n); imag[n] = (1 - Math.cos(angle)) / (Math.PI * n);
  }
  const wave = context.createPeriodicWave(real, imag); waves.set(key, wave); return wave;
}

function noiseBuffer(context, profile, frequency, duration) {
  let cache = noiseBufferCache.get(context);
  if (!cache) { cache = new Map(); noiseBufferCache.set(context, cache); }
  const mode = profile.noiseMode || profile.noiseColor || 'white';
  const length = Math.max(256, Math.min(context.sampleRate * 2, Math.ceil(context.sampleRate * Math.max(0.25, duration))));
  const key = `${mode}:${Math.round(frequency)}:${length}`;
  if (cache.has(key)) return cache.get(key);
  const buffer = context.createBuffer(1, length, context.sampleRate); const data = buffer.getChannelData(0);
  if (mode === 'gb' || mode === 'nes') {
    let lfsr = 0x7fff;
    const clock = Math.max(8, Math.min(context.sampleRate, frequency > 0 ? frequency * 32 : 8000));
    let phase = 0;
    for (let i = 0; i < data.length; i += 1) {
      phase += clock / context.sampleRate;
      while (phase >= 1) { phase -= 1; const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); }
      data[i] = (lfsr & 1) ? 0.45 : -0.45;
    }
  } else {
    let b0 = 0; let b1 = 0; let b2 = 0; let mean = 0;
    let seed = 2166136261;
    for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 * 2 - 1; };
    for (let i = 0; i < data.length; i += 1) {
      const white = random();
      if (mode === 'pink') { b0 = 0.99765 * b0 + white * 0.099046; b1 = 0.963 * b1 + white * 0.2965164; b2 = 0.57 * b2 + white * 1.0526913; data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12; }
      else data[i] = white;
      mean += data[i];
    }
    mean /= data.length;
    for (let i = 0; i < data.length; i += 1) data[i] -= mean;
    // A short equal-power seam keeps cached loops free of a click.
  }
  const fade = Math.min(Math.floor(data.length / 8), Math.floor(context.sampleRate * 0.008));
  for (let i = 0; i < fade; i += 1) {
    const t = (i + 1) / (fade + 1); const tailIndex = data.length - fade + i;
    data[tailIndex] = data[tailIndex] * (1 - t) + data[i] * t;
  }
  buffer.__loopStartFrame = fade;
  if (cache.size > 32) cache.clear(); cache.set(key, buffer); return buffer;
}

function makeSource(context, profile, frequency) {
  if (profile.waveform === 'noise') {
    const source = context.createBufferSource(); source.buffer = noiseBuffer(context, profile, frequency, 1);
    source.loop = true;
    const bufferDuration = source.buffer.duration || source.buffer.length / context.sampleRate;
    source.loopStart = Math.min(bufferDuration * 0.5, (source.buffer.__loopStartFrame || 0) / context.sampleRate); source.loopEnd = bufferDuration;
    return source;
  }
  const source = context.createOscillator();
  const partialFrequency = frequency;
  if (profile.waveform === 'custom' && context.createPeriodicWave) {
    const entries = profile.harmonics || []; const maxRatio = Math.max(1, ...entries.map((entry) => Math.round(Array.isArray(entry) ? entry[0] : entry.ratio || 1)));
    const limit = Math.max(1, Math.min(128, Math.floor(context.sampleRate / (2 * frequency))));
    const real = new Float32Array(Math.min(maxRatio, limit) + 1); const imag = new Float32Array(real.length); imag[1] = 1;
    for (const entry of entries) {
      const ratio = Math.round(Array.isArray(entry) ? entry[0] : entry.ratio || 0);
      const coefficient = Array.isArray(entry) ? entry[1] : entry.gain || 0;
      if (ratio > 1 && ratio < real.length) imag[ratio] += coefficient;
    }
    source.setPeriodicWave(context.createPeriodicWave(real, imag));
  }
  else if (profile.waveform === 'custom') source.type = 'sine';
  else if (profile.steps && context.createPeriodicWave) {
    const count = Math.max(4, Math.min(64, profile.steps)); const harmonics = Math.max(1, Math.min(64, Math.floor(context.sampleRate / (2 * frequency))));
    const real = new Float32Array(harmonics + 1); const imag = new Float32Array(harmonics + 1);
    const samples = Array.from({ length: count }, (_, index) => {
      const phase = (index + 0.5) / count;
      return profile.waveform === 'triangle' ? (phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase) : (phase < 0.5 ? 1 : -1);
    });
    for (let n = 1; n <= harmonics; n += 1) for (let k = 0; k < count; k += 1) {
      const angle = 2 * Math.PI * n * (k + 0.5) / count;
      const sinc = Math.sin(Math.PI * n / count) / (Math.PI * n / count);
      real[n] += samples[k] * Math.cos(angle) * 2 / count * sinc;
      imag[n] -= samples[k] * Math.sin(angle) * 2 / count * sinc;
    }
    source.setPeriodicWave(context.createPeriodicWave(real, imag));
  } else if (profile.waveform === 'pulse') {
    const wave = getPulseWave(context, profile.duty, partialFrequency);
    if (wave) source.setPeriodicWave(wave); else source.type = 'square';
  } else source.type = profile.waveform;
  return source;
}

function setParam(param, method, value, at) {
  if (typeof param?.[method] === 'function') param[method](value, at);
  else if (method === 'setValueAtTime' && param) param.value = value;
}

/** Build one complete voice. Callers own destination routing and register every returned node for cancellation. */
export function scheduleAudioVoice(context, profile, {
  frequency, velocity = 96, onset, gateEnd, releaseEnd, peak = velocity / 127 * 0.18,
  destination = context.destination, registerNode, onSourceEnded
} = {}) {
  if (profile.drum) {
    releaseEnd = onset + Math.max(0.01, profile.drum.duration || (releaseEnd - onset));
    gateEnd = Math.max(onset + 0.005, releaseEnd - Math.max(0, profile.release || 0));
    frequency = profile.drum.frequency || frequency;
  }
  const nodes = []; const add = (node) => { if (node) { nodes.push(node); register(node, registerNode); } return node; };
  const baseFrequency = frequency;
  const sum = add(context.createGain()); let output = sum; let filter = null;
  const spec = profile.filter;
  if (spec && context.createBiquadFilter) {
    filter = add(context.createBiquadFilter()); filter.type = spec.type || 'lowpass';
    const nyquistLimit = Math.max(10, context.sampleRate * 0.45);
    const velocityBrightness = 0.55 + 0.75 * Math.max(0, Math.min(127, velocity)) / 127;
    const staticCutoff = Math.min(nyquistLimit, Math.max(10, (spec.frequency || 8000) * velocityBrightness));
    const tracking = Math.max(0, Math.min(1, spec.tracking || 0));
    const trackedCutoff = Math.min(nyquistLimit, Math.max(10, staticCutoff * ((baseFrequency / 440) ** tracking)));
    filter.frequency.value = spec.attackFrequency ? Math.min(nyquistLimit, Math.max(10, spec.attackFrequency * velocityBrightness)) : trackedCutoff;
    filter.Q.value = spec.q || 0.7;
    sum.connect(filter); output = filter;
    if (filter.frequency?.setValueAtTime) {
      filter.frequency.setValueAtTime(filter.frequency.value, onset);
      if (spec.attackFrequency && filter.frequency.linearRampToValueAtTime) filter.frequency.linearRampToValueAtTime(trackedCutoff, onset + Math.max(0.005, spec.decay || 0.08));
    }
  }
  const amp = add(context.createGain()); output.connect(amp);
  let finalGain = amp;
  const gateDuration = Math.max(0, gateEnd - onset);
  const attack = Math.min(Math.max(0, profile.attack || 0), gateDuration * 0.45);
  const decayEnd = Math.min(gateEnd, onset + attack + Math.max(0, profile.decay || 0));
  const sustain = Math.max(0, Math.min(1, profile.sustain ?? 1));
  const decayDuration = Math.max(0.000001, profile.decay || 0);
  const gateProgress = Math.max(0, Math.min(1, (gateEnd - (onset + attack)) / decayDuration));
  const gateLevel = decayEnd <= onset + attack ? peak : peak * (Math.max(0.0001, sustain) ** gateProgress);
  setParam(amp.gain, 'setValueAtTime', 0, onset);
  setParam(amp.gain, 'linearRampToValueAtTime', peak, onset + attack);
  if (decayEnd > onset + attack) {
    const decayTarget = decayEnd >= gateEnd ? gateLevel : peak * Math.max(0.0001, sustain);
    if (amp.gain.exponentialRampToValueAtTime && decayTarget > 0 && peak > 0) amp.gain.exponentialRampToValueAtTime(decayTarget, decayEnd);
    else setParam(amp.gain, 'linearRampToValueAtTime', decayTarget, decayEnd);
  }
  setParam(amp.gain, 'setValueAtTime', Math.max(0, gateLevel), gateEnd);
  const releaseDuration = Math.max(0.001, releaseEnd - gateEnd);
  const releaseFloorAt = Math.max(gateEnd + 0.001, releaseEnd - Math.min(0.005, releaseDuration * 0.1));
  if (amp.gain.exponentialRampToValueAtTime && gateLevel > 0) amp.gain.exponentialRampToValueAtTime(Math.max(0.000001, gateLevel * 0.001), releaseFloorAt);
  else setParam(amp.gain, 'linearRampToValueAtTime', gateLevel * 0.001, releaseFloorAt);
  setParam(amp.gain, 'linearRampToValueAtTime', 0, Math.max(releaseFloorAt + 0.0001, releaseEnd));

  const sources = []; let partialSourceCount = 0;
  const transientSpec = profile.transient && typeof profile.transient === 'object' ? profile.transient : { gain: profile.transient || 0, bursts: [0], duration: profile.transientDecay || 0.035 };
  const requestedLevels = [1, Math.abs(transientSpec.gain || 0), ...(profile.partials || []).map((part) => Math.abs(part.gain ?? 1)), ...(profile.waveform === 'custom' ? [] : (profile.harmonics || []).map((part) => Math.abs(Array.isArray(part) ? part[1] : part.gain || 0)))];
  const normalization = 1 / Math.max(1, requestedLevels.reduce((total, level) => total + level, 0));
  const sourceStarts = new Map();
  const addPart = (sourceProfile, ratio = 1, level = 1, detune = 0, decayScale = 1, partFilter = null) => {
    if (partialSourceCount >= 7) return;
    const hz = baseFrequency * ratio;
    if (!Number.isFinite(hz) || hz <= 0 || (sourceProfile.waveform !== 'noise' && hz >= context.sampleRate / 2)) return;
    const source = makeSource(context, sourceProfile, hz);
    partialSourceCount += 1;
    if (source.frequency?.setValueAtTime) {
      const sweep = sourceProfile.drum && ratio === 1 ? sourceProfile.pitchSweep : null;
      source.frequency.setValueAtTime(sweep?.fromRatio > 0 ? hz * sweep.fromRatio : hz, onset);
      if (sweep?.seconds > 0 && source.frequency.exponentialRampToValueAtTime) source.frequency.exponentialRampToValueAtTime(hz, onset + sweep.seconds);
      else if (sweep?.seconds > 0 && source.frequency.linearRampToValueAtTime) source.frequency.linearRampToValueAtTime(hz, onset + sweep.seconds);
    }
    if (detune && source.detune?.setValueAtTime) source.detune.setValueAtTime(detune, onset);
    const route = add(context.createGain()); source.connect(route);
    if (partFilter && context.createBiquadFilter) {
      const localFilter = add(context.createBiquadFilter()); localFilter.type = partFilter.type || 'lowpass';
      localFilter.frequency.value = Math.min(context.sampleRate * 0.45, Math.max(10, partFilter.frequency || 8000));
      localFilter.Q.value = partFilter.q || 0.7; route.connect(localFilter); localFilter.connect(sum);
    } else route.connect(sum);
    route.gain.setValueAtTime(level * normalization, onset);
    if (decayScale !== 1) {
      const modalDuration = Math.max(0.015, profile.decay * decayScale);
      const modalEnd = Math.min(gateEnd, onset + modalDuration);
      const elapsed = Math.max(0, modalEnd - onset);
      const modalTarget = level * normalization * Math.exp(-6.907755 * elapsed / modalDuration);
      if (route.gain.exponentialRampToValueAtTime && level * normalization > 0 && modalTarget > 0) route.gain.exponentialRampToValueAtTime(modalTarget, modalEnd);
      else if (route.gain.linearRampToValueAtTime) route.gain.linearRampToValueAtTime(modalTarget, modalEnd);
    }
    source.onended = () => { try { source.disconnect(); route.disconnect(); } catch {} onSourceEnded?.(source); };
    add(source); sources.push(source); sourceStarts.set(source, onset);
  };
  addPart(profile, 1, 1);
  for (const part of profile.partials || []) addPart({ ...profile, waveform: part.waveform || profile.waveform }, part.ratio || 1, part.gain ?? 1, part.detune || 0, part.decay ?? 1, part.filter);
  for (const harmonic of profile.waveform === 'custom' ? [] : (profile.harmonics || [])) {
    const coefficient = Array.isArray(harmonic) ? harmonic[1] : harmonic.gain;
    const ratio = Array.isArray(harmonic) ? harmonic[0] : harmonic.ratio;
    if (coefficient) addPart({ ...profile, waveform: 'sine' }, ratio, coefficient, 0, harmonic.decay || 1);
  }
  if (transientSpec.gain > 0 && context.createBuffer && context.createBufferSource) {
    const length = Math.max(1, Math.ceil(context.sampleRate * Math.min(0.06, Math.max(0.008, transientSpec.duration || 0.035))));
    const buffer = context.createBuffer(1, length, context.sampleRate); const data = buffer.getChannelData(0);
    let seed = 2166136261;
    for (const char of `${profile.id || profile.waveform}:${Math.round(baseFrequency)}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    for (let i = 0; i < length; i += 1) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = (seed / 0x100000000 * 2 - 1) * Math.exp(-i / Math.max(1, length * 0.2)); }
    const bursts = (Array.isArray(transientSpec.bursts) ? transientSpec.bursts : [0]).slice(0, 3);
    for (const offset of bursts) {
      if (sources.length >= 8 || !Number.isFinite(offset) || offset < 0 || onset + offset >= gateEnd) continue;
      const startAt = onset + offset;
      const transient = context.createBufferSource(); transient.buffer = buffer; const level = add(context.createGain());
      transient.connect(level); level.connect(sum); level.gain.setValueAtTime(transientSpec.gain * normalization, startAt);
      level.gain.linearRampToValueAtTime(0, Math.min(gateEnd, startAt + length / context.sampleRate));
      transient.onended = () => { try { transient.disconnect(); level.disconnect(); } catch {} onSourceEnded?.(transient); };
      add(transient); sources.push(transient); sourceStarts.set(transient, startAt);
    }
  }
  const vibrato = profile.vibrato;
  if (vibrato && context.createOscillator && context.createGain && sources[0]?.frequency) {
    const lfo = add(context.createOscillator()); const depth = add(context.createGain());
    lfo.frequency.value = vibrato.rate || 5; depth.gain.value = baseFrequency * (vibrato.depth || 0.003);
    const start = onset + Math.max(0, vibrato.delay || 0);
    lfo.connect(depth); depth.connect(sources[0].frequency);
    if (start < releaseEnd) { lfo.start(start); lfo.stop(Math.max(start + 0.005, releaseEnd)); }
  }
  const tremolo = profile.tremolo;
  if (tremolo && context.createOscillator && context.createGain) {
    const lfo = add(context.createOscillator()); const depth = add(context.createGain());
    const tremoloGain = add(context.createGain()); amp.connect(tremoloGain); finalGain = tremoloGain;
    const amount = Math.max(0, Math.min(0.95, tremolo.depth || 0.1));
    tremoloGain.gain.value = 1 - amount; lfo.frequency.value = tremolo.rate || 5; depth.gain.value = amount;
    lfo.connect(depth); depth.connect(tremoloGain.gain);
    const start = Math.min(onset + Math.max(0, tremolo.delay || 0), Math.max(onset, releaseEnd - 0.005));
    if (start < releaseEnd) { lfo.start(start); lfo.stop(Math.max(start + 0.005, releaseEnd)); }
  }
  let chokeGain = null;
  if (profile.drum?.chokeGroup) {
    chokeGain = add(context.createGain()); chokeGain.gain.value = 1;
    finalGain.connect(chokeGain); chokeGain.connect(destination);
  } else finalGain.connect(destination);
  const sourceEnd = profile.drum ? releaseEnd : Math.max(gateEnd + 0.005, releaseEnd + 0.005);
  for (const source of sources) source.start(sourceStarts.get(source) ?? onset);
  for (const source of sources) source.stop(sourceEnd);
  let chokeAt = Infinity;
  const choke = (at) => {
    if (!chokeGain || !Number.isFinite(at)) return false;
    const effectiveAt = Math.max(onset, at);
    if (effectiveAt >= chokeAt || effectiveAt >= releaseEnd) return false;
    chokeAt = effectiveAt;
    const fadeEnd = Math.min(releaseEnd, effectiveAt + 0.008);
    try { chokeGain.gain.cancelScheduledValues?.(effectiveAt); } catch {}
    setParam(chokeGain.gain, 'setValueAtTime', 1, effectiveAt);
    setParam(chokeGain.gain, 'linearRampToValueAtTime', 0, Math.max(effectiveAt + 0.0001, fadeEnd));
    for (const source of sources) {
      const startAt = sourceStarts.get(source) ?? onset;
      try { source.stop(Math.max(startAt, Math.min(sourceEnd, fadeEnd))); } catch {}
    }
    return true;
  };
  return { nodes, sources, sum, filter, gain: amp, chokeGain, choke };
}
