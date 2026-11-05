const choices = Object.freeze([
  Object.freeze({ value: 'png', label: 'PNG画像', selector: '[data-tx-download]' }),
  Object.freeze({ value: 'svg', label: 'SVG画像', selector: '[data-tx-svg]' }),
  Object.freeze({ value: 'pxtxt', label: '文章と設定', selector: '[data-tx-project]' }),
]);

export function textRenderOutputChoices() { return choices; }
export function isTextRenderOutputFormat(value) { return choices.some(choice => choice.value === value); }
export function textRenderOutputSelector(value) { return choices.find(choice => choice.value === value)?.selector || null; }
