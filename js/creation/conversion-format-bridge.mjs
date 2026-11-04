/** Temporary boundary for engines whose format API is still a native select.
 * The controller and new view consume plain data, never cloned engine nodes.
 */
export function createNativeFormatBridge({ getSelect, getMode = () => 'media', EventImpl = Event }) {
  const describe = option => ({
    value: option.value,
    label: option.textContent,
    disabled: Boolean(option.disabled || (option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled)),
    ...(option.parentElement?.tagName === 'OPTGROUP' ? { group: option.parentElement.label } : {}),
  });
  return {
    read() {
      const select = getSelect();
      return select ? { mode: getMode(), value: select.value, disabled: select.disabled, options: Array.from(select.options, describe) } : null;
    },
    write(value) {
      const select = getSelect();
      if (!select || select.disabled || !Array.from(select.options, describe).some(option => option.value === value && !option.disabled)) {
        throw new Error('この形式は現在選べません。素材と設定は保持しています。');
      }
      select.value = value;
      select.dispatchEvent(new EventImpl('change', { bubbles: true }));
    },
  };
}
