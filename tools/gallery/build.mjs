#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const dotsDir = path.join(projectRoot, 'portfolio', 'dots');
const manifestPath = path.join(dotsDir, 'manifest.json');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function prettify(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[\-_]+/g, ' ')
    .replace(/\b([a-z])/g, match => match.toUpperCase());
}

async function buildManifest() {
  await fs.mkdir(dotsDir, { recursive: true });
  const entries = await fs.readdir(dotsDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const filePath = path.join(dotsDir, entry.name);
    const stats = await fs.stat(filePath);
    files.push({
      file: entry.name,
      label: prettify(entry.name),
      date: stats.mtime.toISOString().slice(0, 10),
      alt: prettify(entry.name)
    });
  }

  files.sort((a, b) => b.date.localeCompare(a.date));

  await fs.writeFile(manifestPath, JSON.stringify(files, null, 2) + '\n', 'utf8');
  console.log(`[gallery] manifest written with ${files.length} entries -> portfolio/dots/manifest.json`);
}

buildManifest().catch(error => {
  console.error('[gallery] failed to build manifest:', error);
  process.exitCode = 1;
});
