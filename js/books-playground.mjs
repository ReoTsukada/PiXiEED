(() => {
const section = document.querySelector('#books-playground');
if (!section) return;

const palette = [
  { name: '深緑', value: '#315d50' },
  { name: '朱色', value: '#bd604a' },
  { name: '山吹', value: '#e5b453' },
  { name: '青磁', value: '#7da69a' },
  { name: '紙色', value: '#f1e5c9' },
];
const patterns = [
  { name: 'ハート', cells: ['.##.##..', '########', '########', '.######.', '..####..', '...##...', '........', '........'] },
  { name: '星', cells: ['...##...', '..####..', '########', '.######.', '..####..', '.##..##.', '##....##', '........'] },
  { name: '花', cells: ['...##...', '..####..', '.##..##.', '########', '.######.', '..####..', '...##...', '...##...'] },
];
const modes = [
  { id: 'beads', label: 'ビーズ', destination: '#books-toys', destinationLabel: 'ビーズ・ブロックの棚へ' },
  { id: 'blocks', label: 'ブロック', destination: '#books-toys', destinationLabel: 'ビーズ・ブロックの棚へ' },
  { id: 'dots', label: 'ドット', destination: '#books-tools', destinationLabel: '描く道具の棚へ' },
];
const state = {
  mode: 'beads',
  patternIndex: 0,
  colorIndex: 1,
  erase: false,
  cells: Array.from({ length: 64 }, () => null),
  relatedProduct: null,
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

section.classList.add('books-playground');
section.setAttribute('aria-labelledby', 'books-play-title');
section.replaceChildren();

const intro = element('div', 'books-play-intro');
intro.append(element('p', 'books-play-eyebrow', 'ちいさなドットあそび'));
const title = element('h2', 'books-play-title', '並べて、動かして、あそぼう。');
title.id = 'books-play-title';
intro.append(title);
intro.append(element('p', 'books-play-lead', 'ビーズやブロックをイメージした、8×8マスの小さな遊び場。色を選んで、好きな形を並べてみよう。'));
section.append(intro);

const play = element('div', 'books-play-layout');
const boardColumn = element('div', 'books-play-board-column');
const board = element('div', 'books-play-board');
board.setAttribute('role', 'group');
board.setAttribute('aria-label', '8行8列のドット絵');
board.dataset.mode = state.mode;
const tiles = [];
let activeCellIndex = 0;
for (let index = 0; index < 64; index += 1) {
  const tile = element('button', 'books-play-cell');
  const row = Math.floor(index / 8) + 1;
  const column = (index % 8) + 1;
  tile.type = 'button';
  tile.tabIndex = index === activeCellIndex ? 0 : -1;
  tile.setAttribute('aria-pressed', 'false');
  tile.setAttribute('aria-label', `${row}行${column}列、空白`);
  tile.addEventListener('click', () => {
    setActiveCell(index);
    tile.focus();
    state.cells[index] = state.erase ? null : state.colorIndex;
    paintTile(index);
    announce(`${row}行${column}列を${state.erase ? '消しました' : `${palette[state.colorIndex].name}で塗りました`}`);
  });
  tile.addEventListener('focus', () => setActiveCell(index));
  tile.addEventListener('keydown', (event) => {
    const row = Math.floor(activeCellIndex / 8);
    const column = activeCellIndex % 8;
    const destinations = {
      ArrowUp: row > 0 ? activeCellIndex - 8 : activeCellIndex,
      ArrowDown: row < 7 ? activeCellIndex + 8 : activeCellIndex,
      ArrowLeft: column > 0 ? activeCellIndex - 1 : activeCellIndex,
      ArrowRight: column < 7 ? activeCellIndex + 1 : activeCellIndex,
      Home: row * 8,
      End: row * 8 + 7,
    };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    tiles[destinations[event.key]].focus();
  });
  tiles.push(tile);
  board.append(tile);
}
boardColumn.append(board);
play.append(boardColumn);

const controls = element('div', 'books-play-controls');
const paletteGroup = element('fieldset', 'books-play-group books-play-palette');
const paletteLegend = element('legend', 'books-play-label', '色を選ぶ');
paletteGroup.append(paletteLegend);
const swatches = element('div', 'books-play-swatches');
const paletteButtons = [];
palette.forEach((color, index) => {
  const button = element('button', 'books-play-swatch');
  button.type = 'button';
  button.style.setProperty('--books-play-swatch', color.value);
  button.setAttribute('aria-label', `${color.name}を選ぶ`);
  button.setAttribute('aria-pressed', index === state.colorIndex ? 'true' : 'false');
  button.title = color.name;
  button.addEventListener('click', () => {
    state.colorIndex = index;
    state.erase = false;
    syncPalette();
    announce(`${color.name}を選びました`);
  });
  paletteButtons.push(button);
  swatches.append(button);
});
const eraser = element('button', 'books-play-eraser', '消す');
eraser.type = 'button';
eraser.setAttribute('aria-pressed', 'false');
eraser.addEventListener('click', () => {
  state.erase = !state.erase;
  syncPalette();
  announce(state.erase ? '消しゴムを選びました' : `${palette[state.colorIndex].name}を選びました`);
});
swatches.append(eraser);
paletteGroup.append(swatches);
controls.append(paletteGroup);

const modeGroup = element('fieldset', 'books-play-group');
modeGroup.append(element('legend', 'books-play-label', '見え方を選ぶ'));
const modeButtons = new Map();
const modeRow = element('div', 'books-play-options');
for (const mode of modes) {
  const button = element('button', 'books-play-option', mode.label);
  button.type = 'button';
  button.setAttribute('aria-pressed', String(mode.id === state.mode));
  button.addEventListener('click', () => {
    chooseMode(mode.id);
    announce(`${mode.label}の見え方にしました`);
  });
  modeButtons.set(mode.id, button);
  modeRow.append(button);
}
modeGroup.append(modeRow);
controls.append(modeGroup);

const patternGroup = element('div', 'books-play-actions');
const changePattern = element('button', 'books-play-action', '柄をかえる');
changePattern.type = 'button';
changePattern.addEventListener('click', () => {
  state.patternIndex = (state.patternIndex + 1) % patterns.length;
  restorePattern();
  announce(`${patterns[state.patternIndex].name}の柄にしました`);
});
const reset = element('button', 'books-play-action', 'やり直す');
reset.type = 'button';
reset.addEventListener('click', () => {
  restorePattern();
  announce(`${patterns[state.patternIndex].name}の柄に戻しました`);
});
const clear = element('button', 'books-play-action books-play-clear', 'ぜんぶ消す');
clear.type = 'button';
clear.addEventListener('click', () => {
  state.cells.fill(null);
  tiles.forEach((_, index) => paintTile(index));
  announce('マスをすべて消しました');
});
const animate = element('button', 'books-play-action books-play-motion', '動かす');
animate.type = 'button';
animate.addEventListener('click', runMotion);
patternGroup.append(changePattern, reset, clear, animate);
controls.append(patternGroup);

const status = element('p', 'books-play-status');
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
status.setAttribute('aria-atomic', 'true');
controls.append(status);
const destination = element('a', 'books-play-destination');
destination.setAttribute('href', '#books-toys');
controls.append(destination);
play.append(controls);
section.append(play);

document.addEventListener('click', (event) => {
  const origin = event.target instanceof Element ? event.target.closest('a[data-books-play-mode]') : null;
  if (!origin || origin.getAttribute('href') !== '#books-playground') return;
  const selected = modes.find((mode) => mode.id === origin.getAttribute('data-books-play-mode'));
  const target = origin.getAttribute('data-books-play-destination') || '';
  const label = (origin.getAttribute('data-books-play-label') || '').trim().slice(0, 48);
  if (!selected || !isProductDestination(target) || !label) return;
  chooseMode(selected.id, { destination: target, label });
  announce(`${label}に合わせて${selected.label}で遊べます`);
});

function announce(message) {
  status.textContent = message;
}

function setActiveCell(index) {
  activeCellIndex = index;
  tiles.forEach((tile, tileIndex) => { tile.tabIndex = tileIndex === index ? 0 : -1; });
}

function paintTile(index) {
  const tile = tiles[index];
  const colorIndex = state.cells[index];
  tile.style.setProperty('--books-play-cell-color', colorIndex === null ? 'transparent' : palette[colorIndex].value);
  tile.dataset.filled = String(colorIndex !== null);
  tile.setAttribute('aria-pressed', String(colorIndex !== null));
  const row = Math.floor(index / 8) + 1;
  const column = (index % 8) + 1;
  tile.setAttribute('aria-label', `${row}行${column}列、${colorIndex === null ? '空白' : palette[colorIndex].name}`);
}

function syncPalette() {
  paletteButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(!state.erase && index === state.colorIndex)));
  eraser.setAttribute('aria-pressed', String(state.erase));
}

function syncModes() {
  for (const [id, button] of modeButtons) button.setAttribute('aria-pressed', String(id === state.mode));
}

function restorePattern() {
  const pattern = patterns[state.patternIndex];
  const fill = state.erase ? 0 : state.colorIndex;
  state.cells = pattern.cells.join('').split('').map((cell) => cell === '.' ? null : fill);
  state.cells.forEach((_, index) => paintTile(index));
}

function chooseMode(modeId, relatedProduct = null) {
  if (!modes.some((mode) => mode.id === modeId)) return;
  state.mode = modeId;
  state.relatedProduct = relatedProduct;
  board.dataset.mode = state.mode;
  syncModes();
  syncDestination();
}

function isProductDestination(destinationValue) {
  return /^#product-[a-zA-Z0-9_-]+$/.test(destinationValue)
    && Boolean(document.getElementById(destinationValue.slice(1)));
}

function syncDestination() {
  const selected = modes.find((mode) => mode.id === state.mode);
  if (state.relatedProduct && !isProductDestination(state.relatedProduct.destination)) state.relatedProduct = null;
  const related = state.relatedProduct;
  destination.href = related ? related.destination : selected.destination;
  destination.textContent = related ? `${related.label}の棚へ →` : `${selected.destinationLabel} →`;
}

function runMotion() {
  board.classList.remove('books-play-wave');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.pixieedMotion === 'reduced') {
    announce('動きは控える設定です。絵はそのまま楽しめます');
    return;
  }
  void board.offsetWidth;
  board.classList.add('books-play-wave');
  announce('絵がふわりと動きます');
}

board.addEventListener('animationend', (event) => {
  if (event.target === board && event.animationName === 'books-play-float') {
    board.classList.remove('books-play-wave');
    announce('動きが終わりました。続けて遊べます');
  }
});

const clearMotion = () => board.classList.remove('books-play-wave');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const onMotionPreferenceChange = (event) => {
  if (event.matches) clearMotion();
};
if (motionPreference.addEventListener) motionPreference.addEventListener('change', onMotionPreferenceChange);
else motionPreference.addListener?.(onMotionPreferenceChange);
new MutationObserver(() => {
  if (document.documentElement.dataset.pixieedMotion === 'reduced') clearMotion();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pixieed-motion'] });

restorePattern();
syncPalette();
syncModes();
syncDestination();
})();
