const TEXT_ART_FORMATS = new Set(['ascii', 'block', 'braille', 'emoji', 'custom']);

/** Add the text-art destination alongside the native media formats. */
export function fileOutputChoices(nativeOptions = [], { canArt = false, codeActive = false } = {}) {
  const native = Array.isArray(nativeOptions)
    ? nativeOptions.filter(Boolean).map(option => ({ ...option }))
    : [];
  const choices = [
    ...native,
    { value: 'text-art', label: '文字アート（TXT）', disabled: !canArt, group: '文字' },
  ];
  if (codeActive) {
    choices.unshift({ value: 'code-active', label: '復元コード（別の用途）', disabled: true, group: '現在の用途' });
  }
  return choices;
}

/** Resolve the selected destination without mixing restore codes into formats. */
export function fileOutputSelection({ mode, nativeValue, mediaValue } = {}) {
  if (mode === 'media') return mediaValue || '';
  if (mode === 'output') return TEXT_ART_FORMATS.has(nativeValue) ? 'text-art' : 'code-active';
  return '';
}
