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
  const isMobile = () => window.innerWidth <= 900;
  const uiDir = document.documentElement.dir || 'ltr';
  const parseBool = (value, fallback) => {
    if (value === undefined) return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  };
  const resetOnExit = parseBool(document.body?.dataset?.tourResetOnExit, false);
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
    const last = api.getLastSubpoints?.();
    if (api.applyCameraMode) api.applyCameraMode(last?.sun);
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
  const mobileTabs = document.getElementById('mobileTabs');
  if (mobileTabs) {
    mobileTabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-target]');
      if (!button) return;
      const target = document.getElementById(button.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
  }

  if (!tourState?.active && !isMobile()) {
    tours.startTour('seasons');
  }
  if (typeof api.updateCelestial === 'function') {
    api.updateCelestial();
  }
}
