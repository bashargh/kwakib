const api = (typeof window !== 'undefined') ? window.earthViewerApi : null;
if (!api) {
  console.warn('earthMainPage: earthViewerApi not available.');
} else {
  const isMobile = () => {
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width)) return vv.width <= 900;
    if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
    return window.innerWidth <= 900;
  };
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
    const langSwitcher = document.getElementById('langSwitcher');
    const topicSelect = document.querySelector('.topic-select');
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
        const showOverlay = (document.body.dataset.activeSlide === 'scene');
        if (langSwitcher) langSwitcher.style.display = showOverlay ? 'flex' : 'none';
        if (topicSelect) topicSelect.style.display = showOverlay ? 'flex' : 'none';
        carouselPrevBtn.style.display = 'inline-flex';
        carouselNextBtn.style.display = 'inline-flex';
        updateOverlayPositions();
      } else {
        leftPanels.style.display = defaultDisplays.left;
        scene.style.display = defaultDisplays.scene;
        sidePanels.style.display = defaultDisplays.side;
        if (langSwitcher) langSwitcher.style.display = '';
        if (topicSelect) topicSelect.style.display = '';
        carouselPrevBtn.style.display = '';
        carouselNextBtn.style.display = '';
      }
    };
    const getViewportMetrics = () => {
      const vv = window.visualViewport;
      const baseWidth = vv ? vv.width : window.innerWidth;
      const baseHeight = vv ? vv.height : window.innerHeight;
      const offsetLeft = vv ? vv.offsetLeft : 0;
      const offsetTop = vv ? vv.offsetTop : 0;
      const dpr = window.devicePixelRatio || 1;
      const docEl = document.documentElement;
      const cssWidths = [baseWidth, docEl?.clientWidth, document.body?.clientWidth, window.screen?.width, window.screen?.availWidth]
        .filter((v) => Number.isFinite(v) && v > 0);
      const cssHeights = [baseHeight, docEl?.clientHeight, document.body?.clientHeight, window.screen?.height, window.screen?.availHeight]
        .filter((v) => Number.isFinite(v) && v > 0);
      let width = Math.min(...cssWidths);
      let height = Math.min(...cssHeights);
      if (isMobile() && baseWidth > 900 && dpr > 1) {
        width = Math.min(width, baseWidth / dpr);
        height = Math.min(height, baseHeight / dpr);
      }
      return { width, height, offsetLeft, offsetTop, baseWidth, baseHeight, dpr, vv, cssWidths, cssHeights };
    };
    let lastResizeKey = '';
    let resizeScheduled = false;
    const scheduleResize = () => {
      if (resizeScheduled) return;
      resizeScheduled = true;
      requestAnimationFrame(() => {
        resizeScheduled = false;
        window.dispatchEvent(new Event('resize'));
      });
    };
    const applyMobileClass = () => {
      const mobile = isMobile();
      document.body.classList.toggle('force-mobile', mobile);
      if (!mobile) {
        document.documentElement.style.removeProperty('--viewport-width');
        document.documentElement.style.removeProperty('--viewport-height');
        lastResizeKey = '';
        return;
      }
      const metrics = getViewportMetrics();
      document.documentElement.style.setProperty('--viewport-width', `${metrics.width}px`);
      document.documentElement.style.setProperty('--viewport-height', `${metrics.height}px`);
      const layoutWidth = window.innerWidth || metrics.baseWidth;
      const nextKey = `${Math.round(layoutWidth)}:${Math.round(metrics.width)}:${Math.round(metrics.height)}`;
      if (nextKey !== lastResizeKey) {
        lastResizeKey = nextKey;
        scheduleResize();
      }
    };
    const updateOverlayPositions = () => {
      if (!isMobile()) return;
      const metrics = getViewportMetrics();
      document.documentElement.style.setProperty('--viewport-width', `${metrics.width}px`);
      document.documentElement.style.setProperty('--viewport-height', `${metrics.height}px`);
      const layoutWidth = window.innerWidth || metrics.baseWidth;
      const layoutOffsetX = (document.documentElement.dir === 'rtl' && layoutWidth > metrics.width)
        ? (layoutWidth - metrics.width + metrics.offsetLeft)
        : metrics.offsetLeft;
      const centerX = layoutOffsetX + metrics.width / 2;
      const centerY = metrics.offsetTop + metrics.height / 2;
      const nextWidth = carouselNextBtn.getBoundingClientRect().width || 34;
      carouselPrevBtn.style.top = `${centerY}px`;
      carouselPrevBtn.style.left = `${layoutOffsetX + 8}px`;
      carouselNextBtn.style.top = `${centerY}px`;
      carouselNextBtn.style.left = `${layoutOffsetX + metrics.width - nextWidth - 8}px`;
      carouselNextBtn.style.right = 'auto';
      if (langSwitcher) {
        langSwitcher.style.top = `${metrics.offsetTop + 8}px`;
        langSwitcher.style.left = `${centerX}px`;
        langSwitcher.style.transform = 'translateX(-50%)';
      }
      if (topicSelect) {
        topicSelect.style.top = `${metrics.offsetTop + 44}px`;
        topicSelect.style.left = `${centerX}px`;
        topicSelect.style.transform = 'translateX(-50%)';
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
      applyMobileClass();
      if (isMobile()) {
        setActiveIndex(1);
      } else {
        delete document.body.dataset.activeSlide;
        if (creditEl) creditEl.style.display = 'none';
        applyPanelVisibility();
      }
    };
    ensureDefault();
    addEventListener('resize', ensureDefault);
    addEventListener('resize', updateOverlayPositions);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateOverlayPositions);
      window.visualViewport.addEventListener('scroll', updateOverlayPositions);
    }

  }
}
