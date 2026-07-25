#!/usr/bin/env node
/**
 * 既存PiXFiND投稿へ、投稿画像のみで構成したOGP PNGを一度だけ補完する。
 * 新規投稿は pixfind/app.js が同じファイルを投稿時に生成する。
 */
import sharp from 'sharp';

const supabaseUrl = 'https://kyyiuakrqomzlikfaire.supabase.co';
const anonKey = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const bucket = 'pixfind-puzzles';
const puzzleIdPattern = /^[a-z0-9][a-z0-9-]{0,119}$/i;

async function getPuzzles() {
  const response = await fetch(`${supabaseUrl}/rest/v1/pixfind_puzzles?select=id,original_url,diff_url,mode,game_mode,play_mode`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!response.ok) throw new Error(`pixfind_puzzles fetch failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('pixfind_puzzles did not return an array');
  return data.filter((puzzle) => puzzleIdPattern.test(String(puzzle?.id || '')) && puzzle.original_url && puzzle.diff_url);
}

async function fetchImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`source image download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function contain(image, width, height) {
  return sharp(image)
    .resize(width, height, { fit: 'contain', background: '#000000' })
    .png()
    .toBuffer();
}

async function compose({ mode, original, diff, width, height }) {
  const padding = Math.max(8, Math.round(Math.min(width, height) * 0.012));
  const hidden = String(mode || '').toLowerCase() === 'hidden-object';
  const background = sharp({ create: { width, height, channels: 4, background: '#000000' } });
  if (hidden) {
    return background.composite([{
      input: await contain(original, width - padding * 2, height - padding * 2),
      left: padding,
      top: padding,
    }]).png().toBuffer();
  }
  if (height > width * 0.9) {
    const gap = padding;
    const imageHeight = Math.floor((height - padding * 2 - gap) / 2);
    return background.composite([
      { input: await contain(original, width - padding * 2, imageHeight), left: padding, top: padding },
      { input: await contain(diff, width - padding * 2, imageHeight), left: padding, top: padding + imageHeight + gap },
    ]).png().toBuffer();
  }
  const gap = padding;
  const imageWidth = Math.floor((width - padding * 2 - gap) / 2);
  return background.composite([
    { input: await contain(original, imageWidth, height - padding * 2), left: padding, top: padding },
    { input: await contain(diff, imageWidth, height - padding * 2), left: padding + imageWidth + gap, top: padding },
  ]).png().toBuffer();
}

async function upload(puzzleId, filename, image) {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/puzzles/${encodeURIComponent(puzzleId)}/${filename}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'image/png' },
    body: image,
  });
  if (response.ok || response.status === 409) return;
  throw new Error(`OGP upload failed: ${response.status} ${await response.text()}`);
}

async function main() {
  const puzzles = await getPuzzles();
  for (const puzzle of puzzles) {
    const [original, diff] = await Promise.all([fetchImage(puzzle.original_url), fetchImage(puzzle.diff_url)]);
    const mode = puzzle.mode || puzzle.game_mode || puzzle.play_mode;
    const [wide, square] = await Promise.all([
      compose({ mode, original, diff, width: 1280, height: 720 }),
      compose({ mode, original, diff, width: 1200, height: 1200 }),
    ]);
    await Promise.all([upload(puzzle.id, 'ogp.png', wide), upload(puzzle.id, 'ogp-square.png', square)]);
    console.log(`Backfilled ${puzzle.id}`);
  }
}

await main();
