(() => {
  const embeds = Array.from(document.querySelectorAll('[data-project-live-tool]'));
  if (!embeds.length) return;

  embeds.forEach(embed => {
    const frame = embed.querySelector('[data-project-live-frame]');
    const fullscreen = embed.querySelector('[data-project-live-fullscreen]');
    const page = embed.dataset.projectToolPage;
    const embedPage = embed.dataset.projectToolEmbed;
    if (!frame || !page || !embedPage) return;

    if (fullscreen instanceof HTMLAnchorElement) {
      fullscreen.href = `${page}?fullscreen=1`;
    }
  });
})();
