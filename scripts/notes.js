(function () {
  const noteHeaders = Array.from(document.querySelectorAll('.note__header'));
  if (!noteHeaders.length) return;

  noteHeaders.forEach(header => {
    const id = header.dataset.note;
    if (!id) return;
    const body = document.getElementById(`note-${id}`);
    if (!body) return;

    header.setAttribute('aria-controls', `note-${id}`);
    header.setAttribute('aria-expanded', 'false');

    header.addEventListener('click', () => toggle(header, body));
    header.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(header, body);
      }
    });
  });

  function toggle(header, body) {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', String(!expanded));
    if (expanded) {
      body.hidden = true;
    } else {
      noteHeaders
        .filter(h => h !== header)
        .forEach(h => {
          const id = h.dataset.note;
          if (!id) return;
          const target = document.getElementById(`note-${id}`);
          if (target) target.hidden = true;
          h.setAttribute('aria-expanded', 'false');
        });
      body.hidden = false;
    }
  }
})();
