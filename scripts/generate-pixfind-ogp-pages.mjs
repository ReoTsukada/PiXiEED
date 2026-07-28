#!/usr/bin/env node
/**
 * PiXFiND投稿別のOGPページをGitHub Pages用の静的HTMLとして生成する。
 * StorageはHTMLをページとして配信しないため、メタ情報はここで出力する。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesRoot = path.join(root, 'pixfind/puzzles');
const siteUrl = 'https://pixieed.jp';
const supabaseUrl = 'https://kyyiuakrqomzlikfaire.supabase.co';
const anonKey = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
const bucket = 'pixfind-puzzles';
const puzzleIdPattern = /^[a-z0-9][a-z0-9-]{0,119}$/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function publicObjectUrl(puzzleId, filename) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/puzzles/${encodeURIComponent(puzzleId)}/${filename}`;
}

function pageUrl(puzzleId) {
  return `${siteUrl}/pixfind/puzzles/${encodeURIComponent(puzzleId)}/`;
}

function gameUrl(puzzleId) {
  return `${siteUrl}/pixfind/?puzzle=${encodeURIComponent(puzzleId)}`;
}

function staticPage(puzzle) {
  const mode = String(puzzle.mode || puzzle.game_mode || puzzle.play_mode || 'spot-difference').toLowerCase();
  const isHiddenObject = mode === 'hidden-object';
  const title = `PiXFiND | ${String(puzzle.label || 'パズル').trim() || 'パズル'}`;
  const description = String(puzzle.description || '').trim() || (isHiddenObject
    ? 'ドット絵の中から、指定されたアイテムを探そう。'
    : '2枚の画像を見比べて、間違いを探そう。');
  const url = pageUrl(puzzle.id);
  const targetUrl = gameUrl(puzzle.id);
  const imageUrl = publicObjectUrl(puzzle.id, 'ogp.png');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(description)}"/>
  <meta property="og:image" content="${escapeHtml(imageUrl)}"/>
  <meta property="og:image:width" content="1280"/>
  <meta property="og:image:height" content="720"/>
  <meta property="og:url" content="${escapeHtml(url)}"/>
  <meta property="og:site_name" content="PiXFiND"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${escapeHtml(title)}"/>
  <meta name="twitter:description" content="${escapeHtml(description)}"/>
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}"/>
  <link rel="canonical" href="${escapeHtml(url)}"/>
  <meta http-equiv="refresh" content="0; url=${escapeHtml(targetUrl)}"/>
</head>
<body><p>Redirecting...</p><script>window.location.replace(${JSON.stringify(targetUrl)});</script></body>
</html>`;
}

async function getPuzzles() {
  const response = await fetch(`${supabaseUrl}/rest/v1/pixfind_puzzles?select=id,label,description,mode,game_mode,play_mode,updated_at&order=updated_at.desc`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!response.ok) throw new Error(`pixfind_puzzles fetch failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('pixfind_puzzles did not return an array');
  return data.filter((puzzle) => puzzleIdPattern.test(String(puzzle?.id || '')));
}

async function removeStalePages(puzzleIds) {
  let entries = [];
  try {
    entries = await fs.readdir(pagesRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !puzzleIds.has(entry.name))
    .map((entry) => fs.rm(path.join(pagesRoot, entry.name), { recursive: true, force: true })));
}

async function main() {
  const puzzles = await getPuzzles();
  const puzzleIds = new Set(puzzles.map((puzzle) => puzzle.id));
  await fs.mkdir(pagesRoot, { recursive: true });
  await Promise.all(puzzles.map(async (puzzle) => {
    const directory = path.join(pagesRoot, puzzle.id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.html'), staticPage(puzzle));
  }));
  await removeStalePages(puzzleIds);
  console.log(`Generated ${puzzles.length} PiXFiND OGP page(s).`);
}

await main();
