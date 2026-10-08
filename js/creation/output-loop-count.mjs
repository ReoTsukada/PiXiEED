/** Normalize animation repetition as total plays: 0 means infinite, 1 means one pass. */
export function gifRepeatsToTotalPlays(repeats) {
  if (repeats === null || repeats === undefined) return 1;
  if (!Number.isSafeInteger(repeats) || repeats < 0 || repeats > 65535) throw new RangeError('GIFのループ設定が壊れています。');
  return repeats === 0 ? 0 : repeats + 1;
}

export function totalPlaysToGifRepeats(totalPlays) {
  if (!Number.isSafeInteger(totalPlays) || totalPlays < 0 || totalPlays > 65536) throw new RangeError('GIFは1〜65536回または無限再生で書き出せます。');
  if (totalPlays === 1) return null; // GIF's loop extension has no finite one-play value; omit it.
  return totalPlays === 0 ? 0 : totalPlays - 1;
}

export function assertTotalPlays(totalPlays, maximum = 0xffffffff) {
  if (!Number.isSafeInteger(totalPlays) || totalPlays < 0 || totalPlays > maximum) throw new RangeError('再生回数の設定が上限を超えています。');
  return totalPlays;
}
