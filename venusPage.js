const isMobile = () => {
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.width)) return vv.width <= 900;
  if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
  return window.innerWidth <= 900;
};

const prevBtn = document.getElementById('carouselPrevBtn');
const nextBtn = document.getElementById('carouselNextBtn');
if (prevBtn && nextBtn) {
  const slideIds = ['leftPanels', 'scene', 'sidePanels'];
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
    return { width, height, offsetLeft, offsetTop, baseWidth, baseHeight, dpr };
  };
  const applyMobileClass = () => {
    const mobile = isMobile();
    document.body.classList.toggle('force-mobile', mobile);
    document.documentElement.style.overflow = mobile ? 'hidden' : '';
    document.body.style.overflow = mobile ? 'hidden' : '';
    if (!mobile) {
      document.documentElement.style.removeProperty('--viewport-width');
      document.documentElement.style.removeProperty('--viewport-height');
      document.documentElement.style.removeProperty('--viewport-offset-x');
      document.documentElement.style.removeProperty('--viewport-offset-y');
      lastResizeKey = '';
      return;
    }
    const metrics = getViewportMetrics();
    document.documentElement.style.setProperty('--viewport-width', `${metrics.width}px`);
    document.documentElement.style.setProperty('--viewport-height', `${metrics.height}px`);
    const layoutWidth = window.innerWidth || metrics.baseWidth;
    const layoutOffsetX = (document.documentElement.dir === 'rtl' && layoutWidth > metrics.width)
      ? (layoutWidth - metrics.width + metrics.offsetLeft)
      : metrics.offsetLeft;
    document.documentElement.style.setProperty('--viewport-offset-x', `${layoutOffsetX}px`);
    document.documentElement.style.setProperty('--viewport-offset-y', `${metrics.offsetTop}px`);
    document.documentElement.style.setProperty('--viewport-offset-x', `${layoutOffsetX}px`);
    document.documentElement.style.setProperty('--viewport-offset-y', `${metrics.offsetTop}px`);
    const nextKey = `${Math.round(layoutWidth)}:${Math.round(metrics.width)}:${Math.round(metrics.height)}`;
    if (nextKey !== lastResizeKey) {
      lastResizeKey = nextKey;
      scheduleResize();
    }
  };
  const updateOverlayPositions = () => {
    if (!isMobile()) return;
    const metrics = getViewportMetrics();
    const layoutWidth = window.innerWidth || metrics.baseWidth;
    const layoutOffsetX = (document.documentElement.dir === 'rtl' && layoutWidth > metrics.width)
      ? (layoutWidth - metrics.width + metrics.offsetLeft)
      : metrics.offsetLeft;
    const centerX = layoutOffsetX + metrics.width / 2;
    const centerY = metrics.offsetTop + metrics.height / 2;
    const nextWidth = nextBtn.getBoundingClientRect().width || 34;
    prevBtn.style.top = `${centerY}px`;
    prevBtn.style.left = `${layoutOffsetX + 8}px`;
    nextBtn.style.top = `${centerY}px`;
    nextBtn.style.left = `${layoutOffsetX + metrics.width - nextWidth - 8}px`;
    nextBtn.style.right = 'auto';
    if (langSwitcher) {
      langSwitcher.style.top = `${metrics.offsetTop + 8}px`;
      langSwitcher.style.left = `${centerX}px`;
      langSwitcher.style.transform = 'translateX(-50%)';
    }
    if (topicSelect) {
      const langHeight = langSwitcher?.getBoundingClientRect().height || 28;
      topicSelect.style.top = `${metrics.offsetTop + langHeight + 12}px`;
      topicSelect.style.left = `${centerX}px`;
      topicSelect.style.transform = 'translateX(-50%)';
    }
  };
  const applyPanelVisibility = () => {
    if (!leftPanels || !scene || !sidePanels) return;
    if (isMobile()) {
      leftPanels.style.display = (document.body.dataset.activeSlide === 'leftPanels') ? 'block' : 'none';
      scene.style.display = (document.body.dataset.activeSlide === 'scene') ? 'block' : 'none';
      sidePanels.style.display = (document.body.dataset.activeSlide === 'sidePanels') ? 'block' : 'none';
      const showOverlay = (document.body.dataset.activeSlide === 'scene');
      if (langSwitcher) langSwitcher.style.display = showOverlay ? 'flex' : 'none';
      if (topicSelect) topicSelect.style.display = showOverlay ? 'flex' : 'none';
      prevBtn.style.display = 'inline-flex';
      nextBtn.style.display = 'inline-flex';
      updateOverlayPositions();
    } else {
      leftPanels.style.display = defaultDisplays.left;
      scene.style.display = defaultDisplays.scene;
      sidePanels.style.display = defaultDisplays.side;
      if (langSwitcher) langSwitcher.style.display = '';
      if (topicSelect) topicSelect.style.display = '';
      prevBtn.style.display = '';
      nextBtn.style.display = '';
    }
  };
  let currentIndex = 1;
  let lastMobileState = isMobile();
  const setActiveIndex = (index) => {
    currentIndex = Math.max(0, Math.min(slideIds.length - 1, index));
    document.body.dataset.activeSlide = slideIds[currentIndex] || '';
    applyPanelVisibility();
    if (isMobile()) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
  };
  prevBtn.addEventListener('click', () => {
    setActiveIndex(currentIndex - 1);
  });
  nextBtn.addEventListener('click', () => {
    setActiveIndex(currentIndex + 1);
  });
  const ensureDefault = () => {
    const mobile = isMobile();
    applyMobileClass();
    if (mobile) {
      if (!lastMobileState || !document.body.dataset.activeSlide) {
        setActiveIndex(1);
      } else {
        applyPanelVisibility();
        updateOverlayPositions();
      }
    } else {
      if (document.body.dataset.activeSlide) delete document.body.dataset.activeSlide;
      applyPanelVisibility();
    }
    lastMobileState = mobile;
  };
  ensureDefault();
  addEventListener('resize', ensureDefault);
  addEventListener('resize', updateOverlayPositions);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateOverlayPositions);
    window.visualViewport.addEventListener('scroll', updateOverlayPositions);
  }
}
