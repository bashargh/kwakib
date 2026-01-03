export const initViewerPanels = ({
  root = document,
  infoPanel,
  sidePanels,
  toggleInfoBtn,
  toggleControlsBtn,
  tourPanel,
  creditsToggle,
  footer,
  isMobile = () => false,
  collapsibleIds = [],
  defaultInfoVisible = true,
  defaultControlsVisible = true,
  forcePanelsOnMobile = true,
  onApply,
  onResize
} = {}) => {
  let infoVisible = defaultInfoVisible;
  let controlsVisible = defaultControlsVisible;
  let lastMobileState = isMobile();
  const hasMobileCarousel = () => !!document.body?.dataset?.activeSlide;

  const setCollapsed = (id, collapsed) => {
    const el = root.getElementById(id);
    if (!el) return;
    if (collapsed) el.classList.add('collapsed'); else el.classList.remove('collapsed');
    const header = el.querySelector('.section-header');
    if (header) header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };
  const syncCollapsibles = (forceMobileState = null) => {
    const mobile = forceMobileState !== null ? forceMobileState : isMobile();
    collapsibleIds.forEach(id => setCollapsed(id, mobile));
    lastMobileState = mobile;
  };
  root.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const target = header.dataset.target;
      if (!target) return;
      const el = root.getElementById(target);
      if (!el) return;
      const nextState = !el.classList.contains('collapsed');
      setCollapsed(target, nextState);
    });
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        header.click();
      }
    });
  });
  syncCollapsibles(lastMobileState);

  const positionTourPanel = () => {
    if (!tourPanel) return;
    const infoRect = infoPanel?.getBoundingClientRect();
    if (infoPanel && infoVisible && infoPanel.style.display !== 'none' && infoRect && innerWidth > 900) {
      tourPanel.style.left = `${infoPanel.offsetLeft}px`;
      tourPanel.style.top = `${infoPanel.offsetTop + infoPanel.offsetHeight + 12}px`;
    } else if (innerWidth > 900) {
      tourPanel.style.left = '12px';
      tourPanel.style.top = '64px';
    }
  };

  const applyPanelVisibility = () => {
    if (hasMobileCarousel()) {
      if (typeof onApply === 'function') onApply();
      return;
    }
    if (forcePanelsOnMobile && isMobile()) {
      infoVisible = true;
      controlsVisible = true;
    }
    const nowMobile = isMobile();
    if (nowMobile !== lastMobileState) {
      syncCollapsibles(nowMobile);
    }
    if (infoPanel) infoPanel.style.display = infoVisible ? 'block' : 'none';
    if (sidePanels) {
      sidePanels.style.display = controlsVisible ? (isMobile() ? 'block' : 'flex') : 'none';
    }
    positionTourPanel();
    if (typeof onApply === 'function') onApply();
  };

  if (toggleInfoBtn) {
    toggleInfoBtn.addEventListener('click', () => {
      infoVisible = !infoVisible;
      applyPanelVisibility();
    });
  }
  if (toggleControlsBtn) {
    toggleControlsBtn.addEventListener('click', () => {
      controlsVisible = !controlsVisible;
      applyPanelVisibility();
    });
  }
  addEventListener('resize', () => {
    applyPanelVisibility();
    if (typeof onResize === 'function') onResize();
  });
  applyPanelVisibility();

  let creditsOpen = false;
  const setCreditsOpen = (open) => {
    if (!footer) return;
    creditsOpen = open;
    footer.classList.toggle('show', open);
  };
  if (creditsToggle && footer) {
    creditsToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setCreditsOpen(!creditsOpen);
    });
    document.addEventListener('click', (event) => {
      if (!creditsOpen) return;
      const target = event.target;
      if (footer.contains(target) || creditsToggle.contains(target)) return;
      setCreditsOpen(false);
    });
  }

  return {
    applyPanelVisibility,
    setInfoVisible: (value) => {
      infoVisible = !!value;
      applyPanelVisibility();
    },
    setControlsVisible: (value) => {
      controlsVisible = !!value;
      applyPanelVisibility();
    }
  };
};
