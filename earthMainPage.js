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
    const creditEl = document.querySelector('.mobile-scene-footer');
    let currentIndex = 0;
    const setActiveIndex = (index) => {
      currentIndex = Math.max(0, Math.min(slideIds.length - 1, index));
      document.body.dataset.activeSlide = slideIds[currentIndex] || '';
      if (creditEl) {
        creditEl.style.display = (isMobile() && slideIds[currentIndex] === 'scene') ? 'block' : 'none';
      }
    };
    carouselPrevBtn.addEventListener('click', () => {
      setActiveIndex(currentIndex - 1);
    });
    carouselNextBtn.addEventListener('click', () => {
      setActiveIndex(currentIndex + 1);
    });
    const ensureDefault = () => {
      if (isMobile()) {
        setActiveIndex(1);
      } else {
        if (creditEl) creditEl.style.display = 'none';
      }
    };
    ensureDefault();
    addEventListener('resize', ensureDefault);
  }
}
