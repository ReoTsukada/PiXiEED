(function () {
  const viewer = document.getElementById('dotGalleryMain');
  const buttonsContainer = document.getElementById('dotGalleryButtons');
  if (!viewer || !buttonsContainer) return;

  if (Array.isArray(window.DOT_GALLERY_MANIFEST) && window.DOT_GALLERY_MANIFEST.length) {
    initialize(window.DOT_GALLERY_MANIFEST);
  } else {
    fetch('../portfolio/dots/manifest.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => initialize(Array.isArray(data) ? data : []))
      .catch(() => initialize([]));
  }

  function initialize(entries) {
    if (!entries.length) {
      entries = [
        {
          file: '../maoitu/ogp.png',
          label: 'Maoitu',
          date: new Date().toISOString().slice(0, 10),
          alt: '魔王様!!いつまでよければいいですか!? のタイトル背景'
        }
      ];
    }

    const buttons = entries.map((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dot-gallery__button' + (index === 0 ? ' is-active' : '');
      const src = entry.file.startsWith('http') || entry.file.startsWith('data:')
        ? entry.file
        : `../portfolio/dots/${entry.file}`;
      button.dataset.src = src;
      button.dataset.alt = entry.alt || entry.label || '';
      button.textContent = `${entry.date || ''}｜${entry.label || entry.file}`;
      button.addEventListener('click', () => selectArtwork(buttons, button));
      buttonsContainer.appendChild(button);
      return button;
    });

    selectArtwork(buttons, buttons[0]);
  }

  function selectArtwork(allButtons, button) {
    if (!button) return;
    const src = button.dataset.src;
    const alt = button.dataset.alt;
    viewer.src = src;
    viewer.alt = alt;
    allButtons.forEach(btn => btn.classList.toggle('is-active', btn === button));
  }
})();
