export type GameAudioVoiceKind = "BGM" | "SE" | "VOICE";
export interface GameAudioVoice {
  readonly voiceId: string;
  readonly assetId: string;
  readonly kind: GameAudioVoiceKind;
  readonly priority: number;
  readonly startedAt: number;
  readonly fadeInMs: number;
}

export interface GameAudioRuntimeSnapshot {
  readonly bgm: GameAudioVoice | null;
  readonly voices: readonly GameAudioVoice[];
  readonly maxVoices: number;
  readonly cacheBytes: number;
  readonly cacheEntries: number;
  readonly released: boolean;
}

type WebAudioBuffer = { readonly duration: number };
type WebAudioGain = {
  readonly gain: {
    value: number;
    cancelScheduledValues: (time: number) => void;
    setValueAtTime: (value: number, time: number) => void;
    linearRampToValueAtTime: (value: number, time: number) => void;
  };
  connect: (target: unknown) => WebAudioGain;
  disconnect: () => void;
};
type WebAudioBufferSource = {
  buffer: WebAudioBuffer;
  connect: (target: WebAudioGain) => WebAudioGain;
  addEventListener: (type: "ended", listener: () => void, options?: { once?: boolean }) => void;
  start: () => void;
  stop: () => void;
  disconnect: () => void;
};
type WebAudioMedia = {
  preload: string;
  loop: boolean;
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
  addEventListener: (type: "ended", listener: () => void) => void;
  removeEventListener: (type: "ended", listener: () => void) => void;
  removeAttribute: (name: string) => void;
};
type WebAudioMediaSource = {
  connect: (target: WebAudioGain) => WebAudioGain;
  disconnect: () => void;
};
type WebAudioContext = {
  readonly currentTime: number;
  readonly destination: unknown;
  createBufferSource: () => WebAudioBufferSource;
  createGain: () => WebAudioGain;
  createMediaElementSource: (media: WebAudioMedia) => WebAudioMediaSource;
  decodeAudioData: (data: ArrayBuffer) => Promise<WebAudioBuffer>;
};

interface CacheEntry { readonly assetId: string; readonly bytes: number; lastUsed: number; }

export class GameAudioRuntime {
  static readonly BGM_FADE_MS = 200;
  static readonly VOICE_FADE_MS = 8;
  static readonly MAX_VOICES = 24;
  static readonly MAX_CACHE_BYTES = 64 * 1024 * 1024;
  static readonly MAX_CACHE_ENTRIES = 64;
  private bgm: GameAudioVoice | null = null;
  private voices: GameAudioVoice[] = [];
  private cache = new Map<string, CacheEntry>();
  private sequence = 0;
  private released = false;

  startBgm(assetId: string, now = Date.now()): GameAudioVoice {
    const next: GameAudioVoice = { voiceId: `bgm:${++this.sequence}`, assetId, kind: "BGM", priority: Number.MAX_SAFE_INTEGER, startedAt: now, fadeInMs: GameAudioRuntime.BGM_FADE_MS };
    this.bgm = next;
    this.released = false;
    return next;
  }

  playVoice(assetId: string, kind: "SE" | "VOICE" = "SE", priority = 0, now = Date.now()): GameAudioVoice | null {
    this.released = false;
    const next: GameAudioVoice = { voiceId: `voice:${++this.sequence}`, assetId, kind, priority, startedAt: now, fadeInMs: GameAudioRuntime.VOICE_FADE_MS };
    if (this.voices.length >= GameAudioRuntime.MAX_VOICES) {
      const victimIndex = this.voices.reduce((best, voice, index, all) => voice.priority < all[best]!.priority || (voice.priority === all[best]!.priority && voice.startedAt < all[best]!.startedAt) ? index : best, 0);
      if ((this.voices[victimIndex]?.priority ?? Number.MAX_SAFE_INTEGER) > priority) return null;
      this.voices.splice(victimIndex, 1);
    }
    this.voices.push(next);
    return next;
  }

