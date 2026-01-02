const api = (typeof window !== 'undefined') ? window.earthViewerApi : null;
if (!api) {
  console.warn('earthMainPage: earthViewerApi not available.');
} else {
  const isMobile = () => window.innerWidth <= 900;
  const interestingDates = document.getElementById('interestingDates');
  if (!interestingDates) {
    // No page-specific controls to bind.
  } else {
    const dateButtons = interestingDates.querySelectorAll('[data-datetime]');
    const dtInput = document.getElementById('datetime');
    dateButtons.forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const dt = btn.dataset.datetime;
        if (!dt || !api.parseUTC) return;
        const parsed = api.parseUTC(dt);
        if (!parsed) return;
        if (api.setCameraMode) api.setCameraMode('sun');
        if (api.cameraModeButtons) {
          api.cameraModeButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.mode === 'sun');
          });
        }
        if (dtInput && api.formatUTC && api.roundToMinute) {
          dtInput.value = api.formatUTC(api.roundToMinute(parsed));
        }
        if (api.updateCelestial) api.updateCelestial();
      });
    });
  }

  const pageLayout = document.getElementById('pageLayout');
  const carouselPrevBtn = document.getElementById('carouselPrevBtn');
  const carouselNextBtn = document.getElementById('carouselNextBtn');
  if (pageLayout && carouselPrevBtn && carouselNextBtn) {
    const slideIds = ['leftPanels', 'scene', 'sidePanels'];
    const slides = slideIds.map((id) => document.getElementById(id)).filter(Boolean);
    const creditEl = document.querySelector('.mobile-scene-footer');
    if (document.documentElement.dir === 'rtl') {
      pageLayout.setAttribute('dir', 'ltr');
      document.getElementById('leftPanels')?.setAttribute('dir', 'rtl');
      document.getElementById('sidePanels')?.setAttribute('dir', 'rtl');
    }
    let currentIndex = 0;
    const updateActiveSlide = () => {
      if (!slides.length) return;
      const width = pageLayout.clientWidth || window.innerWidth;
      const rawIndex = width ? pageLayout.scrollLeft / width : 0;
      currentIndex = Math.max(0, Math.min(slides.length - 1, Math.round(rawIndex)));
      document.body.dataset.activeSlide = slideIds[currentIndex] || '';
      if (creditEl) {
        creditEl.style.display = (isMobile() && slideIds[currentIndex] === 'scene') ? 'block' : 'none';
      }
    };
    const scrollToIndex = (index) => {
      if (!slides.length) return;
      const clamped = Math.max(0, Math.min(slides.length - 1, index));
      const width = pageLayout.clientWidth || window.innerWidth;
      pageLayout.scrollTo({ left: clamped * width, behavior: 'smooth' });
      setTimeout(updateActiveSlide, 220);
    };
    carouselPrevBtn.addEventListener('click', () => {
      scrollToIndex(currentIndex - 1);
    });
    carouselNextBtn.addEventListener('click', () => {
      scrollToIndex(currentIndex + 1);
    });
    let rafId = 0;
    pageLayout.addEventListener('scroll', () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updateActiveSlide();
      });
    }, { passive: true });
    updateActiveSlide();
    if (isMobile() && slides[1]) {
      requestAnimationFrame(() => {
        const width = pageLayout.clientWidth || window.innerWidth;
        pageLayout.scrollTo({ left: width, behavior: 'auto' });
        updateActiveSlide();
      });
    }
  }
}
