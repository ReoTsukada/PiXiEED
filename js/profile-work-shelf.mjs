import { initHomeRecentProjects } from './home-recent-projects.mjs?rev=20261128-work-shelf-1';
import { createFeedDraftStore } from './social/drafts.mjs?rev=20261128-explore-puzzle-posts-1';

const shelf = document.querySelector('[data-profile-work-shelf]');
const view = new URLSearchParams(location.search).get('view');
if (shelf && (!view || view === 'home')) {
  const list = shelf.querySelector('[data-profile-draft-list]');
  const status = shelf.querySelector('[data-profile-draft-status]');
  const drafts = createFeedDraftStore();
  let run = 0;

  function attach() {
    const destination = document.querySelector('[data-profile-root] .profile-content');
    if (!destination) return;
    destination.querySelector('h2')?.after(shelf);
    shelf.hidden = false;
  }

  async function renderDrafts() {
    const generation = ++run;
    try {
      const recent = (await drafts.list()).slice(0, 4);
      if (generation !== run) return;
      const cards = recent.map(draft => {
        const title = draft.title.trim() || 'タイトル未設定';
        const card = document.createElement('a');
        card.className = 'portal-recent-card';
        card.href = `/feed/?view=drafts&draft=${encodeURIComponent(draft.id)}`;
        card.setAttribute('aria-label', `${title} の下書きを開く`);
        const preview = document.createElement('span');
        preview.className = 'portal-recent-preview';
        preview.setAttribute('aria-hidden', 'true');
        if (draft.image) {
          const image = document.createElement('img');
          image.src = draft.image.dataUrl;
          image.alt = '';
          image.loading = 'lazy';
          image.width = draft.image.width;
          image.height = draft.image.height;
          preview.append(image);
        } else {
          preview.classList.add('profile-draft-text');
          preview.textContent = Array.from(draft.caption.trim() || '投稿の下書き').slice(0, 80).join('');
        }
        const name = document.createElement('span');
        name.className = 'portal-recent-title';
        name.textContent = title;
        const meta = document.createElement('small');
        meta.className = 'portal-recent-meta';
        meta.textContent = '投稿の下書き · 端末内';
        card.append(preview, name, meta);
        return card;
      });
      list.replaceChildren(...cards);
      status.hidden = Boolean(cards.length);
      status.textContent = cards.length ? '' : 'この端末に投稿の下書きはありません。';
    } catch {
      if (generation !== run) return;
      status.hidden = false;
      status.textContent = 'この端末の下書きを読み込めませんでした。';
    }
  }

  document.addEventListener('pixieed:profile-rendered', attach);
  attach();
  initHomeRecentProjects({ max: 4, emptyMessage: 'この端末に制作中の絵はありません。' });
  void renderDrafts();
  window.addEventListener('pageshow', event => { if (event.persisted) void renderDrafts(); });
}
