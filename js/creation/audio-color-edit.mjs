import { setAnimationPalette } from './animation-core.mjs';
import { validateAudioAnimationBinding } from './audio-animation.mjs?rev=20261001-audio-animation-1';
import { validatePxdAudioBinding } from './pxd-draw-audio.mjs?rev=20261001-free-tools-1';

const rgbaPattern = /^rgba-([\da-f]{8})$/i;
const hexPattern = /^#([\da-f]{6})$/i;

export function audioHexToHsl(hex) {
  const match = hexPattern.exec(String(hex));
  if (!match) throw new TypeError('色を読み取れません。');
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min; const lightness = (max + min) / 2;
  if (!delta) return { h: 0, s: 0, l: Math.round(lightness * 100) };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = Math.round(hue * 60); if (hue < 0) hue += 360;
  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

export function audioHslToHex(hue, saturation, lightness) {
  if (![hue, saturation, lightness].every(Number.isFinite)) throw new TypeError('色の調整値が不正です。');
  const h = ((hue % 360) + 360) % 360; const s = Math.max(0, Math.min(100, saturation)) / 100; const l = Math.max(0, Math.min(100, lightness)) / 100;
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Recolor one shared image/animation palette entry while retaining its sound mapping and note data. */
export function replaceAudioSourceColor({ image = null, animation = null, link, song, colorId, hex }) {
  const match = rgbaPattern.exec(String(colorId || ''));
  const requested = hexPattern.exec(String(hex || ''));
  if (!match || !requested || !link?.colorToSlot || typeof link.colorToSlot !== 'object' || Array.isArray(link.colorToSlot) || !song?.tracks) throw new TypeError('画像の色を変更できません。');
  if (animation) {
    if (image || link.rulesVersion !== 'shared-animation-v1') throw new TypeError('このアニメーション形式の色は変更できません。');
    validateAudioAnimationBinding(song, animation, link);
  } else if (image) {
    if (!['shared-canvas-v1', 'pixel-cell-v1'].includes(link.rulesVersion)) throw new TypeError('この画像形式の色は変更できません。');
    if (link.rulesVersion === 'shared-canvas-v1' && link.imageRole !== 'audio') throw new TypeError('共有元画像を直接変更できません。音楽用画像へ切り離してから変更してください。');
    validatePxdAudioBinding(song, image, link);
  } else throw new TypeError('編集する画像がありません。');
  const oldId = `rgba-${match[1].toLowerCase()}`; const oldBytes = match[1].match(/../g).map((part) => Number.parseInt(part, 16));
  if (oldBytes[3] === 0 || !Object.hasOwn(link.colorToSlot, oldId)) throw new TypeError('元の画像色が見つかりません。');
  const newRgb = requested[1].toLowerCase(); const nextId = `rgba-${newRgb}${match[1].slice(6, 8).toLowerCase()}`;
  if (oldId === nextId) return { image, animation, link, song, colorId: oldId, changed: false };
  if (Object.hasOwn(link.colorToSlot, nextId) && link.colorToSlot[nextId] !== link.colorToSlot[oldId]) {
    throw new TypeError('変更先の色は別の音に割り当て済みです。音が混ざらないよう、別の色を選んでください。');
  }

  let nextImage = image; let nextAnimation = animation; const changedCells = new Set();
  if (animation) {
    if (oldBytes[3] !== 255 || !Array.isArray(animation.palette)) throw new TypeError('このアニメーション色は変更できません。');
    const oldHex = `#${match[1].slice(0, 6).toLowerCase()}`;
    if (!animation.palette.some((entry) => entry.toLowerCase() === oldHex)) throw new TypeError('アニメーションの元色が見つかりません。');
    const nextHex = `#${newRgb}`;
    if (animation.palette.some((entry) => entry.toLowerCase() === nextHex && entry.toLowerCase() !== oldHex)) {
      throw new TypeError('アニメーションにはすでに同じ色があります。別の色を選んでください。');
    }
    nextAnimation = setAnimationPalette(animation, animation.palette.map((entry) => entry.toLowerCase() === oldHex ? nextHex : entry));
  } else {
    if (!image?.rgba || image.rgba.length !== image.width * image.height * 4) throw new TypeError('元の画像データが不正です。');
    const rgba = new image.rgba.constructor(image.rgba);
    const distinctColors = new Set(); let found = false;
    for (let offset = 0; offset < rgba.length; offset += 4) {
      if ([0, 1, 2, 3].every((channel) => rgba[offset + channel] === oldBytes[channel])) {
        for (let channel = 0; channel < 3; channel += 1) rgba[offset + channel] = Number.parseInt(newRgb.slice(channel * 2, channel * 2 + 2), 16);
        changedCells.add(`${offset / 4 % image.width}:${Math.floor(offset / 4 / image.width)}`);
        found = true;
      }
      distinctColors.add([...rgba.subarray(offset, offset + 4)].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    }
    nextImage = found ? { ...image, rgba, colorCount: distinctColors.size } : image;
  }

  const colorToSlot = { ...link.colorToSlot, [nextId]: link.colorToSlot[oldId] };
  delete colorToSlot[oldId];
  const nextLink = { ...link, colorToSlot };
  const legacyGeneratedNotePrefix = `pxd-image-${song.songId}-`;
  const legacyCellTicks = new Set([...changedCells].map((cell) => {
    const [x, y] = cell.split(':').map(Number);
    return `${link.rowPitchMap[y]}:${x * link.ticksPerCell}`;
  }));
  const nextSong = { ...song, tracks: song.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({
      ...clip,
      notes: clip.notes.map((note) => {
        const cell = note.sourceCell;
        const linkedAnimationNote = animation && cell?.kind === 'audio-animation';
        const linkedSharedImageNote = link.rulesVersion === 'shared-canvas-v1' && Number.isInteger(cell?.x) && Number.isInteger(cell?.y)
          && changedCells.has(`${cell.x}:${cell.y}`);
        const linkedLegacyImageNote = link.rulesVersion === 'pixel-cell-v1' && typeof note.noteId === 'string'
          && note.noteId.startsWith(legacyGeneratedNotePrefix) && /^\d+$/.test(note.noteId.slice(legacyGeneratedNotePrefix.length))
          && track.instrument === link.colorToSlot[oldId] && legacyCellTicks.has(`${note.pitch}:${note.startTick}`);
        return (linkedAnimationNote || linkedSharedImageNote || linkedLegacyImageNote) && note.colorId === oldId
        ? { ...note, ...(note.colorId === oldId ? { colorId: nextId } : {}), ...(note.sourceCell?.colorId === oldId ? { sourceCell: { ...note.sourceCell, colorId: nextId } } : {}) }
        : note;
      })
    }))
  })) };
  if (animation) validateAudioAnimationBinding(nextSong, nextAnimation, nextLink);
  else validatePxdAudioBinding(nextSong, nextImage, nextLink);
  return { image: nextImage, animation: nextAnimation, link: nextLink, song: nextSong, colorId: nextId, changed: true };
}
