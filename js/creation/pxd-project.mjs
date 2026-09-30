import { createPxdProject, getPxdJson, setPxdJson, setPxdBytes } from './pxd-codec.mjs';
import { MAX_DRAW_COLORS, validateDrawDocument, documentRgba } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { countSharedImageColors } from './shared-image.mjs?rev=20260930-shared-canvas-5';

const MAX_PIXELS = 2 * 1024 * 1024;
const MAX_RETURNED_COLOR_IDS = 32;
const rolePattern = /^[a-z][a-z0-9-]{0,47}$/;
const identityKeys = ['id', 'trackId', 'clipId', 'noteId', 'slotId', 'colorId', 'pieceId', 'groupId', 'targetId'];
const clone = (value) => structuredClone(value);
function merge(oldValue, value) {
  if (Array.isArray(value)) {
    if (!Array.isArray(oldValue)) return clone(value);
    const key = identityKeys.find((candidate) => value.length && value.every((item) => item && typeof item === 'object' && typeof item[candidate] === 'string'));
    if (!key) return clone(value);
    const previous = new Map(oldValue.filter((item) => item && typeof item === 'object').map((item) => [item[key], item]));
    return value.map((item) => merge(previous.get(item[key]), item));
  }
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    const result = oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue) ? clone(oldValue) : {};
    for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, { value: merge(oldValue?.[key], item), enumerable: true, writable: true, configurable: true });
    return result;
  }
  return clone(value);
}
/** Replace the edited fields while carrying unrecognised fields of matching items. */
export function mergePxdJson(project, path, value) {
  return setPxdJson(project, path, merge(project.entries.some((entry) => entry.path === path) ? getPxdJson(project, path) : null, value));
}
function imagePaths(role) {
  if (!rolePattern.test(role)) throw new TypeError('画像の種類を確認できません。');
  return { meta: `images/${role}/meta.json`, rgba: `images/${role}/pixels.rgba`, draw: role === 'main' ? 'draw/state.json' : `images/${role}/draw.json` };
}
function validImage(image) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > MAX_PIXELS) throw new RangeError('画像は合計209万画素までです。原本のサイズは変更しません。');
  if (!(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== image.width * image.height * 4) throw new TypeError('画像の画素データが一致しません。');
  return image;
}
const hex = (values) => [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
function colorsOf(rgba) {
  const colors = new Map();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const color = rgba.subarray(offset, offset + 4); const key = hex(color);
    if (!colors.has(key)) colors.set(key, { colorId: `rgba-${key}`, rgba: [...color] });
  }
  return [...colors.values()];
}
export async function putPxdImage(project, image, role = 'main') {
  validImage(image); project ||= createPxdProject(); const paths = imagePaths(role);
  let next = setPxdBytes(project, paths.rgba, new Uint8Array(image.rgba));
  next = mergePxdJson(next, paths.meta, { schemaVersion: 1, width: image.width, height: image.height, rgbaPath: paths.rgba, colors: colorsOf(image.rgba), ...(image.provenance ? { provenance: image.provenance } : {}) });
  return next;
}

/** Write the canonical shared canvas as one raw RGBA payload and compact schema-2 metadata. */
export async function putPxdSharedImage(project, image) {
  validImage(image); project ||= createPxdProject();
  const paths = imagePaths('main'); const rgba = new Uint8Array(image.rgba);
  const colorCount = countSharedImageColors({ width: image.width, height: image.height, rgba });
  let next = setPxdBytes(project, paths.rgba, rgba);
  const priorMeta = next.entries.some((entry) => entry.path === paths.meta) ? getPxdJson(next, paths.meta) : {};
  const meta = { ...priorMeta, schemaVersion: 2, width: image.width, height: image.height, rgbaPath: paths.rgba, colorCount };
  delete meta.colors;
  next = setPxdJson(next, paths.meta, meta);
  next.manifest = {
    ...next.manifest,
    sharedCanvas: { schemaVersion: 1, imageRole: 'main', width: image.width, height: image.height, colorCount }
  };
  return next;
}

export async function readPxdImage(project, role = 'main') {
  const paths = imagePaths(role); const meta = project.entries.some((entry) => entry.path === paths.meta) ? getPxdJson(project, paths.meta) : null;
  if (!meta) return null;
  if (![1, 2].includes(meta.schemaVersion) || meta.rgbaPath !== paths.rgba) throw new TypeError('この画像の保存版にはまだ対応していません。原本は保持しています。');
  const entry = project.entries.find((item) => item.path === paths.rgba);
  if (!entry) throw new TypeError('画像の画素が見つかりません。');
  const image = validImage({ ...clone(meta), rgba: new Uint8Array(entry.bytes) });
  if (meta.schemaVersion === 1) {
    if (!Array.isArray(meta.colors) || JSON.stringify(meta.colors.map(({ colorId, rgba }) => ({ colorId, rgba }))) !== JSON.stringify(colorsOf(image.rgba))) throw new TypeError('画像の色と画素が一致しません。');
    image.colorIds = meta.colors.slice(0, MAX_RETURNED_COLOR_IDS).map((color) => color.colorId);
  } else {
    const pixelCount = image.width * image.height;
    if (!Number.isSafeInteger(meta.colorCount) || meta.colorCount < 1 || meta.colorCount > pixelCount) throw new TypeError('画像の色数と画素が一致しません。');
    const colorCount = countSharedImageColors(image, meta.colorCount);
    if (meta.colorCount !== colorCount) throw new TypeError('画像の色数と画素が一致しません。');
    image.colorCount = colorCount;
    image.colorIds = colorsOfLimited(image.rgba, MAX_RETURNED_COLOR_IDS);
  }
  return image;
}

