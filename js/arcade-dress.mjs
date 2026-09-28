/**
 * Dresses a play tool page in the PiXiEED arcade look without touching how it works.
 * The page keeps every control and id; this adds a title band with a little live demo, turns the setup form
 * into a dark game panel with a big start button, and — where the page reports progress in text — a HUD with
 * a timer and a celebration when you finish. Chosen by <body data-page>.
 */
import { demoTitle, sfx, createTimer, formatTime, winOverlay, floatText, burst } from './arcade.mjs?rev=20260928-arcade-2';

const $ = (s) => document.querySelector(s);
const TOOLS = {
  'spot-difference': { heading: '.spot-heading', setup: '#spot-setup', start: '#spot-start', resume: '#spot-resume', demo: 'spot', tagline: 'ちがいを作って、見つけてもらおう', done: '#spot-confirmed', primaries: ['#spot-play-local', '#spot-publish'] },
  'hidden-object': { heading: '.hidden-heading', setup: '#hidden-setup', start: '#hidden-start', resume: '#hidden-resume', demo: 'find', tagline: 'かくして、さがしてもらおう', done: '#hidden-confirmed', primaries: ['#hidden-play-local', '#hidden-publish'] },
  pixfind: { heading: '.pixfind-heading', setup: '#pixfind-list', bandBefore: true, demo: 'spot', tagline: 'ちがいとかくれもの、見つけられる？', play: '#pixfind-game', progress: '#pixfind-progress', round: '#pixfind-title', },
  'creation-game': { heading: '.game-heading', setup: '#game-setup', start: '#game-prepare', resume: '#game-resume', demo: 'runner', tagline: 'じぶんの絵が主人公になる', play: '#game-play', progress: '#game-progress', win: '#game-win', again: '#game-new' }
};
const tool = TOOLS[document.body.dataset.page];
if (tool) dress(tool);

function dress(t) {
  document.body.classList.add('arc-tool');
  const heading = $(t.heading); const setup = $(t.setup);
  // ---- title band: the page's own h1, a tagline and a live demo ----
  if (heading && setup) {
    const band = document.createElement('div'); band.className = 'arc-title';
    const art = document.createElement('canvas'); art.setAttribute('aria-hidden', 'true');
    const h1 = heading.querySelector('h1'); h1?.classList.add('arc-title-name');
    const tag = document.createElement('p'); tag.className = 'arc-title-sub'; tag.textContent = t.tagline;
    band.append(art, ...(h1 ? [h1] : []), tag);
    heading.hidden = true; heading.classList.add('arc-moved');
    if (t.bandBefore) { const lobby = document.createElement('div'); lobby.className = 'arc-panel arc-setup arc-lobby'; lobby.append(band); setup.before(lobby); setup.classList.add('arc-cardlist'); }
    else { setup.classList.add('arc-panel', 'arc-setup'); setup.prepend(band); }
    demoTitle(art, t.demo);
  }
  const start = t.start && $(t.start); const resume = t.resume && $(t.resume);
  if (start) { start.classList.add('arc-start'); start.addEventListener('click', () => { if (!start.disabled) sfx.start(); }, true); }
  if (resume) resume.classList.add('arc-press', 'arc-sub-button');
  for (const sel of t.primaries || []) $(sel)?.classList.add('arc-go');
  // ---- editors: a "done" moment when the author confirms the answers ----
  if (t.done) {
    const done = $(t.done);
    if (done) new MutationObserver(() => { if (!done.hidden) burst(); }).observe(done, { attributes: true, attributeFilter: ['hidden'] });
  }
  // ---- games: HUD, a sound for each find, and the celebration ----
  if (t.play && t.progress) hud(t);
}

function hud(t) {
  const play = $(t.play); const progress = $(t.progress); if (!play || !progress) return;
  play.classList.add('arc-play');
  const bar = document.createElement('div'); bar.className = 'arc-hud';
  bar.innerHTML = '<span class="arc-badge"><b>★</b><span></span></span><span class="arc-timer" role="timer" aria-label="プレイ時間">00:00</span><span class="arc-progress"><span class="arc-progress-label"></span><span class="arc-bar"><span></span></span></span>';
  play.prepend(bar);
  const label = bar.querySelector('.arc-progress-label'); const fill = bar.querySelector('.arc-bar span'); const badge = bar.querySelector('.arc-badge span'); const timerEl = bar.querySelector('.arc-timer');
  const timer = createTimer((ms) => { timerEl.textContent = formatTime(ms); }, `pixieed:${document.body.dataset.page}:time:`);
  let last = -1; let total = 0; let round = ''; let won = null; let moves = '';
  const roundKey = () => (t.round ? $(t.round)?.textContent || '' : 'game');
  function read() {
    const text = progress.textContent || '';
    const m = text.match(/(\d+)\s*\/\s*(\d+)/); moves = (text.match(/移動\s*(\d+)/) || [])[1] || '';
    const key = roundKey();
    if (key !== round) { round = key; last = -1; won?.close(); won = null; timer.use(`${key}`); }
    if (!m) { label.textContent = text; fill.style.width = '0%'; return; }
    const got = Number(m[1]); total = Number(m[2]);
    label.innerHTML = `${t.win ? '星' : '見つけた'} <b>${got} / ${total}</b>`; fill.style.width = `${total ? Math.round((got / total) * 100) : 0}%`;
    badge.textContent = t.win ? 'ゲーム' : `${total}か所`;
    if (last >= 0 && got > last) {
      sfx.snap(got); bar.classList.remove('is-bump'); requestAnimationFrame(() => bar.classList.add('is-bump'));
      const r = bar.getBoundingClientRect(); const host = play.getBoundingClientRect(); floatText(play, r.right - host.left - 40, r.bottom - host.top + 6, '+1');
    }
    if (!play.hidden && got < total) timer.start();
    const finished = t.win ? !$(t.win)?.hidden : total > 0 && got >= total;
    if (finished && !won) {
      timer.stop();
      won = winOverlay(play, {
        title: t.win ? 'ゴール！' : 'ぜんぶ見つけた！', stars: 3, maxStars: 3,
        stats: [['タイム', formatTime(timer.elapsed())], t.win ? ['移動', `${moves}回`] : ['見つけた', `${got}か所`]],
        actions: [
          ...(t.again ? [{ label: 'もういちど', primary: true, onClick: () => { won?.close(); $(t.again)?.click(); } }] : []),
          { label: t.again ? '閉じる' : 'つぎの問題へ', primary: !t.again, onClick: () => { won?.close(); if (!t.again) $('#pixfind-back')?.click(); } }
        ]
      });
    }
    last = got;
  }
  new MutationObserver(read).observe(progress, { childList: true, characterData: true, subtree: true });
  if (t.win) { const w = $(t.win); if (w) new MutationObserver(read).observe(w, { attributes: true, attributeFilter: ['hidden'] }); }
  const lobby = document.querySelector('.arc-lobby');
  const syncShown = () => { if (lobby) lobby.hidden = !play.hidden; };
  new MutationObserver(() => { syncShown(); if (play.hidden) { timer.stop(); won?.close(); won = null; } else read(); }).observe(play, { attributes: true, attributeFilter: ['hidden'] });
  syncShown();
  read();
}
