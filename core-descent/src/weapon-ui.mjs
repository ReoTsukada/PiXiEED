import {CORE_BY_ID} from './catalog.mjs';
import {weaponForDigit} from './weapons.mjs';

export function weaponLabel(digit) { return ['剣','ダガー','大剣','槍','斧','槌','弓','刃輪','杖','魔導書'][digit] || '武器'; }

export function itemDefinition(item) {
  if (!item) return null;
  const base = CORE_BY_ID[item.type];
  if (item.type !== 'emitter') return base;
  const weapon = weaponForDigit(item.digit);
  return {...base, name: `${weapon.name}の武器核`, glyph: weapon.glyph,
    color: weapon.color, family: '武器',
    desc: `${weapon.description} ${weapon.mechanic} 頂点以外では武器の動作を発動せず、威力補正を上へ伝えます。`};
}

/** Original pixel silhouettes. These icons use the same 32-pixel design grid. */
export function weaponIcon(digit) {
  const shapes = [
    '<path fill="#dbe9dd" d="M21 3h8v8L14 26l-8-8Z"/><path fill="#91b5aa" d="m23 7 3 3-14 14-3-3Z"/><path fill="#e7bf71" d="m4 14 14 14-3 3L1 17Z"/><path fill="#75513c" d="m7 22 3 3-6 6H1v-3Z"/>',
    '<path fill="#e5ece1" d="m25 5 3-2 1 7-12 13-6-6Z"/><path fill="#b193da" d="m9 15 10 10-3 3L6 18Z"/><path fill="#6e493b" d="m9 23 3 3-5 5H2v-5Z"/>',
    '<path fill="#c8d8d0" d="M19 2h10v10L13 28 3 18Z"/><path fill="#edf0df" d="m20 4 5 1-18 18-3-4Z"/><path fill="#e2bc6b" d="m2 16 14 14-3 2L0 19Z"/><path fill="#845e42" d="m6 24 3 3-4 5H0v-4Z"/>',
    '<path fill="#916b43" d="m24 6 3 3L6 30H2v-4Z"/><path fill="#dce8d4" d="m21 2 9-2 2 2-2 9-8 3-4-4Z"/><path fill="#77bdb2" d="m24 5 3 1-6 6-2-2Z"/>',
    '<path fill="#926441" d="M15 7h5v23h-5Z"/><path fill="#d2ddd0" d="M6 3h8v3h9V3h5v17h-5v-3h-9v3H6V3Z"/><path fill="#8aa294" d="M7 4h4v15H7Zm18 0h2v14h-2Z"/><path fill="#e0b75f" d="M14 7h8v5h-8Z"/>',
    '<path fill="#906640" d="M14 10h5v21h-5Z"/><path fill="#7d9293" d="M4 3h24v13H4Z"/><path fill="#cfdfcb" d="M3 3h6v13H3Zm21 0h6v13h-6Z"/><path fill="#e5c177" d="M12 6h9v7h-9Z"/>',
    '<path fill="#b99258" d="M9 2h7v3h5v5h3v12h-3v5h-5v3H9v-3h5v-3h4v-4h2v-8h-2V8h-4V5H9Z"/><path fill="#c9d4bd" d="M8 3h2v26H8Z"/><path fill="#e9e9cb" d="M4 15h24v2H4Zm22-3h3v8h-3v-3h-2v-2h2Z"/>',
    '<path fill="#e2c078" fill-rule="evenodd" d="M9 2h14v3h5v5h3v13h-3v5h-6v3H9v-3H4v-6H1V10h3V5h5Zm2 6v3H8v10h3v3h10v-3h3V11h-3V8Z"/><path fill="#a6d8c2" d="M12 4h9v2h-9ZM4 12h2v8H4Zm22 1h2v8h-2ZM12 26h9v2h-9Z"/>',
    '<path fill="#a67e53" d="M13 12h5v20h-5Z"/><path fill="#80d8cd" d="M12 1h8v3h4v8h-4v4h-8v-4H8V4h4Z"/><path fill="#dbf2cc" d="M14 3h4v8h-4Z"/><path fill="#d0ab69" d="M10 13h12v4H10Z"/>',
    '<path fill="#986d99" d="M2 5h11l3 3 3-3h11v23H19l-3 2-3-2H2Z"/><path fill="#ecdfb7" d="M4 3h8l4 4 4-4h8v22h-8l-4 3-4-3H4Z"/><path fill="#9a748f" d="M15 8h2v18h-2ZM7 8h5v2H7Zm0 5h5v2H7Zm13-5h5v2h-5Zm0 5h5v2h-5Z"/><path fill="#86cfc6" d="m21 17 4 3-4 3-3-3Z"/>'
  ];
  return `<svg viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">${shapes[digit] || shapes[0]}</svg>`;
}
