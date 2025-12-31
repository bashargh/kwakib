export const initEarthPanels = ({
  leftPanels,
  infoPanel,
  sidePanels,
  toggleInfoBtn,
  toggleControlsBtn,
  leftPanelsAlways = false,
  isMobile = () => false,
  onApply
} = {}) => {
  let infoVisible = !isMobile();
  let controlsVisible = !isMobile();

  const applyPanelVisibility = () => {
    if (leftPanels) {
      if (leftPanelsAlways) {
        leftPanels.style.display = 'flex';
        if (infoPanel) infoPanel.style.display = infoVisible ? 'block' : 'none';
      } else {
        leftPanels.style.display = infoVisible ? 'flex' : 'none';
      }
    } else if (infoPanel) {
      infoPanel.style.display = infoVisible ? 'block' : 'none';
    }

    if (sidePanels) {
      sidePanels.style.display = controlsVisible ? (isMobile() ? 'block' : 'flex') : 'none';
    }
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

  addEventListener('resize', applyPanelVisibility);
  applyPanelVisibility();

  return {
    applyPanelVisibility,
    getInfoVisible: () => infoVisible,
    setInfoVisible: (value) => {
      infoVisible = !!value;
      applyPanelVisibility();
    },
    getControlsVisible: () => controlsVisible,
    setControlsVisible: (value) => {
      controlsVisible = !!value;
      applyPanelVisibility();
    }
  };
};