function colorsOfLimited(rgba, limit) {
  const colors = new Map();
  for (let offset = 0; offset < rgba.length && colors.size < limit; offset += 4) {
    const color = rgba.subarray(offset, offset + 4); const key = hex(color);
    if (!colors.has(key)) colors.set(key, `rgba-${key}`);
  }
  return [...colors.values()];
}

/** Read the main image as a shared canvas, accepting unmarked schema-1 projects for migration. */
export async function readPxdSharedImage(project) {
  const image = await readPxdImage(project, 'main');
  if (!image) return null;
  const marker = project.manifest?.sharedCanvas;
  const colorCount = image.colorCount ?? countSharedImageColors(image);
  if (marker !== undefined && (marker?.schemaVersion !== 1 || marker.imageRole !== 'main'
    || marker.width !== image.width || marker.height !== image.height || marker.colorCount !== colorCount)) {
    throw new TypeError('PXDの共通画像情報と画素が一致しません。');
  }
  return { width: image.width, height: image.height, rgba: new Uint8Array(image.rgba), colorIds: [...(image.colorIds ?? [])], colorCount };
}
/** Exact conversion only. Unsupported images remain intact in the container. */
export function imageToDrawDocument(image) {
  validImage(image);
  if (![image.width, image.height].every((side) => Number.isInteger(side) && side >= 1 && side <= 512)) throw new RangeError('この原本は描画キャンバスの対応サイズ外です。PXD内の原本は保持しています。');
  const palette = []; const indices = new Map(); const pixels = new Array(image.width * image.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const color = image.rgba.subarray(index * 4, index * 4 + 4); const key = hex(color);
    if (key === '00000000') { pixels[index] = -1; continue; }
    if (!indices.has(key)) {
      if (palette.length >= MAX_DRAW_COLORS) throw new RangeError('原本は128色を超えています。自動で減色せず、PXD内に全色を保持しています。');
      indices.set(key, palette.length); palette.push(`#${key}`);
    }
    pixels[index] = indices.get(key);
  }
  return validateDrawDocument({ schemaVersion: 1, width: image.width, height: image.height, palette: palette.length ? palette : ['#00000000'], pixels });
}
function sameBytes(a, b) { return a?.length === b?.length && a.every((value, index) => value === b[index]); }
export async function readPxdDrawDocument(project, role = 'main') {
  const paths = imagePaths(role); const image = await readPxdImage(project, role);
  const meta = project.entries.some((entry) => entry.path === paths.meta) ? getPxdJson(project, paths.meta) : null;
  if (role === 'main' && meta?.schemaVersion === 2) return image ? imageToDrawDocument(image) : null;
  const document = project.entries.some((entry) => entry.path === paths.draw) ? getPxdJson(project, paths.draw) : null;
  if (document) {
    validateDrawDocument(document);
    if (!image || image.width !== document.width || image.height !== document.height || !sameBytes(documentRgba(document), image.rgba)) throw new TypeError('描画データと原本の画素が一致しません。');
    return clone(document);
  }
  if (!image) return null;
  return imageToDrawDocument(image);
}
export async function putPxdDrawDocument(project, document, role = 'main') {
  validateDrawDocument(document); project ||= createPxdProject();
  const before = await readPxdImage(project, role); const rgba = documentRgba(document);
  let next;
  if (role === 'main') next = await putPxdSharedImage(project, { width: document.width, height: document.height, rgba });
  else {
    next = await putPxdImage(project, { width: document.width, height: document.height, rgba }, role);
    next = mergePxdJson(next, imagePaths(role).draw, document);
  }
  if (before && (before.width !== document.width || before.height !== document.height || !sameBytes(before.rgba, rgba))) {
    const puzzlePath = ['spot-after', 'spot-before'].includes(role) ? 'puzzles/spot_difference.json' : role === 'hidden' ? 'puzzles/hidden_object.json' : null;
    if (puzzlePath && next.entries.some((entry) => entry.path === puzzlePath)) next = mergePxdJson(next, puzzlePath, { confirmed: false, publication: 'draft', published: false, sourceChanged: true });
  }
  return next;
}
export function pxdImageRoles(project) {
  return project.entries.filter((entry) => /^images\/[a-z][a-z0-9-]*\/meta\.json$/.test(entry.path)).map((entry) => entry.path.split('/')[1]);
}
export function primaryPxdImageRole(project, preferred) {
  const roles = pxdImageRoles(project);
  if (preferred) { imagePaths(preferred); if (!roles.includes(preferred)) throw new Error('指定した画像部品がPXDにありません。'); return preferred; }
  return ['main', 'draw', 'audio', 'jigsaw-main', 'hidden', 'spot-after', 'spot-before'].find((role) => roles.includes(role)) || null;
}
export function pxdToolUrl(tool, project, imageRole) {
  const routes = { draw: '/draw/', audio: '/audio/', camera: '/pixel-camera.html', jigsaw: '/jigsaw/', spot_difference: '/spot-difference/', hidden_object: '/hidden-object/' };
  if (!routes[tool] || !project?.projectId || !project?.revisionId) throw new TypeError('保存した作品の行き先を確認できません。');
  const query = new URLSearchParams({ pxd: project.projectId, pxdRevision: project.revisionId });
  if (imageRole) { imagePaths(imageRole); query.set('pxdImage', imageRole); }
  return `${routes[tool]}?${query}`;
}
