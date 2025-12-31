export const applyFaqSchema = ({ appLang }) => {
  const schemaEl = document.getElementById('faqSchema');
  if (!schemaEl) return;
  const qaPairs = [
    {
      q: document.getElementById('faqQ1')?.textContent || '',
      a: document.getElementById('faqA1')?.textContent || ''
    },
    {
      q: document.getElementById('faqQ2')?.textContent || '',
      a: document.getElementById('faqA2')?.textContent || ''
    },
    {
      q: document.getElementById('faqQ3')?.textContent || '',
      a: document.getElementById('faqA3')?.textContent || ''
    }
  ].filter(pair => pair.q && pair.a);
  const mainEntity = qaPairs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a }
  }));
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: [appLang],
    mainEntity
  };
  schemaEl.textContent = JSON.stringify(payload, null, 2);
};

export const applyLangSwitcherLinks = ({ appLang, pageLangMap, availableLangs }) => {
  const buildLangUrl = (code) => {
    const target = pageLangMap[code];
    if (!target) return null;
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    url.pathname = url.pathname.replace(/[^/]*$/, target);
    return url.toString();
  };
  const langSwitcher = document.getElementById('langSwitcher');
  const hideLangSwitcher = (typeof window !== 'undefined' && window.HIDE_LANG_SWITCHER === true) || availableLangs.length < 2;
  if (langSwitcher && hideLangSwitcher) langSwitcher.style.display = 'none';
  const linkEn = document.getElementById('langLinkEn');
  const linkAr = document.getElementById('langLinkAr');
  const hrefEn = buildLangUrl('en');
  const hrefAr = buildLangUrl('ar');
  if (linkEn) {
    if (hrefEn) {
      linkEn.href = hrefEn;
      linkEn.classList.toggle('active', appLang === 'en');
    } else {
      linkEn.style.display = 'none';
    }
  }
  if (linkAr) {
    if (hrefAr) {
      linkAr.href = hrefAr;
      linkAr.classList.toggle('active', appLang === 'ar');
    } else {
      linkAr.style.display = 'none';
    }
  }
  const head = document.head;
  document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
  availableLangs.forEach((code) => {
    const href = buildLangUrl(code);
    if (!href) return;
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = code;
    link.href = href;
    link.dataset.hreflang = '1';
    head.appendChild(link);
  });
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    head.appendChild(canonical);
  }
  const forcedCanonical = (typeof window !== 'undefined' && typeof window.FORCED_CANONICAL === 'string')
    ? window.FORCED_CANONICAL
    : null;
  canonical.href = forcedCanonical || buildLangUrl(appLang) || location.href;
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute('content', appLang === 'ar' ? 'ar_AR' : 'en_US');
};
