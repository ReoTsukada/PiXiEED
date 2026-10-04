const HEX_COLOR = /^#([\da-f]{6})$/i;

export function hexToHsl(hex, fallbackHue = 0) {
  const match = HEX_COLOR.exec(String(hex));
  if (!match) throw new TypeError('色を読み取れません。');
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min; const lightness = (max + min) / 2;
  if (!delta) return { h: ((fallbackHue % 360) + 360) % 360, s: 0, l: Math.round(lightness * 100) };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = Math.round(hue * 60); if (hue < 0) hue += 360;
  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

export function hslToHex(hue, saturation, lightness) {
  if (![hue, saturation, lightness].every(Number.isFinite)) throw new TypeError('色の調整値が不正です。');
  const h = ((hue % 360) + 360) % 360; const s = Math.max(0, Math.min(100, saturation)) / 100; const l = Math.max(0, Math.min(100, lightness)) / 100;
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}
