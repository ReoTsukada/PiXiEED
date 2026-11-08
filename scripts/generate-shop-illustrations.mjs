#!/usr/bin/env node
// Historical command name retained. AI artwork is authored separately, not regenerated
// deterministically by code. This command only verifies the documented JPEG asset set.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Expected JPEG image');
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error('Truncated JPEG segment');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG segment length');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) throw new Error('Truncated JPEG frame');
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
      if (!width || !height) throw new Error('Invalid JPEG dimensions');
      return { width, height };
    }
    offset += length;
  }
  throw new Error('JPEG frame not found');
}

export async function validateIllustrations(root = fileURLToPath(new URL('../', import.meta.url))) {
  const manifest = JSON.parse(await readFile(path.join(root, 'assets/books/illustrations-manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.method !== 'AI-generated category illustrations' || !manifest.provenance?.generator || !manifest.provenance?.description || !manifest.provenance?.rights || !Array.isArray(manifest.assets)) throw new Error('Missing illustration provenance');
  const products = JSON.parse(await readFile(path.join(root, 'assets/books/room-products.json'), 'utf8'));
  const used = new Set(products.filter(p => p && p.enabled !== false && p.visible !== false && !p.sample).map(p => p.shopThumbnail?.src).filter(Boolean));
  const declared = new Set();
  let total = 0;
  for (const asset of manifest.assets) {
    if (!/^\/assets\/books\/illustrations\/[a-z-]+\.jpg$/.test(asset.src) || declared.has(asset.src)) throw new Error('Invalid or duplicate illustration path');
    declared.add(asset.src);
    if (asset.width !== 640 || asset.height !== 640 || !asset.subject || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error(`Invalid illustration metadata: ${asset.src}`);
    const bytes = await readFile(path.join(root, asset.src.slice(1)));
    const size = jpegDimensions(bytes);
    if (size.width !== asset.width || size.height !== asset.height) throw new Error(`Illustration dimensions mismatch: ${asset.src}`);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Illustration hash mismatch: ${asset.src}`);
    total += bytes.length;
  }
  if (used.size !== declared.size || [...used].some(src => !declared.has(src))) throw new Error('Illustrations must match exactly the used catalog assets');
  const files = await readdir(path.join(root, 'assets/books/illustrations'));
  if (files.length !== declared.size || files.some(file => !declared.has(`/assets/books/illustrations/${file}`))) throw new Error('Undeclared illustration file');
  return { count: declared.size, bytes: total };
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await validateIllustrations();
  console.log(`Verified ${result.count} original 640x640 AI illustrations (${result.bytes} bytes total)`);
}
