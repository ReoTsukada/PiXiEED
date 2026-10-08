// The ordinary catalog uses the same explicit operator confirmation as the room.
const disclosure = document.querySelector('#books-associate-disclosure');
const links = [...document.querySelectorAll('[data-books-commerce-link]')];
links.forEach(link => { link.hidden = true; });
try {
  const response = await fetch('/assets/books/room-commerce.json', {
    credentials: 'same-origin', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('commerce configuration unavailable');
  const config = await response.json();
  if (config.enrollmentConfirmed === true && typeof config.associateName === 'string' && config.associateName.trim()) {
    if (disclosure) disclosure.textContent = `Amazon のアソシエイトとして、${config.associateName.trim()}は適格販売により収入を得ています。`;
    links.forEach(link => { link.hidden = false; });
  }
} catch { /* Remain visibly unconfirmed and keep outbound links disabled. */ }

// Preserve hidden records in the manifest while removing every ordinary-catalog entry.
try {
  const response = await fetch('/assets/books/room-products.json', {
    credentials: 'same-origin', signal: AbortSignal.timeout(5000),
  });
  if (response.ok) {
    const products = await response.json();
    if (Array.isArray(products)) for (const product of products) {
      if (product?.enabled !== false && product?.visible !== false) continue;
      if (typeof product.id !== 'string') continue;
      const entry = document.getElementById(product.id)
        || [...document.querySelectorAll('[data-books-product-id]')].find(el => el.dataset.booksProductId === product.id);
      if (entry) entry.hidden = true;
    }
  }
} catch { /* The room's catalog filtering is independent of this fallback page. */ }
