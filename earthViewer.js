    import * as THREE from 'three';
    import {
  SIDEREAL_MS,
  normalizeDeg,
      OBLIQUITY_RAD,
      getSubpoints,
      daylightHours
    } from './astroCore.js';
    import {
      latLonToVec3,
    } from './viewerGlobe.js';
import { createGlobeViewerCore } from './globeViewerCore.js';
import { createViewerControls } from './viewerControls.js';
import { initEarthPanels } from './earthPanels.js';
import { bindGlobePointer } from './viewerPointer.js';
import { createEclipticOverlay } from './earthEclipticOverlay.js';
import { createDaylightPanel } from './earthDaylightPanel.js';
import { applyFaqSchema, applyLangSwitcherLinks } from './earthPageMeta.js';
import { formatUTC, parseUTC, caretUnit, rangeForUnit, adjustDate } from './viewerTime.js';
import {
      addSubpointMarker,
      addLatLonLines,
      addTerminator,
      addVisibilityHemisphere,
      addNightHemisphere,
      addTwilightBand
    } from './viewerOverlays.js';
import {
      addHighlightLines,
      buildGreatCircleArc,
      buildGreatCirclePoints,
      updatePointMetrics
    } from './earthPointUtils.js';
    const Astronomy = globalThis.Astronomy;

    const customPageLangMap = (typeof window !== 'undefined' && window.PAGE_LANG_MAP && typeof window.PAGE_LANG_MAP === 'object')
      ? window.PAGE_LANG_MAP
      : null;
    const pageLangMap = customPageLangMap || { en: 'index.html', ar: 'earth-ar.html' };
    const availableLangs = Object.keys(pageLangMap);
    const docLang = (document.documentElement.lang || '').toLowerCase();
    const appLang = pageLangMap[docLang] ? docLang : (availableLangs[0] || 'en');
    const uiDir = document.documentElement.dir || (appLang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.lang = appLang;
    document.documentElement.dir = uiDir;
    const parseBool = (value, fallback) => {
      if (value === undefined) return fallback;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return fallback;
    };
    const pageData = document.body?.dataset || {};
    const viewerConfig = {
      includeMeanSun: parseBool(pageData.includeMeanSun, false),
      includeMoon: parseBool(pageData.includeMoon, true),
      showEcliptic: parseBool(pageData.showEcliptic, false),
      allowPointSelection: parseBool(pageData.allowPointSelection, true),
      leftPanelsAlways: parseBool(pageData.leftPanelsAlways, false),
      mobilePanelsVisible: parseBool(pageData.mobilePanelsVisible, false),
      mobileCameraDistance: Number.parseFloat(pageData.mobileCameraDistance)
    };
    const singlePointMode = (typeof window !== 'undefined' && window.SINGLE_POINT === true);
    const EARTH_RADIUS_KM = 6371;
    const hookRegistry = {
      onUpdate: [],
      onResize: [],
      onPointSet: []
    };
    const addHook = (list, fn) => {
      if (typeof fn === 'function') list.push(fn);
    };
    const earthViewerHooks = {
      onUpdate: (fn) => addHook(hookRegistry.onUpdate, fn),
      onResize: (fn) => addHook(hookRegistry.onResize, fn),
      onPointSet: (fn) => addHook(hookRegistry.onPointSet, fn)
    };
    const runHooks = (list, payload) => {
      list.forEach((hook) => {
        try {
          hook(payload);
        } catch (err) {
          console.error('earthViewer hook error', err);
        }
      });
    };
    if (typeof window !== 'undefined') {
      window.earthViewerHooks = earthViewerHooks;
    }

    const pageStrings = (() => {
      const el = document.getElementById('pageStrings');
      if (!el) return {};
      try {
        const parsed = JSON.parse(el.textContent || '{}');
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch (err) {
        console.warn('Failed to parse pageStrings JSON.', err);
        return {};
      }
    })();
    const copyText = (key, fallback = '') => (
      typeof pageStrings[key] === 'string' ? pageStrings[key] : fallback
    );
    const formatCopy = (key, fallback, vars = {}) => {
      const template = copyText(key, fallback);
      return template.replace(/\{(\w+)\}/g, (_match, k) => (vars[k] ?? `{${k}}`));
    };
    const applyPageMeta = () => {
      applyFaqSchema({ appLang });
      applyLangSwitcherLinks({ appLang, pageLangMap, availableLangs });
    };
    const container = document.getElementById('scene');
    const {
      camera,
      renderer,
      controls,
      earth,
      planetGroup,
      baseCameraDistance,
      earthBaseYaw,
      groups: {
        gridGroup,
        userHighlightGroup,
        userMarkersGroup,
        userPathGroup,
        celestialGroup,
        terminatorGroup,
        visibilityGroup,
        eclipticGroup,
        tourHighlightGroup
      },
      render,
      resize: resizeCore
    } = createGlobeViewerCore({ container });
    const clearGroupWithDispose = (group) => {
      if (!group) return;
      while (group.children.length) {
        const child = group.children[0];
        group.remove(child);
        if (child.geometry?.dispose) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat?.dispose?.());
          } else {
            child.material.dispose?.();
          }
        }
      }
    };
    const eclipticOverlay = createEclipticOverlay({
      Astronomy,
      OBLIQUITY_RAD,
      eclipticGroup,
      latLonToVec3,
      normalizeDeg,
      clearGroupWithDispose
    });
    let basePlanetYaw = 0;
    let lastSubpoints = null;
    let timeOverride = null;
    let timePlayback = {
      active: false,
      startReal: 0,
      duration: 0,
      baseDate: null,
      progress: 0,
      timespanMs: null,
      stepMs: null,
      lastDateMs: null,
      lastUpdate: 0
    };
    let terminatorSide = 0;
    let markerScale = 1;
    let cameraFocusLat = 0;
    let moonOverlayEnabled = viewerConfig.includeMoon;
    const markerRadius = () => {
      const base = innerWidth <= 900 ? 0.018 : 0.01;
      return base * markerScale;
    };
    const { updateDurations, formatHours } = createDaylightPanel({
      earthRadiusKm: EARTH_RADIUS_KM,
      copyText,
      formatCopy,
      singlePointMode,
      daylightHours,
      updatePointMetrics
    });

    function plotPoints() {
      // Clear previous markers/highlights
      clearGroupWithDispose(userHighlightGroup);
      clearGroupWithDispose(userMarkersGroup);
      clearGroupWithDispose(userPathGroup);

      const raw = [];
      const lat1El = document.getElementById('lat1');
      const lon1El = document.getElementById('lon1');
      if (lat1El && lon1El) {
        raw.push({ lat: lat1El.value, lon: lon1El.value, color: 0xff6699 });
      }
      if (!singlePointMode) {
        const lat2El = document.getElementById('lat2');
        const lon2El = document.getElementById('lon2');
        if (lat2El && lon2El) {
          raw.push({ lat: lat2El.value, lon: lon2El.value, color: 0x66ff99 });
        }
      }
      const pts = raw
        .filter(p => p.lat !== '' && p.lon !== '')
        .map(p => ({
          lat: THREE.MathUtils.clamp(parseFloat(p.lat), -90, 90),
          lon: THREE.MathUtils.euclideanModulo(parseFloat(p.lon) + 180, 360) - 180,
          color: p.color
        }));

      const markerGeom = new THREE.SphereGeometry(markerRadius(), 16, 16);

      pts.forEach(p => {
        const pos = latLonToVec3(p.lat, p.lon, 1.01);
        const marker = new THREE.Mesh(markerGeom, new THREE.MeshBasicMaterial({ color: p.color }));
        marker.position.copy(pos);
        userMarkersGroup.add(marker);
        addHighlightLines({ group: userHighlightGroup, latDeg: p.lat, lonDeg: p.lon, color: p.color });
      });

      if (!singlePointMode && pts.length >= 2) {
        const a = latLonToVec3(pts[0].lat, pts[0].lon, 1).normalize();
        const b = latLonToVec3(pts[1].lat, pts[1].lon, 1).normalize();
        const pathColor = 0x8b5cf6;
        const circlePts = buildGreatCirclePoints(a, b, 360, 1.012);
        if (circlePts) {
          const circleGeom = new THREE.BufferGeometry().setFromPoints(circlePts);
          const circleMat = new THREE.LineDashedMaterial({
            color: pathColor,
            dashSize: 0.01,
            gapSize: 0.004,
            transparent: true,
            opacity: 0.8
          });
          const circleLine = new THREE.Line(circleGeom, circleMat);
          circleLine.computeLineDistances();
          userPathGroup.add(circleLine);
        }
        const arcPts = buildGreatCircleArc(a, b, 120, 1.014);
        if (arcPts) {
          const curve = new THREE.CatmullRomCurve3(arcPts, false);
          const tube = new THREE.TubeGeometry(curve, Math.max(64, arcPts.length * 2), 0.0025, 8, false);
          const mesh = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: pathColor, transparent: true, opacity: 0.95 }));
          userPathGroup.add(mesh);
        }
      }

      updateDurations(lastSubpoints?.sun, lastSubpoints?.moon);
      render();
    }
    function setPoint(index, latDeg, lonDeg) {
      const targetIndex = singlePointMode ? 0 : index;
      const latInput = document.getElementById(targetIndex === 0 ? 'lat1' : 'lat2');
      const lonInput = document.getElementById(targetIndex === 0 ? 'lon1' : 'lon2');
      if (!latInput || !lonInput) return;
      latInput.value = latDeg.toFixed(2);
      lonInput.value = lonDeg.toFixed(2);
      plotPoints();
      runHooks(hookRegistry.onPointSet, { index: targetIndex, lat: latDeg, lon: lonDeg });
    }
    const setMarkerScale = (value) => {
      markerScale = Number.isFinite(value) ? value : 1;
      plotPoints();
    };
    const getMarkerScale = () => markerScale;
    const setCameraFocusLat = (value) => {
      if (!Number.isFinite(value)) {
        cameraFocusLat = 0;
        return;
      }
      cameraFocusLat = THREE.MathUtils.clamp(value, -90, 90);
    };
    const getCameraFocusLat = () => cameraFocusLat;
    const setMoonOverlayEnabled = (value) => {
      moonOverlayEnabled = !!value;
    };
    const getMoonOverlayEnabled = () => moonOverlayEnabled;
    const setTimeOverride = (value) => {
      if (!value) {
        timeOverride = null;
        return;
      }
      timeOverride = value instanceof Date ? value : new Date(value);
    };
    const getTimeOverride = () => timeOverride;

    document.getElementById('plotBtn').addEventListener('click', (e) => {
      e.preventDefault();
      plotPoints();
    });
    document.getElementById('clearPointsBtn').addEventListener('click', (e) => {
      e.preventDefault();
      const lat1El = document.getElementById('lat1');
      const lon1El = document.getElementById('lon1');
      if (lat1El) lat1El.value = '';
      if (lon1El) lon1El.value = '';
      if (!singlePointMode) {
        const lat2El = document.getElementById('lat2');
        const lon2El = document.getElementById('lon2');
        if (lat2El) lat2El.value = '';
        if (lon2El) lon2El.value = '';
      }
      clickCount = 0;
      plotPoints();
    });
    let cameraModeButtons = [];
    let datetimeInput = null;
    let twilightInput = null;
    let twilightValue = null;
    let cameraMode = 'geo';
    function setCameraSunSync(subsolar) {
      if (!subsolar) return false;
      const radius = Math.max(1.5, camera.position.length());
      const pos = latLonToVec3(subsolar.lat, subsolar.lon, radius);
      camera.position.copy(pos);
      controls.target.set(0, 0, 0);
      controls.update();
      return true;
    }
    function setCameraTerminator(subsolar, side) {
      if (!subsolar) return false;
      const radius = Math.max(1.5, camera.position.length());
      const latTarget = cameraFocusLat;
      const lonTarget = subsolar.lon + side * 90; // look along the terminator toward dawn/dusk
      const pos = latLonToVec3(latTarget, lonTarget, radius);
      camera.position.copy(pos);
      controls.target.set(0, 0, 0);
      controls.update();
      return true;
    }
    function applyCameraMode(subsolar = lastSubpoints?.sun) {
      if (cameraMode === 'sun') {
        setCameraSunSync(subsolar);
        return;
      }
      if (cameraMode === 'dawn') {
        terminatorSide = -1;
        setCameraTerminator(subsolar, terminatorSide);
        return;
      }
      if (cameraMode === 'dusk') {
        terminatorSide = 1;
        setCameraTerminator(subsolar, terminatorSide);
        return;
      }
      // geo: do nothing, leave user-controlled view
    }
    // Hover and click on globe to place points
    const hoverLabel = document.getElementById('hoverLabel');
    let clickCount = 0; // A on first click, B on second, then keep updating B
    bindGlobePointer({
      renderer,
      camera,
      globe: earth,
      getLocalVector: (point) => {
        planetGroup.updateMatrixWorld();
        return planetGroup.worldToLocal(point.clone()).normalize();
      },
      onHover: (lat, lon) => {
        if (!hoverLabel) return;
        if (lat === null || lon === null) {
          hoverLabel.textContent = '';
          return;
        }
        hoverLabel.textContent = formatCopy(
          'hoverLabel',
          'Hover: lat {lat}, lon {lon}',
          { lat: lat.toFixed(2), lon: lon.toFixed(2) }
        );
      },
      onClick: (lat, lon) => {
        if (lat === null || lon === null) return;
        if (!viewerConfig.allowPointSelection) return;
        if (singlePointMode) {
          setPoint(0, lat, lon);
          clickCount = 1;
        } else if (clickCount === 0) {
          setPoint(0, lat, lon);
          clickCount = 1;
        } else {
          setPoint(1, lat, lon);
          clickCount = 2; // stay updating B
        }
      },
      onLeave: () => {
        if (hoverLabel) hoverLabel.textContent = '';
      }
    });
    // set default datetime to now (UTC)
    function seedDateTime() {
      const dt = document.getElementById('datetime');
      dt.value = formatUTC(new Date());
    }
    function roundToMinute(date) {
      return new Date(Math.round(date.getTime() / 60000) * 60000);
    }
    const shiftSidereal = (mult) => {
      const current = parseUTC(document.getElementById('datetime').value) ?? new Date();
      const shifted = new Date(current.getTime() + mult * SIDEREAL_MS);
      document.getElementById('datetime').value = formatUTC(shifted);
      updateCelestial();
    };
    const controlsUi = createViewerControls({
      parseUTC,
      formatUTC,
      roundToMinute,
      caretUnit,
      rangeForUnit,
      adjustDate,
      onDateInput: updateCelestial,
      onDateChange: updateCelestial,
      onNowClick: seedDateTime,
      onSiderealShift: shiftSidereal,
      onTwilightInput: (value) => {
        updateCelestial();
      },
      onVisibilityChange: () => {
        const sunToggle = document.getElementById('toggleSunVisibility');
        const moonToggle = document.getElementById('toggleMoonVisibility');
        const sunOn = sunToggle ? sunToggle.checked : true;
        const moonOn = moonToggle ? moonToggle.checked : false;
        visibilityGroup.children.forEach(mesh => {
          if (mesh.userData.body === 'sun') mesh.visible = sunOn;
          if (mesh.userData.body === 'moon') mesh.visible = moonOn;
        });
        render();
      },
      setCameraMode: (mode) => { cameraMode = mode; },
      applyCameraMode,
      visibilityToggleIds: ['toggleSunVisibility', 'toggleMoonVisibility']
    });
    ({ datetimeInput, twilightInput, twilightValue, cameraModeButtons } = controlsUi);
    const startTimePlayback = (options = {}) => {
      const base = options.baseDate ?? (parseUTC(datetimeInput.value) ?? new Date());
      const duration = typeof options.durationMs === 'number' ? options.durationMs : 28000;
      const timespan = typeof options.timespanMs === 'number' ? options.timespanMs : SIDEREAL_MS;
      const stepMs = typeof options.stepMs === 'number' ? options.stepMs : null;
      timePlayback = {
        active: true,
        startReal: performance.now(),
        duration,
        baseDate: base,
        progress: 0,
        timespanMs: timespan,
        stepMs,
        lastDateMs: null,
        lastUpdate: 0
      };
      setTimeOverride(base);
      planetGroup.rotation.y = basePlanetYaw;
      earth.rotation.y = earthBaseYaw;
      datetimeInput.value = formatUTC(roundToMinute(base));
    };
    const stopTimePlayback = (options = {}) => {
      basePlanetYaw = planetGroup.rotation.y;
      timePlayback.active = false;
      const preserve = options && typeof options === 'object' && options.preserveOverride;
      if (preserve && options.finalDate instanceof Date) {
        setTimeOverride(options.finalDate);
      } else if (!preserve) {
        setTimeOverride(null);
      }
      earth.rotation.y = earthBaseYaw;
    };
    document.querySelectorAll('.timeStep').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const unit = btn.dataset.unit;
        const delta = Number(btn.dataset.delta);
        const current = parseUTC(document.getElementById('datetime').value) ?? new Date();
        adjustDate(current, unit, delta);
        document.getElementById('datetime').value = formatUTC(current);
        updateCelestial();
      });
    });
    seedDateTime();
    function updateCelestial() {
      clearGroupWithDispose(celestialGroup);
      clearGroupWithDispose(terminatorGroup);
      clearGroupWithDispose(visibilityGroup);
      clearGroupWithDispose(tourHighlightGroup);
      planetGroup.updateMatrixWorld(true);
      const dtInput = document.getElementById('datetime').value;
      const date = timeOverride ?? (parseUTC(dtInput) ?? new Date());
      if (!viewerConfig.showEcliptic) {
        eclipticOverlay.clear();
      } else {
        eclipticOverlay.update(date);
      }
      const includeMeanSun = viewerConfig.includeMeanSun;
      const { sun, moon, meanSun } = getSubpoints(date, includeMeanSun);
      lastSubpoints = { sun, moon, meanSun };
      const markerGeom = new THREE.SphereGeometry(markerRadius(), 16, 16);

      const includeMoon = viewerConfig.includeMoon && moonOverlayEnabled;
      const bodies = [
        { body: 'sun', point: sun, color: 0xffdd55, showOverlay: false }, // sun overlay handled by night cap instead
        ...(meanSun ? [{ body: 'meanSun', point: meanSun, color: 0xff8800, showOverlay: false }] : []),
        ...(includeMoon ? [{ body: 'moon', point: moon, color: 0x55ddff, showOverlay: true }] : [])
      ];

      const moonToggle = document.getElementById('toggleMoonVisibility');
      const sunToggle = document.getElementById('toggleSunVisibility');
      const sunVis = sunToggle ? sunToggle.checked : true;
      const moonVis = moonToggle ? moonToggle.checked : false;
      bodies.forEach(obj => {
        const showVis = obj.body === 'moon' ? moonVis : sunVis;
        addSubpointMarker({
          group: celestialGroup,
          markerGeom,
          point: obj.point,
          color: obj.color,
          latLonToVec3
        });
        addLatLonLines({ group: celestialGroup, point: obj.point, color: obj.color });
        addTerminator({
          group: terminatorGroup,
          point: obj.point,
          color: obj.color,
          latLonToVec3,
          radius: 1.01
        });
        if (obj.showOverlay) {
          addVisibilityHemisphere({
            group: visibilityGroup,
            point: obj.point,
            color: obj.color,
            latLonToVec3,
            opacity: 0.16,
            visible: showVis,
            body: obj.body
          });
        }
      });

      if (sun) {
        addNightHemisphere({
          group: visibilityGroup,
          point: sun,
          latLonToVec3,
          color: 0x0a1f4d,
          opacity: 0.42,
          scale: 1.5,
          visible: sunVis,
          body: 'sun'
        });
      }

      const twilightAngle = Math.max(0, parseFloat(document.getElementById('twilightAngle').value) || 0);
      const nightOverlayEnabled = sunVis;
      if (twilightAngle > 0) {
        addTwilightBand({
          group: visibilityGroup,
          point: sun,
          latLonToVec3,
          angle: twilightAngle,
          color: 0xcc9933,
          opacity: nightOverlayEnabled ? 0.28 : 0.18,
          body: 'twilight'
        });
      }
      const fmt = (v) => v.toFixed(2);
      const latLabel = copyText('coordLatLabel', 'lat');
      const lonLabel = copyText('coordLonLabel', 'lon');
      const degLabel = copyText('coordDegLabel', 'deg');
      const info = `
        <div><strong>${copyText('subsolarRealLabel', 'Subsolar (real)')}:</strong> ${latLabel} ${fmt(sun.lat)} ${degLabel}, ${lonLabel} ${fmt(sun.lon)} ${degLabel}</div>
        ${meanSun ? `<div><strong>${copyText('subsolarMeanLabel', 'Subsolar (mean)')}:</strong> ${latLabel} ${fmt(meanSun.lat)} ${degLabel}, ${lonLabel} ${fmt(meanSun.lon)} ${degLabel}</div>` : ''}
        ${includeMoon ? `<div><strong>${copyText('sublunarLabel', 'Sublunar')}:</strong> ${latLabel} ${fmt(moon.lat)} ${degLabel}, ${lonLabel} ${fmt(moon.lon)} ${degLabel}</div>` : ''}
      `;
      document.getElementById('subpoints').innerHTML = info;
      updateDurations(sun, includeMoon ? moon : null);
      const camTarget = sun;
      applyCameraMode(camTarget);
      runHooks(hookRegistry.onUpdate, { date, sun, meanSun, moon, includeMoon });
      render();
    }

      // Plot initial defaults
      plotPoints();
      updateCelestial();

    // Hover coordinate display
    const leftPanels = document.getElementById('leftPanels');
    const infoPanel = document.getElementById('infoPanel');
    const sidePanels = document.getElementById('sidePanels');
    const toggleInfoBtn = document.getElementById('toggleInfoBtn');
    const toggleControlsBtn = document.getElementById('toggleControlsBtn');
    const isMobile = () => {
      if (typeof window === 'undefined') return false;
      const vv = window.visualViewport;
      if (vv && Number.isFinite(vv.width)) return vv.width <= 900;
      if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
      return innerWidth <= 900;
    };
    applyPageMeta();

    if (typeof window !== 'undefined') {
      window.earthViewerApi = {
        hooks: earthViewerHooks,
        groups: {
          userHighlightGroup,
          userMarkersGroup,
          userPathGroup,
          celestialGroup,
          terminatorGroup,
          visibilityGroup,
          eclipticGroup,
          tourHighlightGroup
        },
        planetGroup,
        earth,
        controls,
        baseCameraDistance,
        render,
        clearGroupWithDispose,
        latLonToVec3,
        copyText,
        formatCopy,
        parseUTC,
        formatUTC,
        updateCelestial,
        setPoint,
        getLastSubpoints: () => lastSubpoints,
        setTimeOverride,
        getTimeOverride,
        startTimePlayback,
        stopTimePlayback,
        getTimePlayback: () => timePlayback,
        setMarkerScale,
        getMarkerScale,
        setCameraFocusLat,
        getCameraFocusLat,
        setMoonOverlayEnabled,
        getMoonOverlayEnabled,
        applyCameraMode,
        getCameraMode: () => cameraMode,
        setCameraMode: (mode) => { cameraMode = mode; },
        cameraModeButtons,
        datetimeInput,
        twilightInput,
        twilightValue,
        roundToMinute,
        seedDateTime,
        earthBaseYaw,
        getBasePlanetYaw: () => basePlanetYaw,
        setBasePlanetYaw: (value) => { basePlanetYaw = value; },
        resetClickCount: () => { clickCount = 0; },
        mathUtils: THREE.MathUtils,
        formatHours
      };
    }

    initEarthPanels({
      leftPanels,
      infoPanel,
      sidePanels,
      toggleInfoBtn,
      toggleControlsBtn,
      leftPanelsAlways: viewerConfig.leftPanelsAlways,
      mobilePanelsVisible: viewerConfig.mobilePanelsVisible,
      isMobile
    });

    const applyMobileCameraDistance = () => {
      if (!isMobile()) return;
      if (!Number.isFinite(viewerConfig.mobileCameraDistance)) return;
      const next = Math.max(1.5, viewerConfig.mobileCameraDistance);
      if (Math.abs(camera.position.length() - next) > 0.01) {
        camera.position.setLength(next);
        controls.update();
      }
    };
    applyMobileCameraDistance();

      function onResize() {
        const size = resizeCore();
        applyMobileCameraDistance();
        runHooks(hookRegistry.onResize, { width: size.width, height: size.height });
        render();
      }
    addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      if (timePlayback.active) {
        const now = performance.now();
        const t = (now - timePlayback.startReal) / timePlayback.duration;
        timePlayback.progress = Math.min(1, Math.max(0, t));
        const timespan = timePlayback.timespanMs ?? SIDEREAL_MS;
        let offsetMs = timespan * timePlayback.progress;
        const stepMs = timePlayback.stepMs;
        if (timePlayback.progress >= 1) {
          offsetMs = timespan;
        } else if (typeof stepMs === 'number' && stepMs > 0) {
          offsetMs = Math.floor(offsetMs / stepMs) * stepMs;
          if (offsetMs > timespan) offsetMs = timespan;
        }
        const currentDate = new Date(timePlayback.baseDate.getTime() + offsetMs);
        earth.rotation.y = earthBaseYaw;
        setTimeOverride(currentDate);
        document.getElementById('datetime').value = formatUTC(roundToMinute(currentDate));
        const quantized = typeof stepMs === 'number' && stepMs > 0;
        let didUpdate = false;
        if (quantized) {
          const ms = currentDate.getTime();
          if (timePlayback.lastDateMs !== ms) {
            timePlayback.lastDateMs = ms;
            updateCelestial();
            timePlayback.lastUpdate = now;
            didUpdate = true;
          }
        } else if (!timePlayback.lastUpdate || now - timePlayback.lastUpdate > 50) {
          updateCelestial();
          timePlayback.lastUpdate = now;
          didUpdate = true;
        }
        if (timePlayback.progress >= 1) {
          stopTimePlayback({ preserveOverride: true, finalDate: currentDate });
          if (!didUpdate) updateCelestial();
        }
      }
      controls.update();
      render();
    }
    animate();
