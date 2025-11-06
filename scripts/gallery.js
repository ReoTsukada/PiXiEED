(function () {
  const viewer = document.getElementById('dotGalleryMain');
  const buttonsContainer = document.getElementById('dotGalleryButtons');
  if (!viewer || !buttonsContainer) return;

  if (Array.isArray(window.DOT_GALLERY_MANIFEST) && window.DOT_GALLERY_MANIFEST.length) {
    initialize(window.DOT_GALLERY_MANIFEST);
  } else {
    fetch('portfolio/dots/manifest.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => initialize(Array.isArray(data) ? data : []))
      .catch(() => initialize([]));
  }

  function initialize(entries) {
    if (!entries.length) {
      entries = [
        {
          file: 'maoitu/ogp.png',
          label: 'Maoitu',
          date: new Date().toISOString().slice(0, 10),
          alt: '魔王様!!いつまでよければいいですか!? のタイトル背景'
        }
      ];
    }

    window.addEventListener('resize', () => fitImage(viewer));

    const buttons = entries.map((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dot-gallery__button' + (index === 0 ? ' is-active' : '');
      const src = entry.file.startsWith('http') || entry.file.startsWith('data:')
        ? entry.file
        : (entry.file.includes('/') ? entry.file : `portfolio/dots/${entry.file}`);
      const thumb = entry.thumb
        ? (entry.thumb.startsWith('http') || entry.thumb.startsWith('data:')
            ? entry.thumb
            : (entry.thumb.includes('/') ? entry.thumb : `portfolio/dots/${entry.thumb}`))
        : src;
      button.dataset.src = src;
      button.dataset.alt = entry.alt || entry.label || '';
      button.setAttribute('aria-label', `${entry.label || entry.file}`);
      button.addEventListener('click', () => selectArtwork(buttons, button));
      const preview = document.createElement('img');
      preview.src = thumb;
      preview.alt = '';
      preview.loading = 'lazy';
      button.appendChild(preview);
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
    if (viewer.complete) {
      fitImage(viewer);
    } else {
      viewer.addEventListener('load', () => fitImage(viewer), { once: true });
    }
    allButtons.forEach(btn => btn.classList.toggle('is-active', btn === button));
  }

  function fitImage(img) {
    const container = img.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || rect.width;
    const naturalHeight = img.naturalHeight || rect.height;
    if (!naturalWidth || !naturalHeight) return;
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    img.style.transform = `scale(${scale})`;
  }
})();
