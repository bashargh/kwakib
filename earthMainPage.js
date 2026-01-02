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
    const getCurrentIndex = () => {
      const scrollLeft = pageLayout.scrollLeft;
      let bestIndex = 0;
      let bestDist = Infinity;
      slides.forEach((slide, index) => {
        const dist = Math.abs(slide.offsetLeft - scrollLeft);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = index;
        }
      });
      return bestIndex;
    };
    const updateActiveSlide = () => {
      if (!slides.length) return;
      const index = getCurrentIndex();
      document.body.dataset.activeSlide = slideIds[index] || '';
      if (creditEl) {
        creditEl.style.display = (isMobile() && slideIds[index] === 'scene') ? 'block' : 'none';
      }
    };
    const scrollToIndex = (index) => {
      if (!slides.length) return;
      const clamped = Math.max(0, Math.min(slides.length - 1, index));
      pageLayout.scrollTo({ left: slides[clamped].offsetLeft, behavior: 'smooth' });
      setTimeout(updateActiveSlide, 220);
    };
    carouselPrevBtn.addEventListener('click', () => {
      scrollToIndex(getCurrentIndex() - 1);
    });
    carouselNextBtn.addEventListener('click', () => {
      scrollToIndex(getCurrentIndex() + 1);
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
        pageLayout.scrollLeft = slides[1].offsetLeft;
        updateActiveSlide();
      });
    }
  }
}
