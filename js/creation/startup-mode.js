(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'camera') {
    document.documentElement.dataset.creationEntryMode = 'camera';
    document.documentElement.dataset.creationStartup = 'camera';
  }
})();
