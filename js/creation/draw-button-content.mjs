const ICON_ROOT = '/assets/icons/pixieed/';

/** Keep the icon and visible caption as separate, stable nodes. */
export function createDrawButtonContent(button, { icon, label, doc = button?.ownerDocument } = {}) {
  if (!button || !doc?.createElement) throw new TypeError('Draw button content requires a button and document');
  const image = doc.createElement('img');
  if (button.dataset) button.dataset.drawButtonContent = 'true';
  else button.setAttribute('data-draw-button-content', 'true');
  image.className = 'draw-button-icon';
  image.setAttribute('width', '20'); image.setAttribute('height', '20');
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.setAttribute('draggable', 'false');
  image.setAttribute('src', `${ICON_ROOT}${icon}.svg`);
  const caption = doc.createElement('span');
  caption.className = 'draw-button-label';
  caption.textContent = String(label ?? '');
  button.textContent = '';
  button.append(image);
  button.append(caption);
  return { icon: image, label: caption };
}

export function setDrawButtonLabel(labelNode, value) {
  if (!labelNode) return;
  const next = String(value ?? '');
  if (labelNode.textContent !== next) labelNode.textContent = next;
}