  stopBgm(): void { this.bgm = null; }
  stopVoice(voiceId: string): void { this.voices = this.voices.filter((voice) => voice.voiceId !== voiceId); }
  cacheAsset(assetId: string, bytes: number, now = Date.now()): void {
    const safeBytes = Math.max(0, Math.floor(bytes));
    this.cache.set(assetId, { assetId, bytes: safeBytes, lastUsed: now });
    while (this.cache.size > GameAudioRuntime.MAX_CACHE_ENTRIES || this.cacheBytes() > GameAudioRuntime.MAX_CACHE_BYTES) {
      const victim = [...this.cache.values()].sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (victim === undefined) break;
      this.cache.delete(victim.assetId);
    }
  }
  touchCache(assetId: string, now = Date.now()): void { const item = this.cache.get(assetId); if (item !== undefined) item.lastUsed = now; }
  stopAll(): void { this.bgm = null; this.voices = []; this.cache.clear(); this.released = true; }
  snapshot(): GameAudioRuntimeSnapshot { return { bgm: this.bgm, voices: [...this.voices], maxVoices: GameAudioRuntime.MAX_VOICES, cacheBytes: this.cacheBytes(), cacheEntries: this.cache.size, released: this.released }; }
  private cacheBytes(): number { return [...this.cache.values()].reduce((sum, item) => sum + item.bytes, 0); }
}

/** Runtime-only Web Audio adapter. Game save data contains only metadata
 * pointers; nodes, media elements, fetches and decoded buffers stay here. */
export interface WebAudioGameAudioRuntimeOptions {
  readonly context?: WebAudioContext;
  readonly audioFactory?: (url: string) => WebAudioMedia;
  readonly fetchImpl?: typeof fetch;
  readonly shortDecodeLimitBytes?: number;
}

interface LiveAudioHandle {
  readonly voiceId: string;
  readonly gain?: WebAudioGain;
  readonly source?: WebAudioBufferSource;
  readonly media?: WebAudioMedia;
  readonly mediaSource?: WebAudioMediaSource;
  readonly timers: ReturnType<typeof setTimeout>[];
  readonly abort?: AbortController;
  readonly ended?: () => void;
}

export class WebAudioGameAudioRuntime extends GameAudioRuntime {
  static readonly SHORT_DECODE_LIMIT_BYTES = 8 * 1024 * 1024;
  private readonly context: WebAudioContext | undefined;
  private readonly audioFactory: (url: string) => WebAudioMedia;
  private readonly fetchImpl: typeof fetch;
  private readonly shortDecodeLimitBytes: number;
  private readonly live = new Map<string, LiveAudioHandle>();
  private readonly decoded = new Map<string, WebAudioBuffer>();
  private readonly pendingFetches = new Set<AbortController>();

  constructor(options: WebAudioGameAudioRuntimeOptions = {}) {
    super();
    this.context = options.context;
    this.audioFactory = options.audioFactory ?? ((url) => {
      const Media = (globalThis as unknown as { Audio: new (url: string) => WebAudioMedia }).Audio;
      const media = new Media(url);
      media.preload = "auto";
      return media;
    });
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.shortDecodeLimitBytes = Math.max(
      1,
      Math.floor(options.shortDecodeLimitBytes ?? WebAudioGameAudioRuntime.SHORT_DECODE_LIMIT_BYTES),
    );
  }

  override startBgm(assetId: string, now = Date.now()): GameAudioVoice {
    return super.startBgm(assetId, now);
  }

  /** Start a URL through an HTMLMediaElement so long BGM is never fully decoded. */
  startBgmUrl(assetId: string, url: string, now = Date.now()): GameAudioVoice {
    const previous = this.snapshot().bgm;
    const next = super.startBgm(assetId, now);
    this.fadeOutBgm(previous, next.voiceId);
    this.attachMedia(next, url, true);
    return next;
  }

  /** Play a short decoded buffer or a streaming URL. */
  override playVoice(
    assetId: string,
    kind: "SE" | "VOICE" = "SE",
    priority = 0,
    now = Date.now(),
    source?: WebAudioBuffer | string,
  ): GameAudioVoice | null {
    const previous = new Set(this.snapshot().voices.map((voice) => voice.voiceId));
    const next = super.playVoice(assetId, kind, priority, now);
    if (next === null) return null;
    for (const voiceId of previous) {
      if (!this.snapshot().voices.some((voice) => voice.voiceId === voiceId)) {
        this.releaseHandle(voiceId);
      }
    }
    if (typeof source === "string") this.attachMedia(next, source, false);
    else if (source !== undefined) this.attachBuffer(next, source);
    return next;
  }

