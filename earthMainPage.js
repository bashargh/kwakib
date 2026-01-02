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
    const leftPanels = document.getElementById('leftPanels');
    const scene = document.getElementById('scene');
    const sidePanels = document.getElementById('sidePanels');
    const defaultDisplays = {
      left: leftPanels?.style.display ?? '',
      scene: scene?.style.display ?? '',
      side: sidePanels?.style.display ?? ''
    };
    const applyPanelVisibility = () => {
      if (!leftPanels || !scene || !sidePanels) return;
      if (isMobile()) {
        leftPanels.style.display = (document.body.dataset.activeSlide === 'leftPanels') ? 'flex' : 'none';
        scene.style.display = (document.body.dataset.activeSlide === 'scene') ? 'block' : 'none';
        sidePanels.style.display = (document.body.dataset.activeSlide === 'sidePanels') ? 'flex' : 'none';
        carouselPrevBtn.style.display = 'inline-flex';
        carouselNextBtn.style.display = 'inline-flex';
      } else {
        leftPanels.style.display = defaultDisplays.left;
        scene.style.display = defaultDisplays.scene;
        sidePanels.style.display = defaultDisplays.side;
        carouselPrevBtn.style.display = '';
        carouselNextBtn.style.display = '';
      }
    };
    let currentIndex = 0;
    const setActiveIndex = (index) => {
      currentIndex = Math.max(0, Math.min(slideIds.length - 1, index));
      document.body.dataset.activeSlide = slideIds[currentIndex] || '';
      if (creditEl) {
        creditEl.style.display = (isMobile() && slideIds[currentIndex] === 'scene') ? 'block' : 'none';
      }
      applyPanelVisibility();
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
        applyPanelVisibility();
      }
    };
    ensureDefault();
    addEventListener('resize', ensureDefault);
  }
}
