export const createAnalemmaUI = ({
  analemmaUi,
  analemmaInsetState,
  analemmaTooltip,
  analemmaPath,
  updateAnalemmaChartHeights,
  updateCelestial,
  updateAnalemmaInset,
  hideAnalemmaInset,
  startAnalemmaPlayback,
  pauseAnalemmaPlayback,
  resetAnalemmaPlayback,
  getLastSubpoints
}) => {
  const initAnalemmaBreakdown = () => {
    const panel = document.getElementById('analemmaBreakdown');
    if (!panel) return;
    analemmaInsetState.enabled = false;
    analemmaUi.tooltip.el = document.getElementById('analemmaTooltip');
    analemmaUi.charts.ecc.canvas = document.getElementById('eccentricityChart');
    analemmaUi.charts.obliq.canvas = document.getElementById('obliquityChart');
    analemmaUi.charts.combined.canvas = document.getElementById('analemmaCombinedChart');
    analemmaTooltip?.attach(analemmaUi.charts.ecc.canvas, 'ecc');
    analemmaTooltip?.attach(analemmaUi.charts.obliq.canvas, 'obliq');
    const tabButtons = Array.from(panel.querySelectorAll('.analemma-tab'));
    const tabPanels = Array.from(panel.querySelectorAll('.analemma-tab-panel'));
    const setTab = (tabId) => {
      if (!tabId) return;
      analemmaUi.tab = tabId;
      tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
      tabPanels.forEach(tabPanel => tabPanel.classList.toggle('active', tabPanel.dataset.tab === tabId));
      analemmaUi.tooltip.pinned = false;
      analemmaUi.tooltip.source = null;
      analemmaTooltip?.hide();
      if (tabId === 'combined') {
        analemmaInsetState.enabled = true;
        analemmaInsetState.mode = 'sidereal';
      } else {
        analemmaInsetState.enabled = false;
        hideAnalemmaInset();
      }
      updateAnalemmaChartHeights();
      updateCelestial();
      if (tabId === 'combined') {
        const lastSubpoints = getLastSubpoints?.();
        if (lastSubpoints?.sun) {
          updateAnalemmaInset(analemmaInsetState.mode, lastSubpoints.sun, lastSubpoints.meanSun);
        }
      }
    };
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });
    const initialTab = tabButtons.find(btn => btn.classList.contains('active'))?.dataset.tab
      || tabButtons[0]?.dataset.tab;
    if (initialTab) setTab(initialTab);

    const initCardToggles = () => {
      const cards = Array.from(panel.querySelectorAll('.analemma-card'));
      cards.forEach((card) => {
        const toggle = card.querySelector('.analemma-card-toggle');
        const header = card.querySelector('.analemma-card-header');
        const content = card.querySelector('.analemma-card-content');
        if (!toggle || !content) return;
        const collapseLabel = toggle.dataset.labelCollapse || 'Collapse';
        const expandLabel = toggle.dataset.labelExpand || 'Expand';
        const setCollapsed = (collapsed) => {
          card.classList.toggle('is-collapsed', collapsed);
          content.hidden = collapsed;
          toggle.setAttribute('aria-expanded', String(!collapsed));
          toggle.textContent = collapsed ? expandLabel : collapseLabel;
        };
        const initialCollapsed = card.classList.contains('is-collapsed')
          || content.hidden
          || toggle.getAttribute('aria-expanded') === 'false';
        setCollapsed(initialCollapsed);
        toggle.addEventListener('click', () => {
          setCollapsed(!card.classList.contains('is-collapsed'));
          updateAnalemmaChartHeights();
          updateCelestial();
        });
        if (header) {
          header.addEventListener('click', (event) => {
            if (event.target && event.target.closest('.analemma-card-toggle')) return;
            setCollapsed(!card.classList.contains('is-collapsed'));
            updateAnalemmaChartHeights();
            updateCelestial();
          });
        }
      });
    };
    initCardToggles();

    const playBtn = document.getElementById('analemmaPlayBtn');
    const pauseBtn = document.getElementById('analemmaPauseBtn');
    const resetBtn = document.getElementById('analemmaResetBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        const resume = !!analemmaPath.obliquityTrace.startDate;
        startAnalemmaPlayback(resume);
      });
    }
    if (pauseBtn) pauseBtn.addEventListener('click', pauseAnalemmaPlayback);
    if (resetBtn) resetBtn.addEventListener('click', resetAnalemmaPlayback);

    document.addEventListener('pointerdown', (event) => {
      if (!analemmaUi.tooltip.pinned) return;
      if (event.target && event.target.tagName === 'CANVAS') return;
      analemmaUi.tooltip.pinned = false;
      analemmaUi.tooltip.source = null;
      analemmaTooltip?.hide();
    });
  };

  return { initAnalemmaBreakdown };
};
