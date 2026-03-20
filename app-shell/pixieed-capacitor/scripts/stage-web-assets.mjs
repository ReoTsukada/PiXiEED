import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '../..');
const webRoot = path.join(appRoot, 'dist', 'web');
const buildManifestPath = path.join(appRoot, 'dist', 'build-manifest.json');
const shouldCheckOnly = process.argv.includes('--check');

const includeEntries = [
  'assets',
  'character-dots',
  'contact',
  'contest',
  'en',
  'games.html',
  'glossary',
  'icon',
  'index.html',
  'jerin-maker',
  'maoitu',
  'manifest.webmanifest',
  'notes',
  'pixel-art-animation',
  'pixel-art-editor',
  'pixel-art-online',
  'pixfind',
  'pixiedraw',
  'pixiee-lens',
  'portfolio',
  'privacy',
  'projects',
  'public-room.html',
  'public-room.js',
  'resident-128.html',
  'resident-128.js',
  'resident-216.html',
  'resident-216.js',
  'resident-256.html',
  'resident-256.js',
  'resident-room.html',
  'resident-room.js',
  'robots.txt',
  'rooms.json',
  'scripts',
  'scripts.js',
  'sitemap.xml',
  'styles.css',
  'terms',
  'tools',
  'tools.html'
];

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function getBuildSummary(entries) {
  return {
    generatedAt: new Date().toISOString(),
    appRoot,
    repoRoot,
    webRoot,
    entries
  };
}

function buildLauncherHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>PiXiEED App</title>
  <meta name="theme-color" content="#020816"/>
  <style>
    :root {
      color-scheme: dark;
      --bg: #020816;
      --panel: rgba(15, 23, 42, 0.96);
      --line: rgba(148, 163, 184, 0.28);
      --text: #f8fafc;
      --sub: #cbd5e1;
      --accent: #7dd3fc;
      --accent-strong: #38bdf8;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 35%),
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 28%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .app-home {
      width: min(720px, 100%);
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--panel);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
      padding: 24px;
      display: grid;
      gap: 18px;
    }
    .brand {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .brand img {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      image-rendering: pixelated;
    }
    .brand h1 {
      margin: 0;
      font-size: clamp(28px, 5vw, 40px);
      line-height: 1.1;
    }
    .brand p,
    .lead,
    .meta {
      margin: 0;
      color: var(--sub);
      line-height: 1.6;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .action {
      border: 1px solid rgba(125, 211, 252, 0.22);
      border-radius: 18px;
      padding: 16px;
      color: inherit;
      text-decoration: none;
      background: rgba(15, 23, 42, 0.85);
      display: grid;
      gap: 8px;
    }
    .action strong {
      font-size: 17px;
      line-height: 1.3;
    }
    .action span {
      color: var(--sub);
      line-height: 1.5;
      font-size: 14px;
    }
    .action--primary {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.08));
      border-color: rgba(56, 189, 248, 0.42);
    }
    .meta {
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main class="app-home">
    <section class="brand">
      <img src="./icon/icon-512-4.png" alt="PiXiEED icon"/>
      <div>
        <p class="meta">PiXiEED App</p>
        <h1>PiXiEED</h1>
      </div>
    </section>
    <p class="lead">描く、撮る、みんなで遊ぶ。PiXiEED の主要機能へこのホームから移動できます。</p>
    <section class="actions">
      <a class="action action--primary" href="./pixiedraw/index.html">
        <strong>PiXiEEDraw を開く</strong>
        <span>本格ドット絵制作と共同編集を始めます。</span>
      </a>
      <a class="action" href="./pixiee-lens/index.html">
        <strong>PiXiEELENS</strong>
        <span>カメラ撮影からドット化して Draw へ持ち込めます。</span>
      </a>
      <a class="action" href="./tools.html">
        <strong>ツール一覧</strong>
        <span>PiXiEED の各ツールを確認できます。</span>
      </a>
      <a class="action" href="./public-room.html">
        <strong>公開中の部屋</strong>
        <span>みんなで一緒に描いている部屋へ参加できます。</span>
      </a>
      <a class="action" href="./contest/index.html">
        <strong>コンテスト</strong>
        <span>投稿や開催情報を確認できます。</span>
      </a>
    </section>
    <p class="meta">PiXiEED の各機能を 1 つのアプリから行き来できるホームです。</p>
  </main>
</body>
</html>
`;
}

async function copyEntry(entry) {
  const sourcePath = path.join(repoRoot, entry);
  const targetPath = path.join(webRoot, entry);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    filter: (source) => !source.endsWith('.DS_Store')
  });
}

async function validateEntries() {
  const missing = [];
  for (const entry of includeEntries) {
    const sourcePath = path.join(repoRoot, entry);
    if (!(await pathExists(sourcePath))) {
      missing.push(entry);
    }
  }
  if (missing.length) {
    throw new Error(`Missing source entries: ${missing.join(', ')}`);
  }
}

async function main() {
  await validateEntries();
  if (shouldCheckOnly) {
    console.log(`OK: ${includeEntries.length} entries are available for staging.`);
    return;
  }

  await rm(path.join(appRoot, 'dist'), { recursive: true, force: true });
  await mkdir(webRoot, { recursive: true });

  for (const entry of includeEntries) {
    await copyEntry(entry);
  }

  await writeFile(buildManifestPath, `${JSON.stringify(getBuildSummary(includeEntries), null, 2)}\n`, 'utf8');

  console.log(`Staged ${includeEntries.length} entries into ${webRoot}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
