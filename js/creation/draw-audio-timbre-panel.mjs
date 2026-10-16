import { AUDIO_INSTRUMENTS, AUDIO_INSTRUMENT_GROUPS } from './audio-timbres.mjs?rev=20261005-audio-drums-1';
import { getAudioInstrumentIcon } from './audio-instrument-icons.mjs?rev=20261005-audio-drums-1';

const instrumentById = new Map(AUDIO_INSTRUMENTS.map(voice => [voice.id, voice]));
const colorKey = color => color ? `rgba-${String(color).slice(1).toLowerCase().padEnd(8, 'f')}` : null;
const groupFor = id => AUDIO_INSTRUMENT_GROUPS.find(group => group.instruments.some(voice => voice.id === id))?.name || AUDIO_INSTRUMENT_GROUPS[0].name;

export function mountDrawAudioTimbrePanel({ scope, colorPanel, getPalette, getSelectedColor, selectColor, onEnterSound, onEnterColor, getAudioApi } = {}) {
  if (!scope?.listen || !colorPanel?.element || typeof getPalette !== 'function' || typeof getSelectedColor !== 'function' || typeof selectColor !== 'function' || typeof getAudioApi !== 'function') {
    throw new TypeError('音色パネルの初期化情報が不正です。');
  }

  const root = colorPanel.element;
  root.classList.add('draw-audio-timbre-panel');
  root.dataset.drawAudioTimbre = 'true';
  const header = root.querySelector('.dce-header');
  const viewTabs = root.querySelector('.dce-view-tabs');
  viewTabs.hidden = true;
  const closeButton = root.querySelector('#dce-close'); if (closeButton) closeButton.hidden = true;
  const colorContent = root.querySelector('.dce-content');
  const colorActions = root.querySelector('.dce-actions');
  if (!header || !viewTabs || !colorContent || !colorActions) throw new Error('色調整パネルの構造を確認できません。');

  const targetRow = document.createElement('div');
  targetRow.className = 'datp-target-row';
  targetRow.innerHTML = `<button id="datp-target-color" class="datp-target-chip" type="button" aria-label="現在の色"></button>
    <div class="datp-assignment"><span class="datp-micro-label">適用中</span><span id="datp-current-instrument" class="datp-current-instrument">音なし</span></div>
    <button id="datp-previous-color" class="datp-icon-button" type="button" aria-label="前の色">‹</button>
    <button id="datp-next-color" class="datp-icon-button" type="button" aria-label="次の色">›</button>`;
  const targetChip = targetRow.querySelector('#datp-target-color');
  const currentInstrument = targetRow.querySelector('#datp-current-instrument');

  const categoryRow = document.createElement('div');
  categoryRow.className = 'datp-category-row';
  categoryRow.innerHTML = `<button id="datp-category-open" class="datp-category-trigger" type="button" aria-expanded="false"><span>カテゴリ</span><strong id="datp-category-name"></strong><span aria-hidden="true">⌄</span></button>
    <div class="datp-category-back-row" hidden><button id="datp-category-back" class="datp-back" type="button"><span aria-hidden="true">‹</span> 音色一覧</button><strong id="datp-category-heading">全10カテゴリ</strong></div>`;
  const categoryOpen = categoryRow.querySelector('#datp-category-open');
  const categoryBackRow = categoryRow.querySelector('.datp-category-back-row');
  const categoryName = categoryRow.querySelector('#datp-category-name');

  const scroll = document.createElement('div'); scroll.id = 'datp-scroll'; scroll.className = 'datp-scroll'; scroll.tabIndex = 0;
  const scrollCue = document.createElement('div'); scrollCue.id = 'datp-scroll-cue'; scrollCue.className = 'datp-scroll-cue'; scrollCue.textContent = '↓ 下に続きます'; scrollCue.setAttribute('aria-hidden', 'true'); scrollCue.hidden = true;
  const colorView = document.createElement('div'); colorView.className = 'datp-color-view'; colorView.append(colorContent);
  const soundView = document.createElement('div'); soundView.id = 'datp-sound-view'; soundView.className = 'datp-sound-view';
  const candidateList = document.createElement('div'); candidateList.id = 'datp-candidate-list'; candidateList.className = 'datp-candidate-list';
  const categoryList = document.createElement('div'); categoryList.id = 'datp-category-list'; categoryList.className = 'datp-category-list'; categoryList.setAttribute('role', 'listbox'); categoryList.setAttribute('aria-label', '音色カテゴリ'); categoryList.hidden = true;
  soundView.append(candidateList, categoryList); scroll.append(colorView, soundView);

  const footer = document.createElement('div'); footer.className = 'datp-footer';
  const colorDone = colorActions.querySelector('#dce-done');
  const soundActions = document.createElement('div'); soundActions.className = 'datp-sound-actions';
  soundActions.innerHTML = `<button id="datp-audition" class="datp-audition" type="button" aria-label="候補の音色を試聴">▷<span>試聴</span></button>
    <button id="datp-mute" class="datp-mute" type="button">この色を鳴らさない</button>
    <button id="datp-apply" class="datp-apply" type="button">この色に適用</button>`;
  const status = document.createElement('div'); status.id = 'datp-status'; status.className = 'datp-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  footer.append(colorActions, soundActions, status);
  root.replaceChildren(header, targetRow, categoryRow, scroll, footer, scrollCue);

  let audioApi = null;
  let activeView = 'color';
  let category = AUDIO_INSTRUMENT_GROUPS[0].name;
  let screen = 'list';
  let targetIndex = -1;
  let targetSignature = '';
  let candidateInstrument = null;
  let previewing = false;
  let previewTimer = 0;
  let previewToken = 0;
  let destroyed = false;

  function setStatus(message = '') { status.textContent = message; }
  function stopPreview() {
    previewToken += 1; clearTimeout(previewTimer); previewTimer = 0;
    if (previewing) { try { audioApi?.stopPreview?.(); } catch {} }
    previewing = false; renderFooter();
  }
  function preview(instrumentId = candidateInstrument) {
    if (!instrumentId || !audioApi) return;
    stopPreview();
    const token = ++previewToken;
    previewing = true; renderFooter(); setStatus('試聴しています。');
    Promise.resolve(audioApi.preview(instrumentId)).then(result => {
      if (!previewing || token !== previewToken) return;
      if (result === false) { previewing = false; renderFooter(); return; }
      const profile = instrumentById.get(instrumentId);
      const natural = Math.max(0.12 + Number(profile?.release || 0.12), Number(profile?.drum?.duration || 0));
      previewTimer = window.setTimeout(() => { if (token !== previewToken) return; previewing = false; previewTimer = 0; renderFooter(); setStatus('試聴が終わりました。'); }, Math.ceil((natural + 0.12) * 1000));
    }).catch(error => {
      if (token !== previewToken) return;
      previewing = false; previewTimer = 0; renderFooter(); setStatus(error?.message || '試聴できませんでした。');
    });
  }
  function setActiveView(view) {
    if (view !== 'color' && view !== 'sound') return;
    activeView = view;
    colorView.hidden = view !== 'color';
    soundView.hidden = view !== 'sound';
    targetRow.hidden = view !== 'sound';
    categoryRow.hidden = view !== 'sound';
    colorActions.hidden = view === 'sound';
    soundActions.hidden = view !== 'sound' || !audioApi;
    if (view !== 'sound') { screen = 'list'; categoryOpen.hidden = false; categoryBackRow.hidden = true; stopPreview(); }
    else { renderTarget(); renderCandidates(); }
    root.dataset.activeView = view;
    const title = header.querySelector('h2'); if (title) title.textContent = view === 'sound' ? '音色を調整' : '色を調整';
  }
  function nameOf(id) { return id ? instrumentById.get(id)?.name || '音色' : '音なし'; }
  function renderTarget() {
    const palette = getPalette();
    targetIndex = getSelectedColor();
    const color = palette[targetIndex];
    const group = AUDIO_INSTRUMENT_GROUPS.find(item => item.name === category) || AUDIO_INSTRUMENT_GROUPS[0];
    categoryName.textContent = `${group.name} · ${group.instruments.length}音色`;
    targetChip.style.setProperty('--datp-target', color || 'transparent');
    targetChip.setAttribute('aria-label', color ? `色 ${targetIndex + 1} ${color}` : '透明色');
    const assigned = audioApi?.getAssignment?.(targetIndex, color) || null;
    currentInstrument.replaceChildren();
    if (assigned) {
      const info = getAudioInstrumentIcon(assigned);
      const image = document.createElement('img'); image.src = info.url; image.alt = ''; image.className = 'datp-voice-icon';
      const label = document.createElement('span'); label.textContent = nameOf(assigned); currentInstrument.append(image, label);
    } else {
      const label = document.createElement('span'); label.className = 'datp-no-voice'; label.textContent = '音なし'; currentInstrument.append(label);
    }
    return { palette, color, assigned };
  }
  function updateCandidateCards() {
    for (const card of candidateList.querySelectorAll('[data-instrument]')) {
      const id = card.dataset.instrument, applied = id === (audioApi?.getAssignment?.(targetIndex, getPalette()[targetIndex]) || null), draft = id === candidateInstrument;
      card.classList.toggle('is-applied', applied); card.classList.toggle('is-candidate', draft);
      card.setAttribute('aria-pressed', String(draft));
      const badge = card.querySelector('.datp-badge');
      if (applied) { badge.hidden = false; badge.textContent = '✓ 適用中'; }
      else if (draft) { badge.hidden = false; badge.textContent = '候補'; }
      else badge.hidden = true;
    }
  }
  function renderCandidates() {
    const group = AUDIO_INSTRUMENT_GROUPS.find(item => item.name === category) || AUDIO_INSTRUMENT_GROUPS[0];
    categoryName.textContent = group.name;
    candidateList.replaceChildren();
    const grid = document.createElement('div'); grid.className = 'datp-voice-grid';
    for (const voice of group.instruments) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'datp-voice'; button.dataset.instrument = voice.id;
      const icon = getAudioInstrumentIcon(voice.id); const image = document.createElement('img'); image.className = 'datp-voice-icon'; image.src = icon.url; image.alt = '';
      const label = document.createElement('span'); label.className = 'datp-voice-name';
      const naturalBreak = { 'electric-piano': ['エレクトリック', 'ピアノ'], guitar: ['アコースティック', 'ギター'] }[voice.id];
      if (naturalBreak) {
        naturalBreak.forEach((part, index) => {
          if (index) label.append(document.createElement('wbr'));
          const chunk = document.createElement('span'); chunk.className = 'datp-name-chunk'; chunk.textContent = part; label.append(chunk);
        });
      } else label.textContent = voice.name;
      const badge = document.createElement('span'); badge.className = 'datp-badge'; badge.hidden = true;
      button.append(image, label, badge);
      button.addEventListener('click', () => {
        if (candidateInstrument !== voice.id) { stopPreview(); candidateInstrument = voice.id; setStatus(`${voice.name}は未適用です。`); }
        updateCandidateCards(); renderFooter(); preview(voice.id);
      });
      grid.append(button);
    }
    candidateList.append(grid); updateCandidateCards(); renderFooter();
  }
  function renderCategories() {
    categoryList.replaceChildren();
    categoryBackRow.querySelector('#datp-category-heading').textContent = `全${AUDIO_INSTRUMENT_GROUPS.length}カテゴリ`;
    for (const group of AUDIO_INSTRUMENT_GROUPS) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'datp-category'; button.dataset.category = group.name;
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(group.name === category));
      const label = document.createElement('span'); label.textContent = group.name;
      const count = document.createElement('small'); count.textContent = String(group.instruments.length);
      button.append(label, count); button.addEventListener('click', () => {
        category = group.name; screen = 'list'; renderScreen(); setStatus(`${group.name}の音色を表示しています。`); categoryOpen.focus({ preventScroll: true });
      });
      categoryList.append(button);
    }
  }
  function renderScreen() {
    const choosing = screen === 'categories';
    candidateList.hidden = choosing; categoryList.hidden = !choosing;
    categoryOpen.hidden = choosing; categoryBackRow.hidden = !choosing;
    categoryOpen.setAttribute('aria-expanded', String(choosing));
    if (choosing) renderCategories(); else renderCandidates();
    scroll.scrollTop = 0; updateScrollCue();
  }
  function updateScrollCue() {
    requestAnimationFrame(() => {
      if (destroyed) return;
      const canScroll = scroll.scrollHeight > scroll.clientHeight + 2;
      const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
      scroll.classList.toggle('has-overflow', canScroll);
      scroll.classList.toggle('at-bottom', atBottom);
      scrollCue.hidden = !canScroll || atBottom;
    });
  }
  function renderFooter() {
    const assigned = audioApi?.getAssignment?.(targetIndex, getPalette()[targetIndex]) || null;
    const readOnly = !audioApi || Boolean(audioApi.isReadOnly?.(targetIndex));
    const auditionButton = soundActions.querySelector('#datp-audition');
    auditionButton.innerHTML = previewing ? '■<span>停止</span>' : '▷<span>試聴</span>';
    auditionButton.setAttribute('aria-label', previewing ? '試聴を停止' : '候補の音色を試聴');
    auditionButton.disabled = screen === 'categories' || (!previewing && !candidateInstrument);
    soundActions.querySelector('#datp-mute').disabled = screen === 'categories' || !candidateInstrument;
    soundActions.querySelector('#datp-apply').disabled = readOnly || candidateInstrument === assigned || categoryList.hidden === false;
  }
  function setAudioApi(api) {
    audioApi = api || null;
    const soundTab = viewTabs.querySelector('[data-dce-view="sound"]');
    soundTab.hidden = !audioApi; viewTabs.hidden = !audioApi; if (closeButton) closeButton.hidden = !audioApi;
    if (colorDone) colorDone.hidden = Boolean(audioApi);
    soundActions.hidden = activeView !== 'sound' || !audioApi;
    if (!audioApi && colorPanel.activeView === 'sound') {
      colorPanel.dismiss();
      colorPanel.setView('color', { notify: false });
      setActiveView('color'); targetSignature = '';
    }
    if (audioApi) refresh(); else stopPreview();
  }
  function refresh() {
    if (destroyed) return;
    const selected = getSelectedColor(), palette = getPalette(), color = palette[selected];
    const assigned = audioApi?.getAssignment?.(selected, color) || null;
    const signature = `${selected}|${color || ''}|${assigned || ''}|${Boolean(audioApi?.isReadOnly?.(selected))}`;
    const previous = targetSignature; targetSignature = signature;
    if (selected !== targetIndex || (previous && previous !== signature && assigned !== candidateInstrument && activeView === 'sound')) {
      stopPreview(); candidateInstrument = assigned; screen = 'list';
      if (selected !== targetIndex && assigned) category = groupFor(assigned);
      renderTarget(); renderScreen();
      if (previous && previous !== signature) setStatus('色または適用中の音色が変わりました。');
    } else {
      renderTarget(); updateCandidateCards(); renderFooter();
    }
  }
  function selectTarget(index) {
    const palette = getPalette(); if (!Number.isInteger(index) || index < 0 || index >= palette.length) return;
    stopPreview(); selectColor(index); refresh();
  }
  function onView(view) {
    if (view === activeView) return;
    stopPreview();
    if (view === 'sound') {
      onEnterSound?.();
      candidateInstrument = audioApi?.getAssignment?.(getSelectedColor(), getPalette()[getSelectedColor()]) || null;
      category = groupFor(candidateInstrument); screen = 'list'; setStatus('候補を選び、適用で保存します。');
    } else {
      onEnterColor?.();
    }
    setActiveView(view); targetSignature = '';
    if (view === 'sound') refresh();
  }

  scope.listen(categoryOpen, 'click', () => { screen = 'categories'; stopPreview(); renderScreen(); });
  scope.listen(categoryRow.querySelector('#datp-category-back'), 'click', () => { screen = 'list'; renderScreen(); categoryOpen.focus({ preventScroll: true }); });
  scope.listen(targetRow.querySelector('#datp-previous-color'), 'click', () => selectTarget(getSelectedColor() - 1 < 0 ? getPalette().length - 1 : getSelectedColor() - 1));
  scope.listen(targetRow.querySelector('#datp-next-color'), 'click', () => selectTarget((getSelectedColor() + 1) % getPalette().length));
  scope.listen(soundActions.querySelector('#datp-audition'), 'click', () => previewing ? stopPreview() : preview());
  scope.listen(soundActions.querySelector('#datp-mute'), 'click', () => { stopPreview(); candidateInstrument = null; updateCandidateCards(); renderFooter(); setStatus('無音を候補にしました。適用するとこの色は鳴りません。'); });
  scope.listen(soundActions.querySelector('#datp-apply'), 'click', () => {
    if (!audioApi || audioApi.isReadOnly?.(getSelectedColor())) return;
    const colorIndex = getSelectedColor(), color = getPalette()[colorIndex];
    try {
      stopPreview(); audioApi.apply(colorIndex, color, candidateInstrument);
      candidateInstrument = audioApi.getAssignment?.(colorIndex, color) || null;
      targetSignature = ''; refresh(); setStatus(`${nameOf(candidateInstrument)}を色 ${colorIndex + 1}に適用しました。`);
    } catch (error) { setStatus(error?.message || '適用できませんでした。'); refresh(); }
  });
  scope.listen(scroll, 'scroll', updateScrollCue, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(updateScrollCue);
    for (const node of [scroll, colorView, soundView, candidateList, categoryList]) resizeObserver.observe(node);
    scope.add(() => resizeObserver.disconnect());
  }
  scope.listen(scroll, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const selector = screen === 'categories' ? '[data-category]' : '[data-instrument]';
    const buttons = [...scroll.querySelectorAll(selector)]; const source = event.target.closest(selector); if (!source) return;
    const bounds = source.getBoundingClientRect(), delta = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[event.key];
    const options = buttons.filter(button => button !== source).map(button => {
      const rect = button.getBoundingClientRect(), dx = rect.left + rect.width / 2 - (bounds.left + bounds.width / 2), dy = rect.top + rect.height / 2 - (bounds.top + bounds.height / 2);
      const forward = dx * delta[0] + dy * delta[1], sideways = Math.abs(dx * delta[1] - dy * delta[0]);
      return { button, score: forward > 0 ? forward + sideways * 2.5 : Infinity };
    }).sort((a,b) => a.score - b.score);
    if (options[0]?.score < Infinity) { event.preventDefault(); options[0].button.focus(); }
  });

  function onEscape(event) {
    if (activeView !== 'sound' || screen !== 'categories') return false;
    screen = 'list'; renderScreen(); setStatus('カテゴリ選択に戻りました。');
    categoryOpen.focus({ preventScroll: true }); return true;
  }
  function onHide() { stopPreview(); candidateInstrument = audioApi?.getAssignment?.(getSelectedColor(), getPalette()[getSelectedColor()]) || null; screen = 'list'; }
  function onShow(view) { activeView = view; setActiveView(view); targetSignature = ''; if (view === 'sound' && audioApi) refresh(); }
  function setEnabled(enabled) {
    if (!enabled && colorPanel.isOpen) colorPanel.dismiss();
    root.classList.toggle('has-audio-timbre', Boolean(enabled));
    if (!enabled) setAudioApi(null);
    updateScrollCue();
  }
  function dispose() { destroyed = true; stopPreview(); }
  scope.add(dispose);
  setActiveView('color');
  // The owning color panel calls these optional view hooks from its capture-phase close/Escape handlers.
  return { refresh, setAudioApi, setEnabled, setView: setActiveView, onView, onEscape, onHide, onShow, dispose, get activeView() { return activeView; }, get screen() { return screen; }, get isEnabled() { return Boolean(audioApi); } };
}
