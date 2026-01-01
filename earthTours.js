export const createEarthTours = ({
  copyText,
  formatCopy,
  uiDir,
  isMobile,
  allowMobileTours = false,
  resetOnExit = false,
  tourUi,
  collapseInfoPanelForTour,
  restoreInfoPanelAfterTour,
  onTourStart,
  onTourExit,
  setPoint,
  updateCelestial,
  updateTourPoiSummary,
  applyCameraMode,
  getLastSubpoints,
  getCameraMode,
  setCameraMode,
  cameraModeButtons,
  datetimeInput,
  twilightInput,
  twilightValue,
  setTimeOverride,
  startTimePlayback,
  stopTimePlayback,
  formatUTC,
  roundToMinute,
  parseUTC,
  SIDEREAL_MS,
  seasonDate,
  planetGroup,
  earth,
  earthBaseYaw,
  getBasePlanetYaw,
  setBasePlanetYaw,
  resetClickCount,
  mathUtils
}) => {
  const tourDefs = {
    seasons: {
      id: 'seasons',
      titleKey: 'tour_seasons_title',
      title: 'Day/night through the seasons',
      steps: [
        {
          type: 'poi-select',
          titleKey: 'tour_seasons_step0_title',
          title: 'Pick a place',
          bodyKey: 'tour_seasons_step0_body',
          body: 'Click the globe (or enter lat/lon and press "Use typed point"). We will track how daylight changes here.'
        },
        {
          type: 'scene',
          titleKey: 'tour_seasons_step1_title',
          title: 'March equinox',
          bodyKey: 'tour_seasons_step1_body',
          body: 'Day and night are roughly equal everywhere. Your point should see ~12h daylight.',
          datetime: seasonDate(3, 20, 12),
          twilightAngle: 6
        },
        {
          type: 'scene',
          titleKey: 'tour_seasons_step2_title',
          title: 'June solstice',
          bodyKey: 'tour_seasons_step2_body',
          body: 'Northern points enjoy longer days; southern points get shorter ones.',
          datetime: seasonDate(6, 21, 12),
          twilightAngle: 6
        },
        {
          type: 'scene',
          titleKey: 'tour_seasons_step3_title',
          title: 'September equinox',
          bodyKey: 'tour_seasons_step3_body',
          body: 'Day and night balance again as the subsolar point crosses the equator.',
          datetime: seasonDate(9, 22, 12),
          twilightAngle: 6
        },
        {
          type: 'scene',
          titleKey: 'tour_seasons_step4_title',
          title: 'December solstice',
          bodyKey: 'tour_seasons_step4_body',
          body: 'Southern summer / northern winter. Daylight flips from June.',
          datetime: seasonDate(12, 21, 12),
          twilightAngle: 6
        }
      ]
    }
  };

  const tourState = {
    active: false,
    tourId: 'seasons',
    stepIndex: 0,
    poi: null,
    awaitingPoi: false,
    currentPreset: null,
    saved: null
  };
  let tourTwilightAngle = null;

  const resetObject = (target, next) => {
    Object.keys(target).forEach((key) => {
      delete target[key];
    });
    Object.assign(target, next);
  };

  const setTourAlert = (text) => {
    if (!tourUi.alert) return;
    if (!text) {
      tourUi.alert.style.display = 'none';
      tourUi.alert.textContent = '';
      return;
    }
    tourUi.alert.style.display = 'block';
    tourUi.alert.textContent = text;
  };

  const updateTourAvailability = () => {
    const mobile = isMobile();
    if (tourUi.mobileMsg) {
      tourUi.mobileMsg.style.display = (mobile && !allowMobileTours) ? 'block' : 'none';
    }
    if (tourUi.desktopControls) {
      tourUi.desktopControls.style.display = (mobile && !allowMobileTours) ? 'none' : 'block';
    }
    if (mobile && !allowMobileTours && tourState.active) exitTour(true);
  };

  const readPoiFromInputs = () => {
    const lat = parseFloat(document.getElementById('lat1').value);
    const lon = parseFloat(document.getElementById('lon1').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat: mathUtils.clamp(lat, -90, 90),
      lon: mathUtils.euclideanModulo(lon + 180, 360) - 180
    };
  };

  const updateTourStepCard = () => {
    const tour = tourDefs[tourState.tourId] || tourDefs.seasons;
    const step = tour.steps[tourState.stepIndex] || tour.steps[0];
    if (tourUi.section) {
      tourUi.section.style.display = tourState.active ? 'block' : 'none';
    }
    if (tourUi.card) tourUi.card.style.display = tourState.active ? 'block' : 'none';
    if (tourUi.start) tourUi.start.style.display = (!tourState.active && !isMobile()) ? 'inline-block' : 'none';
    if (tourUi.useTypedPoi) tourUi.useTypedPoi.style.display = (tourState.active && tourState.awaitingPoi) ? 'block' : 'none';
    if (!tourState.active) {
      setTourAlert('');
      return;
    }
    if (tourUi.title) {
      tourUi.title.textContent = step.title || tour.title;
      tourUi.title.dir = uiDir;
    }
    if (tourUi.body) {
      tourUi.body.innerHTML = '';
      if (step.body) {
        const p = document.createElement('p');
        p.textContent = step.body;
        p.dir = uiDir;
        tourUi.body.appendChild(p);
      }
    }
    if (tourUi.progress) {
      tourUi.progress.textContent = formatCopy(
        'tourStepProgress',
        'Step {current} / {total}',
        { current: tourState.stepIndex + 1, total: tour.steps.length }
      );
    }
    const atStart = tourState.stepIndex === 0;
    const atEnd = tourState.stepIndex === tour.steps.length - 1;
    if (tourUi.prev) {
      const hidePrev = atStart || step.type === 'poi-select';
      tourUi.prev.style.display = hidePrev ? 'none' : 'inline-block';
      tourUi.prev.disabled = atStart;
    }
    if (tourUi.next) {
      const needsPoi = step.type === 'poi-select' || tourState.awaitingPoi;
      tourUi.next.disabled = (needsPoi && !tourState.poi) || atEnd;
      tourUi.next.style.display = atEnd ? 'none' : 'inline-block';
    }
    const poiText = tourState.poi
      ? formatCopy(
          'tourPoiLocked',
          'POI locked: lat {lat}, lon {lon}',
          { lat: tourState.poi.lat.toFixed(2), lon: tourState.poi.lon.toFixed(2) }
        )
      : copyText('tourPoiPrompt', 'Pick a point to continue.');
    setTourAlert(tourState.awaitingPoi ? poiText : '');
    const last = getLastSubpoints ? getLastSubpoints() : null;
    updateTourPoiSummary(last?.sun);
  };

  const startTourRotation = (options = {}) => {
    if (typeof startTimePlayback === 'function') startTimePlayback(options);
  };

  const stopTourRotation = (options = {}) => {
    if (typeof stopTimePlayback === 'function') stopTimePlayback(options);
  };

  const applyTourStep = (step) => {
    if (step.type === 'poi-select') {
      tourState.awaitingPoi = true;
      updateTourStepCard();
      return;
    }
    stopTourRotation();
    tourState.awaitingPoi = false;
    if (!tourState.poi) {
      const fallbackPoi = readPoiFromInputs() || { lat: 0, lon: 0 };
      tourState.poi = fallbackPoi;
      setPoint(0, fallbackPoi.lat, fallbackPoi.lon);
    } else {
      setPoint(0, tourState.poi.lat, tourState.poi.lon);
    }
    const targetDate = step.datetime ? parseUTC(step.datetime) : null;
    if (targetDate) {
      setTimeOverride(targetDate); // keep full precision for tours; UI rounds to minutes.
      datetimeInput.value = formatUTC(roundToMinute(targetDate));
    }
    if (tourState.active) {
      if (tourTwilightAngle === null) {
        const fallback = Number.isFinite(step.twilightAngle) ? step.twilightAngle : parseFloat(twilightInput.value);
        tourTwilightAngle = Number.isFinite(fallback) ? fallback : 0;
      }
      twilightInput.value = tourTwilightAngle;
      twilightValue.textContent = `${tourTwilightAngle} deg`;
    }
    if (tourState.active && tourState.tourId === 'seasons') {
      setCameraMode('dawn');
      cameraModeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === getCameraMode()));
    }
    setBasePlanetYaw(0);
    planetGroup.rotation.y = getBasePlanetYaw();
    earth.rotation.y = earthBaseYaw;
    updateTourStepCard();
    updateCelestial();
    if (!step.noRotation) startTourRotation({ baseDate: targetDate });
  };

  const goToTourStep = (index) => {
    const tour = tourDefs[tourState.tourId];
    if (!tour) return;
    const clamped = Math.max(0, Math.min(index, tour.steps.length - 1));
    tourState.stepIndex = clamped;
    applyTourStep(tour.steps[clamped]);
    const last = getLastSubpoints ? getLastSubpoints() : null;
    updateTourPoiSummary(last?.sun);
  };

  const advanceTourStep = (delta) => {
    if (!tourState.active) return;
    const tour = tourDefs[tourState.tourId];
    if (!tour) return;
    const next = Math.max(0, Math.min(tour.steps.length - 1, tourState.stepIndex + delta));
    if (next === tourState.stepIndex) return;
    goToTourStep(next);
  };

  const startTour = (tourId = 'seasons') => {
    if (isMobile() && !allowMobileTours) {
      setTourAlert('Tours are available on desktop screens.');
      return;
    }
    collapseInfoPanelForTour();
    const tour = tourDefs[tourId] || tourDefs.seasons;
    resetObject(tourState, {
      active: true,
      tourId: tour.id,
      stepIndex: 0,
      poi: null,
      awaitingPoi: false,
      currentPreset: null,
      saved: {
        datetime: datetimeInput.value,
        twilight: twilightInput.value,
        cameraMode: getCameraMode()
      }
    });
    resetClickCount();
    if (typeof onTourStart === 'function') onTourStart(tourState);
    const initTwilight = parseFloat(twilightInput.value);
    tourTwilightAngle = Number.isFinite(initTwilight) ? initTwilight : null;
    setBasePlanetYaw(0);
    planetGroup.rotation.y = getBasePlanetYaw();
    updateTourStepCard();
    goToTourStep(0);
  };

  const exitTour = (silent = false) => {
    if (!tourState.active) return;
    const saved = tourState.saved;
    stopTourRotation();
    restoreInfoPanelAfterTour();
    if (typeof onTourExit === 'function') onTourExit(tourState);
    resetObject(tourState, {
      active: false,
      tourId: null,
      stepIndex: 0,
      poi: null,
      awaitingPoi: false,
      currentPreset: null,
      saved: null
    });
    tourTwilightAngle = null;
    setBasePlanetYaw(0);
    planetGroup.rotation.y = getBasePlanetYaw();
    if (saved) {
      datetimeInput.value = saved.datetime;
      twilightInput.value = saved.twilight;
      twilightValue.textContent = `${saved.twilight} deg`;
      setCameraMode(saved.cameraMode);
      cameraModeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === getCameraMode());
      });
    }
    updateTourStepCard();
    if (!silent) updateCelestial();
  };

  const resetSeasonsTour = () => {
    if (!tourState.active || tourState.tourId !== 'seasons') {
      startTour('seasons');
    }
    stopTourRotation();
    setTimeOverride(null);
    const poi = readPoiFromInputs() || tourState.poi;
    if (poi) {
      tourState.poi = poi;
      tourState.awaitingPoi = false;
      setPoint(0, poi.lat, poi.lon);
      tourState.awaitingPoi = true;
    } else {
      tourState.awaitingPoi = true;
    }
    tourState.stepIndex = 0;
    tourState.currentPreset = null;
    updateTourStepCard();
    updateCelestial();
  };

  const applyTourCopy = () => {
    Object.values(tourDefs).forEach((tour) => {
      if (tour.titleKey) tour.title = copyText(tour.titleKey, tour.title);
      tour.steps.forEach((step) => {
        if (step.titleKey) step.title = copyText(step.titleKey, step.title);
        if (step.bodyKey) step.body = copyText(step.bodyKey, step.body);
      });
    });
    updateTourStepCard();
  };

  const bindUi = () => {
    if (tourUi.start) tourUi.start.addEventListener('click', () => startTour('seasons'));
    if (tourUi.exit) tourUi.exit.addEventListener('click', () => {
      if (resetOnExit && tourState.tourId === 'seasons') {
        resetSeasonsTour();
        return;
      }
      exitTour();
    });
    if (tourUi.prev) tourUi.prev.addEventListener('click', () => advanceTourStep(-1));
    if (tourUi.next) tourUi.next.addEventListener('click', () => {
      if (tourState.awaitingPoi && !tourState.poi) {
        setTourAlert(copyText('tourPoiFirst', 'Pick a point first.'));
        return;
      }
      advanceTourStep(1);
    });
    if (tourUi.replay) tourUi.replay.addEventListener('click', () => {
      if (!tourState.active) return;
      const tour = tourDefs[tourState.tourId];
      if (!tour) return;
      applyTourStep(tour.steps[tourState.stepIndex]);
    });
    if (tourUi.useTypedPoi) tourUi.useTypedPoi.addEventListener('click', () => {
      if (!tourState.active) return;
      const poi = readPoiFromInputs();
      if (!poi) {
        setTourAlert(copyText('tourPoiInvalid', 'Enter a valid lat/lon first.'));
        return;
      }
      tourState.poi = poi;
      tourState.awaitingPoi = false;
      updateTourStepCard();
      advanceTourStep(1);
    });
  };

  return {
    tourDefs,
    tourState,
    applyTourCopy,
    updateTourAvailability,
    updateTourStepCard,
    startTour,
    exitTour,
    resetSeasonsTour,
    goToTourStep,
    advanceTourStep,
    startTourRotation,
    stopTourRotation,
    bindUi
  };
};
