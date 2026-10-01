import { createPxdProject } from './pxd-codec.mjs';
import { pxdImageRoles, primaryPxdImageRole, readPxdImage } from './pxd-project.mjs?rev=20260930-shared-canvas-5';

const THUMBNAIL_EDGE = 28;
const MAX_TITLE_LENGTH = 60;
const DRAW_STATE_PATHS = ['draw/state.json', 'images/main/draw.json'];
const AUDIO_STATE_PATH = 'audio/state.json';

/** Remove control/formatting characters and keep titles short before UI display. */
export function sanitizeProjectTitle(text) {
  if (typeof text !== 'string') return '無題の作品';
  const safe = text.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(safe).slice(0, MAX_TITLE_LENGTH).join('').trim() || '無題の作品';
}

function safeTimestamp(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 64) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function imageThumbnail(image) {
  if (!image) return null;
  const scale = Math.min(1, THUMBNAIL_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor(y * image.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor(x * image.width / width));
      const source = (sourceY * image.width + sourceX) * 4;
      const target = (y * width + x) * 3;
      const alpha = image.rgba[source + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        rgb[target + channel] = Math.round(image.rgba[source + channel] * alpha + 255 * (1 - alpha));
      }
    }
  }
  return { width, height, rgb };
}

function hasEntry(project, path) { return project.entries.some((entry) => entry.path === path); }

async function catalogImage(project) {
  const roles = pxdImageRoles(project);
  const preferred = primaryPxdImageRole(project);
  const candidates = [...new Set([preferred, ...roles].filter(Boolean))];
  for (const role of candidates) {
    try {
      const image = await readPxdImage(project, role);
      if (image) return image;
    } catch {
      // One unavailable image part should not prevent the other parts from being listed.
    }
  }
  return null;
}

/** Build small, display-ready metadata without a DOM or a canvas. */
export async function summarizeProject(project) {
  if (!project || !Array.isArray(project.entries) || !project.manifest || typeof project.manifest !== 'object') {
    throw new TypeError('PXD作品を要約できません。');
  }
  const image = await catalogImage(project);
  const imageRoles = pxdImageRoles(project);
  const hasDrawing = project.manifest.lastMode === 'draw'
    || DRAW_STATE_PATHS.some((path) => hasEntry(project, path))
    || imageRoles.some((role) => hasEntry(project, `images/${role}/draw.json`));
  const hasAudio = project.manifest.lastMode === 'audio' || hasEntry(project, AUDIO_STATE_PATH);
  const lastMode = typeof project.manifest.lastMode === 'string'
    ? Array.from(project.manifest.lastMode).slice(0, 32).join('')
    : null;
  const stamp = project.manifest.toolProject;
  const toolProject = stamp && typeof stamp.tool === 'string' && stamp.schemaVersion === 1
    ? { tool: stamp.tool, schemaVersion: 1 }
    : null;
  return {
    name: sanitizeProjectTitle(project.manifest.title),
    createdAt: safeTimestamp(project.manifest.createdAt),
    lastMode,
    toolProject,
    width: image?.width ?? null,
    height: image?.height ?? null,
    hasDrawing,
    hasAudio,
    thumbnail: imageThumbnail(image)
  };
}

/** Duplicate a PXD as an independent local project while retaining every payload. */
export function forkProject(project, { projectId, revisionId, title, now = Date.now() } = {}) {
  if (!project || project.format !== 'PXD' || project.version !== 3 || !Array.isArray(project.entries)) {
    throw new TypeError('複製するPXD作品を確認できません。');
  }
  const timestamp = now instanceof Date ? now.getTime() : safeTimestamp(now);
  if (!Number.isFinite(timestamp)) throw new TypeError('複製日時を確認できません。');
  const manifest = structuredClone(project.manifest ?? {});
  manifest.title = sanitizeProjectTitle(title ?? manifest.title);
  manifest.createdAt = timestamp;
  return createPxdProject({
    projectId,
    revisionId,
    manifest,
    entries: project.entries.map((entry) => ({
      ...structuredClone(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'bytes'))),
      bytes: new Uint8Array(entry.bytes)
    })),
    opaquePayloads: (project.opaquePayloads ?? []).map(({ bytes }) => ({ bytes: new Uint8Array(bytes) }))
  });
}
