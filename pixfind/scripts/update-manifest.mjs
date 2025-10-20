#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUZZLE_DIR = path.join(ROOT, 'assets', 'puzzles');
const MANIFEST_PATH = path.join(PUZZLE_DIR, 'manifest.json');

const DIFFICULTY_MAP = new Map([
  ['d1', 1],
  ['d2', 2],
  ['d3', 3],
  ['d4', 4],
  ['d5', 5],
]);

function parseFolderName(name) {
  const [prefix, ...rest] = name.split('-');
  const difficulty = DIFFICULTY_MAP.get(prefix);
  if (!difficulty || rest.length === 0) {
    return null;
  }
  const slug = rest.join('-');
  const label = slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return { difficulty, slug, label };
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function buildManifest() {
  const entries = [];
  const items = await fs.readdir(PUZZLE_DIR, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    if (!item.isDirectory()) continue;
    const parsed = parseFolderName(item.name);
    if (!parsed) continue;
    const folderPath = path.join(PUZZLE_DIR, item.name);
    const originalPath = path.join(folderPath, 'original.png');
    const diffPath = path.join(folderPath, 'diff.png');
    const hasOriginal = await fileExists(originalPath);
    const hasDiff = await fileExists(diffPath);
    if (!hasOriginal || !hasDiff) continue;
    entries.push({
      id: item.name,
      slug: parsed.slug,
      label: parsed.label,
      difficulty: parsed.difficulty,
      original: path.posix.join('assets/puzzles', item.name, 'original.png'),
      diff: path.posix.join('assets/puzzles', item.name, 'diff.png'),
    });
  }
  entries.sort((a, b) => a.difficulty - b.difficulty || a.label.localeCompare(b.label, 'ja'));
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  console.log(`Generated manifest with ${entries.length} puzzle(s) at ${path.relative(ROOT, MANIFEST_PATH)}`);
}

buildManifest().catch(error => {
  console.error('Failed to build manifest:', error);
  process.exit(1);
});
