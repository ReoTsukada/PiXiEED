/** Bind keyed settings descriptors to native controls under one stable root. */
export function createConversionSettingsBridge({ main, fields, EventImpl = Event }) {
  const resolve = key => {
    const selector = fields[key];
    return selector ? main.querySelector(selector) : null;
  };
  return {
    read() {
      return Object.fromEntries(Object.keys(fields).flatMap(key => {
        const field = resolve(key);
        return field ? [[key, {
          value: field.value,
          disabled: Boolean(field.disabled),
          visible: !field.closest('[hidden]'),
        }]] : [];
      }));
    },
    write(batch) {
      const entries = Object.entries(batch || {});
      if (!entries.length) return false;
      const refs = entries.map(([key]) => resolve(key));
      if (refs.some(field => !field || field.disabled)) return false;
      for (let index = 0; index < entries.length; index += 1) refs[index].value = entries[index][1];
      for (const field of refs) {
        field.dispatchEvent(new EventImpl('input', { bubbles: true }));
        field.dispatchEvent(new EventImpl('change', { bubbles: true }));
      }
      return true;
    },
  };
}
