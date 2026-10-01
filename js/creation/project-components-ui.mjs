import { COMPONENTS, componentImageRole, hasProjectComponent } from './project-components.mjs?rev=20261001-components-1';
import { readPxdImage } from './pxd-project.mjs?rev=20261001-components-1';

const shapes = {
  draw: '<path d="m4 20 1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  audio: '<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  jigsaw: '<path d="M4 4h6a3 3 0 1 0 4 0h6v6a3 3 0 1 1 0 4v6h-6a3 3 0 1 0-4 0H4v-6a3 3 0 1 1 0-4z"/>',
  spot_difference: '<path d="M3 4h7v16H3zM14 4h7v16h-7zM5 9h3M16 14h3"/>',
  hidden_object: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M8 10h4M10 8v4"/>'
};
const icon = (tool) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[tool]}</svg>`;
function node(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text) el.textContent = text; return el; }
function sampleCanvas(image) {
  const canvas = node('canvas', 'project-component__pixels');
  const ratio = Math.min(1, 64 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
  const pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const source = (Math.min(image.height - 1, Math.floor(y / ratio)) * image.width + Math.min(image.width - 1, Math.floor(x / ratio))) * 4;
    pixels.set(image.rgba.subarray(source, source + 4), (y * canvas.width + x) * 4);
  }
  canvas.getContext('2d').putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
  canvas.setAttribute('aria-hidden', 'true'); return canvas;
}

export function createProjectComponentShelf({ tool, onOpen, onReplace, onEditImage }) {
  const element = node('div', 'project-components'); element.setAttribute('aria-label', 'このプロジェクトの絵・曲・パズル');
  let epoch = 0; let busy = false; let loading = false;
  const locks = () => { for (const button of element.querySelectorAll('button')) button.disabled = busy || loading || button.dataset.unavailable === 'true'; };
  return {
    element,
    setBusy(value) { busy = value; locks(); },
    async refresh(project) {
      const version = ++epoch; loading = true; locks();
      const contents = await Promise.all(COMPONENTS.map(async (part) => {
        const exists = hasProjectComponent(project, part.tool);
        let image = null; let failed = false;
        try { image = await readPxdImage(project, componentImageRole(project, part.tool)); } catch { failed = true; }
        return { part, exists, image, failed };
      }));
      if (version !== epoch) return;
      element.replaceChildren();
      for (const { part, exists, image, failed } of contents) {
        const card = node('section', 'project-component'); card.dataset.tool = part.tool;
        card.dataset.created = String(exists); card.dataset.active = String(part.tool === tool);
        const open = node('button', 'project-component__open'); open.type = 'button'; open.id = `pxd-to-${part.tool}`;
        const action = exists ? '続きを開く' : part.tool === 'draw' ? '描き始める' : '絵から作る';
        open.setAttribute('aria-label', `${part.label}${exists ? 'の続きを開く' : part.tool === 'draw' ? 'を描き始める' : 'を絵から作る'}`);
        if (part.tool === tool && exists) open.setAttribute('aria-current', 'true');
        open.dataset.unavailable = String(failed || !image && !exists && part.tool !== 'draw');
        const preview = node('span', 'project-component__preview');
        if (image) preview.append(sampleCanvas(image));
        else preview.innerHTML = icon(part.tool);
        const info = node('span', 'project-component__info');
        const label = node('strong', ''); label.innerHTML = `${icon(part.tool)}<span>${part.label}</span>`;
        info.append(label, node('small', '', failed ? '画像を確認できません' : action));
        open.append(preview, info, node('span', 'project-component__arrow', exists ? '↗' : '＋'));
        open.addEventListener('click', () => onOpen(part.tool)); card.append(open);
        if (exists && part.tool !== 'draw') {
          const actions = node('div', 'project-component__actions');
          if (onEditImage && image) {
            const edit = node('button', '', part.tool === 'spot_difference' ? '違いを描く' : part.tool === 'audio' ? '曲の絵を編集' : '絵を編集'); edit.type = 'button'; edit.id = `project-edit-${part.tool}`;
            edit.setAttribute('aria-label', `${part.label}に使う絵を編集`); edit.addEventListener('click', () => onEditImage(part.tool)); actions.append(edit);
          }
          const replace = node('button', '', part.tool === 'audio' ? '絵の更新を曲に反映' : '絵を差し替える'); replace.type = 'button'; replace.id = `project-replace-${part.tool}`;
          replace.setAttribute('aria-label', part.tool === 'audio' ? 'プロジェクトの最新の絵を曲に反映' : `${part.label}の絵を差し替える`); replace.addEventListener('click', () => onReplace(part.tool)); actions.append(replace); card.append(actions);
        }
        element.append(card);
      }
      loading = false; locks();
    }
  };
}
