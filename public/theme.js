(() => {
  let saved;
  try { saved = localStorage.getItem('translate-theme'); } catch { saved = null; }
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
