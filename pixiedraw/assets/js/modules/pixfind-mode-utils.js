(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixfindModeUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() { return true; },
      get(target, key) {
        if (key === Symbol.unscopables) return undefined;
        return Object.prototype.hasOwnProperty.call(target, key) ? target[key] : globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
        function getPixfindMultiDisabledReason() {
          if (multiState.connecting) {
            return localizeText('共有モード接続中はパズルを作成できません', 'A puzzle cannot be created while collab is connecting');
          }
          if (multiState.connected) {
            return localizeText('共有モード中はパズルを作成できません', 'A puzzle cannot be created during collab');
          }
          return '';
        }

        function getPixfindSendDisabledReason() {
          return getPixfindMultiDisabledReason() || getMultiExportDisabledReason('pixfind') || '';
        }

        function updatePixfindModeUI() {
          const disabledReason = getPixfindSendDisabledReason();
          if (dom.controls.sendToPixfind instanceof HTMLButtonElement) {
            dom.controls.sendToPixfind.disabled = Boolean(disabledReason);
            dom.controls.sendToPixfind.title = disabledReason;
          }
          if (dom.controls.pixfindActionReason instanceof HTMLElement) {
            dom.controls.pixfindActionReason.textContent = disabledReason || localizeText('パズルにできます', 'Ready to make a puzzle');
          }
        }

        // Compatibility no-ops for old project data and legacy control wiring.
        // PiXFiND no longer creates or rewrites a second "difference" frame.
        function getPixfindFramePair() { return null; }
        function disablePixfindForMultiSession() { updatePixfindModeUI(); return false; }
        function setPixfindHelpExpanded() {}
        function ensurePixfindDiffFrame() { return false; }
        function setPixfindModeEnabled() { updatePixfindModeUI(); return false; }
        function syncPixfindSnapshotAfterDocumentReset() { updatePixfindModeUI(); }

        const PIXFIND_TRANSFER_KEY = 'pixfind_creator_transfer_v2';
        const PIXFIND_TRANSFER_DB = 'pixieed-pixfind-transfer';
        const PIXFIND_TRANSFER_STORE = 'payloads';

        function canvasToPngBlob(canvas) {
          return new Promise((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG blob creation failed')), 'image/png');
          });
        }

        function savePixfindTransfer(payload) {
          return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
              reject(new Error('IndexedDB is unavailable'));
              return;
            }
            const request = window.indexedDB.open(PIXFIND_TRANSFER_DB, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(PIXFIND_TRANSFER_STORE, { keyPath: 'id' });
            request.onerror = () => reject(request.error || new Error('Could not open transfer store'));
            request.onsuccess = () => {
              const transaction = request.result.transaction(PIXFIND_TRANSFER_STORE, 'readwrite');
              transaction.objectStore(PIXFIND_TRANSFER_STORE).put(payload);
              transaction.oncomplete = () => resolve();
              transaction.onerror = () => reject(transaction.error || new Error('Could not save transfer'));
            };
          });
        }

        function createPixfindFrameThumbnail(frame) {
          const source = createFrameCanvas(
            compositeFramePixels(frame, state.width, state.height, state.palette),
            state.width,
            state.height
          );
          const longestSide = Math.max(state.width, state.height, 1);
          const scale = Math.min(1, 112 / longestSide);
          const thumbnail = document.createElement('canvas');
          thumbnail.width = Math.max(1, Math.round(state.width * scale));
          thumbnail.height = Math.max(1, Math.round(state.height * scale));
          const context = thumbnail.getContext('2d');
          context.imageSmoothingEnabled = false;
          context.drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
          return thumbnail.toDataURL('image/png');
        }

        function choosePixfindSourceFrame() {
          const frames = Array.isArray(state.frames) ? state.frames : [];
          if (frames.length <= 1) return Promise.resolve([0]);
          return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'pixfind-frame-picker';
            dialog.setAttribute('aria-label', localizeText('パズルにするフレームを選ぶ', 'Choose a frame for the puzzle'));
            const heading = document.createElement('h2');
            heading.textContent = localizeText('パズルにする絵を選ぶ', 'Choose artwork for the puzzle');
            const note = document.createElement('p');
            note.textContent = localizeText('1枚で「もの探し」、2枚で「間違い探し」になります。', 'One frame creates hidden-object; two frames create spot-difference.');
            const grid = document.createElement('div');
            grid.className = 'pixfind-frame-picker__grid';
            const selected = [];
            const send = document.createElement('button');
            send.type = 'button';
            send.className = 'button';
            send.disabled = true;
            const finish = value => {
              dialog.close();
              dialog.remove();
              resolve(value);
            };
            const updateSelection = () => {
              grid.querySelectorAll('.pixfind-frame-picker__item').forEach(button => {
                const index = Number(button.dataset.frameIndex);
                const order = selected.indexOf(index);
                const isSelected = order >= 0;
                button.classList.toggle('is-selected', isSelected);
                button.setAttribute('aria-pressed', String(isSelected));
                if (isSelected) button.dataset.selectionOrder = String(order + 1);
                else delete button.dataset.selectionOrder;
              });
              send.disabled = selected.length === 0;
              send.classList.toggle('is-ready', selected.length > 0);
              send.dataset.selectionCount = String(selected.length);
              send.textContent = selected.length === 2
                ? localizeText('2枚で間違い探しを作る', 'Create spot-difference with 2 frames')
                : localizeText('1枚でもの探しを作る', 'Create hidden-object with 1 frame');
            };
            frames.forEach((frame, index) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.className = 'pixfind-frame-picker__item';
              button.dataset.frameIndex = String(index);
              button.setAttribute('aria-label', localizeText(`フレーム ${index + 1} を使う`, `Use frame ${index + 1}`));
              const image = new Image();
              image.alt = '';
              const label = document.createElement('span');
              label.textContent = localizeText(`フレーム ${index + 1}`, `Frame ${index + 1}`);
              button.append(image, label);
              button.addEventListener('click', () => {
                const selectedIndex = selected.indexOf(index);
                if (selectedIndex >= 0) selected.splice(selectedIndex, 1);
                else if (selected.length < 2) selected.push(index);
                else selected.splice(0, selected.length, index);
                updateSelection();
              });
              const loadThumbnail = () => {
                if (image.src) return;
                image.src = createPixfindFrameThumbnail(frame);
              };
              button.addEventListener('pointerenter', loadThumbnail, { once: true });
              button.addEventListener('focus', loadThumbnail, { once: true });
              grid.appendChild(button);
            });
            updateSelection();
            const lazyThumbnailObserver = typeof IntersectionObserver === 'function'
              ? new IntersectionObserver(entries => entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.dispatchEvent(new Event('focus'));
                lazyThumbnailObserver.unobserve(entry.target);
              }), { root: grid, rootMargin: '180px' })
              : null;
            grid.querySelectorAll('.pixfind-frame-picker__item').forEach(button => lazyThumbnailObserver?.observe(button));
            send.addEventListener('click', () => finish(selected.slice()));
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'button button--ghost';
            cancel.textContent = localizeText('キャンセル', 'Cancel');
            cancel.addEventListener('click', () => finish(null));
            const actions = document.createElement('div');
            actions.className = 'pixfind-frame-picker__actions';
            actions.append(send, cancel);
            dialog.append(heading, note, grid, actions);
            dialog.addEventListener('cancel', event => {
              event.preventDefault();
              finish(null);
            }, { once: true });
            document.body.appendChild(dialog);
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else finish([clamp(Math.round(Number(state.activeFrame) || 0), 0, frames.length - 1)]);
          });
        }

        async function exportProjectToPixfind() {
          if (!ensureCurrentClientCanExportProject({ announce: true, format: 'pixfind' })) return;
          const disabledReason = getPixfindSendDisabledReason();
          if (disabledReason) {
            updateAutosaveStatus(disabledReason, 'warn');
            return;
          }
          const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
          const frameIndexes = await choosePixfindSourceFrame();
          if (!Array.isArray(frameIndexes) || !frameIndexes.length) return;
          const sourceFrames = frameIndexes.map(index => state.frames?.[index] || null);
          if (sourceFrames.some(frame => !frame)) {
            updateAutosaveStatus(localizeText('パズルにする絵がありません', 'There is no artwork to turn into a puzzle'), 'warn');
            return;
          }
          try {
            const imageBlobs = await Promise.all(sourceFrames.map(frame => {
              const pixels = compositeFramePixels(frame, state.width, state.height, state.palette);
              return canvasToPngBlob(createFrameCanvas(pixels, state.width, state.height));
            }));
            const isAnimation = frameCount > 1;
            const metadata = {
              mode: imageBlobs.length === 2 ? 'spot-difference' : 'hidden-object',
              canvasSize: state.width === state.height ? state.width : `${state.width}x${state.height}`,
              width: state.width,
              height: state.height,
              sourceFrameIndexes: frameIndexes,
              sourceFrameCount: frameCount,
              isAnimation,
              createdAt: new Date().toISOString(),
            };
            const id = `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
            try {
              await savePixfindTransfer({ id, imageBlobs, metadata });
              localStorage.setItem(PIXFIND_TRANSFER_KEY, JSON.stringify({ id }));
            } catch (transferError) {
              // Private browsing can block IndexedDB. Keep a compatibility
              // fallback so the direct link still works for small canvases.
              localStorage.setItem(PIXFIND_UPLOAD_KEY, JSON.stringify({
                originalDataUrl: createFrameCanvas(compositeFramePixels(sourceFrames[0], state.width, state.height, state.palette), state.width, state.height).toDataURL('image/png'),
                diffDataUrl: imageBlobs.length === 2
                  ? createFrameCanvas(compositeFramePixels(sourceFrames[1], state.width, state.height, state.palette), state.width, state.height).toDataURL('image/png')
                  : undefined,
                ...metadata,
              }));
            }
            markDocumentDurablySaved();
            window.location.href = '../pixfind/index.html#creator';
          } catch (error) {
            console.error('PiXFiND export failed', error);
            updateAutosaveStatus(localizeText('パズル用PNGの作成に失敗しました', 'Failed to create the puzzle PNG'), 'error');
          }
        }

        return Object.freeze({
          getPixfindFramePair,
          getPixfindMultiDisabledReason,
          disablePixfindForMultiSession,
          getPixfindSendDisabledReason,
          setPixfindHelpExpanded,
          updatePixfindModeUI,
          ensurePixfindDiffFrame,
          setPixfindModeEnabled,
          syncPixfindSnapshotAfterDocumentReset,
          exportProjectToPixfind,
        });
      }
    })(scope);
  }

  root.pixfindModeUtils = Object.freeze({ createPixfindModeUtils });
})();
