/** Build only the new view's options from plain controller data, in source order. */
export function createConversionFormatOptions(doc, choices) {
  const nodes = [];
  let group = null;
  for (const choice of choices) {
    const option = doc.createElement('option'); option.value = choice.value;
    option.textContent = choice.label; option.disabled = choice.disabled;
    if (Object.hasOwn(choice, 'group')) {
      if (!group || group.label !== choice.group) {
        group = doc.createElement('optgroup'); group.label = choice.group; nodes.push(group);
      }
      group.append(option);
    } else { group = null; nodes.push(option); }
  }
  return nodes;
}