  async decodeShort(assetId: string, url: string, contentLength?: number): Promise<WebAudioBuffer | undefined> {
    const cached = this.decoded.get(assetId);
    if (cached !== undefined) return cached;
    if (contentLength !== undefined && contentLength > this.shortDecodeLimitBytes) return undefined;
    if (this.context === undefined) return undefined;
    const abort = new AbortController();
    this.pendingFetches.add(abort);
    try {
      const response = await this.fetchImpl(url, { signal: abort.signal });
      const length = Number(response.headers.get("content-length") ?? "NaN");
      if (Number.isFinite(length) && length > this.shortDecodeLimitBytes) return undefined;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > this.shortDecodeLimitBytes) return undefined;
      const buffer = await this.context.decodeAudioData(bytes.slice(0));
      this.decoded.set(assetId, buffer);
      this.cacheAsset(assetId, bytes.byteLength);
      return buffer;
    } catch {
      return undefined;
    } finally {
      this.pendingFetches.delete(abort);
    }
  }

  override stopBgm(): void {
    const bgm = this.snapshot().bgm;
    if (bgm !== null) this.releaseHandle(bgm.voiceId);
    super.stopBgm();
  }

  override stopVoice(voiceId: string): void {
    this.releaseHandle(voiceId);
    super.stopVoice(voiceId);
  }

  override stopAll(): void {
    for (const voiceId of [...this.live.keys()]) this.releaseHandle(voiceId);
    for (const abort of this.pendingFetches) abort.abort();
    this.pendingFetches.clear();
    this.decoded.clear();
    super.stopAll();
  }

  private attachBuffer(voice: GameAudioVoice, buffer: WebAudioBuffer): void {
    if (this.context === undefined) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.connect(gain).connect(this.context.destination);
    this.fadeIn(gain, voice.kind === "BGM" ? GameAudioRuntime.BGM_FADE_MS : GameAudioRuntime.VOICE_FADE_MS);
    const timer = setTimeout(() => this.releaseHandle(voice.voiceId), Math.max(1, buffer.duration * 1_000 + 32));
    source.addEventListener("ended", () => this.releaseHandle(voice.voiceId), { once: true });
    source.start();
    this.live.set(voice.voiceId, { voiceId: voice.voiceId, gain, source, timers: [timer] });
  }

  private attachMedia(voice: GameAudioVoice, url: string, loop: boolean): void {
    if (this.context === undefined) return;
    const media = this.audioFactory(url);
    media.loop = loop;
    const gain = this.context.createGain();
    const mediaSource = this.context.createMediaElementSource(media);
    mediaSource.connect(gain).connect(this.context.destination);
    this.fadeIn(gain, voice.kind === "BGM" ? GameAudioRuntime.BGM_FADE_MS : GameAudioRuntime.VOICE_FADE_MS);
    const ended = () => this.releaseHandle(voice.voiceId);
    media.addEventListener("ended", ended);
    void media.play().catch(() => undefined);
    this.live.set(voice.voiceId, { voiceId: voice.voiceId, gain, media, mediaSource, timers: [], ended });
  }

  private fadeOutBgm(previous: GameAudioVoice | null, voiceId: string): void {
    if (previous === null || previous.voiceId === voiceId) return;
    const handle = this.live.get(previous.voiceId);
    if (handle?.gain !== undefined && this.context !== undefined) {
      const now = this.context.currentTime;
      handle.gain.gain.cancelScheduledValues(now);
      handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
      handle.gain.gain.linearRampToValueAtTime(0, now + GameAudioRuntime.BGM_FADE_MS / 1_000);
    }
    const timer = setTimeout(() => this.releaseHandle(previous.voiceId), GameAudioRuntime.BGM_FADE_MS);
    if (handle !== undefined) handle.timers.push(timer);
  }

  private fadeIn(gain: WebAudioGain, durationMs: number): void {
    if (this.context === undefined) return;
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + durationMs / 1_000);
  }

  private releaseHandle(voiceId: string): void {
    const handle = this.live.get(voiceId);
    if (handle === undefined) return;
    for (const timer of handle.timers) clearTimeout(timer);
    if (handle.media !== undefined && handle.ended !== undefined) {
      handle.media.removeEventListener("ended", handle.ended);
    }
    try { handle.source?.stop(); } catch { /* already ended */ }
    handle.source?.disconnect();
    handle.mediaSource?.disconnect();
    handle.gain?.disconnect();
    if (handle.media !== undefined) {
      handle.media.pause();
      handle.media.removeAttribute("src");
      handle.media.load();
    }
    handle.abort?.abort();
    this.live.delete(voiceId);
  }
}
