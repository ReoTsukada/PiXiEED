(function () {
  const viewer = document.getElementById('characterGalleryMain');
  const placeholder = document.getElementById('characterGalleryPlaceholder');
  const placeholderMeta = document.getElementById('characterPlaceholderMeta');
  const buttonsContainer = document.getElementById('characterGalleryButtons');
  const nameEl = document.getElementById('characterGalleryName');
  const weightEl = document.getElementById('characterGalleryWeight');
  const detailEl = document.getElementById('characterGalleryDetail');
  const traitsEl = document.getElementById('characterTraits');
  const detailsEl = document.getElementById('characterPreviewDetails');

  if (
    !viewer ||
    !placeholder ||
    !buttonsContainer ||
    !nameEl ||
    !weightEl ||
    !detailEl ||
    !traitsEl ||
    !detailsEl
  ) {
    return;
  }

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const typingControllers = new Map();
  const DEFAULT_IMAGE_SCALE = 0.7;

  const manifest = getManifest();
  if (!manifest.length) {
    return;
  }

  const buttons = manifest.map((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character-sprite' + (index === 0 ? ' is-active' : '');
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.setAttribute('role', 'option');
    button.setAttribute('data-character-id', entry.id || `character-${index + 1}`);
    button.setAttribute('aria-label', `${entry.name || entry.buttonLabel || `Character ${index + 1}`} を表示`);

    const img = document.createElement('img');
    const src = normalizePath(entry.file);
    if (src) {
      img.src = src;
    } else {
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    }
    img.alt = `${entry.name || 'キャラクター'}のドット絵`;
    img.loading = 'lazy';

    const label = document.createElement('span');
    label.textContent = entry.buttonLabel || entry.name || `Character ${index + 1}`;

    button.appendChild(img);
    button.appendChild(label);

    button.addEventListener('click', () => selectCharacter(entry, button));
    buttonsContainer.appendChild(button);
    return button;
  });

  selectCharacter(manifest[0], buttons[0]);

  function selectCharacter(entry, activeButton) {
    if (!entry) return;
    const src = normalizePath(entry.file);
    if (src) {
      viewer.hidden = false;
      viewer.src = src;
      viewer.alt = `${entry.name || 'キャラクター'}のドットプレビュー`;
      placeholder.hidden = true;
      if (placeholderMeta) {
        placeholderMeta.textContent = '';
      }
    } else {
      viewer.hidden = true;
      viewer.removeAttribute('src');
      placeholder.hidden = false;
      if (placeholderMeta) {
        placeholderMeta.textContent = entry.status
          ? `${entry.status} / PNG未配置`
          : 'PNG未配置';
      }
    }

    typeText(nameEl, entry.name || 'キャラクター（仮）');
    typeText(weightEl, `重さ: ${entry.weight || '調整中'}`);
    typeText(detailEl, entry.detail || entry.background || entry.description || '詳細メモを準備中');
    applyScale(DEFAULT_IMAGE_SCALE);
    if (traitsEl) {
      traitsEl.innerHTML = '';
      const traits = Array.isArray(entry.traits) && entry.traits.length ? entry.traits : ['特徴メモを準備中'];
      traits.forEach(trait => {
        const li = document.createElement('li');
        traitsEl.appendChild(li);
        typeText(li, trait);
      });
    }

    if (Array.isArray(buttons)) {
      buttons.forEach(btn => {
        const isActive = btn === activeButton;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    adjustDetailsScale();
  }

  function applyScale(scaleValue) {
    const scale = typeof scaleValue === 'number' ? scaleValue : DEFAULT_IMAGE_SCALE;
    if (viewer) {
      viewer.style.setProperty('--character-image-scale', scale);
    }
    const frame = viewer?.parentElement;
    if (frame) {
      frame.style.setProperty('--character-image-scale', scale);
    }
  }

  function typeText(element, text) {
    if (!element) return;
    const content = typeof text === 'string' ? text : '';

    if (reduceMotionQuery.matches) {
      element.textContent = content;
      return;
    }

    stopTyping(element);
    const chars = Array.from(content);
    let index = 0;
    element.textContent = '';

    if (!chars.length) {
      return;
    }

    const step = () => {
      if (index >= chars.length) {
        typingControllers.delete(element);
        return;
      }
      element.textContent += chars[index++];
      const delay = Math.random() * 25 + 15;
      typingControllers.set(element, window.setTimeout(step, delay));
    };

    step();
  }

  function stopTyping(element) {
    const controller = typingControllers.get(element);
    if (controller) {
      clearTimeout(controller);
      typingControllers.delete(element);
    }
  }

  function adjustDetailsScale() {
    if (!detailsEl) return;

    detailsEl.classList.remove('character-preview__details--compact', 'character-preview__details--dense');

    requestAnimationFrame(() => {
      if (!detailsEl) return;

      if (detailsEl.scrollHeight > detailsEl.clientHeight + 4) {
        detailsEl.classList.add('character-preview__details--compact');
      }

      if (detailsEl.scrollHeight > detailsEl.clientHeight + 4) {
        detailsEl.classList.add('character-preview__details--dense');
      }
    });
  }

  function normalizePath(file) {
    if (!file) {
      return '';
    }
    if (/^(?:https?:)?\/\//.test(file) || file.startsWith('data:') || file.startsWith('/')) {
      return file;
    }
    return `character-dots/${file}`;
  }

  function getManifest() {
    if (Array.isArray(window.CHARACTER_GALLERY_MANIFEST) && window.CHARACTER_GALLERY_MANIFEST.length) {
      return window.CHARACTER_GALLERY_MANIFEST;
    }
    return [
      {
        id: 'placeholder',
        name: 'キャラクター（仮）',
        role: 'Leading',
        tagline: 'PNG差し替え用の仮枠です。',
        description: 'manifest.js にエントリを追加するとボタンが増え、画像とメモが切り替わります。',
        weight: '???',
        file: null,
        buttonLabel: 'Placeholder',
        buttonStatus: 'WIP',
        background: '未設定の背景情報',
        traits: ['ポイントを追加']
      }
    ];
  }
})();
