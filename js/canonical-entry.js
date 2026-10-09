// GitHub Pages serves / and /index.html from the same file. This is a
// client-side navigation, not an HTTP 301; the canonical remains in HTML.
if (location.pathname === '/index.html') {
  location.replace('/' + location.search + location.hash);
}
