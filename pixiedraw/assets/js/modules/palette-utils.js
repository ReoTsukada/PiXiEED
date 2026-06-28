(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPaletteBaseUtils({
    clamp,
  } = {}) {
    function toKebabCase(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function splitPalettePresetNameTokens(value) {
      return String(value || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    }

    function localizePalettePresetNameJa(name) {
      const tokenMap = Object.freeze({
        Pixel: '',
        Pixels: '',
        Core: 'コア',
        Retro: 'レトロ',
        Bits: 'ビッツ',
        Soft: 'ソフト',
        Neon: 'ネオン',
        Pastel: 'パステル',
        Vintage: 'ヴィンテージ',
        Arcade: 'アーケード',
        Glow: 'グロー',
        CRT: 'CRT',
        Dream: 'ドリーム',
        Old: 'オールド',
        Screen: 'スクリーン',
        Classic: 'クラシック',
        Dawn: 'ドーン',
        Dusk: 'ダスク',
        Night: 'ナイト',
        Horizon: 'ホライズン',
        Sunrise: 'サンライズ',
        Sunset: 'サンセット',
        Moonlight: 'ムーンライト',
        Galaxy: 'ギャラクシー',
        Cosmos: 'コスモス',
        Nebula: 'ネビュラ',
        Aurora: 'オーロラ',
        Ocean: 'オーシャン',
        Lagoon: 'ラグーン',
        Deep: 'ディープ',
        Sea: 'シー',
        Reef: 'リーフ',
        Forest: 'フォレスト',
        Meadow: 'メドウ',
        Jungle: 'ジャングル',
        Desert: 'デザート',
        Canyon: 'キャニオン',
        Mountain: 'マウンテン',
        Snow: 'スノー',
        Glacier: 'グレイシャー',
        Volcano: 'ボルケーノ',
        Storm: 'ストーム',
        Thunder: 'サンダー',
        Lightning: 'ライトニング',
        Rain: 'レイン',
        Mist: 'ミスト',
        Fog: 'フォグ',
        Frost: 'フロスト',
        Ember: 'エンバー',
        Flame: 'フレイム',
        Lava: 'ラヴァ',
        Sand: 'サンド',
        Clay: 'クレイ',
        Stone: 'ストーン',
        Marble: 'マーブル',
        Bronze: 'ブロンズ',
        Copper: 'コッパー',
        Iron: 'アイアン',
        Silver: 'シルバー',
        Gold: 'ゴールド',
        Crystal: 'クリスタル',
        Prism: 'プリズム',
        Candy: 'キャンディ',
        Bubblegum: 'バブルガム',
        Cotton: 'コットン',
        Mint: 'ミント',
        Lemon: 'レモン',
        Peach: 'ピーチ',
        Berry: 'ベリー',
        Cherry: 'チェリー',
        Plum: 'プラム',
        Sakura: 'サクラ',
        Indigo: 'インディゴ',
        Yamabuki: 'ヤマブキ',
        Wakakusa: 'ワカクサ',
        Shikon: 'シコン',
        Ink: 'インク',
        Shadow: 'シャドウ',
        Eclipse: 'エクリプス',
        Cyber: 'サイバー',
        Circuit: 'サーキット',
        Matrix: 'マトリクス',
        Digital: 'デジタル',
        Hologram: 'ホログラム',
        Vapor: 'ベイパー',
        Fantasy: 'ファンタジー',
        Storybook: 'ストーリーブック',
        Adventure: 'アドベンチャー',
        Dungeon: 'ダンジョン',
        Castle: 'キャッスル',
        Kingdom: 'キングダム',
        Hero: 'ヒーロー',
        Villain: 'ヴィラン',
        Monster: 'モンスター',
        Slime: 'スライム',
        Dragon: 'ドラゴン',
        Treasure: 'トレジャー',
        Magic: 'マジック',
        Potion: 'ポーション',
        Rune: 'ルーン',
        Relic: 'レリック',
        Artifact: 'アーティファクト',
        Portal: 'ポータル',
        Temple: 'テンプル',
        Shrine: 'シュライン',
        Arena: 'アリーナ',
        Battle: 'バトル',
        Victory: 'ビクトリー',
        Quest: 'クエスト',
        Journey: 'ジャーニー',
        Frontier: 'フロンティア',
        Island: 'アイランド',
        Harbor: 'ハーバー',
        City: 'シティ',
        Metro: 'メトロ',
        Skyline: 'スカイライン',
        Alley: 'アレイ',
        Lantern: 'ランタン',
        Festival: 'フェスティバル',
        Carnival: 'カーニバル',
        Fireworks: 'ファイアワークス',
        Stardust: 'スターダスト',
        Comet: 'コメット',
        Orbit: 'オービット',
        Satellite: 'サテライト',
        Signal: 'シグナル',
        Spectrum: 'スペクトラム',
        Gradient: 'グラデーション',
        Harmony: 'ハーモニー',
        Balance: 'バランス',
        Contrast: 'コントラスト',
        Echo: 'エコー',
        Pulse: 'パルス',
        Wave: 'ウェーブ',
        Flux: 'フラックス',
        Spark: 'スパーク',
        Radiance: 'レイディアンス',
        Bloom: 'ブルーム',
        Garden: 'ガーデン',
        Orchard: 'オーチャード',
        Vineyard: 'ヴィンヤード',
        River: 'リバー',
        Waterfall: 'ウォーターフォール',
        Cliff: 'クリフ',
        Valley: 'バレー',
        Prairie: 'プレーリー',
        Savannah: 'サバンナ',
        Tundra: 'ツンドラ',
        Solar: 'ソーラー',
        Wind: 'ウィンド',
        Lunar: 'ルナー',
        Dust: 'ダスト',
        Stellar: 'ステラ',
      });
      const tokens = splitPalettePresetNameTokens(name);
      if (!tokens.length) {
        return String(name || '');
      }
      return tokens
        .map(token => (Object.prototype.hasOwnProperty.call(tokenMap, token) ? tokenMap[token] : token))
        .join('')
        .replace(/pixel/gi, '')
        .trim();
    }

    function normalizePalettePresetDisplayName(name) {
      return String(name || '')
        .replace(/\bpixel\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    function resolveNewProjectPaletteColorCount(name) {
      const normalized = String(name || '').trim().toLowerCase();
      if (!normalized) {
        return 16;
      }
      if (
        normalized === 'pixel core'
        || normalized === 'pixel ink'
        || normalized === 'pixel shadow'
        || normalized === 'old screen'
      ) {
        return 4;
      }
      if (
        normalized.includes('bits')
        || normalized.includes('mist')
        || normalized.includes('fog')
        || normalized.includes('frost')
        || normalized.includes('stone')
        || normalized.includes('iron')
        || normalized.includes('slime')
        || normalized.includes('dungeon')
      ) {
        return 8;
      }
      if (
        normalized.includes('neon')
        || normalized.includes('galaxy')
        || normalized.includes('cosmos')
        || normalized.includes('nebula')
        || normalized.includes('aurora')
        || normalized.includes('cyber')
        || normalized.includes('circuit')
        || normalized.includes('matrix')
        || normalized.includes('digital')
        || normalized.includes('hologram')
        || normalized.includes('spectrum')
        || normalized.includes('gradient')
        || normalized.includes('fireworks')
        || normalized.includes('stardust')
        || normalized.includes('comet')
        || normalized.includes('orbit')
        || normalized.includes('satellite')
        || normalized.includes('solarwind')
        || normalized.includes('stellarwind')
      ) {
        return 32;
      }
      if (
        normalized.includes('classic')
        || normalized.includes('vintage')
        || normalized.includes('pastel')
        || normalized.includes('forest')
        || normalized.includes('meadow')
        || normalized.includes('desert')
        || normalized.includes('mountain')
        || normalized.includes('snow')
        || normalized.includes('clay')
        || normalized.includes('bronze')
        || normalized.includes('silver')
        || normalized.includes('gold')
        || normalized.includes('castle')
        || normalized.includes('kingdom')
      ) {
        return 16;
      }
      return 24;
    }

    function hashTextToUint32(value) {
      const text = String(value || '');
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function mixUint32Hash(hash, value) {
      return Math.imul((hash >>> 0) ^ (Math.round(Number(value) || 0) >>> 0), 16777619) >>> 0;
    }

    function mixTextHash(hash, value) {
      return mixUint32Hash(hash, hashTextToUint32(value));
    }

    function hslToRgbColor(h, s, l) {
      const hue = ((Number(h) % 360) + 360) % 360;
      const sat = clamp(Number(s), 0, 100) / 100;
      const lig = clamp(Number(l), 0, 100) / 100;
      if (sat <= 0) {
        const gray = clamp(Math.round(lig * 255), 0, 255);
        return { r: gray, g: gray, b: gray, a: 255 };
      }
      const c = (1 - Math.abs(2 * lig - 1)) * sat;
      const hPrime = hue / 60;
      const x = c * (1 - Math.abs((hPrime % 2) - 1));
      let r1 = 0;
      let g1 = 0;
      let b1 = 0;
      if (hPrime >= 0 && hPrime < 1) {
        r1 = c;
        g1 = x;
      } else if (hPrime < 2) {
        r1 = x;
        g1 = c;
      } else if (hPrime < 3) {
        g1 = c;
        b1 = x;
      } else if (hPrime < 4) {
        g1 = x;
        b1 = c;
      } else if (hPrime < 5) {
        r1 = x;
        b1 = c;
      } else {
        r1 = c;
        b1 = x;
      }
      const m = lig - (c / 2);
      return {
        r: clamp(Math.round((r1 + m) * 255), 0, 255),
        g: clamp(Math.round((g1 + m) * 255), 0, 255),
        b: clamp(Math.round((b1 + m) * 255), 0, 255),
        a: 255,
      };
    }

    return Object.freeze({
      toKebabCase,
      splitPalettePresetNameTokens,
      localizePalettePresetNameJa,
      normalizePalettePresetDisplayName,
      resolveNewProjectPaletteColorCount,
      hashTextToUint32,
      mixUint32Hash,
      mixTextHash,
      hslToRgbColor,
    });
  }

  function createPalettePresetUtils({
    clamp,
    normalizeColorValue,
    NEW_PROJECT_PALETTE_PRESET_DEFAULT,
    NEW_PROJECT_PALETTE_PRESET_SET,
    NEW_PROJECT_PALETTE_PRESET_MAP,
    CURRENT_PALETTE_PRESET_CUSTOM,
    newProjectPalettePresetColorCache,
    hashTextToUint32,
    hslToRgbColor,
  } = {}) {
    function getNewProjectPalettePresetDefinition(presetId, fallbackPresetId = NEW_PROJECT_PALETTE_PRESET_DEFAULT) {
      const normalized = normalizeNewProjectPalettePreset(presetId, fallbackPresetId);
      return NEW_PROJECT_PALETTE_PRESET_MAP.get(normalized)
        || NEW_PROJECT_PALETTE_PRESET_MAP.get(NEW_PROJECT_PALETTE_PRESET_DEFAULT)
        || null;
    }

    function normalizeNewProjectPalettePreset(value, fallback = NEW_PROJECT_PALETTE_PRESET_DEFAULT) {
      const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (NEW_PROJECT_PALETTE_PRESET_SET.has(normalized)) {
        return normalized;
      }
      return NEW_PROJECT_PALETTE_PRESET_SET.has(fallback)
        ? fallback
        : NEW_PROJECT_PALETTE_PRESET_DEFAULT;
    }

    function normalizeCurrentPalettePreset(value, fallback = CURRENT_PALETTE_PRESET_CUSTOM) {
      const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (normalized === CURRENT_PALETTE_PRESET_CUSTOM || NEW_PROJECT_PALETTE_PRESET_SET.has(normalized)) {
        return normalized;
      }
      if (fallback === CURRENT_PALETTE_PRESET_CUSTOM || NEW_PROJECT_PALETTE_PRESET_SET.has(fallback)) {
        return fallback;
      }
      return CURRENT_PALETTE_PRESET_CUSTOM;
    }

    function generateNewProjectPaletteColors(definition) {
      const count = clamp(Math.round(Number(definition?.colorCount) || 16), 4, 32);
      const colorSlots = Math.max(1, count - 1);
      const seed = hashTextToUint32(definition?.id || definition?.name || 'pixel-core');
      const baseHue = seed % 360;
      const baseSaturation = 42 + (seed % 36);
      const colors = [{ r: 0, g: 0, b: 0, a: 0 }];
      for (let index = 0; index < colorSlots; index += 1) {
        const t = colorSlots > 1 ? index / (colorSlots - 1) : 0;
        const band = index % 4;
        const hue = (baseHue + (t * 248) + (band * 11)) % 360;
        const saturation = clamp(baseSaturation + ((index % 5) - 2) * 6, 30, 90);
        const lightnessBase = 14 + (t * 72);
        const lightness = clamp(lightnessBase + (band === 0 ? -6 : band === 3 ? 6 : 0), 8, 94);
        colors.push(hslToRgbColor(hue, saturation, lightness));
      }
      return colors.map(color => normalizeColorValue(color));
    }

    function getNewProjectPalettePresetColors(presetId, fallbackPresetId = NEW_PROJECT_PALETTE_PRESET_DEFAULT) {
      const definition = getNewProjectPalettePresetDefinition(presetId, fallbackPresetId);
      if (!definition) {
        return [{ r: 0, g: 0, b: 0, a: 0 }];
      }
      const cached = newProjectPalettePresetColorCache.get(definition.id);
      if (Array.isArray(cached) && cached.length) {
        return cached.map(color => normalizeColorValue(color));
      }
      const generated = generateNewProjectPaletteColors(definition);
      newProjectPalettePresetColorCache.set(definition.id, generated);
      return generated.map(color => normalizeColorValue(color));
    }

    function createRgbModeDefaultPalette() {
      return [
        { r: 0, g: 0, b: 0, a: 0 },
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 255, g: 0, b: 0, a: 255 },
        { r: 255, g: 128, b: 0, a: 255 },
        { r: 255, g: 255, b: 0, a: 255 },
        { r: 128, g: 255, b: 0, a: 255 },
        { r: 0, g: 255, b: 0, a: 255 },
        { r: 0, g: 255, b: 255, a: 255 },
        { r: 0, g: 128, b: 255, a: 255 },
        { r: 0, g: 0, b: 255, a: 255 },
        { r: 128, g: 0, b: 255, a: 255 },
        { r: 255, g: 0, b: 255, a: 255 },
        { r: 255, g: 128, b: 192, a: 255 },
        { r: 128, g: 128, b: 128, a: 255 },
        { r: 192, g: 192, b: 192, a: 255 },
      ].map(color => normalizeColorValue(color));
    }

    return Object.freeze({
      getNewProjectPalettePresetDefinition,
      normalizeNewProjectPalettePreset,
      normalizeCurrentPalettePreset,
      generateNewProjectPaletteColors,
      getNewProjectPalettePresetColors,
      createRgbModeDefaultPalette,
    });
  }

  root.paletteUtils = Object.freeze({
    createPaletteBaseUtils,
    createPalettePresetUtils,
  });
})();
