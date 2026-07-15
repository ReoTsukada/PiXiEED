(() => {
  const frames = Array.from(document.querySelectorAll('.home-live-tool__frame, .project-live-tool__frame'));
  const syncFrameHeight = frame => {
    if (!(frame instanceof HTMLIFrameElement)) return;
    // The project hub deliberately uses the whole remaining browser window.
    // Its height is owned by the page layout, not the home-preview 16:9 sync.
    if (frame.closest('body.project-tool-window')) return;
    const width = Math.round(frame.getBoundingClientRect().width || frame.clientWidth || 0);
    if (width > 0) {
      const height = Math.round(width * 9 / 16);
      // Keep both the CSS box and the iframe's intrinsic viewport at 16:9.
      // Safari can otherwise retain the original portrait intrinsic size until
      // a later reflow, so the embedded application initially selects its
      // mobile portrait UI even though the visible frame is horizontal.
      frame.width = String(width);
      frame.height = String(height);
      frame.style.height = `${height}px`;
    }
  };
  const syncAllFrameHeights = () => frames.forEach(syncFrameHeight);
  syncAllFrameHeights();
  frames.forEach(frame => {
    frame.addEventListener('load', () => {
      syncFrameHeight(frame);
      // The embedded tools are same-origin.  Tell them about the final frame
      // geometry after Safari has applied the intrinsic height.
      window.requestAnimationFrame(() => {
        try {
          frame.contentWindow?.dispatchEvent(new Event('resize'));
        } catch (_error) {
          // A cross-origin embed would simply manage its own viewport.
        }
      });
    });
  });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncAllFrameHeights);
    frames.forEach(frame => observer.observe(frame));
  } else {
    window.addEventListener('resize', syncAllFrameHeights, { passive: true });
  }

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
