#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const outputPath = path.join(projectRoot, 'data', 'project-updates.json');

const PROJECTS = [
  {
    id: 'site',
    name: 'PiXiEED 全体',
    url: '/index.html',
    paths: ['index.html', 'notes', 'glossary', 'portfolio', 'projects', 'sitemap.xml', 'robots.txt', 'scripts/dev-notes.js']
  },
  {
    id: 'pixiedraw',
    name: 'PiXiEEDraw',
    url: '/projects/pixiedraw/',
    paths: ['pixiedraw']
  },
  {
    id: 'pixiedraw-lite',
    name: 'PiXiEEDraw Lite',
    url: '/projects/jerin-maker/',
    paths: ['jerin-maker']
  },
  {
    id: 'pixiee-lens',
    name: 'PiXiEELENS',
    url: '/projects/pixiee-lens/',
    paths: ['pixiee-lens']
  },
  {
    id: 'qr-maker',
    name: 'QRコードメーカー',
    url: '/projects/qr-maker/',
    paths: ['qr-maker']
  },
  {
    id: 'pixfind',
    name: 'PiXFiND',
    url: '/projects/pixfind/',
    paths: ['pixfind']
  },
  {
    id: 'maoitu',
    name: '魔王様!!いつまでよければいいですか!?',
    url: '/projects/maoitu/',
    paths: ['maoitu']
  },
  {
    id: 'maou-war',
    name: '魔王奪還戦',
    url: '/projects/maou-war/',
    paths: ['maou-war']
  }
];

const MAX_PROJECT_DATES = 8;
const MAX_RECENT_DATES = 8;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

function classifyPath(filePath) {
  const value = normalizePath(filePath).toLowerCase();
  if (!value) return '';
  if (value.endsWith('.md') || value.includes('/docs/') || value.startsWith('notes/')) return 'ドキュメント';
  if (value.endsWith('.css')) return 'スタイル';
  if (value.endsWith('.js') || value.endsWith('.mjs') || value.endsWith('.ts')) return '機能';
  if (value.endsWith('.html')) return '画面';
  if (value.match(/\.(png|gif|jpg|jpeg|webp|svg)$/)) return '画像';
  if (value.endsWith('sitemap.xml') || value.endsWith('robots.txt')) return 'SEO';
  if (value.endsWith('.json')) return '設定';
  return '構成';
}

function summarizePaths(paths) {
  const categories = [];
  const files = Array.from(new Set((paths || []).map(normalizePath).filter(Boolean)));
  files.forEach((filePath) => {
    const category = classifyPath(filePath);
    if (category && !categories.includes(category)) {
      categories.push(category);
    }
  });
  const visible = categories.slice(0, 4);
  if (!visible.length) return '更新内容を調整';
  return `${visible.join(' / ')}を更新`;
}

function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
}

async function gitLogForPaths(paths) {
  const args = [
    'log',
    '--date=short',
    '--pretty=format:__COMMIT__%n%ad%x09%H%x09%s',
    '--name-only',
    '--',
    ...paths
  ];
  const { stdout } = await execFileAsync('git', args, {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024
  });
  return parseGitLog(stdout);
}

function parseGitLog(text) {
  const commits = [];
  let current = null;
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (line === '__COMMIT__') {
      if (current) commits.push(current);
      current = { date: '', hash: '', subject: '', files: [] };
      return;
    }
    if (!current) return;
    if (!current.date) {
      const [date = '', hash = '', ...subjectParts] = line.split('\t');
      current.date = safeDate(date);
      current.hash = hash.trim();
      current.subject = subjectParts.join('\t').trim();
      return;
    }
    const filePath = normalizePath(line.trim());
    if (filePath) current.files.push(filePath);
  });
  if (current) commits.push(current);
  return commits.filter((entry) => entry.date);
}

function buildProjectEntries(commits) {
  const grouped = new Map();
  commits.forEach((commit) => {
    const date = safeDate(commit.date);
    if (!date) return;
    const bucket = grouped.get(date) || { date, files: new Set() };
    commit.files.forEach((filePath) => bucket.files.add(filePath));
    grouped.set(date, bucket);
  });
  return Array.from(grouped.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_PROJECT_DATES)
    .map((entry) => ({
      date: entry.date,
      items: [summarizePaths(Array.from(entry.files))]
    }));
}

function buildRecentByDate(projects) {
  const byDate = new Map();
  projects.forEach((project) => {
    (project.entries || []).forEach((entry) => {
      const date = safeDate(entry.date);
      if (!date) return;
      const rows = byDate.get(date) || [];
      rows.push({
        id: project.id,
        name: project.name,
        url: project.url,
        summary: Array.isArray(entry.items) ? entry.items[0] || '' : ''
      });
      byDate.set(date, rows);
    });
  });
  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MAX_RECENT_DATES)
    .map(([date, updates]) => ({
      date,
      updates: updates.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    }));
}

async function main() {
  const projects = [];
  for (const project of PROJECTS) {
    const commits = await gitLogForPaths(project.paths);
    projects.push({
      id: project.id,
      name: project.name,
      url: project.url,
      entries: buildProjectEntries(commits)
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    projects,
    recentByDate: buildRecentByDate(projects)
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
