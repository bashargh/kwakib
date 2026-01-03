import {
  TAU,
  normalizeDeg,
  sunDeclinationForYear,
  daylightHours,
  daylightHoursAtAltitude,
  SIDEREAL_MS,
  seasonDate
} from './astroCore.js';
import { createSeasonsInset } from './seasonsInset.js';
import { createSeasonsOverlay } from './seasonsOverlay.js';
import { createEarthTours } from './earthTours.js';

const api = (typeof window !== 'undefined') ? window.earthViewerApi : null;
if (!api) {
  console.warn('earthSeasonsPage: earthViewerApi not available.');
} else {
  const isMobile = () => {
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width)) return vv.width <= 900;
    if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
    return window.innerWidth <= 900;
  };
  const uiDir = document.documentElement.dir || 'ltr';
  const parseBool = (value, fallback) => {
    if (value === undefined) return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  };
  const resetOnExit = parseBool(document.body?.dataset?.tourResetOnExit, false);
  const allowMobileTours = parseBool(document.body?.dataset?.allowMobileTour, false);
  const formatHours = (hours) => {
    const h = Math.floor(hours);
    let m = Math.round((hours - h) * 60);
    let hh = h;
    if (m === 60) { hh += 1; m = 0; }
    return `${hh}h ${String(m).padStart(2, '0')}m`;
  };
  const defaultMarkerScale = api.getMarkerScale?.() ?? 1;
  const defaultMoonEnabled = api.getMoonOverlayEnabled?.() ?? true;
  const defaultCameraFocusLat = api.getCameraFocusLat?.() ?? 0;
  const setTourVisuals = (active) => {
    if (api.setMarkerScale) api.setMarkerScale(active ? 1.35 : defaultMarkerScale);
    if (api.setMoonOverlayEnabled) api.setMoonOverlayEnabled(active ? false : defaultMoonEnabled);
    if (!active && api.setCameraFocusLat) api.setCameraFocusLat(defaultCameraFocusLat);
  };

  const tourUi = {
    section: document.getElementById('tourSection'),
    start: document.getElementById('startTourBtn'),
    useTypedPoi: document.getElementById('useTypedPoiBtn'),
    card: document.getElementById('tourCard'),
    title: document.getElementById('tourStepTitle'),
    body: document.getElementById('tourStepBody'),
    progress: document.getElementById('tourProgress'),
    prev: document.getElementById('tourPrevBtn'),
    next: document.getElementById('tourNextBtn'),
    replay: document.getElementById('tourReplayBtn'),
    exit: document.getElementById('tourExitBtn'),
    alert: document.getElementById('tourAlert'),
    mobileMsg: document.getElementById('tourMobileMsg'),
    desktopControls: document.getElementById('tourDesktopControls')
  };
  const leftPanels = document.getElementById('leftPanels');
  const infoPanel = document.getElementById('infoPanel');
  let savedInfoPanelDisplay = '';
  let infoPanelCollapsedByTour = false;
  let savedLeftPanelsWidth = '';
  let leftPanelsWidenedByTour = false;
  const collapseInfoPanelForTour = () => {
    if (!infoPanel || infoPanelCollapsedByTour) return;
    savedInfoPanelDisplay = infoPanel.style.display;
    infoPanel.style.display = 'none';
    infoPanelCollapsedByTour = true;
    if (leftPanels && !leftPanelsWidenedByTour) {
      savedLeftPanelsWidth = leftPanels.style.width;
      leftPanels.style.width = '520px';
      leftPanelsWidenedByTour = true;
    }
  };
  const restoreInfoPanelAfterTour = () => {
    if (!infoPanel || !infoPanelCollapsedByTour) return;
    infoPanel.style.display = savedInfoPanelDisplay;
    infoPanelCollapsedByTour = false;
    if (leftPanels && leftPanelsWidenedByTour) {
      leftPanels.style.width = savedLeftPanelsWidth;
      leftPanelsWidenedByTour = false;
    }
  };

  let tourState = null;
  const updateTourPoiSummary = (sun) => {
    const target = document.getElementById('tourPoiSummary');
    if (!target) return;
    if (!tourState?.active || !tourState.poi || !sun) {
      target.textContent = '';
      return;
    }
    const dur = daylightHours(tourState.poi.lat, sun.lat);
    target.textContent = api.formatCopy(
      'durationsSummary',
      'At your point: Day {day}, Night {night}',
      { day: formatHours(dur.day), night: formatHours(dur.night) }
    );
  };

  const tours = createEarthTours({
    copyText: api.copyText,
    formatCopy: api.formatCopy,
    uiDir,
    isMobile,
    allowMobileTours,
    resetOnExit,
    tourUi,
    collapseInfoPanelForTour,
    restoreInfoPanelAfterTour,
    onTourStart: () => {
      setTourVisuals(true);
      api.updateCelestial?.();
    },
    onTourExit: () => {
      setTourVisuals(false);
      api.updateCelestial?.();
    },
    setPoint: api.setPoint,
    updateCelestial: api.updateCelestial,
    updateTourPoiSummary,
    applyCameraMode: api.applyCameraMode,
    getLastSubpoints: api.getLastSubpoints,
    getCameraMode: api.getCameraMode,
    setCameraMode: api.setCameraMode,
    cameraModeButtons: api.cameraModeButtons,
    datetimeInput: api.datetimeInput,
    twilightInput: api.twilightInput,
    twilightValue: api.twilightValue,
    setTimeOverride: api.setTimeOverride,
    startTimePlayback: api.startTimePlayback,
    stopTimePlayback: api.stopTimePlayback,
    formatUTC: api.formatUTC,
    roundToMinute: api.roundToMinute,
    parseUTC: api.parseUTC,
    SIDEREAL_MS,
    seasonDate,
    planetGroup: api.planetGroup,
    earth: api.earth,
    earthBaseYaw: api.earthBaseYaw,
    getBasePlanetYaw: api.getBasePlanetYaw,
    setBasePlanetYaw: api.setBasePlanetYaw,
    resetClickCount: api.resetClickCount,
    mathUtils: api.mathUtils
  });
  tourState = tours.tourState;

  const tourDayColor = '#8cff8c';
  const tourNightColor = '#8899ff';
  const seasonsOverlay = createSeasonsOverlay({
    getTourState: () => tourState,
    tourHighlightGroup: api.groups.tourHighlightGroup,
    tourDayColor,
    tourNightColor,
    latLonToVec3: api.latLonToVec3,
    clearGroupWithDispose: api.clearGroupWithDispose
  });
  const seasonsInset = createSeasonsInset({
    getTourState: () => tourState,
    getTimeOverride: api.getTimeOverride,
    getDateTimeValue: () => document.getElementById('datetime')?.value,
    getTwilightAngle: () => parseFloat(document.getElementById('twilightAngle')?.value) || 0,
    copyText: api.copyText,
    formatCopy: api.formatCopy,
    formatHours,
    parseUTC: api.parseUTC,
    normalizeDeg,
    TAU,
    sunDeclinationForYear,
    daylightHours,
    daylightHoursAtAltitude
  });

  const updateInsetForTour = (sun) => {
    if (tourState?.active && tourState.tourId === 'seasons') {
      const tour = tours.tourDefs?.[tourState.tourId];
      const step = tour?.steps?.[tourState.stepIndex];
      if (tourState.awaitingPoi || step?.type === 'poi-select') {
        seasonsInset.hide();
      } else {
        seasonsInset.update(sun);
      }
    } else {
      seasonsInset.hide();
    }
  };

  api.hooks.onPointSet(({ lat, lon }) => {
    if (!tourState?.active || !tourState.awaitingPoi) return;
    tourState.poi = { lat, lon };
    tourState.awaitingPoi = false;
    api.resetClickCount?.();
    tours.updateTourStepCard();
    updateTourPoiSummary(api.getLastSubpoints?.()?.sun);
    api.setCameraFocusLat?.(lat);
  });

  api.hooks.onUpdate(({ sun }) => {
    seasonsOverlay.drawLatitudeBand(sun);
    updateInsetForTour(sun);
    updateTourPoiSummary(sun);
  });

  tours.bindUi();
  tours.updateTourAvailability();
  tours.updateTourStepCard();
  tours.applyTourCopy();
  addEventListener('resize', tours.updateTourAvailability);
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
        setActiveIndex(0);
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

  if (!tourState?.active && (!isMobile() || allowMobileTours)) {
    tours.startTour('seasons');
  }
  if (typeof api.updateCelestial === 'function') {
    api.updateCelestial();
  }
}
