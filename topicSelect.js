const initTopicSelect = (selectId = 'topicSelect') => {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentUrl = new URL(location.href);
  const normalizePath = (path) => {
    const cleaned = path.replace(/[?#].*$/, '').replace(/\/+$/, '');
    return cleaned.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  };
  const currentPath = normalizePath(currentUrl.pathname);
  for (const opt of select.options) {
    const optUrl = new URL(opt.value, currentUrl);
    const optPath = normalizePath(optUrl.pathname);
    if (currentPath === optPath) {
      select.value = opt.value;
      break;
    }
  }
  select.addEventListener('change', () => {
    if (!select.value) return;
    const targetUrl = new URL(select.value, currentUrl);
    if (normalizePath(targetUrl.pathname) !== currentPath) location.href = select.value;
  });
};

initTopicSelect();
