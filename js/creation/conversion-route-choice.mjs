const MAX_GROUPS = 4;
const MAX_OPTIONS = 4;

function optionFor(select, value) {
  return Array.from(select.options || []).find(option => option.value === value) || null;
}

/** Mirror a few route choices with radios while retaining the native selects as authority. */
export function mountConversionRouteChoices({ container, native, groups, doc = globalThis.document, win = globalThis.window } = {}) {
  if (!container || !native || !Array.isArray(groups) || groups.length < 1 || groups.length > MAX_GROUPS
      || typeof doc?.createElement !== 'function' || typeof win?.Event !== 'function') return null;

  const originalHidden = Boolean(native.hidden);
  let root = null, destroyed = false;
  try {
    const prepared = groups.map((group, groupIndex) => {
      const select = group?.select;
      const options = Array.from(select?.options || []);
      if (!select || typeof select.addEventListener !== 'function' || typeof select.dispatchEvent !== 'function'
          || !options.length || options.length > MAX_OPTIONS) throw new TypeError('Unsupported route choice group');
      return { ...group, select, options, name: group.name || ('sc-route-choice-' + (groupIndex + 1)) };
    });
    root = doc.createElement('div');
    root.className = 'sc-route-choices';
    root.dataset.scRouteChoice = '';

    const records = [];
    for (const group of prepared) {
      const fieldset = doc.createElement('fieldset');
      fieldset.className = 'sc-route-choice';
      fieldset.dataset.scRouteName = group.name;
      const legend = doc.createElement('legend');
      legend.textContent = group.label || '';
      fieldset.append(legend);
      const options = doc.createElement('div');
      options.className = 'sc-route-choice-options';
      for (const option of group.options) {
        const label = doc.createElement('label');
        label.className = 'sc-route-choice-option';
        const radio = doc.createElement('input');
        radio.type = 'radio'; radio.name = group.name; radio.value = option.value;
        radio.dataset.scRouteValue = option.value;
        const text = doc.createElement('span');
        text.textContent = option.textContent;
        label.append(radio, text);
        options.append(label);
        records.push({ select: group.select, radio, text });
        radio.addEventListener('change', () => {
          if (destroyed) return;
          const current = optionFor(group.select, radio.value);
          if (!radio.checked || radio.disabled || group.select.disabled || !current || current.disabled) { update(); return; }
          group.select.value = radio.value;
          group.select.dispatchEvent(new win.Event('change', { bubbles: true }));
          update();
        });
      }
      fieldset.append(options);
      root.append(fieldset);
    }

    container.append(root);
    native.hidden = true;
    const update = () => {
      if (destroyed) return;
      for (const { select, radio, text } of records) {
        const current = optionFor(select, radio.value);
        const label = current?.textContent || '';
        const checked = Boolean(current && select.value === radio.value), disabled = Boolean(select.disabled || !current || current.disabled);
        if (text.textContent !== label) text.textContent = label;
        if (radio.checked !== checked) radio.checked = checked;
        if (radio.disabled !== disabled) radio.disabled = disabled;
      }
    };
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      root?.remove();
      if (native.hidden !== originalHidden) native.hidden = originalHidden;
    };
    update();
    return { update, destroy };
  } catch {
    root?.remove?.();
    native.hidden = originalHidden;
    return null;
  }
}
