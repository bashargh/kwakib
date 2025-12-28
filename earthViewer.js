    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import {
      TAU,
      SIDEREAL_MS,
      anchorYear,
      isLeapYear,
      daysInYear,
      pad2,
      EOT_ZERO_MS,
      normalizeDeg,
      wrap360,
      OBLIQUITY_RAD,
      alignMeanRealNearEotZero,
      seasonDate,
      vectorToRaDec,
      vectorToEclipticLonDeg,
      sunEclipticLonDeg,
      subpointFromBody,
      meanSunSubpoint,
      getSubpoints,
      sunDeclinationForYear,
      daylightHoursAtAltitude,
      daylightHours
    } from './astroCore.js';
    import {
      addEarthGrid,
      createNightHemisphere,
      createTerminatorCircle,
      createTwilightBand,
      createVisibilityHemisphere,
      latLonToVec3,
      loadEarthTexture
    } from './viewerGlobe.js';
    const Astronomy = globalThis.Astronomy;

    const customPageLangMap = (typeof window !== 'undefined' && window.PAGE_LANG_MAP && typeof window.PAGE_LANG_MAP === 'object')
      ? window.PAGE_LANG_MAP
      : null;
    const pageLangMap = customPageLangMap || { en: 'index.html', ar: 'earth-ar.html' };
    const availableLangs = Object.keys(pageLangMap);
    const forcedTourParam = (typeof window !== 'undefined' && window.FORCED_TOUR) || new URLSearchParams(location.search).get('tour');
    let normalizedForcedTour = typeof forcedTourParam === 'string' ? forcedTourParam.trim().toLowerCase() : null;
    const docLang = (document.documentElement.lang || '').toLowerCase();
    const appLang = pageLangMap[docLang] ? docLang : (availableLangs[0] || 'en');
    const uiDir = document.documentElement.dir || (appLang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.lang = appLang;
    document.documentElement.dir = uiDir;
    const isAnalemmaPage = document.body?.classList.contains('analemma-page');
    const isMainEarthPage = document.body?.classList.contains('earth-main');
    const isSeasonsPage = document.body?.classList.contains('seasons-page');
    if (isAnalemmaPage) normalizedForcedTour = null;
    const singlePointMode = (typeof window !== 'undefined' && window.SINGLE_POINT === true);
    const EARTH_RADIUS_KM = 6371;

    const pageCopy = (() => {
      const el = document.getElementById('earthCopy');
      if (!el) return {};
      try {
        const parsed = JSON.parse(el.textContent || '{}');
        return (parsed && typeof parsed === 'object') ? parsed : {};
      } catch (err) {
        console.warn('Failed to parse earthCopy JSON.', err);
        return {};
      }
    })();
    const copyText = (key, fallback = '') => (
      typeof pageCopy[key] === 'string' ? pageCopy[key] : fallback
    );
    const formatCopy = (key, fallback, vars = {}) => {
      const template = copyText(key, fallback);
      return template.replace(/\{(\w+)\}/g, (_match, k) => (vars[k] ?? `{${k}}`));
    };
    const buildLangUrl = (code) => {
      const target = pageLangMap[code];
      if (!target) return null;
      const url = new URL(location.href);
      url.searchParams.delete('lang');
      url.pathname = url.pathname.replace(/[^/]*$/, target);
      return url.toString();
    };

    // Guided tour definitions (season walkthrough and analemma microscope).
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
      },
      analemma: {
        id: 'analemma',
        titleKey: 'tour_analemma_title',
        title: 'Analemma (equation of time)',
        steps: [
          {
            type: 'poi-select',
            titleKey: 'tour_analemma_step0_title',
            title: 'Choose a point',
            bodyKey: 'tour_analemma_step0_body',
            body: 'Pick a site; we will compare the mean (reference) Sun with the apparent Sun at your meridian.',
          },
          {
            type: 'scene',
            titleKey: 'tour_analemma_step1_title',
            title: 'Baseline: mean noon',
            bodyKey: 'tour_analemma_step1_body',
            body: 'Start near the day when equation of time is ~0. At local noon the mean and real Sun align over your longitude. Inset: top compares mean vs real longitude over one sidereal day; bottom shows the real daily motion vector with longitude scaled by cos(dec).',
            alignMeanReal: true,
            noRotation: true,
            cameraMode: 'sun',
            cameraTarget: 'meanSun',
            showEot: true,
            showInset: true,
            showAnalemmaArcs: true,
            highlightMeridian: true
          },
          {
            type: 'scene',
            titleKey: 'tour_analemma_step2_title',
            title: 'Eccentricity (speed change)',
            bodyKey: 'tour_analemma_step2_body',
            body: 'Near perihelion in early January Earth moves faster, so the apparent Sun runs ahead of the mean Sun. Solar noon shifts earlier, stretching the analemma east-west.',
            alignDateMs: Date.UTC(anchorYear, 0, 3, 12, 0, 0, 0),
            noRotation: true,
            cameraMode: 'sun',
            cameraTarget: 'meanSun',
            showEot: true,
            showInset: true,
            showAnalemmaArcs: true
          },
          {
            type: 'scene',
            titleKey: 'tour_analemma_step3_title',
            title: 'Obliquity (tilt projection)',
            bodyKey: 'tour_analemma_step3_body',
            body: 'Around solstice the Sun is far north or south. Its daily motion tilts out of the equatorial plane, so the east-west component is compressed by cos(dec). This adds the vertical loop and another time offset.',
            alignDateMs: Date.UTC(anchorYear, 5, 21, 12, 0, 0, 0),
            noRotation: true,
            cameraMode: 'sun',
            cameraTarget: 'meanSun',
            showEot: true,
            showInset: true,
            showAnalemmaArcs: true
          },
          {
            type: 'scene',
            titleKey: 'tour_analemma_step4_title',
            title: 'Full-year trace',
            bodyKey: 'tour_analemma_step4_body',
            body: 'Hold mean noon fixed at your longitude and step through a full year. The real subsolar point traces the analemma as eccentricity and tilt combine.',
            offsetFrom: 'anchor',
            offsetMs: 0,
            rotationTimespanMs: Date.UTC(anchorYear + 1, 3, 15, 12, 0, 0, 0) - Date.UTC(anchorYear, 3, 15, 12, 0, 0, 0),
            rotationDurationMs: 45000,
            rotationStepMs: 86400000,
            cameraMode: 'sun',
            cameraTarget: 'meanSun',
            showAnalemmaTrace: true,
            showInset: true
          },
          {
            type: 'scene',
            titleKey: 'tour_analemma_step5_title',
            title: 'Explore any date',
            bodyKey: 'tour_analemma_step5_body',
            body: 'Use the date/time input to jump anywhere; the inset and equation-of-time readout update for your longitude.',
            noRotation: true,
            cameraMode: 'sun',
            cameraTarget: 'meanSun',
            showEot: true,
            showInset: true,
            showAnalemmaArcs: true
          }
        ]
      }
    };
    if (!normalizedForcedTour || !tourDefs[normalizedForcedTour]) normalizedForcedTour = null;
    function applyTourCopy() {
      Object.values(tourDefs).forEach((tour) => {
        if (tour.titleKey) tour.title = copyText(tour.titleKey, tour.title);
        tour.steps.forEach((step) => {
          if (step.titleKey) step.title = copyText(step.titleKey, step.title);
          if (step.bodyKey) step.body = copyText(step.bodyKey, step.body);
        });
      });
      if (typeof updateTourStepCard === 'function') updateTourStepCard();
    }
    function applyFaqSchema() {
      const schemaEl = document.getElementById('faqSchema');
      if (!schemaEl) return;
      const qaPairs = [
        {
          q: document.getElementById('faqQ1')?.textContent || '',
          a: document.getElementById('faqA1')?.textContent || ''
        },
        {
          q: document.getElementById('faqQ2')?.textContent || '',
          a: document.getElementById('faqA2')?.textContent || ''
        },
        {
          q: document.getElementById('faqQ3')?.textContent || '',
          a: document.getElementById('faqA3')?.textContent || ''
        }
      ].filter(pair => pair.q && pair.a);
      const mainEntity = qaPairs.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a }
      }));
      const payload = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: [appLang],
        mainEntity
      };
      schemaEl.textContent = JSON.stringify(payload, null, 2);
    }
    function applyLangSwitcherLinks() {
      const langSwitcher = document.getElementById('langSwitcher');
      const hideLangSwitcher = (typeof window !== 'undefined' && window.HIDE_LANG_SWITCHER === true) || availableLangs.length < 2;
      if (langSwitcher && hideLangSwitcher) langSwitcher.style.display = 'none';
      const linkEn = document.getElementById('langLinkEn');
      const linkAr = document.getElementById('langLinkAr');
      const hrefEn = buildLangUrl('en');
      const hrefAr = buildLangUrl('ar');
      if (linkEn) {
        if (hrefEn) {
          linkEn.href = hrefEn;
          linkEn.classList.toggle('active', appLang === 'en');
        } else {
          linkEn.style.display = 'none';
        }
      }
      if (linkAr) {
        if (hrefAr) {
          linkAr.href = hrefAr;
          linkAr.classList.toggle('active', appLang === 'ar');
        } else {
          linkAr.style.display = 'none';
        }
      }
      const head = document.head;
      document.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove());
      availableLangs.forEach((code) => {
        const href = buildLangUrl(code);
        if (!href) return;
        const link = document.createElement('link');
        link.rel = 'alternate';
        link.hreflang = code;
        link.href = href;
        link.dataset.hreflang = '1';
        head.appendChild(link);
      });
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        head.appendChild(canonical);
      }
      const forcedCanonical = (typeof window !== 'undefined' && typeof window.FORCED_CANONICAL === 'string')
        ? window.FORCED_CANONICAL
        : null;
      canonical.href = forcedCanonical || buildLangUrl(appLang) || location.href;
      const ogLocale = document.querySelector('meta[property="og:locale"]');
      if (ogLocale) ogLocale.setAttribute('content', appLang === 'ar' ? 'ar_AR' : 'en_US');
    }
    const container = document.getElementById('scene');
    const getSceneSize = () => {
      const rect = container?.getBoundingClientRect();
      const width = Math.max(1, rect?.width || innerWidth);
      const height = Math.max(1, rect?.height || innerHeight);
      return { width, height };
    };
    const scene = new THREE.Scene();
    const initialSize = getSceneSize();
    const camera = new THREE.PerspectiveCamera(45, initialSize.width / initialSize.height, 0.1, 100);
    const baseCameraDistance = 3;
    camera.position.set(0, 0, baseCameraDistance);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(initialSize.width, initialSize.height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if (container) container.appendChild(renderer.domElement);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const texLoader = new THREE.TextureLoader();
    const earthMaterial = new THREE.MeshBasicMaterial({ color: 0xbbbbbb });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), earthMaterial);
    const planetGroup = new THREE.Group();
    scene.add(planetGroup);
    const earthBaseYaw = -Math.PI / 2;
    earth.rotation.y = earthBaseYaw;
    planetGroup.add(earth);
    loadEarthTexture({
      loader: texLoader,
      material: earthMaterial,
      onLoad: () => render(),
      onFallbackError: (err) => console.warn('Earth texture fallback failed', err)
    });
    const gridGroup = new THREE.Group();
    const userHighlightGroup = new THREE.Group();
    const userMarkersGroup = new THREE.Group();
    const userPathGroup = new THREE.Group();
    const celestialGroup = new THREE.Group();
    const terminatorGroup = new THREE.Group();
    const visibilityGroup = new THREE.Group();
    const eclipticGroup = new THREE.Group();
    const tourHighlightGroup = new THREE.Group();
    planetGroup.add(gridGroup);
    planetGroup.add(userHighlightGroup);
    planetGroup.add(userMarkersGroup);
    planetGroup.add(userPathGroup);
    planetGroup.add(celestialGroup);
    planetGroup.add(terminatorGroup);
    planetGroup.add(visibilityGroup);
    planetGroup.add(eclipticGroup);
    planetGroup.add(tourHighlightGroup);
    addEarthGrid(gridGroup);
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
    function updateEclipticLine(date) {
      clearGroupWithDispose(eclipticGroup);
      if (!date || !Astronomy) return;
      const time = Astronomy.MakeTime(date);
      const gast = Astronomy.SiderealTime(time); // hours
      const obliqDeg = OBLIQUITY_RAD * 180 / Math.PI;
      const raHours = 18;
      const decDeg = 90 - obliqDeg;
      const lon = normalizeDeg((raHours - gast) * 15);
      const normal = latLonToVec3(decDeg, lon, 1).normalize();
      const eclipticRadius = 1.006;
      const ecliptic = createTerminatorCircle(normal, 0x7ee787, eclipticRadius);
      ecliptic.material.transparent = true;
      ecliptic.material.opacity = 0.85;
      eclipticGroup.add(ecliptic);
      const nodeLon = normalizeDeg(-gast * 15);
      const basisU = latLonToVec3(0, nodeLon, 1).normalize();
      const basisV = new THREE.Vector3().crossVectors(normal, basisU).normalize();
      const tickHeight = innerWidth <= 900 ? 0.045 : 0.035;
      const tickRadius = innerWidth <= 900 ? 0.0045 : 0.0035;
      for (let angle = 0; angle < 360; angle += 30) {
        const rad = THREE.MathUtils.degToRad(angle);
        const dir = basisU.clone().multiplyScalar(Math.cos(rad))
          .add(basisV.clone().multiplyScalar(Math.sin(rad)))
          .normalize();
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(tickRadius, tickRadius, tickHeight, 10),
          new THREE.MeshBasicMaterial({ color: 0x7ee787 })
        );
        marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        marker.position.copy(dir).multiplyScalar(eclipticRadius + tickHeight / 2);
        eclipticGroup.add(marker);
      }
    }
    let basePlanetYaw = 0;
    let lastSubpoints = null;
    let tourTimeOverride = null;
    let tourTwilightAngle = null;
    let terminatorSide = 0;
    const analemmaCameraDistance = baseCameraDistance;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.45;
    if (isAnalemmaPage) {
      controls.enableZoom = false;
      controls.minDistance = analemmaCameraDistance;
      controls.maxDistance = analemmaCameraDistance;
    }
    let tourRotation = {
      active: false,
      startReal: 0,
      duration: 0,
      baseDate: null,
      progress: 0,
      timespanMs: null,
      stepMs: null,
      lastDateMs: null,
      lastUpdate: 0,
      cameraTarget: 'sun'
    };
    let tourState = {
      active: false,
      tourId: 'seasons',
      stepIndex: 0,
      poi: null,
      awaitingPoi: false,
      currentPreset: null,
      anchorDate: null,
      saved: null
    };
    const analemmaInsetState = { enabled: false, mode: 'sidereal' };
    const analemmaUi = {
      tab: null,
      cache: null,
      chartHeights: null,
      charts: {
        ecc: { canvas: null, plot: null, data: null },
        obliq: { canvas: null, plot: null, data: null },
        combined: { canvas: null, plot: null, data: null }
      },
      tooltip: { el: null, pinned: false, source: null }
    };
    const markerRadius = () => {
      const base = innerWidth <= 900 ? 0.018 : 0.01;
      return tourState.active ? base * 1.35 : base;
    };
    const tourDayColor = new THREE.Color(0x8cff8c);
    const tourNightColor = new THREE.Color(0x8899ff);

    function drawTourLatitudeBand(sun) {
      clearGroupWithDispose(tourHighlightGroup);
      if (!tourState.active || !tourState.poi || !sun) return;
      const latDeg = THREE.MathUtils.clamp(tourState.poi.lat, -90, 90);
      const lat = THREE.MathUtils.degToRad(latDeg);
      const sunDir = latLonToVec3(sun.lat, sun.lon, 1).normalize();
      const samples = [];
      for (let deg = -180; deg <= 180; deg += 1) {
        const lon = THREE.MathUtils.degToRad(deg);
        const pos = new THREE.Vector3(
          Math.cos(lat) * Math.sin(lon),
          Math.sin(lat),
          Math.cos(lat) * Math.cos(lon)
        ).multiplyScalar(1.006);
        const sign = pos.dot(sunDir) >= 0 ? 'day' : 'night';
        samples.push({ pos, sign });
      }
      // close loop
      samples.push(samples[0]);
      const segments = [];
      let current = [];
      let currentSign = samples[0].sign;
      samples.forEach(({ pos, sign }) => {
        if (sign !== currentSign && current.length) {
          segments.push({ sign: currentSign, pts: current.slice() });
          current = [];
          currentSign = sign;
        }
        current.push(pos);
      });
      if (current.length) segments.push({ sign: currentSign, pts: current });
      // If wraparound produces two segments of same sign at ends, merge them
      if (segments.length > 1 && segments[0].sign === segments[segments.length - 1].sign) {
        const first = segments.shift();
        const last = segments.pop();
        segments.unshift({ sign: first.sign, pts: [...last.pts, ...first.pts] });
      }
      segments.forEach(seg => {
        const color = seg.sign === 'day' ? tourDayColor : tourNightColor;
        const curve = new THREE.CatmullRomCurve3(seg.pts, false);
        const geom = new THREE.TubeGeometry(curve, Math.max(20, seg.pts.length * 2), 0.005, 8, false);
        const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }));
        tourHighlightGroup.add(mesh);
      });
    }
    const formatHours = (hours) => {
      const h = Math.floor(hours);
      let m = Math.round((hours - h) * 60);
      let hh = h;
      if (m === 60) { hh += 1; m = 0; }
      return `${hh}h ${String(m).padStart(2, '0')}m`;
    };
    function updateDurations(sun, moon) {
      const box = document.getElementById('durations');
      if (!sun) {
        box.innerHTML = '';
        return;
      }
      const points = [];
      const lat1El = document.getElementById('lat1');
      const lon1El = document.getElementById('lon1');
      const pointLabelSingle = copyText('pointLabelSingle', 'Point');
      const pointLabelA = copyText('pointLabelA', 'Point A');
      const pointLabelB = copyText('pointLabelB', 'Point B');
      if (lat1El && lon1El) {
        points.push({
          label: singlePointMode ? pointLabelSingle : pointLabelA,
          lat: parseFloat(lat1El.value),
          lon: parseFloat(lon1El.value),
          color: 0xff6699
        });
      }
      if (!singlePointMode) {
        const lat2El = document.getElementById('lat2');
        const lon2El = document.getElementById('lon2');
        if (lat2El && lon2El) {
        points.push({
          label: pointLabelB,
          lat: parseFloat(lat2El.value),
          lon: parseFloat(lon2El.value),
          color: 0x66ff99
        });
      }
      }
      const filtered = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (!filtered.length) {
        const prompt = copyText('durationsPrompt', 'Select a point to see day/night duration.');
        box.innerHTML = `<div style="color:#8aa2d3;">${prompt}</div>`;
        updatePointMetrics([]);
        return;
      }
      const dayLabel = copyText('labelDay', 'Day');
      const nightLabel = copyText('labelNight', 'Night');
      const moonUpLabel = copyText('labelMoonUp', 'Moon up');
      const rows = filtered.map(p => {
        const colorHex = `#${p.color.toString(16).padStart(6, '0')}`;
        const colorDot = `<span style="display:inline-block; width:10px; height:10px; background:${colorHex}; margin-inline-end:6px; border-radius:2px; vertical-align:middle;"></span>`;
        const sunDur = daylightHours(p.lat, sun.lat);
        if (!moon) {
          return `<div>${colorDot}<strong>${p.label}:</strong> ${dayLabel} ${formatHours(sunDur.day)}, ${nightLabel} ${formatHours(sunDur.night)}</div>`;
        }
        const moonDur = daylightHours(p.lat, moon.lat);
        return `<div>${colorDot}<strong>${p.label}:</strong> ${dayLabel} ${formatHours(sunDur.day)}, ${nightLabel} ${formatHours(sunDur.night)}, ${moonUpLabel} ${formatHours(moonDur.day)}</div>`;
      });
      box.innerHTML = rows.join('');
      updatePointMetrics(filtered);
    }
    function updateTourPoiSummary(sun) {
      const target = document.getElementById('tourPoiSummary');
      if (!target) return;
      if (!tourState.active || !tourState.poi || !sun) {
        target.textContent = '';
        return;
      }
      const dur = daylightHours(tourState.poi.lat, sun.lat);
      target.textContent = formatCopy(
        'durationsSummary',
        'At your point: Day {day}, Night {night}',
        { day: formatHours(dur.day), night: formatHours(dur.night) }
      );
    }
    function startTourRotation(options = {}) {
      const base = options.baseDate ?? parseUTC(document.getElementById('datetime').value) ?? new Date();
      const duration = typeof options.durationMs === 'number' ? options.durationMs : 28000;
      const timespan = typeof options.timespanMs === 'number' ? options.timespanMs : SIDEREAL_MS;
      const stepMs = typeof options.stepMs === 'number' ? options.stepMs : null;
      const camTarget = options.cameraTarget || 'sun';
      tourRotation = {
        active: true,
        startReal: performance.now(),
        duration,
        baseDate: base,
        progress: 0,
        timespanMs: timespan,
        stepMs,
        lastDateMs: null,
        lastUpdate: 0,
        cameraTarget: camTarget
      };
      tourTimeOverride = base;
      planetGroup.rotation.y = basePlanetYaw;
      earth.rotation.y = earthBaseYaw;
      document.getElementById('datetime').value = formatUTC(roundToMinute(base));
    }
    function stopTourRotation(options = {}) {
      basePlanetYaw = planetGroup.rotation.y;
      tourRotation.active = false;
      const preserve = options && typeof options === 'object' && options.preserveOverride;
      if (preserve && options.finalDate instanceof Date) {
        tourTimeOverride = options.finalDate;
      } else if (!preserve) {
        tourTimeOverride = null;
      }
      earth.rotation.y = earthBaseYaw;
    }

    function addHighlightLines(latDeg, lonDeg, color) {
      // Latitude line
      const lat = THREE.MathUtils.degToRad(latDeg);
      const latPts = [];
      for (let i = 0; i <= 360; i += 2) {
        const phi = THREE.MathUtils.degToRad(i);
        const x = Math.cos(lat) * Math.sin(phi);
        const y = Math.sin(lat);
        const z = Math.cos(lat) * Math.cos(phi);
        latPts.push(new THREE.Vector3(x, y, z));
      }
      const latGeom = new THREE.BufferGeometry().setFromPoints(latPts);
      const latLine = new THREE.LineLoop(latGeom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
      userHighlightGroup.add(latLine);

      // Longitude line
      const lon = THREE.MathUtils.degToRad(lonDeg);
      const lonPts = [];
      for (let l = -90; l <= 90; l += 2) {
        const lr = THREE.MathUtils.degToRad(l);
        const x = Math.cos(lr) * Math.sin(lon);
        const y = Math.sin(lr);
        const z = Math.cos(lr) * Math.cos(lon);
        lonPts.push(new THREE.Vector3(x, y, z));
      }
      const lonGeom = new THREE.BufferGeometry().setFromPoints(lonPts);
      const lonLine = new THREE.Line(lonGeom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
      userHighlightGroup.add(lonLine);
    }

    function buildGreatCirclePoints(a, b, steps, radius) {
      const normal = new THREE.Vector3().crossVectors(a, b);
      if (normal.lengthSq() < 1e-6) return null;
      normal.normalize();
      const u = a.clone().normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const p = u.clone().multiplyScalar(Math.cos(theta)).add(v.clone().multiplyScalar(Math.sin(theta)));
        pts.push(p.normalize().multiplyScalar(radius));
      }
      return pts;
    }

    function buildGreatCircleArc(a, b, steps, radius) {
      const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
      if (angle < 1e-6) return null;
      const sinTotal = Math.sin(angle);
      if (Math.abs(sinTotal) < 1e-6) return null;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const w1 = Math.sin((1 - t) * angle) / sinTotal;
        const w2 = Math.sin(t * angle) / sinTotal;
        const p = a.clone().multiplyScalar(w1).add(b.clone().multiplyScalar(w2)).normalize().multiplyScalar(radius);
        pts.push(p);
      }
      return pts;
    }

    function updatePointMetrics(points) {
      const target = document.getElementById('pointMetrics');
      if (!target) return;
      if (!points || points.length < 2) {
        target.innerHTML = '';
        return;
      }
      const [p1, p2] = points;
      const lat1 = THREE.MathUtils.degToRad(p1.lat);
      const lat2 = THREE.MathUtils.degToRad(p2.lat);
      const dLat = lat2 - lat1;
      const dLon = THREE.MathUtils.degToRad(p2.lon - p1.lon);
      const sinHalfLat = Math.sin(dLat / 2);
      const sinHalfLon = Math.sin(dLon / 2);
      const a = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = EARTH_RADIUS_KM * c;
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      const bearing = (THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 360) % 360;
      const distanceText = `${distanceKm.toFixed(distanceKm >= 1000 ? 0 : 1)} km`;
      const headingText = `${bearing.toFixed(1)}°`;
      const routeLabel = copyText('metricsRouteLabel', 'A-B');
      const routeLabelHtml = `<span dir="ltr">${routeLabel}</span>`;
      const distanceLabel = formatCopy('metricsDistanceLabel', 'Distance ({route})', { route: routeLabelHtml });
      const headingLabel = formatCopy('metricsHeadingLabel', 'Initial heading ({route})', { route: routeLabelHtml });
      target.innerHTML = `<div><strong>${distanceLabel}:</strong> ${distanceText}</div>` +
        `<div><strong>${headingLabel}:</strong> ${headingText}</div>`;
    }

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
        addHighlightLines(p.lat, p.lon, p.color);
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
    function maybeCaptureTourPoi(latDeg, lonDeg) {
      if (!tourState.active || !tourState.awaitingPoi) return;
      tourState.poi = { lat: latDeg, lon: lonDeg };
      tourState.awaitingPoi = false;
      clickCount = singlePointMode ? 0 : 1; // keep subsequent clicks on point B if user continues
      updateTourStepCard();
      // stay on step until user clicks Next
    }
    function setPoint(index, latDeg, lonDeg) {
      const targetIndex = singlePointMode ? 0 : index;
      const latInput = document.getElementById(targetIndex === 0 ? 'lat1' : 'lat2');
      const lonInput = document.getElementById(targetIndex === 0 ? 'lon1' : 'lon2');
      if (!latInput || !lonInput) return;
      latInput.value = latDeg.toFixed(2);
      lonInput.value = lonDeg.toFixed(2);
      plotPoints();
      maybeCaptureTourPoi(latDeg, lonDeg);
    }

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
    // Visibility toggles: flip overlays in-place to avoid rebuilding geometry.
    const visControls = ['toggleSunVisibility', 'toggleMoonVisibility'];
    visControls.forEach(id => {
      const control = document.getElementById(id);
      if (!control) return;
      control.addEventListener('change', () => {
        const sunToggle = document.getElementById('toggleSunVisibility');
        const moonToggle = document.getElementById('toggleMoonVisibility');
        const sunOn = sunToggle ? sunToggle.checked : true;
        const moonOn = moonToggle ? moonToggle.checked : false;
        visibilityGroup.children.forEach(mesh => {
          if (mesh.userData.body === 'sun') mesh.visible = sunOn;
          if (mesh.userData.body === 'moon') mesh.visible = moonOn;
        });
        render();
      });
    });
    const cameraModeButtons = Array.from(document.querySelectorAll('#cameraSegments button'));
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
      const latTarget = (tourState.active && tourState.poi) ? tourState.poi.lat : 0;
      const lonTarget = subsolar.lon + side * 90; // look along the terminator toward dawn/dusk
      const pos = latLonToVec3(latTarget, lonTarget, radius);
      camera.position.copy(pos);
      controls.target.set(0, 0, 0);
      controls.update();
      return true;
    }
    function applyCameraMode(subsolar) {
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
    cameraModeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        cameraModeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        cameraMode = btn.dataset.mode;
        applyCameraMode(lastSubpoints?.sun);
      });
    });
    document.getElementById('datetime').addEventListener('change', () => {
      updateCelestial();
    });
    const datetimeInput = document.getElementById('datetime');
    let activeDateUnit = null;
    datetimeInput.addEventListener('input', () => {
      updateCelestial();
    });
    datetimeInput.addEventListener('click', () => {
      const pos = datetimeInput.selectionStart ?? 0;
      activeDateUnit = caretUnit(pos);
    });
    datetimeInput.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const pos = datetimeInput.selectionStart ?? 0;
      const unit = activeDateUnit ?? caretUnit(pos);
      activeDateUnit = unit;
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      const current = parseUTC(datetimeInput.value) ?? new Date();
      adjustDate(current, unit, delta);
      datetimeInput.value = formatUTC(current);
      const range = rangeForUnit(unit);
      // Restore selection to the same segment after value change
      requestAnimationFrame(() => datetimeInput.setSelectionRange(range.start, range.end));
      updateCelestial();
    });
    const resetNowBtn = document.getElementById('resetNowBtn');
    if (resetNowBtn) {
      resetNowBtn.addEventListener('click', (e) => {
        e.preventDefault();
        seedDateTime();
        updateCelestial();
      });
    }
    const twilightInput = document.getElementById('twilightAngle');
    const twilightValue = document.getElementById('twilightValue');
    twilightInput.addEventListener('input', () => {
      twilightValue.textContent = `${twilightInput.value} deg`;
      if (tourState.active) {
        const val = parseFloat(twilightInput.value);
        if (Number.isFinite(val)) tourTwilightAngle = val;
      }
      updateCelestial();
    });
    const shiftSidereal = (mult) => {
      const current = parseUTC(document.getElementById('datetime').value) ?? new Date();
      const shifted = new Date(current.getTime() + mult * SIDEREAL_MS);
      document.getElementById('datetime').value = formatUTC(shifted);
      updateCelestial();
    };
    const siderealMinusBtn = document.getElementById('siderealMinusBtn');
    if (siderealMinusBtn) {
      siderealMinusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        shiftSidereal(-1);
      });
    }
    const siderealPlusBtn = document.getElementById('siderealPlusBtn');
    if (siderealPlusBtn) {
      siderealPlusBtn.addEventListener('click', (e) => {
        e.preventDefault();
        shiftSidereal(1);
      });
    }
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
    const interestingDates = document.getElementById('interestingDates');
    if (interestingDates) {
      const dateButtons = interestingDates.querySelectorAll('[data-datetime]');
      dateButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const dt = btn.dataset.datetime;
          if (!dt) return;
          const parsed = parseUTC(dt);
          if (!parsed) return;
          cameraMode = 'sun';
          cameraModeButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.mode === cameraMode);
          });
          const dtInput = document.getElementById('datetime');
          dtInput.value = formatUTC(roundToMinute(parsed));
          updateCelestial();
        });
      });
    }
    // Hover and click on globe to place points
    const hoverLabel = document.getElementById('hoverLabel');
    let clickCount = 0; // A on first click, B on second, then keep updating B
    let pointerDownPos = null;
    let pointerMoved = false;
    function onPointerDown(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerDownPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      pointerMoved = false;
    }
    function onPointerMove(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      if (pointerDownPos) {
        const dx = (event.clientX - rect.left) - pointerDownPos.x;
        const dy = (event.clientY - rect.top) - pointerDownPos.y;
        if (Math.hypot(dx, dy) > 5) pointerMoved = true;
      }
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(earth, false);
      if (intersects.length > 0) {
        const p = intersects[0].point.clone();
        planetGroup.updateMatrixWorld();
        const local = planetGroup.worldToLocal(p).normalize();
        const lat = THREE.MathUtils.radToDeg(Math.asin(local.y));
        const lon = THREE.MathUtils.radToDeg(Math.atan2(local.x, local.z));
        if (hoverLabel) {
          hoverLabel.textContent = formatCopy(
            'hoverLabel',
            'Hover: lat {lat}, lon {lon}',
            { lat: lat.toFixed(2), lon: lon.toFixed(2) }
          );
        }
      } else {
        if (hoverLabel) hoverLabel.textContent = '';
      }
    }
    function onPointerClick(event) {
      if (pointerMoved) {
        pointerDownPos = null;
        pointerMoved = false;
        return; // ignore clicks that were actually drags
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(earth, false);
      if (intersects.length > 0) {
        const p = intersects[0].point.clone();
        planetGroup.updateMatrixWorld();
        const local = planetGroup.worldToLocal(p).normalize();
        const lat = THREE.MathUtils.radToDeg(Math.asin(local.y));
        const lon = THREE.MathUtils.radToDeg(Math.atan2(local.x, local.z));
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
      }
      pointerDownPos = null;
      pointerMoved = false;
    }
    function onPointerLeave() {
      pointerDownPos = null;
      pointerMoved = false;
      if (hoverLabel) hoverLabel.textContent = '';
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    // set default datetime to now (UTC)
    function seedDateTime() {
      const dt = document.getElementById('datetime');
      dt.value = formatUTC(new Date());
    }
    function formatUTC(date) {
      const pad = n => String(n).padStart(2, '0');
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    }
    function roundToMinute(date) {
      return new Date(Math.round(date.getTime() / 60000) * 60000);
    }
    function parseUTC(str) {
      if (!str) return null;
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
      if (!m) return null;
      const [_, y, mo, d, h, mi] = m;
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0));
    }
    function caretUnit(pos) {
      // positions for "YYYY-MM-DDTHH:MM"
      if (pos <= 4) return 'year';
      if (pos <= 7) return 'month';
      if (pos <= 10) return 'day';
      if (pos <= 13) return 'hour';
      return 'minute';
    }
    function rangeForUnit(unit) {
      switch (unit) {
        case 'year': return { start: 0, end: 4 };
        case 'month': return { start: 5, end: 7 };
        case 'day': return { start: 8, end: 10 };
        case 'hour': return { start: 11, end: 13 };
        default: return { start: 14, end: 16 };
      }
    }
    function adjustDate(d, unit, delta) {
      switch (unit) {
        case 'year': d.setUTCFullYear(d.getUTCFullYear() + delta); break;
        case 'month': d.setUTCMonth(d.getUTCMonth() + delta); break;
        case 'day': d.setUTCDate(d.getUTCDate() + delta); break;
        case 'hour': d.setUTCHours(d.getUTCHours() + delta); break;
        default: d.setUTCMinutes(d.getUTCMinutes() + delta); break;
      }
    }
    seedDateTime();

    let analemmaTrace = {
      startMs: null,
      totalPoints: 0,
      dayMs: 86400000,
      radius: null,
      geometry: null,
      line: null
    };
    const obliquityTrace = {
      enabled: false,
      startDate: null,
      timespanMs: 0
    };
    function clearAnalemmaTrace() {
      if (analemmaTrace.line) {
        if (analemmaTrace.line.parent) analemmaTrace.line.parent.remove(analemmaTrace.line);
        analemmaTrace.line.material?.dispose?.();
        analemmaTrace.line.geometry?.dispose?.();
      } else if (analemmaTrace.geometry) {
        analemmaTrace.geometry.dispose();
      }
      analemmaTrace = { startMs: null, totalPoints: 0, dayMs: 86400000, radius: null, geometry: null, line: null };
    }
    function ensureAnalemmaTrace(startDate, timespanMs, radius = 1.016) {
      const startMs = startDate.getTime();
      const dayMs = analemmaTrace.dayMs;
      const spanDays = Math.max(1, Math.round((timespanMs || 0) / dayMs));
      const totalPoints = spanDays + 1;
      if (analemmaTrace.line && analemmaTrace.startMs === startMs && analemmaTrace.totalPoints === totalPoints && analemmaTrace.radius === radius) return;

      clearAnalemmaTrace();
      analemmaTrace.startMs = startMs;
      analemmaTrace.totalPoints = totalPoints;
      analemmaTrace.radius = radius;

      const positions = new Float32Array(totalPoints * 3);
      for (let i = 0; i < totalPoints; i++) {
        const dt = new Date(startMs + i * dayMs);
        const sp = getSubpoints(dt, false).sun;
        const vec = latLonToVec3(sp.lat, sp.lon, radius);
        positions[i * 3] = vec.x;
        positions[i * 3 + 1] = vec.y;
        positions[i * 3 + 2] = vec.z;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.85, depthWrite: false });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      analemmaTrace.geometry = geom;
      analemmaTrace.line = line;
    }

    function drawObliquityTrace() {
      if (!obliquityTrace.enabled || !obliquityTrace.startDate) return;
      if (tourState.active) return;
      ensureAnalemmaTrace(obliquityTrace.startDate, obliquityTrace.timespanMs, 1.002);
      const current = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
      const idx = Math.round((current.getTime() - obliquityTrace.startDate.getTime()) / analemmaTrace.dayMs);
      const count = Math.max(0, Math.min(analemmaTrace.totalPoints, idx + 1));
      if (analemmaTrace.geometry) analemmaTrace.geometry.setDrawRange(0, count);
      if (analemmaTrace.line) tourHighlightGroup.add(analemmaTrace.line);
    }

    function drawAnalemmaExtras(step, poi, sun, meanSun) {
      if (!step || !poi) return;
      if (step.showAnalemmaTrace && tourState.anchorDate && step.offsetFrom === 'anchor' && typeof step.offsetMs === 'number') {
        const traceStart = new Date(tourState.anchorDate.getTime() + step.offsetMs);
        // Keep the trace close to the surface so it stays between the tropics visually.
        ensureAnalemmaTrace(traceStart, step.rotationTimespanMs, 1.002);
        const current = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
        const idx = Math.round((current.getTime() - traceStart.getTime()) / analemmaTrace.dayMs);
        const count = Math.max(0, Math.min(analemmaTrace.totalPoints, idx + 1));
        if (analemmaTrace.geometry) analemmaTrace.geometry.setDrawRange(0, count);
        if (analemmaTrace.line) tourHighlightGroup.add(analemmaTrace.line);
      }
      if (step.highlightMeridian) {
        const pts = [];
        for (let l = -90; l <= 90; l += 2) {
          const lr = THREE.MathUtils.degToRad(l);
          const lon = THREE.MathUtils.degToRad(poi.lon);
          const pos = new THREE.Vector3(
            Math.cos(lr) * Math.sin(lon),
            Math.sin(lr),
            Math.cos(lr) * Math.cos(lon)
          ).multiplyScalar(1.013);
          pts.push(pos);
        }
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.004, 8, false);
        const mesh = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.85, transparent: true, depthWrite: false }));
        tourHighlightGroup.add(mesh);
      }
      if (!step.showAnalemmaArcs || !sun || !meanSun) return;
      const makeArc = (deltaLon, color, radius = 1.012, tubeR = 0.0045) => {
        if (!deltaLon || Math.abs(deltaLon) < 0.0001) return;
        const steps = Math.max(8, Math.ceil(Math.abs(deltaLon)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const frac = i / steps;
          const lonDeg = poi.lon + frac * deltaLon;
          const lon = THREE.MathUtils.degToRad(lonDeg);
          const lat = THREE.MathUtils.degToRad(poi.lat);
          const pos = new THREE.Vector3(
            Math.cos(lat) * Math.sin(lon),
            Math.sin(lat),
            Math.cos(lat) * Math.cos(lon)
          ).multiplyScalar(radius);
          pts.push(pos);
        }
        const geom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, tubeR, 8, false);
        tourHighlightGroup.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })));
      };
      const deltaMean = normalizeDeg(meanSun.lon - poi.lon);
      const deltaReal = normalizeDeg(sun.lon - poi.lon);
      makeArc(deltaMean, 0xff8800, 1.012, 0.0045);
      makeArc(deltaReal, 0xffdd55, 1.014, 0.0045);
    }
      // Analemma inset DOM guard: keep show/hide logic in one place.
      function hideAnalemmaInset() {
        const box = document.getElementById('analemmaInsetBox');
        if (!box) return;
        box.style.display = 'none';
        box.style.visibility = '';
      }

      const ORBIT_E = 0.0167;
      const ORBIT_A = 1;
      const SIDEREAL_DAYS = SIDEREAL_MS / 86400000;
      const getDayOfYear = (date) => {
        const start = Date.UTC(date.getUTCFullYear(), 0, 1);
        return (date.getTime() - start) / 86400000;
      };
      const solveKepler = (M, e) => {
        let E = M;
        for (let i = 0; i < 6; i += 1) {
          const f = E - e * Math.sin(E) - M;
          const fPrime = 1 - e * Math.cos(E);
          E -= f / (fPrime || 1);
        }
        return E;
      };
      const orbitStateForDay = (day, yearDays) => {
        const M = TAU * (day / yearDays);
        const E = solveKepler(M, ORBIT_E);
        const cosE = Math.cos(E);
        const sinE = Math.sin(E);
        const r = ORBIT_A * (1 - ORBIT_E * cosE);
        const f = Math.atan2(Math.sqrt(1 - ORBIT_E * ORBIT_E) * sinE, cosE - ORBIT_E);
        const x = r * Math.cos(f);
        const y = r * Math.sin(f);
        const speed = Math.sqrt(Math.max(0, 2 / r - 1));
        return { x, y, r, speed };
      };
      const sunAngleForDay = (day, yearDays) => {
        const state = orbitStateForDay(day, yearDays);
        return Math.atan2(-state.y, -state.x);
      };
      const normalizeAngle = (rad) => ((rad % TAU) + TAU) % TAU;
      const setCanvasSize = (canvas, cssW, cssH) => {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const needW = Math.round(cssW * dpr);
        const needH = Math.round(cssH * dpr);
        if (canvas.width !== needW) canvas.width = needW;
        if (canvas.height !== needH) canvas.height = needH;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        return dpr;
      };
      const updateEccentricityBaseDate = (overrideDate) => {
        const input = document.getElementById('datetime');
        const date = overrideDate ?? (parseUTC(input?.value) ?? new Date());
        const baseDay = getDayOfYear(date);
        const yearDays = daysInYear(date.getUTCFullYear());
        return { date, baseDay, yearDays };
      };
      const drawOrbitCanvas = (canvas, baseDay, animDay, yearDays) => {
        if (!canvas) return;
        const parentW = canvas.parentElement?.clientWidth || 520;
        const cssW = Math.max(240, Math.floor(parentW));
        const cssH = Math.round(cssW * 0.62);
        const dpr = setCanvasSize(canvas, cssW, cssH);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.direction = 'ltr';
        ctx.clearRect(0, 0, cssW, cssH);

        const windowDays = 60;
        const step = 1;
        const pts = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = -windowDays; i <= windowDays; i += step) {
          const state = orbitStateForDay(animDay + i, yearDays);
          pts.push(state);
          if (state.x < minX) minX = state.x;
          if (state.x > maxX) maxX = state.x;
          if (state.y < minY) minY = state.y;
          if (state.y > maxY) maxY = state.y;
        }
        const pad = 28;
        const spanX = maxX - minX || 1;
        const spanY = maxY - minY || 1;
        const scale = Math.min((cssW - pad * 2) / spanX, (cssH - pad * 2) / spanY);
        const mapPoint = (p) => ({
          x: pad + (p.x - minX) * scale,
          y: pad + (maxY - p.y) * scale
        });

        ctx.strokeStyle = 'rgba(220,230,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const mp = mapPoint(p);
          if (idx === 0) ctx.moveTo(mp.x, mp.y);
          else ctx.lineTo(mp.x, mp.y);
        });
        ctx.stroke();

        const sunInView = (0 >= minX && 0 <= maxX && 0 >= minY && 0 <= maxY);
        if (sunInView) {
          const sunP = mapPoint({ x: 0, y: 0 });
          ctx.fillStyle = 'rgba(255,200,100,0.95)';
          ctx.beginPath();
          ctx.arc(sunP.x, sunP.y, 6, 0, TAU);
          ctx.fill();
        }

        const arcDays = SIDEREAL_DAYS * 2;
        ctx.strokeStyle = 'rgba(255,180,80,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 12; i += 1) {
          const d = animDay + (arcDays * i) / 12;
          const state = orbitStateForDay(d, yearDays);
          const mp = mapPoint(state);
          if (i === 0) ctx.moveTo(mp.x, mp.y);
          else ctx.lineTo(mp.x, mp.y);
        }
        ctx.stroke();

        const animState = orbitStateForDay(animDay, yearDays);
        const baseState = orbitStateForDay(baseDay, yearDays);
        const animP = mapPoint(animState);
        const baseP = mapPoint(baseState);
        ctx.fillStyle = 'rgba(120,200,255,0.95)';
        ctx.beginPath();
        ctx.arc(baseP.x, baseP.y, 6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(animP.x, animP.y, 4, 0, TAU);
        ctx.fill();
      };
      const drawSpeedCanvas = (canvas, baseDay, yearDays) => {
        if (!canvas) return;
        const parentW = canvas.parentElement?.clientWidth || 520;
        const cssW = Math.max(240, Math.floor(parentW));
        const cssH = Math.round(cssW * 0.45);
        const dpr = setCanvasSize(canvas, cssW, cssH);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, cssW, cssH);

        const padding = 40;
        const plotW = cssW - padding * 2;
        const plotH = cssH - padding * 2;
        const angles = new Array(yearDays);
        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = 0; i < yearDays; i += 1) {
          const sun0 = sunAngleForDay(i, yearDays);
          const sun1 = sunAngleForDay(i + SIDEREAL_DAYS, yearDays);
          const delta = ((sun1 - sun0 + Math.PI) % TAU) - Math.PI;
          const deg = delta * 180 / Math.PI;
          angles[i] = deg;
          if (deg < minV) minV = deg;
          if (deg > maxV) maxV = deg;
        }
        const scaleY = plotH / (maxV - minV || 1);
        const toX = (day) => padding + (day / (yearDays - 1)) * plotW;
        const toY = (v) => padding + (maxV - v) * scaleY;

        ctx.strokeStyle = 'rgba(150,200,255,0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, padding + plotH);
        ctx.lineTo(padding + plotW, padding + plotH);
        ctx.stroke();

        const meanExtraDeg = 360 / 365.25;
        const meanY = toY(meanExtraDeg);
        ctx.strokeStyle = 'rgba(255,214,85,0.85)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padding, meanY);
        ctx.lineTo(padding + plotW, meanY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(120,200,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < yearDays; i += 1) {
          const x = toX(i);
          const y = toY(angles[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const baseDayWrapped = ((baseDay % yearDays) + yearDays) % yearDays;
        const markerX = toX(baseDayWrapped);
        const markerY = toY(angles[Math.floor(baseDayWrapped)]);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(markerX, markerY, 4, 0, TAU);
        ctx.fill();

        const labelColor = 'rgba(235,245,255,0.95)';
        ctx.strokeStyle = 'rgba(235,245,255,0.35)';
        ctx.lineWidth = 1;
        ctx.fillStyle = labelColor;
        ctx.font = '12.5px "Segoe UI", Arial, sans-serif';

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= 4; i += 1) {
          const val = minV + ((maxV - minV) * i) / 4;
          const y = toY(val);
          ctx.beginPath();
          ctx.moveTo(padding - 6, y);
          ctx.lineTo(padding, y);
          ctx.stroke();
          ctx.fillText(val.toFixed(3), padding - 10, y);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= 4; i += 1) {
          const day = Math.round((yearDays - 1) * i / 4);
          const x = toX(day);
          ctx.beginPath();
          ctx.moveTo(x, padding + plotH);
          ctx.lineTo(x, padding + plotH + 6);
          ctx.stroke();
          ctx.fillText(String(day), x, padding + plotH + 10);
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('deg', padding + 4, padding - 8);
      };
      const renderEccentricityCharts = () => {
        const { baseDay, yearDays } = updateEccentricityBaseDate();
        const speedCanvas = document.getElementById('eccSpeedCanvas');
        drawSpeedCanvas(speedCanvas, baseDay, yearDays);
      };
      const formatIsoDate = (date) => (
        `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
      );
      const formatAbsMinSec = (secondsFloat) => {
        const seconds = Math.round(Math.abs(secondsFloat));
        const mm = Math.floor(seconds / 60);
        const ss = seconds % 60;
        return `${mm}m ${String(ss).padStart(2, '0')}s`;
      };
      const formatNextNoonLabel = (deltaSeconds) => {
        if (Math.abs(deltaSeconds) < 0.5) return copyText('noonUnchanged', 'unchanged');
        const abs = formatAbsMinSec(deltaSeconds);
        if (deltaSeconds > 0) return formatCopy('noonEarlier', '{value} earlier', { value: abs });
        return formatCopy('noonLater', '{value} later', { value: abs });
      };
      const clampDayIndex = (day, yearDays) => (
        Math.max(0, Math.min(yearDays - 1, Math.round(day)))
      );
      const getDateForDay = (year, dayIndex) => new Date(Date.UTC(year, 0, 1 + dayIndex));
      const lonCompressionForLambda = (lambdaDeg) => {
        const l0 = lambdaDeg * Math.PI / 180;
        const l1 = (lambdaDeg + 1) * Math.PI / 180;
        const cosEps = Math.cos(OBLIQUITY_RAD);
        const radToDeg = 180 / Math.PI;
        const ra0 = wrap360(Math.atan2(Math.sin(l0) * cosEps, Math.cos(l0)) * radToDeg);
        const ra1 = wrap360(Math.atan2(Math.sin(l1) * cosEps, Math.cos(l1)) * radToDeg);
        return Math.abs(normalizeDeg(ra1 - ra0));
      };
      const computeEccentricitySeries = (yearDays) => {
        const angles = new Array(yearDays);
        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = 0; i < yearDays; i += 1) {
          const sun0 = sunAngleForDay(i, yearDays);
          const sun1 = sunAngleForDay(i + SIDEREAL_DAYS, yearDays);
          const delta = ((sun1 - sun0 + Math.PI) % TAU) - Math.PI;
          const deg = delta * 180 / Math.PI;
          angles[i] = deg;
          if (deg < minV) minV = deg;
          if (deg > maxV) maxV = deg;
        }
        return { angles, minV, maxV, meanExtraDeg: 360 / 365.25 };
      };
      const computeObliquitySeries = (year, yearDays) => {
        const factors = new Array(yearDays);
        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = 0; i < yearDays; i += 1) {
          const dt = getDateForDay(year, i);
          const lambda = sunEclipticLonDeg(dt);
          const factor = lonCompressionForLambda(lambda);
          factors[i] = factor;
          if (factor < minV) minV = factor;
          if (factor > maxV) maxV = factor;
        }
        return { factors, minV, maxV };
      };
      const computeAnalemmaContributionSeries = (year, yearDays) => {
        const eccSeconds = new Array(yearDays);
        const obliqSeconds = new Array(yearDays);
      const combinedSeconds = new Array(yearDays);
      let maxAbsSeconds = 0;
      let eotSeconds0 = null;
      const meanExtraDeg = 360 / 365.25;
      for (let i = 0; i < yearDays; i += 1) {
          const dt0 = getDateForDay(year, i);
          const dt1 = new Date(dt0.getTime() + SIDEREAL_MS);
          const sun0 = getSubpoints(dt0, false)?.sun;
          const sun1 = getSubpoints(dt1, false)?.sun;
          const mean0 = meanSunSubpoint(dt0);
          const mean1 = meanSunSubpoint(dt1);
          if (!sun0 || !sun1 || !mean0 || !mean1) {
            eccSeconds[i] = 0;
            obliqSeconds[i] = 0;
            combinedSeconds[i] = 0;
            continue;
          }
          if (i === 0) {
            eotSeconds0 = normalizeDeg(mean0.lon - sun0.lon) * 240;
          }
          const deltaLambda = normalizeDeg(sunEclipticLonDeg(dt1) - sunEclipticLonDeg(dt0));
          const realDeltaLon = normalizeDeg(sun1.lon - sun0.lon);
          const meanDeltaLon = normalizeDeg(mean1.lon - mean0.lon);
          const eccSec = (deltaLambda - meanExtraDeg) * 240;
          const obliqSec = (realDeltaLon - deltaLambda) * 240;
          const combinedSec = (meanDeltaLon - realDeltaLon) * 240;
          eccSeconds[i] = eccSec;
          obliqSeconds[i] = obliqSec;
        combinedSeconds[i] = combinedSec;
        maxAbsSeconds = Math.max(maxAbsSeconds, Math.abs(eccSec), Math.abs(obliqSec), Math.abs(combinedSec));
      }
        const accumulate = (values) => {
          const acc = new Array(values.length);
          let total = 0;
          for (let j = 0; j < values.length; j += 1) {
            const value = Number.isFinite(values[j]) ? values[j] : 0;
            total += value;
            acc[j] = total;
          }
          return acc;
        };
        const eccAccum = accumulate(eccSeconds);
        const obliqAccum = accumulate(obliqSeconds);
        const obliqAnchorSec = -180;
        const obliqOffset = Number.isFinite(obliqAccum[0]) ? (obliqAnchorSec - obliqAccum[0]) : 0;
        const obliqAdjusted = obliqAccum.map((value) => (Number.isFinite(value) ? value + obliqOffset : value));
        const combinedAccum = accumulate(combinedSeconds);
        const offset = Number.isFinite(eotSeconds0) ? (eotSeconds0 - (combinedAccum[0] ?? 0)) : 0;
        const combinedAdjusted = combinedAccum.map((value) => (Number.isFinite(value) ? value + offset : value));
        const maxAccum = Math.max(...eccAccum.map(v => Math.abs(v)), ...obliqAdjusted.map(v => Math.abs(v)), ...combinedAdjusted.map(v => Math.abs(v)));
        return {
          eccSeconds: eccAccum,
          obliqSeconds: obliqAdjusted,
          combinedSeconds: combinedAdjusted,
          yearDays,
          maxAbsSeconds: Math.max(maxAccum, 0.5)
        };
      };
      const ensureAnalemmaCache = (year, yearDays) => {
        if (!analemmaUi.cache || analemmaUi.cache.year !== year || analemmaUi.cache.yearDays !== yearDays) {
          analemmaUi.cache = {
            year,
            yearDays,
            ecc: computeEccentricitySeries(yearDays),
            obliq: computeObliquitySeries(year, yearDays),
            combined: computeAnalemmaContributionSeries(year, yearDays)
          };
        }
      };
      const renderEccentricityChart = (canvas, series, baseDay) => {
        if (!canvas || !series) return;
        const parentW = canvas.parentElement?.clientWidth || 520;
        const cssW = Math.max(260, Math.floor(parentW));
        const maxH = analemmaUi.chartHeights?.ecc ?? Infinity;
          const cssH = Math.min(Math.round(cssW * 0.92), maxH);
          const dpr = setCanvasSize(canvas, cssW, cssH);
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);
          const eccCard = canvas.closest('.analemma-card');
          const eccSpacer = eccCard?.querySelector('.analemma-card-spacer');
          if (eccSpacer) eccSpacer.style.height = `${cssH}px`;

        const padding = 48;
        const plotW = cssW - padding * 2;
        const plotH = cssH - padding * 2;
        const minV = series.minV;
        const maxV = series.maxV;
        const yearDays = series.angles.length;
        const scaleY = plotH / (maxV - minV || 1);
        const toX = (day) => padding + (day / (yearDays - 1)) * plotW;
        const toY = (v) => padding + (maxV - v) * scaleY;

        ctx.strokeStyle = 'rgba(150,200,255,0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, padding + plotH);
        ctx.lineTo(padding + plotW, padding + plotH);
        ctx.stroke();

        const meanY = toY(series.meanExtraDeg);
        ctx.strokeStyle = 'rgba(255,214,85,0.55)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padding, meanY);
        ctx.lineTo(padding + plotW, meanY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(120,200,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < yearDays; i += 1) {
          const x = toX(i);
          const y = toY(series.angles[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const baseIdx = clampDayIndex(baseDay, yearDays);
        const markerX = toX(baseIdx);
        const markerY = toY(series.angles[baseIdx]);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(markerX, markerY, 4, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = 'rgba(235,245,255,0.3)';
        ctx.fillStyle = 'rgba(235,245,255,0.8)';
        ctx.font = '12px Arial, sans-serif';

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= 2; i += 1) {
          const val = minV + ((maxV - minV) * i) / 2;
          const y = toY(val);
          ctx.beginPath();
          ctx.moveTo(padding - 6, y);
          ctx.lineTo(padding, y);
          ctx.stroke();
          ctx.fillText(val.toFixed(3), padding - 8, y);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= 2; i += 1) {
          const day = Math.round((yearDays - 1) * i / 2);
          const x = toX(day);
          ctx.beginPath();
          ctx.moveTo(x, padding + plotH);
          ctx.lineTo(x, padding + plotH + 6);
          ctx.stroke();
          ctx.fillText(String(day), x, padding + plotH + 10);
        }

        analemmaUi.charts.ecc.plot = {
          x0: padding,
          y0: padding,
          w: plotW,
          h: plotH,
          yearDays,
          minV,
          maxV
        };
      };
        const renderObliquityMiniCharts = (container) => {
          if (!container) return;
          const charts = Array.from(container.querySelectorAll('.analemma-mini-chart'));
          if (!charts.length) return;
          const tiltDeg = OBLIQUITY_RAD * 180 / Math.PI;
          const equinoxH = Math.cos(OBLIQUITY_RAD);
          const equinoxV = Math.sin(OBLIQUITY_RAD);
          const solsticeH = 1 / Math.cos(OBLIQUITY_RAD);
          const solsticeV = 0;
          const valueMap = {
            'equinox-h': equinoxH,
            'equinox-v': equinoxV,
            'solstice-h': solsticeH,
            'solstice-v': solsticeV
          };
          const valueEls = Array.from(container.querySelectorAll('.analemma-mini-value'));
          valueEls.forEach((el) => {
            const key = el.dataset.miniValue;
            const value = valueMap[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
              el.textContent = value.toFixed(2);
            }
          });
          charts.forEach((canvas) => {
            const mode = canvas.dataset.mini || 'equinox';
            const frame = canvas.closest('.analemma-mini-frame');
            const row = canvas.closest('.analemma-mini-row') || frame?.parentElement || canvas.parentElement;
            const block = canvas.closest('.analemma-mini-block') || row?.parentElement;
            const label = block?.querySelector('.analemma-mini-label');
            const blockStyles = block ? getComputedStyle(block) : null;
            const gapVal = blockStyles ? parseFloat(blockStyles.rowGap || blockStyles.gap || '0') : 0;
            const labelH = label ? label.getBoundingClientRect().height : 0;
            const blockW = block?.clientWidth || row?.clientWidth || canvas.clientWidth || (container.clientWidth ? container.clientWidth / 2 : 240);
            const blockH = block?.clientHeight || row?.clientHeight || blockW;
            const availableH = Math.max(60, Math.floor(blockH - labelH - gapVal));
            const canvasW = Math.max(120, Math.floor(frame?.getBoundingClientRect().width || canvas.getBoundingClientRect().width || blockW));
            const cssW = Math.max(120, Math.floor(canvasW));
            const cssH = Math.max(100, Math.min(Math.floor(cssW * 1.1), availableH));
            const dpr = setCanvasSize(canvas, cssW, cssH);
            canvas.style.height = `${cssH}px`;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
            const cx = cssW * 0.5;
            const cy = cssH * 0.5;
            const half = Math.min(cssW, cssH) * 0.36;
            const left = cx - half;
            const top = cy - half;
            const size = half * 2;
            ctx.strokeStyle = 'rgba(130,170,230,0.45)';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(left, top, size, size);
            const tilt = OBLIQUITY_RAD;
            const eclipticY = mode === 'solstice' ? (cy - half * 0.45) : cy;
            const dir = mode === 'solstice'
              ? { x: 1, y: 0 }
              : { x: Math.cos(tilt), y: -Math.sin(tilt) };
            const stepLen = half * 0.6;
            const lonSpacing = mode === 'solstice' ? stepLen * 0.7 : stepLen * 1.25;
            const firstLonX = cx - lonSpacing * 0.5;
            const intersection = { x: firstLonX, y: cy };
            const lineDir = mode === 'solstice'
              ? { x: 1, y: 0 }
              : { x: dir.x, y: dir.y };
            const p1 = mode === 'equinox'
              ? {
                  x: intersection.x,
                  y: intersection.y
                }
              : {
                  x: cx - lineDir.x * stepLen * 0.5,
                  y: eclipticY - lineDir.y * stepLen * 0.5
                };
            const p2 = mode === 'equinox'
              ? {
                  x: intersection.x + lineDir.x * stepLen,
                  y: intersection.y + lineDir.y * stepLen
                }
              : {
                  x: cx + lineDir.x * stepLen * 0.5,
                  y: eclipticY + lineDir.y * stepLen * 0.5
                };
            if (mode === 'equinox') {
              ctx.strokeStyle = 'rgba(230,240,255,0.55)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(left, cy);
              ctx.lineTo(left + size, cy);
              ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(126,231,135,0.95)';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 4]);
            if (mode === 'equinox') {
              let tMin = -Infinity;
              let tMax = Infinity;
              if (Math.abs(lineDir.x) > 1e-6) {
                const tx1 = (left - p1.x) / lineDir.x;
                const tx2 = (left + size - p1.x) / lineDir.x;
                tMin = Math.max(tMin, Math.min(tx1, tx2));
                tMax = Math.min(tMax, Math.max(tx1, tx2));
              }
              if (Math.abs(lineDir.y) > 1e-6) {
                const ty1 = (top - p1.y) / lineDir.y;
                const ty2 = (top + size - p1.y) / lineDir.y;
                tMin = Math.max(tMin, Math.min(ty1, ty2));
                tMax = Math.min(tMax, Math.max(ty1, ty2));
              }
              const start = {
                x: p1.x + lineDir.x * tMin,
                y: p1.y + lineDir.y * tMin
              };
              const end = {
                x: p1.x + lineDir.x * tMax,
                y: p1.y + lineDir.y * tMax
              };
              ctx.beginPath();
              ctx.moveTo(start.x, start.y);
              ctx.lineTo(end.x, end.y);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.moveTo(left, eclipticY);
              ctx.lineTo(left + size, eclipticY);
              ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(126,231,135,1)';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(126,231,135,1)';
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, 2.6, 0, Math.PI * 2);
            ctx.arc(p2.x, p2.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
            const projX1 = p1.x;
            const projX2 = p2.x;
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(projX1, p1.y);
            ctx.lineTo(projX1, cy);
            ctx.moveTo(projX2, p2.y);
            ctx.lineTo(projX2, cy);
            ctx.stroke();
            ctx.setLineDash([]);
              ctx.strokeStyle = 'rgba(255,214,85,0.85)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(projX1, cy);
              ctx.lineTo(projX2, cy);
              ctx.stroke();
              if (mode === 'equinox') {
                ctx.strokeStyle = 'rgba(120,200,255,0.7)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(projX2, cy);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
            ctx.strokeStyle = 'rgba(255,214,85,0.55)';
            ctx.lineWidth = 1;
            [-1, 1].forEach((dirX) => {
              const x = cx + dirX * lonSpacing * 0.5;
              ctx.beginPath();
              ctx.moveTo(x, top);
              ctx.lineTo(x, top + size);
              ctx.stroke();
            });
          });
        };
        const renderObliquityDiagram = (canvas, series, baseDay) => {
        if (!canvas || !series) return;
        const parentW = canvas.parentElement?.clientWidth || 520;
        const cssW = Math.max(260, Math.floor(parentW));
        const maxH = analemmaUi.chartHeights?.obliq ?? Infinity;
          const cssH = Math.min(Math.round(cssW * 0.92), maxH);
          const dpr = setCanvasSize(canvas, cssW, cssH);
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);
            const obliqCard = canvas.closest('.analemma-card');
            const obliqSpacer = obliqCard?.querySelector('.analemma-card-spacer');
            if (obliqSpacer) {
              const spacerHeight = Math.round(cssH * 1.4);
              obliqSpacer.style.height = `${spacerHeight}px`;
              renderObliquityMiniCharts(obliqSpacer);
            }

        const padding = 48;
        const plotW = cssW - padding * 2;
        const plotH = cssH - padding * 2;
        const minV = series.minV;
        const maxV = series.maxV;
        const yearDays = series.factors.length;
        const scaleY = plotH / (maxV - minV || 1);
        const toX = (day) => padding + (day / (yearDays - 1)) * plotW;
        const toY = (v) => padding + (maxV - v) * scaleY;

        ctx.strokeStyle = 'rgba(150,200,255,0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, padding + plotH);
        ctx.lineTo(padding + plotW, padding + plotH);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,214,85,0.4)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]);
        const baseLineY = toY(1);
        ctx.beginPath();
        ctx.moveTo(padding, baseLineY);
        ctx.lineTo(padding + plotW, baseLineY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(126,231,135,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < yearDays; i += 1) {
          const x = toX(i);
          const y = toY(series.factors[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const baseIdx = clampDayIndex(baseDay, yearDays);
        const markerX = toX(baseIdx);
        const markerY = toY(series.factors[baseIdx]);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(markerX, markerY, 4, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = 'rgba(235,245,255,0.3)';
        ctx.fillStyle = 'rgba(235,245,255,0.8)';
        ctx.font = '12px Arial, sans-serif';

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= 2; i += 1) {
          const val = minV + ((maxV - minV) * i) / 2;
          const y = toY(val);
          ctx.beginPath();
          ctx.moveTo(padding - 6, y);
          ctx.lineTo(padding, y);
          ctx.stroke();
          ctx.fillText(val.toFixed(3), padding - 8, y);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= 2; i += 1) {
          const day = Math.round((yearDays - 1) * i / 2);
          const x = toX(day);
          ctx.beginPath();
          ctx.moveTo(x, padding + plotH);
          ctx.lineTo(x, padding + plotH + 6);
          ctx.stroke();
          ctx.fillText(String(day), x, padding + plotH + 10);
        }

        analemmaUi.charts.obliq.plot = {
          x0: padding,
          y0: padding,
          w: plotW,
          h: plotH,
          yearDays,
          minV,
          maxV
        };
      };
      const renderAnalemmaCombinedChart = (canvas, data) => {
        if (!canvas || !data?.series) return;
        const { series, baseDay, orbitalMotion, lonCompression, combined, tiltFactor, nextNoonDeltaSeconds } = data;
        const { combinedSeconds = [], yearDays = 365 } = series;
        const chartSeconds = combinedSeconds.map((value) => (Number.isFinite(value) ? -value : value));
        const parentW = canvas.parentElement?.clientWidth || 320;
        const cssW = Math.max(240, Math.floor(parentW));
        const cssH = 240;
        const dpr = setCanvasSize(canvas, cssW, cssH);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const padding = 18;
        const axisSpacing = 32;
        const closingMargin = 4;
        const leftMargin = padding + axisSpacing;
        const plotW = Math.max(80, cssW - leftMargin - padding - closingMargin);
        const plotH = cssH - 60;
        const plotTop = 44;
        const midY = plotTop + plotH / 2;
        let maxAbsSeconds = 0;
        chartSeconds.forEach((value) => {
          if (Number.isFinite(value)) maxAbsSeconds = Math.max(maxAbsSeconds, Math.abs(value));
        });
        maxAbsSeconds = Math.max(maxAbsSeconds, 0.5);
        const maxAbsMinutes = maxAbsSeconds / 60;
        const tickStepMinutes = 3;
        const tickMaxMinutes = Math.max(tickStepMinutes, Math.ceil(maxAbsMinutes / tickStepMinutes) * tickStepMinutes);
        const scale = Math.max(0.0001, tickMaxMinutes * 60);

        ctx.fillStyle = 'rgba(8,12,18,0.9)';
        ctx.fillRect(0, 0, cssW, cssH);

        ctx.fillStyle = 'rgba(220,230,255,0.75)';
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(copyText('eotChartTitle', 'Equation of time'), padding, 22);

        const axisColor = 'rgba(255,255,255,0.3)';
        const axisX = leftMargin;
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(axisX, plotTop - 4);
        ctx.lineTo(axisX, plotTop + plotH + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(axisX, midY);
        ctx.lineTo(leftMargin + plotW, midY);
        ctx.stroke();

        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '10px Arial, sans-serif';
        ctx.fillStyle = 'rgba(220,230,255,0.7)';
        ctx.fillText(copyText('chartMinutesUnit', 'min'), axisX - 6, plotTop - 6);

        const toX = (day) => leftMargin + (plotW * day) / Math.max(1, yearDays - 1);
        const toY = (value) => midY - (value / scale) * (plotH / 2);
        const labelDigits = 0;
        const axisTickColor = 'rgba(220,230,255,0.35)';
        ctx.strokeStyle = axisTickColor;
        ctx.fillStyle = 'rgba(220,230,255,0.7)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let minutes = -tickMaxMinutes; minutes <= tickMaxMinutes; minutes += tickStepMinutes) {
          const value = minutes * 60;
          const y = toY(value);
          ctx.beginPath();
          ctx.moveTo(axisX - 4, y);
          ctx.lineTo(axisX, y);
          ctx.stroke();
          ctx.fillText(minutes.toFixed(labelDigits), axisX - 8, y);
        }
        const drawLine = (values, color) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          values.forEach((value, index) => {
            if (typeof value !== 'number') return;
            const x = toX(index);
            const y = toY(value);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        };
        drawLine(chartSeconds, '#ffd655');

        if (typeof baseDay === 'number' && baseDay >= 0 && baseDay < yearDays) {
          const highlightX = toX(baseDay);
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(highlightX, plotTop);
          ctx.lineTo(highlightX, plotTop + plotH);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '10px Arial, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(copyText('chartTodayLabel', 'Today'), highlightX + 4, plotTop + 4);
        }

        ctx.fillStyle = 'rgba(220,230,255,0.6)';
        ctx.font = '10px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('+', cssW - padding - 10, plotTop + 4);
        ctx.fillText('-', cssW - padding - 10, plotTop + plotH - 4);
      };
      
      const updateAnalemmaChartHeights = () => {
        if (!isAnalemmaPage) return;
        const breakdown = document.getElementById('analemmaBreakdown');
        const controls = document.getElementById('analemmaControls');
        const componentsPanel = breakdown?.querySelector('.analemma-tab-panel[data-tab="components"]');
        if (!breakdown || !componentsPanel || !componentsPanel.classList.contains('active')) return;
        const cardsContainer = componentsPanel.querySelector('.analemma-cards');
        const cards = Array.from(componentsPanel.querySelectorAll('.analemma-card'));
        if (!cardsContainer || !cards.length) return;
        const top = breakdown.getBoundingClientRect().top;
        const available = window.innerHeight - top - 12;
        const controlsH = controls?.getBoundingClientRect().height ?? 0;
        const gapStr = getComputedStyle(cardsContainer).rowGap || getComputedStyle(cardsContainer).gap || '0';
        const gapVal = parseFloat(gapStr) || 0;
        const cardsGap = gapVal * Math.max(0, cards.length - 1);
        const cardsMarginTop = parseFloat(getComputedStyle(cardsContainer).marginTop || '0') || 0;
          const staticHeights = cards.map((card) => {
            const chart = card.querySelector('.analemma-card-chart');
            if (!chart) return 0;
            const cardRect = card.getBoundingClientRect();
            const chartRect = chart.getBoundingClientRect();
            const spacer = card.querySelector('.analemma-card-spacer');
            const spacerRect = spacer?.getBoundingClientRect();
            const spacerHeight = spacerRect ? spacerRect.height : 0;
            return Math.max(0, cardRect.height - chartRect.height - spacerHeight);
          });
        const totalStatic = staticHeights.reduce((sum, val) => sum + val, 0);
        const availableForCharts = Math.max(0, available - controlsH - cardsGap - cardsMarginTop - totalStatic);
        const weights = [1, 1];
        const weightSum = weights.reduce((sum, val) => sum + val, 0) || 1;
        const base = availableForCharts / weightSum;
        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
          analemmaUi.chartHeights = {
            ecc: clamp(base * weights[0], 60, 220),
            obliq: clamp(base * weights[1], 60, 220)
          };
      };
      const updateAnalemmaReadouts = (seriesEcc, seriesObliq, baseDay) => {
        if (!seriesEcc || !seriesObliq) return;
        const yearDays = seriesEcc.angles.length;
        const baseIdx = clampDayIndex(baseDay, yearDays);
        const eccValue = seriesEcc.angles[baseIdx];
        const obliqValue = seriesObliq.factors[baseIdx];

        const setText = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = value;
        };
        setText('eccKeyValue', `${eccValue.toFixed(4)} deg`);
        setText('obliqKeyValue', `${obliqValue.toFixed(4)} deg/deg`);
      };
      const updateAnalemmaPanels = (date, sun, meanSun) => {
        if (!isAnalemmaPage) return;
        updateAnalemmaChartHeights();
        const componentsPanel = document.querySelector('.analemma-tab-panel[data-tab="components"]');
        if (componentsPanel && !componentsPanel.classList.contains('active')) return;
        const eccCanvas = analemmaUi.charts.ecc.canvas;
        const obliqCanvas = analemmaUi.charts.obliq.canvas;
        if (!eccCanvas || !obliqCanvas) return;
        const { date: baseDate, baseDay, yearDays } = updateEccentricityBaseDate(date);
        const year = baseDate.getUTCFullYear();
        ensureAnalemmaCache(year, yearDays);
        const eccSeries = analemmaUi.cache.ecc;
        const obliqSeries = analemmaUi.cache.obliq;
        analemmaUi.charts.ecc.data = { ...eccSeries, year, baseDay };
        analemmaUi.charts.obliq.data = { ...obliqSeries, year, baseDay };

        renderEccentricityChart(eccCanvas, eccSeries, baseDay);
        renderObliquityDiagram(obliqCanvas, obliqSeries, baseDay);
        updateAnalemmaReadouts(eccSeries, obliqSeries, baseDay);
      };
      const getTooltipLines = (type, localX, localY) => {
        if (type === 'ecc') {
          const chart = analemmaUi.charts.ecc;
          if (!chart.data || !chart.plot) return null;
          const { x0, y0, w, h, yearDays } = chart.plot;
          if (localX < x0 || localX > x0 + w || localY < y0 || localY > y0 + h) return null;
          const day = clampDayIndex(((localX - x0) / w) * (yearDays - 1), yearDays);
          const date = getDateForDay(chart.data.year, day);
          const angle = chart.data.angles[day];
          const delta = angle - chart.data.meanExtraDeg;
          return [
            formatCopy('tooltipDate', 'Date: {value}', { value: formatIsoDate(date) }),
            formatCopy('tooltipExtraAngle', 'Extra angle: {value}', { value: `${angle.toFixed(4)} deg` }),
            formatCopy('tooltipDeltaMean', 'Delta vs mean: {value}', { value: `${delta.toFixed(4)} deg` })
          ];
        }
        if (type === 'obliq') {
          const chart = analemmaUi.charts.obliq;
          if (!chart.data || !chart.plot) return null;
          const { x0, y0, w, h, yearDays } = chart.plot;
          if (localX < x0 || localX > x0 + w || localY < y0 || localY > y0 + h) return null;
          const day = clampDayIndex(((localX - x0) / w) * (yearDays - 1), yearDays);
          const date = getDateForDay(chart.data.year, day);
          const factor = chart.data.factors[day];
          return [
            formatCopy('tooltipDate', 'Date: {value}', { value: formatIsoDate(date) }),
            formatCopy('tooltipTiltFactor', 'Tilt factor: {value}', { value: `${factor.toFixed(4)} deg/deg` })
          ];
        }
        return null;
      };
      const showAnalemmaTooltip = (lines, clientX, clientY, pinned) => {
        const el = analemmaUi.tooltip.el;
        if (!el || !lines || !lines.length) return;
        el.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
        const offset = 12;
        let x = clientX + offset;
        let y = clientY + offset;
        const rect = el.getBoundingClientRect();
        if (x + rect.width > window.innerWidth - 6) x = clientX - rect.width - offset;
        if (y + rect.height > window.innerHeight - 6) y = clientY - rect.height - offset;
        el.style.left = `${Math.max(6, x)}px`;
        el.style.top = `${Math.max(6, y)}px`;
        el.classList.add('show');
        if (pinned) {
          analemmaUi.tooltip.pinned = true;
        }
      };
      const hideAnalemmaTooltip = () => {
        const el = analemmaUi.tooltip.el;
        if (!el) return;
        el.classList.remove('show');
      };
      const attachAnalemmaTooltip = (canvas, type) => {
        if (!canvas) return;
        canvas.addEventListener('pointermove', (event) => {
          if (analemmaUi.tooltip.pinned && analemmaUi.tooltip.source === type) return;
          const rect = canvas.getBoundingClientRect();
          const localX = event.clientX - rect.left;
          const localY = event.clientY - rect.top;
          const lines = getTooltipLines(type, localX, localY);
          if (!lines) {
            if (!analemmaUi.tooltip.pinned) hideAnalemmaTooltip();
            return;
          }
          analemmaUi.tooltip.source = type;
          showAnalemmaTooltip(lines, event.clientX, event.clientY);
        });
        canvas.addEventListener('pointerleave', () => {
          if (!analemmaUi.tooltip.pinned || analemmaUi.tooltip.source !== type) hideAnalemmaTooltip();
        });
        canvas.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
          const rect = canvas.getBoundingClientRect();
          const localX = event.clientX - rect.left;
          const localY = event.clientY - rect.top;
          const lines = getTooltipLines(type, localX, localY);
          if (!lines) return;
          if (analemmaUi.tooltip.pinned && analemmaUi.tooltip.source === type) {
            analemmaUi.tooltip.pinned = false;
            analemmaUi.tooltip.source = null;
            hideAnalemmaTooltip();
            return;
          }
          analemmaUi.tooltip.source = type;
          showAnalemmaTooltip(lines, event.clientX, event.clientY, true);
        });
      };
      const startAnalemmaPlayback = (resume = false) => {
        stopTourRotation();
        const poi = { lat: 0, lon: 0 };
        setPoint(0, poi.lat, poi.lon);
        let baseDate = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
        if (!resume || !obliquityTrace.startDate) {
          clearAnalemmaTrace();
          const startDate = alignMeanRealNearEotZero(poi.lon);
          obliquityTrace.startDate = startDate;
          const endDate = new Date(startDate);
          endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
          obliquityTrace.timespanMs = endDate.getTime() - startDate.getTime();
          baseDate = startDate;
        }
        const traceStart = obliquityTrace.startDate;
        const endDate = new Date(traceStart);
        endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
        if (baseDate < traceStart || baseDate > endDate) baseDate = traceStart;
        const timespanMs = Math.max(0, endDate.getTime() - baseDate.getTime());
        obliquityTrace.enabled = true;
        tourTimeOverride = baseDate;
        document.getElementById('datetime').value = formatUTC(roundToMinute(baseDate));
        startTourRotation({
          baseDate,
          timespanMs,
          durationMs: 45000,
          stepMs: 86400000,
          cameraTarget: 'meanSun'
        });
        updateCelestial();
      };
      const pauseAnalemmaPlayback = () => {
        if (!tourRotation.active) return;
        const current = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
        stopTourRotation({ preserveOverride: true, finalDate: current });
        updateCelestial();
      };
      const resetAnalemmaPlayback = () => {
        stopTourRotation();
        clearAnalemmaTrace();
        obliquityTrace.enabled = false;
        obliquityTrace.startDate = null;
        obliquityTrace.timespanMs = 0;
        const poi = { lat: 0, lon: 0 };
        setPoint(0, poi.lat, poi.lon);
        const baseDate = alignMeanRealNearEotZero(poi.lon);
        tourTimeOverride = baseDate;
        document.getElementById('datetime').value = formatUTC(roundToMinute(baseDate));
        updateCelestial();
      };

    // Render the microscope inset (Equation of Time panels).
      function updateAnalemmaInset(step, sun, meanSun) {
        const box = document.getElementById('analemmaInsetBox');
        const canvas = document.getElementById('analemmaInset');
        if (!box || !canvas) return;
        const isEmbedCall = typeof step === 'string';
        const showForTour = !!(step?.showInset && tourState.active && tourState.tourId === 'analemma');
        const showForEmbed = isAnalemmaPage && analemmaInsetState.enabled && isEmbedCall;
        if (!(showForTour || showForEmbed) || !sun) {
          hideAnalemmaInset();
          return;
        }
        const t0 = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
        const meanSunBase = meanSun || meanSunSubpoint(t0);
        if (!meanSunBase) {
          hideAnalemmaInset();
          return;
        }
        const t1 = new Date(t0.getTime() + SIDEREAL_MS);
        const sun1 = getSubpoints(t1, false)?.sun;
        if (!sun1) {
          hideAnalemmaInset();
          return;
        }
        const meanSun1 = meanSunSubpoint(t1);
        if (!meanSun1) {
          hideAnalemmaInset();
          return;
        }
        const insetMode = showForEmbed ? step : 'tour';
        const isEmbed = showForEmbed;

        const wasHidden = getComputedStyle(box).display === 'none';
        if (wasHidden) {
          box.style.display = 'block';
          box.style.visibility = 'hidden';
        }
        const boxStyles = getComputedStyle(box);
        const padX = parseFloat(boxStyles.paddingLeft || '0') + parseFloat(boxStyles.paddingRight || '0');
        const availableW = Math.max(360, Math.round((box.clientWidth || 780) - padX));
        const cssW = Math.min(900, availableW);
        const baseHeight = isEmbed
          ? Math.max(320, Math.round(cssW * 0.75))
          : Math.max(420, Math.min(540, Math.round(cssW * 0.8)));
        const maxHeight = isEmbed ? 780 : 840;
        const cssH = Math.min(Math.round(baseHeight * 1.5), maxHeight);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          hideAnalemmaInset();
          return;
        }
        box.style.display = 'block';
        box.style.visibility = '';

        if (isEmbed) {
          const captionEl = document.getElementById('analemmaInsetCaption');
          if (captionEl) {
            const caption = insetMode === 'obliquity'
              ? box.dataset.captionObliquity
              : box.dataset.captionSidereal;
            captionEl.textContent = caption || '';
            captionEl.dir = uiDir;
          }
        }

        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const needW = Math.round(cssW * dpr);
        const needH = Math.round(cssH * dpr);
        if (canvas.width !== needW) canvas.width = needW;
        if (canvas.height !== needH) canvas.height = needH;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const fmtSignedDeg = (deg, digits = 3) => {
          const sign = deg < 0 ? '-' : '+';
          return `${sign}${Math.abs(deg).toFixed(digits)}°`;
        };
        const fmtAbsMinSec = (secondsFloat) => {
          const seconds = Math.round(Math.abs(secondsFloat));
          const minutes = Math.floor(seconds / 60);
          const secs = seconds % 60;
          return `${minutes}m ${String(secs).padStart(2, '0')}s`;
        };
        const drawDot = (x, y, color, r = 6) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        };
        const drawArrow = (x0, y0, x1, y1, color, width = 4) => {
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const head = 10;
          const wing = 6;
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = width;
          ctx.setLineDash([]);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - ux * head - uy * wing, y1 - uy * head + ux * wing);
          ctx.lineTo(x1 - ux * head + uy * wing, y1 - uy * head - ux * wing);
          ctx.closePath();
          ctx.fill();
          ctx.lineCap = 'butt';
        };
        const drawGuide = (x0, y0, x1, y1) => {
          ctx.strokeStyle = 'rgba(220,230,255,0.25)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 6]);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.setLineDash([]);
        };

        const padding = 0;
        const textPadding = 6;
        const axisPadding = 18;
        const gap = 12;
        const panelAvailable = Math.max(0, cssH - gap);
        const panelH = Math.max(180, Math.floor(panelAvailable / 2));
        const topPanelH = panelH + Math.max(0, panelAvailable - panelH * 2);
        const bottomPanelH = panelH;
        const topPanelY = 0;
        const bottomPanelY = topPanelY + topPanelH + gap;
        const axisLeft = padding;
        const axisRight = cssW - padding;
        const axisStart = axisLeft + axisPadding;
        const axisMargin = 12;
        const axisWidth = Math.max(40, axisRight - axisStart - axisMargin);
        const pxPerDeg = axisWidth / 2;
        const axisMid = axisStart + axisWidth / 2;
        const axisEnd = axisStart + axisWidth;
        const topMidY = topPanelY + topPanelH / 2;
        const bottomMidY = bottomPanelY + bottomPanelH / 2;

        const realDeltaLon = normalizeDeg(sun1.lon - sun.lon);
        const realDeltaLat = sun1.lat - sun.lat;
        const meanDeltaLon = normalizeDeg(meanSun1.lon - meanSunBase.lon);
        const tiltFactor = Math.cos(sun.lat * Math.PI / 180);
        const topScaleX = Math.max(0.001, pxPerDeg * tiltFactor);
        const lambda0 = sunEclipticLonDeg(t0);
        const lambda1 = sunEclipticLonDeg(t1);
        const deltaLambda = normalizeDeg(lambda1 - lambda0);
        const radToDeg = 180 / Math.PI;
        const l0 = lambda0 * Math.PI / 180;
        const l1 = (lambda0 + 1) * Math.PI / 180;
        const cosEps = Math.cos(OBLIQUITY_RAD);
        const ra0 = wrap360(Math.atan2(Math.sin(l0) * cosEps, Math.cos(l0)) * radToDeg);
        const ra1 = wrap360(Math.atan2(Math.sin(l1) * cosEps, Math.cos(l1)) * radToDeg);
        const lonCompression = Math.abs(normalizeDeg(ra1 - ra0));
        const orbitalMotion = Math.abs(deltaLambda);
        const combined = orbitalMotion * lonCompression;

        const nextNoonDeltaSeconds = (meanDeltaLon - realDeltaLon) * 240;
        const nextNoonWhen = Math.abs(nextNoonDeltaSeconds) < 0.5
          ? 'unchanged'
          : (nextNoonDeltaSeconds > 0 ? `${fmtAbsMinSec(nextNoonDeltaSeconds)} earlier` : `${fmtAbsMinSec(nextNoonDeltaSeconds)} later`);
        const { date: insetDate, baseDay: insetBaseDay, yearDays: insetYearDays } = updateEccentricityBaseDate(t0);
        ensureAnalemmaCache(insetDate.getUTCFullYear(), insetYearDays);
        const combinedSeriesData = analemmaUi.cache?.combined;
        const combinedData = {
          series: combinedSeriesData,
          baseDay: insetBaseDay,
          orbitalMotion,
          lonCompression,
          combined,
          tiltFactor,
          nextNoonDeltaSeconds
        };
        if (analemmaUi.charts.combined.canvas) {
          renderAnalemmaCombinedChart(analemmaUi.charts.combined.canvas, combinedData);
        }
        
        let cumulativeSeconds = null;
        if (tourState.anchorDate instanceof Date) {
          const anchorMs = tourState.anchorDate.getTime();
          const stepMs = 86400000;
          const steps = Math.round((t0.getTime() - anchorMs) / stepMs);
          const cache = tourState._analemmaCumulativeCache;
          const dailyContributionSeconds = (dayT0) => {
            const dayT1 = new Date(dayT0.getTime() + SIDEREAL_MS);
            const daySun = getSubpoints(dayT0, false)?.sun;
            const daySun1 = getSubpoints(dayT1, false)?.sun;
            if (!daySun || !daySun1) return 0;
            const dayMean = meanSunSubpoint(dayT0);
            const dayMean1 = meanSunSubpoint(dayT1);
            if (!dayMean || !dayMean1) return 0;
            const dMean = normalizeDeg(dayMean1.lon - dayMean.lon);
            const dReal = normalizeDeg(daySun1.lon - daySun.lon);
            const dayDeltaSeconds = (dMean - dReal) * 240;
            return -dayDeltaSeconds;
          };

          if (cache && cache.anchorMs === anchorMs && Number.isFinite(cache.seconds) && Number.isFinite(cache.steps)) {
            if (cache.steps === steps) {
              cumulativeSeconds = cache.seconds;
            } else if (steps >= 0 && cache.steps >= 0 && Math.abs(steps - cache.steps) === 1) {
              if (steps === cache.steps + 1) {
                const dayT0 = new Date(anchorMs + cache.steps * stepMs);
                cumulativeSeconds = cache.seconds + dailyContributionSeconds(dayT0);
              } else {
                const dayT0 = new Date(anchorMs + steps * stepMs);
                cumulativeSeconds = cache.seconds - dailyContributionSeconds(dayT0);
              }
              tourState._analemmaCumulativeCache = { anchorMs, steps, seconds: cumulativeSeconds };
            }
          }

          if (cumulativeSeconds === null) {
            let total = 0;
            if (steps >= 0) {
              for (let i = 0; i < steps; i += 1) {
                const dayT0 = new Date(anchorMs + i * stepMs);
                total += dailyContributionSeconds(dayT0);
              }
            } else {
              for (let i = 0; i < -steps; i += 1) {
                const dayT0 = new Date(anchorMs - (i + 1) * stepMs);
                total -= dailyContributionSeconds(dayT0);
              }
            }
            cumulativeSeconds = total;
            tourState._analemmaCumulativeCache = { anchorMs, steps, seconds: cumulativeSeconds };
          }
        }
        let cumulativeWhen = '';
        if (cumulativeSeconds !== null) {
          if (Math.abs(cumulativeSeconds) < 0.5) {
            cumulativeWhen = copyText('noonUnchanged', 'unchanged');
          } else if (cumulativeSeconds < 0) {
            cumulativeWhen = formatCopy('noonEarlier', '{value} earlier', { value: fmtAbsMinSec(cumulativeSeconds) });
          } else {
            cumulativeWhen = formatCopy('noonLater', '{value} later', { value: fmtAbsMinSec(cumulativeSeconds) });
          }
        }
        const cumulativeLabel = cumulativeWhen
          ? formatCopy('analemmaCumulativeLabel', 'Cumulative: {value}', { value: cumulativeWhen })
          : '';
        const combinedCache = analemmaUi.cache?.combined;
        const baseIdxCombined = (combinedCache && Number.isFinite(insetBaseDay))
          ? clampDayIndex(insetBaseDay, combinedCache.yearDays ?? 365)
          : 0;
        const eotAccumSeconds = combinedCache?.combinedSeconds?.[baseIdxCombined] ?? 0;
        const setInspectorText = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = value;
        };
        const eotText = formatNextNoonLabel(eotAccumSeconds);
        const formatSignedSeconds = (seconds) => {
          if (!Number.isFinite(seconds)) return 'n/a';
          const sign = seconds < 0 ? '-' : '+';
          return `${sign}${formatAbsMinSec(seconds)}`;
        };
        const rawTimeDiffText = formatSignedSeconds(nextNoonDeltaSeconds);
        const timeDiffText = formatCopy('analemmaDailyDifference', 'Daily difference: {value}', { value: rawTimeDiffText });
        const inspectorDetailText = cumulativeLabel || '';
        const meanMotionDeg = 360 / 365.25;
        const eccContribution = deltaLambda - meanMotionDeg;
        const dailyDifferenceDeg = meanMotionDeg - (meanMotionDeg + eccContribution) * lonCompression;
        const dailyDifferenceSec = dailyDifferenceDeg * 240;
        const formatContribution = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(4)}°`;
        const formatFactor = (value) => (Number.isFinite(value) ? `${value.toFixed(4)}x` : 'n/a');
        const eccText = formatContribution(eccContribution);
        const compressionText = formatFactor(lonCompression);
        const differenceDegText = formatContribution(dailyDifferenceDeg);
        const differenceSecText = formatSignedSeconds(dailyDifferenceSec);
        const eotLabel = copyText('eotShortLabel', 'EoT');
        setInspectorText('analemmaEoTValue', formatCopy('analemmaEotValue', '{label} = {value}', { label: eotLabel, value: eotText }));
        setInspectorText('analemmaEoTDelta', timeDiffText);
        setInspectorText('analemmaEoTDetail', inspectorDetailText);
        setInspectorText('analemmaInspectorEcc', formatCopy('analemmaInspectorEcc', 'Ecc {value}', { value: eccText }));
        setInspectorText('analemmaInspectorObliq', formatCopy('analemmaInspectorObliq', 'Compression factor {value}', { value: compressionText }));
        setInspectorText(
          'analemmaInspectorCombined',
          formatCopy(
            'analemmaInspectorCombined',
            'Daily difference = {mean} - ({mean} {ecc}) * {compression} = {diff} ({diffSeconds})',
            {
              mean: formatContribution(meanMotionDeg),
              ecc: eccText,
              compression: compressionText,
              diff: differenceDegText,
              diffSeconds: differenceSecText
            }
          )
        );

        ctx.fillStyle = 'rgba(10,16,26,0.9)';
        ctx.fillRect(0, topPanelY, cssW, topPanelH);
        ctx.fillStyle = 'rgba(10,16,26,0.78)';
        ctx.fillRect(0, bottomPanelY, cssW, bottomPanelH);

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        const borderLeft = Math.max(0, axisStart - axisPadding / 2);
        const borderWidth = Math.max(0, axisEnd - borderLeft);
        ctx.strokeRect(borderLeft, topPanelY + 1, borderWidth, topPanelH - 2);
        ctx.strokeRect(borderLeft, bottomPanelY + 1, borderWidth, bottomPanelH - 2);

        const drawLongitudeMarkers = (panelTop, panelH, scaleX, originX = axisStart, maxMarker = 2) => {
          ctx.strokeStyle = 'rgba(220,230,255,0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(220,230,255,0.78)';
          const labelY = panelTop + panelH - 10;
          for (let marker = 0; marker <= maxMarker; marker += 1) {
            const x = originX + marker * scaleX;
            ctx.beginPath();
            ctx.moveTo(x, panelTop + 6);
            ctx.lineTo(x, panelTop + panelH - 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, panelTop + panelH - 12);
            ctx.lineTo(x, panelTop + panelH - 4);
            ctx.stroke();
            const label = marker === 0 ? '0°' : `+${marker}°`;
            ctx.fillText(label, x, labelY);
          }
          ctx.setLineDash([]);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        };
        drawGuide(axisStart, topMidY, axisEnd, topMidY);
        drawGuide(axisMid, topPanelY + 12, axisMid, topPanelY + topPanelH - 12);
        drawGuide(axisStart, bottomMidY, axisEnd, bottomMidY);
        drawLongitudeMarkers(topPanelY, topPanelH, topScaleX, axisStart, 1);
        drawLongitudeMarkers(bottomPanelY, bottomPanelH, pxPerDeg, axisStart);

        const topOriginX = axisStart;
        const topEndX = axisStart + realDeltaLon * topScaleX;
        const topEndY = topMidY - realDeltaLat * topScaleX * 0.6;
        drawArrow(topOriginX, topMidY, topEndX, topEndY, 'rgba(255,221,85,0.95)', 3);
        drawDot(topOriginX, topMidY, 'rgba(255,221,85,0.85)', 5);
        drawDot(topEndX, topEndY, 'rgba(255,221,85,0.85)', 5);
        const dx = topEndX - topOriginX;
        const dy = topEndY - topMidY;
        if (Math.abs(dx) > 0.001) {
          const targetX = dx >= 0 ? axisEnd : axisStart;
          const scale = (targetX - topOriginX) / dx;
          if (scale > 1) {
            const extX = topOriginX + dx * scale;
            const extY = topMidY + dy * scale;
            ctx.strokeStyle = 'rgba(126,231,135,0.45)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(topEndX, topEndY);
            ctx.lineTo(extX, extY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        ctx.font = '13px Arial, sans-serif';
        ctx.fillStyle = 'rgba(220,230,255,0.78)';
        ctx.textAlign = 'left';
        ctx.fillText(
          formatCopy('insetDeltaLon', 'Δlon {value}', { value: fmtSignedDeg(realDeltaLon) }),
          axisStart + textPadding,
          topPanelY + topPanelH - 24
        );
        ctx.textAlign = 'right';
        ctx.fillText(
          formatCopy('insetDeltaLat', 'Δlat {value}', { value: `${realDeltaLat.toFixed(3)}°` }),
          axisRight,
          topPanelY + topPanelH - 24
        );
        ctx.textAlign = 'left';

        const bottomOriginX = axisStart;
        const bottomEndX = axisStart + meanDeltaLon * pxPerDeg;
        drawArrow(bottomOriginX, bottomMidY, bottomEndX, bottomMidY, 'rgba(255,136,0,0.95)', 2.5);
        drawDot(bottomOriginX, bottomMidY, 'rgba(255,136,0,0.85)', 5);
        drawDot(bottomEndX, bottomMidY, 'rgba(255,136,0,0.85)', 5);
        const realLonX = axisStart + realDeltaLon * pxPerDeg;
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,221,85,0.5)';
        ctx.beginPath();
        ctx.moveTo(realLonX, bottomPanelY + 8);
        ctx.lineTo(realLonX, bottomPanelY + bottomPanelH - 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        drawDot(realLonX, bottomPanelY + 12, 'rgba(255,221,85,0.85)', 3);
        ctx.font = '12px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,221,85,0.85)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(copyText('insetRealSunLabel', 'Real Sun λ'), realLonX + 6, bottomPanelY + 6);
        ctx.textAlign = 'start';
        ctx.textAlign = 'start';
        ctx.fillStyle = 'rgba(220,230,255,0.78)';
        ctx.font = '13px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
          formatCopy('insetDeltaLon', 'Δlon {value}', { value: fmtSignedDeg(meanDeltaLon) }),
          axisStart + textPadding,
          bottomPanelY + bottomPanelH - 24
        );
      }
    // Update the analemma tour POI summary with equation-of-time and offset details.
    function updateAnalemmaOffsets(step, poi, sun, meanSun) {
      if (!poi || !sun || !meanSun) return;
      if (!(step?.showOffsets || step?.showEot)) return;
      const target = document.getElementById('tourPoiSummary');
      if (!target) return;
      const fmtAbsMmSs = (secondsFloat) => {
        const totalSeconds = Math.max(0, Math.round(secondsFloat));
        const mm = Math.floor(totalSeconds / 60);
        const ss = totalSeconds % 60;
        return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      const fmtHhMmSs = (totalSecondsFloat) => {
        const totalSeconds = Math.max(0, Math.round(totalSecondsFloat));
        const hh = Math.floor(totalSeconds / 3600);
        const mm = Math.floor((totalSeconds % 3600) / 60);
        const ss = totalSeconds % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      const fmtSignedMmSs = (deltaSecondsFloat) => {
        const deltaSeconds = Math.round(deltaSecondsFloat);
        const sign = deltaSeconds < 0 ? '-' : '+';
        const abs = Math.abs(deltaSeconds);
        const mm = Math.floor(abs / 60);
        const ss = abs % 60;
        return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      const fmtInAgo = (deltaSecondsFloat) => {
        const deltaSeconds = Math.round(deltaSecondsFloat);
        const abs = fmtAbsMmSs(Math.abs(deltaSeconds));
        return deltaSeconds < 0
          ? formatCopy('timeAgo', '{value} ago', { value: abs })
          : formatCopy('timeIn', 'in {value}', { value: abs });
      };
      if (step.showEot && !step.showOffsets) {
        const eotLon = normalizeDeg(meanSun.lon - sun.lon);
        const eotSeconds = eotLon * 240;
        const eotStr = fmtSignedMmSs(eotSeconds);
        const hint = eotSeconds > 0
          ? copyText('eotHintEarlier', 'apparent noon earlier')
          : (eotSeconds < 0
            ? copyText('eotHintLater', 'apparent noon later')
            : copyText('eotHintMatches', 'apparent noon matches'));
        target.textContent = formatCopy(
          'eotSummary',
          'Equation of time: {value} ({hint})',
          { value: eotStr, hint }
        );
        return;
      }
      const meanDelta = normalizeDeg(meanSun.lon - poi.lon);
      const realDelta = normalizeDeg(sun.lon - poi.lon);
      const meanSeconds = meanDelta * 240;
      const realSeconds = realDelta * 240;

      const meanIn = fmtInAgo(meanSeconds);
      const realIn = fmtInAgo(realSeconds);
      const noonDeltaSeconds = realSeconds - meanSeconds;
      const noonDeltaStr = fmtSignedMmSs(noonDeltaSeconds);
      const noonHint = noonDeltaSeconds < 0
        ? copyText('meridianRealLeads', 'real Sun leads')
        : (noonDeltaSeconds > 0
          ? copyText('meridianMeanLeads', 'mean Sun leads')
          : copyText('meridianAligned', 'aligned'));

      if (step.showSolarDay) {
        const siderealSeconds = SIDEREAL_MS / 1000;
        const siderealStr = fmtHhMmSs(siderealSeconds);
        const extraSeconds = Math.max(0, realSeconds);
        const extraStr = fmtAbsMmSs(extraSeconds);
        const apparentSolarSeconds = siderealSeconds + extraSeconds;
        const apparentSolarStr = fmtHhMmSs(apparentSolarSeconds);
        const deltaVs24Str = fmtSignedMmSs(apparentSolarSeconds - 86400);
        target.textContent = formatCopy(
          'meridianSummarySolarDay',
          'Meridian: mean Sun {mean}, real Sun {real} (real - mean {delta}, {hint}). Solar day ≈ {sidereal} + {extra} = {apparent} ({delta24} vs 24:00:00)',
          {
            mean: meanIn,
            real: realIn,
            delta: noonDeltaStr,
            hint: noonHint,
            sidereal: siderealStr,
            extra: extraStr,
            apparent: apparentSolarStr,
            delta24: deltaVs24Str
          }
        );
        return;
      }
      target.textContent = formatCopy(
        'meridianSummary',
        'Meridian: mean Sun {mean}, real Sun {real} (real - mean {delta}, {hint})',
        { mean: meanIn, real: realIn, delta: noonDeltaStr, hint: noonHint }
      );
    }

    function hideSeasonsInset() {
      const box = document.getElementById('seasonsInsetBox');
      if (box) box.style.display = 'none';
    }

    // Render a daylight/twilight hours curve for the seasons tour at the selected POI.
    function updateSeasonsInset(sun) {
      const box = document.getElementById('seasonsInsetBox');
      const canvas = document.getElementById('seasonsInset');
      if (!box || !canvas) return;
      if (!tourState.active || tourState.tourId !== 'seasons' || !tourState.poi || !sun) {
        hideSeasonsInset();
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        hideSeasonsInset();
        return;
      }

      const current = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
      const year = current.getUTCFullYear();
      const decs = sunDeclinationForYear(year);
      const days = decs.length;
      const lat = tourState.poi.lat;
      const twilightAngle = Math.max(0, parseFloat(document.getElementById('twilightAngle').value) || 0);
      const twilightAlt = twilightAngle > 0 ? -twilightAngle : -0.833;

      const dayHoursSeries = new Array(days);
      const twilightHoursSeries = new Array(days);
      let maxHours = 24;
      for (let i = 0; i < days; i++) {
        const dec = decs[i];
        const dayDur = daylightHours(lat, dec).day;
        const twiDur = daylightHoursAtAltitude(lat, dec, twilightAlt).day;
        dayHoursSeries[i] = dayDur;
        twilightHoursSeries[i] = twiDur;
        if (twiDur > maxHours) maxHours = twiDur;
      }

      const startOfYear = Date.UTC(year, 0, 1);
      const dayIndex = Math.max(
        0,
        Math.min(
          days - 1,
          Math.floor((Date.UTC(year, current.getUTCMonth(), current.getUTCDate()) - startOfYear) / 86400000)
        )
      );

      const wasHidden = getComputedStyle(box).display === 'none';
      if (wasHidden) {
        box.style.display = 'block';
        box.style.visibility = 'hidden';
      } else {
        box.style.display = 'block';
      }

      const cssW = Math.max(320, Math.round(box.clientWidth || 520));
      const cssH = 360; // fixed to prevent layout creep
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const needW = Math.round(cssW * dpr);
      const needH = Math.round(cssH * dpr);
      if (canvas.width !== needW) canvas.width = needW;
      if (canvas.height !== needH) canvas.height = needH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      box.style.visibility = '';

      // Styling constants
      const dayColor = '#8cff8c';
      const twiColor = '#f9c56e';
      const axisColor = 'rgba(255,255,255,0.18)';
      const textColor = 'rgba(220,230,255,0.84)';
      const nightColor = '#8899ff';

      const margin = { left: 46, right: 14, top: 22, bottom: 210 };
      const plotW = cssW - margin.left - margin.right;
      const plotH = cssH - margin.top - margin.bottom;
      const xAt = (i) => margin.left + (plotW * i) / Math.max(1, days - 1);
      const yAt = (hours) => {
        const clamped = Math.min(maxHours, Math.max(0, hours));
        return margin.top + plotH * (1 - clamped / maxHours);
      };

      // Background
      ctx.fillStyle = 'rgba(10,16,26,0.45)';
      ctx.fillRect(0, 0, cssW, cssH);

      // Horizontal grid
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1;
      [0, 6, 12, 18, 24].forEach(h => {
        const y = yAt(h);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(cssW - margin.right, y);
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${h}h`, margin.left - 8, y);
      });

      // Month ticks
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = textColor;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      monthNames.forEach((name, idx) => {
        const di = Math.floor((Date.UTC(year, idx, 1) - startOfYear) / 86400000);
        const x = xAt(di);
        ctx.beginPath();
        ctx.moveTo(x, margin.top + plotH);
        ctx.lineTo(x, margin.top + plotH + 4);
        ctx.stroke();
        ctx.fillText(name, x, cssH - margin.bottom + 6);
      });
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      // Twilight fill + line
      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(twilightHoursSeries[0]));
      for (let i = 1; i < days; i++) ctx.lineTo(xAt(i), yAt(twilightHoursSeries[i]));
      ctx.lineTo(xAt(days - 1), margin.top + plotH);
      ctx.lineTo(xAt(0), margin.top + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(249,197,110,0.16)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(twilightHoursSeries[0]));
      for (let i = 1; i < days; i++) ctx.lineTo(xAt(i), yAt(twilightHoursSeries[i]));
      ctx.strokeStyle = twiColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Daylight line
      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(dayHoursSeries[0]));
      for (let i = 1; i < days; i++) ctx.lineTo(xAt(i), yAt(dayHoursSeries[i]));
      ctx.strokeStyle = dayColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Cursor on current day
      const cx = xAt(dayIndex);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, margin.top);
      ctx.lineTo(cx, margin.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      const drawDot = (x, y, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      };
      drawDot(cx, yAt(dayHoursSeries[dayIndex]), dayColor);
      drawDot(cx, yAt(twilightHoursSeries[dayIndex]), twiColor);

      // Legends
      ctx.fillStyle = textColor;
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const twilightDuration = Math.max(0, twilightHoursSeries[dayIndex] - dayHoursSeries[dayIndex]);
      const dayLegend = formatCopy(
        'seasonsInsetDaylight',
        'Daylight: {hours}',
        { hours: formatHours(dayHoursSeries[dayIndex]) }
      );
      const twiLabel = twilightAngle > 0
        ? formatCopy(
            'seasonsInsetTwilightAngle',
            'Twilight duration (-{angle} deg): {hours}',
            { angle: twilightAngle, hours: formatHours(twilightDuration) }
          )
        : formatCopy(
            'seasonsInsetTwilight',
            'Twilight duration: {hours}',
            { hours: formatHours(twilightDuration) }
          );
      ctx.fillText(dayLegend, margin.left, 6);
      ctx.fillText(twiLabel, margin.left, 24);
      ctx.textAlign = 'right';
      ctx.fillText(
        formatCopy('seasonsInsetLatYear', 'Lat {lat} deg, {year}', { lat: lat.toFixed(2), year }),
        cssW - margin.right,
        6
      );
      ctx.textAlign = 'start';
      // Bottom panel: day/night circle with location marker moving with Earth rotation.
      const deltaLon = normalizeDeg(tourState.poi.lon - sun.lon); // location vs subsolar
      const localSolarHours = ((12 + deltaLon / 15) % 24 + 24) % 24;
      const circleR = 70;
      const circleCx = margin.left + circleR + 10;
      const circleCy = cssH - 80;
      ctx.fillStyle = textColor;
      ctx.font = '12px Arial, sans-serif';
      ctx.fillText(copyText('seasonsInsetHeading', 'Today at this latitude'), margin.left, circleCy - circleR - 20);
      const lstToAngle = (lst) => -((lst - 12) * TAU / 24);
      const dayDurHours = Math.max(0, Math.min(24, dayHoursSeries[dayIndex]));
      const nightDurHours = 24 - dayDurHours;
      const sunriseLST = 12 - dayDurHours / 2;
      const sunsetLST = 12 + dayDurHours / 2;
      const startDay = lstToAngle(sunriseLST);
      const endDay = lstToAngle(sunsetLST);

      ctx.lineWidth = 10;
      // Base night ring
      ctx.strokeStyle = dayColor;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, circleR, 0, TAU);
      ctx.stroke();
      // Day arc (handle polar day/night)
      if (dayDurHours >= 23.99) {
        ctx.strokeStyle = nightColor;
        ctx.beginPath();
        ctx.arc(circleCx, circleCy, circleR, 0, TAU);
        ctx.stroke();
      } else if (dayDurHours <= 0.01) {
        // already night-only ring
      } else {
        ctx.strokeStyle = nightColor;
        ctx.beginPath();
        ctx.arc(circleCx, circleCy, circleR, startDay, endDay, false);
        ctx.stroke();
      }
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = axisColor;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, circleR, 0, TAU);
      ctx.stroke();

      // Marker for the selected location, rotates with local solar time.
      const angleRad = lstToAngle(localSolarHours); // noon on the right (0), midnight left
      const markerR = circleR - 14;
      const mx = circleCx + markerR * Math.cos(angleRad);
      const my = circleCy + markerR * Math.sin(angleRad);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Labels
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(copyText('seasonsInsetDayLabel', 'Day'), circleCx + circleR + 12, circleCy);
      ctx.textAlign = 'right';
      ctx.fillText(copyText('seasonsInsetNightLabel', 'Night'), circleCx - circleR - 12, circleCy);
      ctx.textAlign = 'start';
      const fmtHhMm = (h) => {
        const hh = Math.floor(h) % 24;
        const mm = Math.round((h - Math.floor(h)) * 60);
        return `${String((hh + 24) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      };
      const lstLabel = formatCopy(
        'seasonsInsetLocalSolarTime',
        'Local solar time: {hhmm}',
        { hhmm: fmtHhMm(localSolarHours) }
      );
      ctx.fillText(lstLabel, margin.left, circleCy + circleR + 24);
    }

    function updateCelestial() {
      clearGroupWithDispose(celestialGroup);
      clearGroupWithDispose(terminatorGroup);
      clearGroupWithDispose(visibilityGroup);
      clearGroupWithDispose(tourHighlightGroup);
      planetGroup.updateMatrixWorld(true);
      const dtInput = document.getElementById('datetime').value;
      const date = tourTimeOverride ?? (parseUTC(dtInput) ?? new Date());
      if (isMainEarthPage || isSeasonsPage) {
        clearGroupWithDispose(eclipticGroup);
      } else {
        updateEclipticLine(date);
      }
      const includeMeanSun = analemmaInsetState.enabled
        || isAnalemmaPage
        || (tourState.active && tourState.tourId === 'analemma');
      const { sun, moon, meanSun } = getSubpoints(date, includeMeanSun);
      lastSubpoints = { sun, moon, meanSun };
      const markerGeom = new THREE.SphereGeometry(markerRadius(), 16, 16);

      const includeMoon = !tourState.active && !isAnalemmaPage;
      const bodies = [
        { body: 'sun', point: sun, color: 0xffdd55, showOverlay: false }, // sun overlay handled by night cap instead
        ...(meanSun ? [{ body: 'meanSun', point: meanSun, color: 0xff8800, showOverlay: false }] : []),
        ...(includeMoon ? [{ body: 'moon', point: moon, color: 0x55ddff, showOverlay: true }] : [])
      ];

      bodies.forEach(obj => {
        const moonToggle = document.getElementById('toggleMoonVisibility');
        const sunToggle = document.getElementById('toggleSunVisibility');
        const showVis = obj.body === 'moon'
          ? (moonToggle ? moonToggle.checked : false)
          : (sunToggle ? sunToggle.checked : true);
        const pos = latLonToVec3(obj.point.lat, obj.point.lon, 1.02);
        const marker = new THREE.Mesh(markerGeom, new THREE.MeshBasicMaterial({ color: obj.color }));
        marker.position.copy(pos);
        celestialGroup.add(marker);
        const latLine = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 181 }, (_, i) => {
              const phi = THREE.MathUtils.degToRad(i * 2);
              const lat = THREE.MathUtils.degToRad(obj.point.lat);
              return new THREE.Vector3(
                Math.cos(lat) * Math.sin(phi),
                Math.sin(lat),
                Math.cos(lat) * Math.cos(phi)
              );
            })
          ),
          new THREE.LineBasicMaterial({ color: obj.color, linewidth: 1.5 })
        );
        const lon = THREE.MathUtils.degToRad(obj.point.lon);
        const lonPts = [];
        for (let l = -90; l <= 90; l += 2) {
          const lr = THREE.MathUtils.degToRad(l);
          lonPts.push(new THREE.Vector3(
            Math.cos(lr) * Math.sin(lon),
            Math.sin(lr),
            Math.cos(lr) * Math.cos(lon)
          ));
        }
        const lonLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(lonPts),
          new THREE.LineBasicMaterial({ color: obj.color, linewidth: 1.5 })
        );
        celestialGroup.add(latLine);
        celestialGroup.add(lonLine);
        // Terminator great circle (day/night boundary for sun or moon)
        const dir = latLonToVec3(obj.point.lat, obj.point.lon, 1).normalize();
        const terminator = createTerminatorCircle(dir, obj.color, 1.01);
        terminatorGroup.add(terminator);
        if (obj.showOverlay) {
          const hemi = createVisibilityHemisphere(dir, obj.color, 0.16);
          hemi.visible = showVis;
          hemi.userData.body = obj.body;
          visibilityGroup.add(hemi);
        }
      });

      // Night visibility overlay (dark blue) using the same geometry logic as visibility hemispheres.
      if (sun) {
        const night = createNightHemisphere(latLonToVec3(sun.lat, sun.lon, 1), 0x0a1f4d, 0.42);
        night.visible = document.getElementById('toggleSunVisibility').checked;
        night.userData.body = 'sun';
        visibilityGroup.add(night);
      }

      const twilightAngle = Math.max(0, parseFloat(document.getElementById('twilightAngle').value) || 0);
      const nightOverlayEnabled = document.getElementById('toggleSunVisibility')?.checked;
      if (twilightAngle > 0) {
        const twilightBand = createTwilightBand(
          latLonToVec3(sun.lat, sun.lon, 1),
          0xcc9933,
          nightOverlayEnabled ? 0.28 : 0.18,
          twilightAngle
        );
        twilightBand.userData.body = 'twilight';
        visibilityGroup.add(twilightBand);
      }
      if (!(tourState.active && tourState.tourId === 'analemma')) {
        drawTourLatitudeBand(sun);
      }
      if (tourState.active && tourState.tourId === 'analemma') {
        const tour = tourDefs[tourState.tourId];
        const step = tour?.steps?.[tourState.stepIndex];
        const target = document.getElementById('tourPoiSummary');
        if (target) target.textContent = '';
        drawAnalemmaExtras(step, tourState.poi, sun, meanSun);
        updateAnalemmaOffsets(step, tourState.poi, sun, meanSun);
        updateAnalemmaInset(step, sun, meanSun);
      } else if (analemmaInsetState.enabled) {
        updateAnalemmaInset(analemmaInsetState.mode, sun, meanSun);
      }
      drawObliquityTrace();
      if (isAnalemmaPage) {
        updateAnalemmaPanels(date, sun, meanSun);
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
      if (!(tourState.active && tourState.tourId === 'analemma')) {
        updateDurations(sun, includeMoon ? moon : null);
        updateTourPoiSummary(sun);
      } else {
        // Analemma: keep the global day/night panel; tour offsets handled above when requested.
        updateDurations(sun, includeMoon ? moon : null);
        const target = document.getElementById('tourPoiSummary');
        if (target && !(tourDefs[tourState.tourId]?.steps?.[tourState.stepIndex]?.showOffsets || tourDefs[tourState.tourId]?.steps?.[tourState.stepIndex]?.showEot)) {
          target.textContent = '';
        }
      }
        if (tourState.active && tourState.tourId === 'seasons') {
          updateSeasonsInset(sun);
        } else {
          hideSeasonsInset();
        }
        const camTarget = (tourState.active && tourState.tourId === 'analemma' && (tourDefs[tourState.tourId]?.steps?.[tourState.stepIndex]?.cameraTarget === 'meanSun'))
          ? (meanSun || sun)
          : sun;
      applyCameraMode(camTarget);
      render();
    }

      // Plot initial defaults
      initAnalemmaBreakdown();
      plotPoints();
      updateCelestial();

    // Hover coordinate display
    const leftPanels = document.getElementById('leftPanels');
    const infoPanel = document.getElementById('infoPanel');
    const sidePanels = document.getElementById('sidePanels');
    const toggleInfoBtn = document.getElementById('toggleInfoBtn');
    const toggleControlsBtn = document.getElementById('toggleControlsBtn');
    const isMobile = () => innerWidth <= 900;
    const tourUi = {
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
      desktopControls: document.getElementById('tourDesktopControls'),
      startAnalemma: document.getElementById('startAnalemmaBtn')
    };
    let savedInfoPanelDisplay = '';
    let infoPanelCollapsedByTour = false;
    let savedLeftPanelsWidth = '';
    let leftPanelsWidenedByTour = false;
    function collapseInfoPanelForTour() {
      if (!infoPanel || infoPanelCollapsedByTour) return;
      savedInfoPanelDisplay = infoPanel.style.display;
      infoPanel.style.display = 'none';
      infoPanelCollapsedByTour = true;
      if (leftPanels && !leftPanelsWidenedByTour) {
        savedLeftPanelsWidth = leftPanels.style.width;
        leftPanels.style.width = '520px';
        leftPanelsWidenedByTour = true;
      }
    }
    function restoreInfoPanelAfterTour() {
      if (!infoPanel || !infoPanelCollapsedByTour) return;
      infoPanel.style.display = savedInfoPanelDisplay;
      infoPanelCollapsedByTour = false;
      if (leftPanels && leftPanelsWidenedByTour) {
        leftPanels.style.width = savedLeftPanelsWidth;
        leftPanelsWidenedByTour = false;
      }
    }

    function updateTourAvailability() {
      const mobile = isMobile();
      if (tourUi.mobileMsg) tourUi.mobileMsg.style.display = mobile ? 'block' : 'none';
      if (tourUi.desktopControls) tourUi.desktopControls.style.display = mobile ? 'none' : 'block';
      if (mobile && tourState.active) exitTour(true);
    }
    function readPoiFromInputs() {
      const lat = parseFloat(document.getElementById('lat1').value);
      const lon = parseFloat(document.getElementById('lon1').value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat: THREE.MathUtils.clamp(lat, -90, 90), lon: THREE.MathUtils.euclideanModulo(lon + 180, 360) - 180 };
    }
    function setTourAlert(text) {
      if (!tourUi.alert) return;
      if (!text) {
        tourUi.alert.style.display = 'none';
        tourUi.alert.textContent = '';
        return;
      }
      tourUi.alert.style.display = 'block';
      tourUi.alert.textContent = text;
    }
    function updateTourStepCard() {
      const tour = tourDefs[tourState.tourId] || tourDefs.seasons;
      const step = tour.steps[tourState.stepIndex] || tour.steps[0];
      if (tourUi.card) tourUi.card.style.display = tourState.active ? 'block' : 'none';
      if (tourUi.start) tourUi.start.style.display = (!tourState.active && !isMobile()) ? 'inline-block' : 'none';
      if (tourUi.startAnalemma) tourUi.startAnalemma.style.display = (!tourState.active && !isMobile()) ? 'inline-block' : 'none';
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
      const poiSummary = document.getElementById('tourPoiSummary');
      if (poiSummary && tourState.tourId === 'analemma' && !(step.showOffsets || step.showEot)) {
        poiSummary.textContent = '';
      }
      if (!(tourState.tourId === 'analemma' && step?.showInset)) {
        hideAnalemmaInset();
      }
      if (tourState.tourId !== 'analemma') {
        updateTourPoiSummary(lastSubpoints?.sun);
      }
    }
    function applyTourStep(step) {
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
      let targetDate = null;
      if (step.alignMeanReal) {
        targetDate = alignMeanRealNearEotZero(tourState.poi.lon);
        tourState.anchorDate = targetDate;
      } else if (typeof step.alignDateMs === 'number') {
        // Place local noon for the selected longitude on the specified date.
        const dayMs = 86400000;
        const base = new Date(step.alignDateMs);
        const offsetMs = (-tourState.poi.lon / 360) * dayMs;
        const aligned = new Date(base.getTime() + offsetMs);
        if (step.anchorAligned) tourState.anchorDate = aligned;
        targetDate = typeof step.advanceMs === 'number'
          ? new Date(aligned.getTime() + step.advanceMs)
          : aligned;
      } else if (step.offsetFrom === 'anchor' && tourState.anchorDate && typeof step.offsetMs === 'number') {
        targetDate = new Date(tourState.anchorDate.getTime() + step.offsetMs);
      } else if (step.datetime) {
        targetDate = parseUTC(step.datetime);
      }
      if (targetDate) {
        tourTimeOverride = targetDate; // keep full precision for tours; UI rounds to minutes.
        document.getElementById('datetime').value = formatUTC(roundToMinute(targetDate));
      }
      const rotationOptions = {
        baseDate: targetDate,
        timespanMs: (typeof step.rotationTimespanMs === 'number')
          ? step.rotationTimespanMs
          : (step.rotateSidereal ? SIDEREAL_MS : undefined),
        durationMs: step.rotationDurationMs,
        stepMs: step.rotationStepMs,
        cameraTarget: step.cameraTarget
      };
      if (step.cameraMode) {
        cameraMode = step.cameraMode;
        cameraModeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === cameraMode));
      }
      if (tourState.active) {
        if (tourTwilightAngle === null) {
          const fallback = Number.isFinite(step.twilightAngle) ? step.twilightAngle : parseFloat(twilightInput.value);
          tourTwilightAngle = Number.isFinite(fallback) ? fallback : 0;
        }
        twilightInput.value = tourTwilightAngle;
        twilightValue.textContent = `${tourTwilightAngle} deg`;
      }
      basePlanetYaw = 0;
      planetGroup.rotation.y = basePlanetYaw;
      earth.rotation.y = earthBaseYaw;
      updateTourStepCard();
      updateCelestial();
      if (!step.noRotation) startTourRotation(rotationOptions);
    }
    function goToTourStep(index) {
      const tour = tourDefs[tourState.tourId];
      if (!tour) return;
      const clamped = Math.max(0, Math.min(index, tour.steps.length - 1));
      tourState.stepIndex = clamped;
      applyTourStep(tour.steps[clamped]);
      if (tourState.tourId !== 'analemma') updateTourPoiSummary(lastSubpoints?.sun);
    }
    function advanceTourStep(delta) {
      if (!tourState.active) return;
      const tour = tourDefs[tourState.tourId];
      if (!tour) return;
      const next = Math.max(0, Math.min(tour.steps.length - 1, tourState.stepIndex + delta));
      if (next === tourState.stepIndex) return;
      goToTourStep(next);
    }
    function startTour(tourId = 'seasons') {
      if (isMobile()) {
        setTourAlert('Tours are available on desktop screens.');
        return;
      }
      collapseInfoPanelForTour();
      const tour = tourDefs[tourId] || tourDefs.seasons;
      tourState = {
        active: true,
        tourId: tour.id,
        stepIndex: 0,
        poi: null,
        awaitingPoi: false,
        currentPreset: null,
        anchorDate: null,
        saved: {
          datetime: document.getElementById('datetime').value,
          twilight: document.getElementById('twilightAngle').value,
          cameraMode,
        }
      };
      clickCount = 0;
      if (tour.id === 'seasons') {
        cameraMode = 'dawn';
        cameraModeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === cameraMode));
        applyCameraMode(lastSubpoints?.sun);
      }
      const initTwilight = parseFloat(document.getElementById('twilightAngle').value);
      tourTwilightAngle = Number.isFinite(initTwilight) ? initTwilight : null;
      basePlanetYaw = 0;
      planetGroup.rotation.y = basePlanetYaw;
      updateTourStepCard();
      goToTourStep(0);
    }
    function exitTour(silent = false) {
      if (!tourState.active) return;
      const saved = tourState.saved;
      stopTourRotation();
      restoreInfoPanelAfterTour();
      tourState = {
        active: false,
        tourId: null,
        stepIndex: 0,
        poi: null,
        awaitingPoi: false,
        currentPreset: null,
        anchorDate: null,
        saved: null
      };
      tourTwilightAngle = null;
      basePlanetYaw = 0;
      planetGroup.rotation.y = basePlanetYaw;
      if (saved) {
        document.getElementById('datetime').value = saved.datetime;
        document.getElementById('twilightAngle').value = saved.twilight;
        twilightValue.textContent = `${saved.twilight} deg`;
        cameraMode = saved.cameraMode;
        cameraModeButtons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.mode === cameraMode);
        });
      }
      updateTourStepCard();
      if (!silent) updateCelestial();
    }
    if (tourUi.start) tourUi.start.addEventListener('click', () => startTour('seasons'));
    if (tourUi.startAnalemma) tourUi.startAnalemma.addEventListener('click', () => startTour('analemma'));
    if (tourUi.exit) tourUi.exit.addEventListener('click', () => exitTour());
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
    updateTourAvailability();
    updateTourStepCard();
    applyTourCopy();
    applyFaqSchema();
    applyLangSwitcherLinks();
    if (normalizedForcedTour && !tourState.active && !isMobile()) {
      startTour(normalizedForcedTour);
    }
    if (tourState.active) updateTourStepCard();

    // Track user preference so keyboard-triggered resizes on mobile don't auto-hide panels.
    let infoVisible = !isMobile();
    let controlsVisible = !isMobile();
      function applyPanelVisibility() {
        if (leftPanels) {
          if (isAnalemmaPage) {
            leftPanels.style.display = 'flex';
            if (infoPanel) infoPanel.style.display = infoVisible ? 'block' : 'none';
          } else {
            leftPanels.style.display = infoVisible ? 'flex' : 'none';
          }
        } else {
          infoPanel.style.display = infoVisible ? 'block' : 'none';
        }
      if (controlsVisible) {
        sidePanels.style.display = isMobile() ? 'block' : 'flex';
      } else {
        sidePanels.style.display = 'none';
      }
      updateTourAvailability();
    }
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

      function initAnalemmaBreakdown() {
        const panel = document.getElementById('analemmaBreakdown');
        if (!panel) return;
        analemmaInsetState.enabled = false;
        analemmaUi.tooltip.el = document.getElementById('analemmaTooltip');
        analemmaUi.charts.ecc.canvas = document.getElementById('eccentricityChart');
        analemmaUi.charts.obliq.canvas = document.getElementById('obliquityChart');
        analemmaUi.charts.combined.canvas = document.getElementById('analemmaCombinedChart');
        attachAnalemmaTooltip(analemmaUi.charts.ecc.canvas, 'ecc');
        attachAnalemmaTooltip(analemmaUi.charts.obliq.canvas, 'obliq');
        const tabButtons = Array.from(panel.querySelectorAll('.analemma-tab'));
        const tabPanels = Array.from(panel.querySelectorAll('.analemma-tab-panel'));
        const setTab = (tabId) => {
          if (!tabId) return;
          analemmaUi.tab = tabId;
          tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
          tabPanels.forEach(tabPanel => tabPanel.classList.toggle('active', tabPanel.dataset.tab === tabId));
          analemmaUi.tooltip.pinned = false;
          analemmaUi.tooltip.source = null;
          hideAnalemmaTooltip();
          if (tabId === 'combined') {
            analemmaInsetState.enabled = true;
            analemmaInsetState.mode = 'sidereal';
          } else {
            analemmaInsetState.enabled = false;
            hideAnalemmaInset();
          }
          updateAnalemmaChartHeights();
          updateCelestial();
          if (tabId === 'combined' && lastSubpoints?.sun) {
            updateAnalemmaInset(analemmaInsetState.mode, lastSubpoints.sun, lastSubpoints.meanSun);
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
            });
          };
          initCardToggles();

          const playBtn = document.getElementById('analemmaPlayBtn');
          const pauseBtn = document.getElementById('analemmaPauseBtn');
          const resetBtn = document.getElementById('analemmaResetBtn');
        if (playBtn) {
          playBtn.addEventListener('click', () => {
            const resume = !!obliquityTrace.startDate;
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
          hideAnalemmaTooltip();
        });
      }

      function onResize() {
        const size = getSceneSize();
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
        renderer.setSize(size.width, size.height);
        if (isAnalemmaPage) {
          const current = tourTimeOverride ?? (parseUTC(document.getElementById('datetime').value) ?? new Date());
          if (lastSubpoints?.sun) {
            updateAnalemmaPanels(current, lastSubpoints.sun, lastSubpoints.meanSun);
          } else {
            updateCelestial();
          }
        }
        render();
      }
    addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      if (tourRotation.active) {
        const now = performance.now();
        const t = (now - tourRotation.startReal) / tourRotation.duration;
        tourRotation.progress = Math.min(1, Math.max(0, t));
        const timespan = tourRotation.timespanMs ?? SIDEREAL_MS;
        let offsetMs = timespan * tourRotation.progress;
        const stepMs = tourRotation.stepMs;
        if (tourRotation.progress >= 1) {
          offsetMs = timespan;
        } else if (typeof stepMs === 'number' && stepMs > 0) {
          offsetMs = Math.floor(offsetMs / stepMs) * stepMs;
          if (offsetMs > timespan) offsetMs = timespan;
        }
        const currentDate = new Date(tourRotation.baseDate.getTime() + offsetMs);
        earth.rotation.y = earthBaseYaw;
        tourTimeOverride = currentDate;
        document.getElementById('datetime').value = formatUTC(roundToMinute(currentDate));
        const quantized = typeof stepMs === 'number' && stepMs > 0;
        let didUpdate = false;
        if (quantized) {
          const ms = currentDate.getTime();
          if (tourRotation.lastDateMs !== ms) {
            tourRotation.lastDateMs = ms;
            updateCelestial();
            tourRotation.lastUpdate = now;
            didUpdate = true;
          }
        } else if (!tourRotation.lastUpdate || now - tourRotation.lastUpdate > 50) {
          updateCelestial();
          tourRotation.lastUpdate = now;
          didUpdate = true;
        }
        if (tourRotation.progress >= 1) {
          stopTourRotation({ preserveOverride: true, finalDate: currentDate });
          updateTourStepCard();
          if (!didUpdate) updateCelestial();
        }
      }
      controls.update();
      render();
    }
    function render() {
      renderer.render(scene, camera);
    }
    animate();



