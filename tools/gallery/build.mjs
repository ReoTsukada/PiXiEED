#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const dotsDir = path.join(projectRoot, 'portfolio', 'dots');
const manifestPath = path.join(dotsDir, 'manifest.json');
const manifestScriptPath = path.join(dotsDir, 'manifest.js');
const thumbsDir = path.join(dotsDir, 'thumbs');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function prettify(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[\-_]+/g, ' ')
    .replace(/\b([a-z])/g, match => match.toUpperCase());
}

async function buildManifest() {
  await fs.mkdir(dotsDir, { recursive: true });
  await fs.mkdir(thumbsDir, { recursive: true });
  const entries = await fs.readdir(dotsDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    const filePath = path.join(dotsDir, entry.name);
    const stats = await fs.stat(filePath);
    let thumb = entry.name;
    try {
      const { spawnSync } = await import('child_process');
      const thumbName = `${path.parse(entry.name).name}.png`;
      const thumbPath = path.join(thumbsDir, thumbName);
      const result = spawnSync('convert', [filePath + '[0]', '-thumbnail', '128x128', thumbPath]);
      if (result.status === 0) {
        thumb = `thumbs/${thumbName}`;
      } else {
        console.warn(`[gallery] imagemagick convert failed for ${entry.name}: ${result.stderr?.toString()}`);
      }
    } catch (error) {
      console.warn(`[gallery] thumbnail generation skipped for ${entry.name}: ${error.message}`);
    }

    files.push({
      file: entry.name,
      thumb,
      label: prettify(entry.name),
      date: stats.mtime.toISOString().slice(0, 10),
      alt: prettify(entry.name)
    });
  }

  files.sort((a, b) => b.date.localeCompare(a.date));

  const json = JSON.stringify(files, null, 2) + '\n';
  await fs.writeFile(manifestPath, json, 'utf8');
  const scriptContent = `window.DOT_GALLERY_MANIFEST = ${JSON.stringify(files, null, 2)};\n`;
  await fs.writeFile(manifestScriptPath, scriptContent, 'utf8');
  console.log(`[gallery] manifest written with ${files.length} entries -> portfolio/dots/manifest.(json|js)`);
}

buildManifest().catch(error => {
  console.error('[gallery] failed to build manifest:', error);
  process.exitCode = 1;
});
