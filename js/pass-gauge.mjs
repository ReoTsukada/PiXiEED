const HOUR_MS = 60 * 60 * 1000;
const CELL_MS = HOUR_MS / 12;
const ROW_COUNT = 3;
const CELLS_PER_ROW = 12;

function format(ms) {
  const minutes = Math.ceil(ms / 60000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function compact(ms) {
  const minutes = Math.ceil(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours >= 100 ? `${hours}h` : `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Pure view model for the header's three one-hour rows (the bank itself is unbounded). */
export function derivePassGauge(remainingMs) {
  const pro = remainingMs === Infinity;
  const remaining = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
  const active = pro || remaining > 0;
  const clock = pro ? 'Pro' : active ? format(remaining) : '+1時間';
  const rows = Array.from({ length: ROW_COUNT }, (_, index) => {
    const tier = ROW_COUNT - index - 1;
    const rowMs = pro ? HOUR_MS : Math.max(0, Math.min(HOUR_MS, remaining - tier * HOUR_MS));
    const litCells = Math.min(CELLS_PER_ROW, Math.ceil(rowMs / CELL_MS));
    return { filled: litCells > 0, cells: Array.from({ length: CELLS_PER_ROW }, (_, cellIndex) => cellIndex < litCells) };
  });
  const filledCount = rows.reduce((total, row) => total + row.cells.filter(Boolean).length, 0);
  const bank = pro ? ROW_COUNT : Math.min(ROW_COUNT, Math.ceil(remaining / HOUR_MS));
  return {
    label: pro ? 'Pro' : active ? compact(remaining) : '+1時間',
    clock,
    active,
    pro,
    long: active && !pro && Math.ceil(remaining / 60000) >= 6000,
    bank,
    rows,
    filledCount,
  };
}

function setDataset(element, key, value) {
  const text = String(value);
  if (element.dataset[key] !== text) element.dataset[key] = text;
}

/** Update existing, fixed header nodes only when their visible state changed. */
export function renderPassGauge(button, state) {
  const label = button.querySelector('[data-header-pass-label]');
  if (label && label.textContent !== state.label) label.textContent = state.label;
  const add = button.querySelector('.px-pass-add');
  if (add && add.textContent !== (state.pro ? '∞' : '+')) add.textContent = state.pro ? '∞' : '+';
  setDataset(button, 'active', state.active);
  setDataset(button, 'bank', state.bank);
  if (state.long) setDataset(button, 'long', true);
  else if (button.dataset.long !== undefined) delete button.dataset.long;
  if (state.pro) setDataset(button, 'pro', true);
  else if (button.dataset.pro !== undefined) delete button.dataset.pro;

  const rows = button.querySelectorAll('.px-pass-gauge-row');
  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('.px-pass-cell');
    const rowState = state.rows[rowIndex];
    if (!rowState) return;
    setDataset(row, 'filled', rowState.filled);
    cells.forEach((cell, cellIndex) => setDataset(cell, 'filled', Boolean(rowState.cells[cellIndex])));
  });
}
