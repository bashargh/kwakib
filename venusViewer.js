import * as THREE from 'three';
    import {
      normalizeDeg as normalizeLon,
      subpointFromBody
    } from './astroCore.js';
import {
      latLonToVec3
    } from './viewerGlobe.js';
import {
      adjustDate,
      caretUnit,
      formatLocalTime,
      formatUTC,
      parseUTC,
      pointTimeZone,
      rangeForUnit
    } from './viewerTime.js';
import { createViewerControls } from './viewerControls.js';
import { initViewerPanels } from './viewerPanels.js';
import { createGlobeViewerCore } from './globeViewerCore.js';
import { createSkyInset } from './viewerSky.js';
import { bindGlobePointer } from './viewerPointer.js';
import { formatSkyRows } from './viewerSkyReadout.js';
import { prepareOrbitCanvas, setOrbitLabelStyle, updateLocalTimeBox } from './viewerOrbit.js';
import {
      addLatLonLines,
      addNightHemisphere,
      addSubpointMarker,
      addTerminator,
      addTwilightBand,
      addVisibilityHemisphere
    } from './viewerOverlays.js';
    const Astronomy = globalThis.Astronomy;
    let lastSubpoints = null;
    let terminatorSide = 1; // 1 for dawn, -1 for dusk
    const getSubpoints = (date) => {
      const when = date || new Date();
      return {
        sun: subpointFromBody(Astronomy.Body.Sun, when),
        venus: subpointFromBody(Astronomy.Body.Venus, when)
      };
    };

    const container = document.getElementById('scene');
    const {
      scene,
      camera,
      renderer,
      controls,
      earth,
      planetGroup,
      groups: {
        userHighlightGroup,
        userMarkersGroup,
        celestialGroup,
        terminatorGroup,
        visibilityGroup
      },
      resize: resizeCore
    } = createGlobeViewerCore({ container });
    const orbitCanvas = document.getElementById('orbitCanvas');
    const orbitCtx = orbitCanvas?.getContext('2d');
    const ORBIT_AVG = { earth: 1.0, venus: 0.723 };
    const ROT_EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
    const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const indicatorGroup = new THREE.Group(); // arrows or other indicators
    planetGroup.add(indicatorGroup);
    const skyInset = createSkyInset({
      containerId: 'sky3dContainer',
      cameraPosition: [2.0, 1.6, 2.0],
      minDistance: 1.6,
      maxDistance: 3.6,
      target: [0, 0.15, 0]
    });
    function getSelectedPoint() {
      const lat = parseFloat(document.getElementById('lat1').value);
      const lonRaw = parseFloat(document.getElementById('lon1').value);
      if (!Number.isFinite(lat) || !Number.isFinite(lonRaw)) return null;
      return { lat: THREE.MathUtils.clamp(lat, -90, 90), lon: normalizeLon(lonRaw) };
    }
    function updateLocalTime(date) {
      updateLocalTimeBox({
        point: getSelectedPoint(),
        date,
        pointTimeZone,
        formatLocalTime,
        defaultTimeZone,
        label: 'Local time'
      });
    }
    function localBasis(latDeg, lonDeg) {
      const up = latLonToVec3(latDeg, lonDeg, 1).normalize();
      const north = latLonToVec3(latDeg + 0.01, lonDeg, 1).sub(up).normalize();
      const east = new THREE.Vector3().crossVectors(north, up).normalize(); // ensure east aligns with increasing longitude
      return { up, north, east };
    }
    function updateUpArrow(pointOverride) {
      const point = pointOverride || getSelectedPoint();
      if (!point) return;
      const { up } = localBasis(point.lat, point.lon);
      const start = up.clone().multiplyScalar(1.01);
      const end = up.clone().multiplyScalar(1.38);
      const lineGeom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x66aaff, linewidth: 2 });
      indicatorGroup.add(new THREE.Line(lineGeom, lineMat));
      const coneGeom = new THREE.ConeGeometry(0.01, 0.06, 12);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0x66aaff });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize());
      indicatorGroup.add(cone);
    }
    function updateVenusArrow(date, venusPoint) {
      const point = getSelectedPoint();
      if (!point || !venusPoint) return;
      const time = Astronomy.MakeTime(date);
      const observer = new Astronomy.Observer(point.lat, point.lon, 0);
      const eq = Astronomy.Equator(Astronomy.Body.Venus, time, observer, true, true);
      const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
      if (!hor || hor.altitude <= 0) return; // below horizon

      const azRad = THREE.MathUtils.degToRad(hor.azimuth);
      const altRad = THREE.MathUtils.degToRad(hor.altitude);
      const { up, north, east } = localBasis(point.lat, point.lon);
      const horizDir = new THREE.Vector3()
        .addScaledVector(north, Math.cos(azRad))
        .addScaledVector(east, Math.sin(azRad))
        .normalize();
      const dir = new THREE.Vector3()
        .addScaledVector(horizDir, Math.cos(altRad))
        .addScaledVector(up, Math.sin(altRad))
        .normalize();

      const start = up.clone().multiplyScalar(1.01);
      const end = start.clone().addScaledVector(dir, 0.35);

      const lineGeom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xb377ff, linewidth: 2 });
      indicatorGroup.add(new THREE.Line(lineGeom, lineMat));

      const coneGeom = new THREE.ConeGeometry(0.01, 0.06, 12);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xb377ff });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      indicatorGroup.add(cone);
    }
    function addAzAltArrow(point, azDeg, altDeg, color, opts = {}) {
      if (!point || !Number.isFinite(azDeg) || !Number.isFinite(altDeg)) return;
      const { up, north, east } = localBasis(point.lat, point.lon);
      const start = up.clone().multiplyScalar(1.01);
      const drawAlt = opts.floorAlt !== undefined ? Math.max(altDeg, opts.floorAlt) : altDeg;
      const len = opts.length ?? 0.32;
      const azRad = THREE.MathUtils.degToRad(azDeg);
      const altRad = THREE.MathUtils.degToRad(drawAlt);
      const horizDir = new THREE.Vector3()
        .addScaledVector(north, Math.cos(azRad))
        .addScaledVector(east, Math.sin(azRad))
        .normalize();
      const dir = new THREE.Vector3()
        .addScaledVector(horizDir, Math.cos(altRad))
        .addScaledVector(up, Math.sin(altRad))
        .normalize();
      const end = start.clone().addScaledVector(dir, len);
      const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const mat = opts.dashed
        ? new THREE.LineDashedMaterial({ color, linewidth: 2, dashSize: 0.03, gapSize: 0.015, opacity: opts.opacity ?? 1, transparent: true })
        : new THREE.LineBasicMaterial({ color, linewidth: 2, opacity: opts.opacity ?? 1, transparent: opts.opacity !== undefined });
      const line = new THREE.Line(geom, mat);
      if (opts.dashed) line.computeLineDistances();
      indicatorGroup.add(line);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.01, 0.06, 12),
        new THREE.MeshBasicMaterial({ color, opacity: opts.opacity ?? 1, transparent: opts.opacity !== undefined })
      );
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      indicatorGroup.add(cone);
    }
    function drawHorizonRing(point) {
      if (!point) return;
      const { up, north, east } = localBasis(point.lat, point.lon);
      const center = up.clone().multiplyScalar(1.01);
      const radius = 0.23;
      const pts = [];
      for (let deg = 0; deg <= 360; deg += 6) {
        const rad = THREE.MathUtils.degToRad(deg);
        const dir = new THREE.Vector3()
          .addScaledVector(east, Math.cos(rad))
          .addScaledVector(north, Math.sin(rad))
          .normalize();
        pts.push(center.clone().addScaledVector(dir, radius));
      }
      const ringGeom = new THREE.BufferGeometry().setFromPoints(pts);
      const ringMat = new THREE.LineBasicMaterial({ color: 0x6a7694, linewidth: 1.5, opacity: 0.85, transparent: true });
      indicatorGroup.add(new THREE.LineLoop(ringGeom, ringMat));
      const tickLen = 0.045;
      const addTick = (dirVec, color) => {
        const tickGeom = new THREE.BufferGeometry().setFromPoints([
          center.clone().addScaledVector(dirVec, radius),
          center.clone().addScaledVector(dirVec, radius + tickLen)
        ]);
        indicatorGroup.add(new THREE.Line(tickGeom, new THREE.LineBasicMaterial({ color, linewidth: 2 })));
      };
      addTick(north, 0x9dc5ff);
      addTick(east, 0x9dc5ff);
      addTick(north.clone().multiplyScalar(-1), 0x9dc5ff);
      addTick(east.clone().multiplyScalar(-1), 0x9dc5ff);
    }
    const skyPanelVisible = () => true;
    function ensureSkyScene() {
      skyInset.ensure();
    }
    function resizeSkyRenderer() {
      skyInset.resize();
    }
    function clearSkyArrows() {
      skyInset.clearArrows();
    }
    function addSkyArrow(azDeg, altDeg, color, opts = {}) {
      skyInset.addArrow(azDeg, altDeg, color, opts);
    }
    function renderSky() {
      if (!skyPanelVisible()) return;
      skyInset.render();
    }
    function computeHorizons(date) {
      const point = getSelectedPoint();
      if (!point) return null;
      const time = Astronomy.MakeTime(date);
      const observer = new Astronomy.Observer(point.lat, point.lon, 0);
      const sunEq = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
      const venusEq = Astronomy.Equator(Astronomy.Body.Venus, time, observer, true, true);
      const sunHor = Astronomy.Horizon(time, observer, sunEq.ra, sunEq.dec, 'normal');
      const venusHor = Astronomy.Horizon(time, observer, venusEq.ra, venusEq.dec, 'normal');
      return { point, time, sunHor, venusHor };
    }
    function updateSkyOverlay(date, orbitInfo, horizons) {
      const box = document.getElementById('skyView');
      const venusBox = document.getElementById('venusReadout');
      const hint = document.getElementById('skyHint');
      const sunWarning = document.getElementById('skySunWarning');
      const skyContainer = document.getElementById('sky3dContainer');
      const data = horizons || computeHorizons(date);
      if (!box) return;
      if (!data) {
        box.innerHTML = '';
        if (venusBox) venusBox.innerHTML = '';
        if (hint) hint.style.display = 'flex';
        if (sunWarning) sunWarning.style.display = 'none';
        if (skyContainer) skyContainer.classList.remove('sun-visible');
        clearSkyArrows();
        renderSky();
        return;
      }
      if (hint) hint.style.display = 'none';
      const { sunHor, venusHor } = data;
      const sunVisible = sunHor.altitude > 0;
      if (sunWarning) sunWarning.style.display = sunVisible ? 'block' : 'none';
      if (skyContainer) skyContainer.classList.toggle('sun-visible', sunVisible);
      const overlayOn = skyPanelVisible();
      clearSkyArrows();
      if (overlayOn) {
        ensureSkyScene();
        if (sunHor.altitude > 0) {
          addSkyArrow(sunHor.azimuth, sunHor.altitude, 0xffdd55, { length: 1.2, opacity: 0.9 });
        }
        if (venusHor.altitude > 0) {
          addSkyArrow(venusHor.azimuth, venusHor.altitude, 0xb377ff, { length: 1.2, opacity: 0.9 });
        }
      }
      box.innerHTML = formatSkyRows({
        entries: [
          { label: 'Sun', az: sunHor.azimuth, alt: sunHor.altitude },
          { label: 'Venus', az: venusHor.azimuth, alt: venusHor.altitude }
        ],
        labels: {
          az: 'az',
          alt: 'alt',
          deg: ' deg',
          na: 'n/a',
          belowHorizon: ' (below horizon here)',
          pairSep: ','
        }
      });
      if (venusBox) {
        venusBox.innerHTML = '';
      }
      renderSky();
    }
    function updateEarthArrows(date, horizons) {
      const data = horizons || computeHorizons(date);
      if (!data) return;
      const { point, sunHor, venusHor } = data;
      updateUpArrow(point);
      if (sunHor.altitude > 0) {
        addAzAltArrow(point, sunHor.azimuth, sunHor.altitude, 0xffdd55, { length: 0.34, opacity: 0.9 });
      }
      if (venusHor.altitude > 0) {
      addAzAltArrow(point, venusHor.azimuth, venusHor.altitude, 0xb377ff, { length: 0.34, opacity: 0.9 });
      }
    }
    function heliocentricEcliptic(body, time) {
      const vec = Astronomy.HelioVector(body, time);
      return Astronomy.RotateVector(ROT_EQJ_TO_ECL, vec);
    }
    function drawOrbitDiagram(date) {
      if (!orbitCanvas || !orbitCtx) return null;
      const time = Astronomy.MakeTime(date);
      const earthEcl = heliocentricEcliptic(Astronomy.Body.Earth, time);
      const venusEcl = heliocentricEcliptic(Astronomy.Body.Venus, time);
      const earthR = Math.hypot(earthEcl.x, earthEcl.y);
      const venusR = Math.hypot(venusEcl.x, venusEcl.y);
      const maxR = Math.max(earthR, venusR, 1);
      const { w, h, cx, cy } = prepareOrbitCanvas({ canvas: orbitCanvas, ctx: orbitCtx });
      const margin = 18;
      const scale = (Math.min(w, h) / 2 - margin) / maxR;

      const drawOrbit = (r, color) => {
        const rad = r * scale;
        orbitCtx.setLineDash([5, 4]);
        orbitCtx.strokeStyle = color;
        orbitCtx.beginPath();
        orbitCtx.arc(cx, cy, rad, 0, Math.PI * 2);
        orbitCtx.stroke();
        orbitCtx.setLineDash([]);
      };
      drawOrbit(ORBIT_AVG.earth, '#2a89ff');
      drawOrbit(ORBIT_AVG.venus, '#ff77cc');

      const toScreen = (v) => ({ x: cx + v.x * scale, y: cy - v.y * scale });

      const earthPos = toScreen(earthEcl);
      const venusPos = toScreen(venusEcl);

      orbitCtx.fillStyle = '#ffdd55';
      orbitCtx.beginPath();
      orbitCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      orbitCtx.fill();

      orbitCtx.fillStyle = '#4da3ff';
      orbitCtx.beginPath();
      orbitCtx.arc(earthPos.x, earthPos.y, 5, 0, Math.PI * 2);
      orbitCtx.fill();

      orbitCtx.fillStyle = '#ff77cc';
      orbitCtx.beginPath();
      orbitCtx.arc(venusPos.x, venusPos.y, 5, 0, Math.PI * 2);
      orbitCtx.fill();

      setOrbitLabelStyle(orbitCtx);
      orbitCtx.fillText('Sun', cx + 8, cy - 8);
      orbitCtx.fillText('Earth', earthPos.x + 8, earthPos.y - 4);
      orbitCtx.fillText('Venus', venusPos.x + 8, venusPos.y - 4);

      const venusGeo = Astronomy.GeoVector(Astronomy.Body.Venus, time, true);
      const venusEarthDistance = Math.hypot(venusGeo.x, venusGeo.y, venusGeo.z);
      const sunGeo = Astronomy.GeoVector(Astronomy.Body.Sun, time, true);
      const dot = venusGeo.x * sunGeo.x + venusGeo.y * sunGeo.y + venusGeo.z * sunGeo.z;
      const sunMag = Math.hypot(sunGeo.x, sunGeo.y, sunGeo.z) || 1;
      const venusMag = Math.hypot(venusGeo.x, venusGeo.y, venusGeo.z) || 1;
      const cosElong = THREE.MathUtils.clamp(dot / (sunMag * venusMag), -1, 1);
      const elongDeg = Math.acos(cosElong) * Astronomy.RAD2DEG;

        return { elongDeg };
      }
    function updateOrbitText(info) {
        const box = document.getElementById('orbitData');
        if (!box) return;
        if (!info) {
          box.innerHTML = '';
          return;
        }
        box.innerHTML = `
        <div>Venus elongation: ${info.elongDeg.toFixed(1)}&deg;</div>
        `;
      }
    const isMobileView = () => {
      const vv = window.visualViewport;
      if (vv && Number.isFinite(vv.width)) return vv.width <= 900;
      if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
      return innerWidth <= 900;
    };
    const markerRadius = () => (isMobileView() ? 0.018 : 0.01);

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

    function plotPoints() {
      // Clear previous markers/highlights
      userHighlightGroup.clear();
      userMarkersGroup.clear();
      indicatorGroup.clear();

      const point = getSelectedPoint();
      if (!point) {
        render();
        return;
      }
      const pts = [{ ...point, color: 0xffaa33 }];

      const markerGeom = new THREE.SphereGeometry(markerRadius(), 16, 16);

      pts.forEach(p => {
        const pos = latLonToVec3(p.lat, p.lon, 1.01);
        const marker = new THREE.Mesh(markerGeom, new THREE.MeshBasicMaterial({ color: p.color }));
        marker.position.copy(pos);
        userMarkersGroup.add(marker);
        addHighlightLines(p.lat, p.lon, p.color);
      });

      updateLocalTime(parseUTC(document.getElementById('datetime').value) ?? new Date());
      render();
    }
    function setPoint(latDeg, lonDeg) {
      const latInput = document.getElementById('lat1');
      const lonInput = document.getElementById('lon1');
      latInput.value = latDeg.toFixed(2);
      lonInput.value = lonDeg.toFixed(2);
      plotPoints();
      updateCelestial();
    }

    document.getElementById('plotBtn').addEventListener('click', (e) => {
      e.preventDefault();
      plotPoints();
      updateCelestial();
    });
    document.getElementById('clearPointsBtn').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('lat1').value = '';
      document.getElementById('lon1').value = '';
      updateLocalTime(parseUTC(document.getElementById('datetime').value) ?? new Date());
      plotPoints();
      updateCelestial();
    });
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
      const dir = latLonToVec3(subsolar.lat, subsolar.lon, 1).normalize();
      const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const east = new THREE.Vector3().crossVectors(up, dir).normalize();
      const radius = Math.max(1.5, camera.position.length());
      const viewVec = east.multiplyScalar(side * radius);
      camera.position.copy(viewVec);
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
    createViewerControls({
      parseUTC,
      formatUTC,
      caretUnit,
      rangeForUnit,
      adjustDate,
      onDateInput: updateCelestial,
      onDateChange: updateCelestial,
      onNowClick: seedDateTime,
      onTwilightInput: () => updateCelestial(),
      onVisibilityChange: () => {
        const sunOn = document.getElementById('toggleSunVisibility').checked;
        const venusOn = document.getElementById('toggleVenusVisibility').checked;
        visibilityGroup.children.forEach(mesh => {
          if (mesh.userData.body === 'sun') mesh.visible = sunOn;
          if (mesh.userData.body === 'venus') mesh.visible = venusOn;
        });
        render();
      },
      setCameraMode: (mode) => { cameraMode = mode; },
      applyCameraMode,
      visibilityToggleIds: ['toggleSunVisibility', 'toggleVenusVisibility']
    });
    const shiftMonth = (mult) => {
      const current = parseUTC(document.getElementById('datetime').value) ?? new Date();
      const shifted = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth() + mult,
        current.getUTCDate(),
        current.getUTCHours(),
        current.getUTCMinutes(),
        0,
        0
      ));
      document.getElementById('datetime').value = formatUTC(shifted);
      updateCelestial();
    };
    document.getElementById('monthMinusBtn').addEventListener('click', (e) => {
      e.preventDefault();
      shiftMonth(-1);
    });
    document.getElementById('monthPlusBtn').addEventListener('click', (e) => {
      e.preventDefault();
      shiftMonth(1);
    });
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
    // Hover and click on globe to place points
    const hoverLabel = document.getElementById('hoverLabel');
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
        hoverLabel.textContent = `Hover: lat ${lat.toFixed(2)}, lon ${lon.toFixed(2)}`;
      },
      onClick: (lat, lon) => {
        if (lat === null || lon === null) return;
        setPoint(lat, lon);
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
    seedDateTime();

    function updateCelestial() {
      celestialGroup.clear();
      terminatorGroup.clear();
      visibilityGroup.clear();
      indicatorGroup.clear();
      const dtInput = document.getElementById('datetime').value;
      const date = parseUTC(dtInput) ?? new Date();
      const { sun, venus } = getSubpoints(date);
      lastSubpoints = { sun, venus };
      const markerGeom = new THREE.SphereGeometry(markerRadius(), 16, 16);

      const bodies = [
        { body: 'sun', point: sun, color: 0xffdd55, showOverlay: false }, // day-side tint handled by night cap
        { body: 'venus', point: venus, color: 0xb377ff, showOverlay: true }
      ];

      bodies.forEach(obj => {
        const showVis = obj.body === 'venus'
          ? document.getElementById('toggleVenusVisibility').checked
          : document.getElementById('toggleSunVisibility').checked;
        addSubpointMarker({
          group: celestialGroup,
          markerGeom,
          point: obj.point,
          color: obj.color,
          latLonToVec3
        });
        addLatLonLines({ group: celestialGroup, point: obj.point, color: obj.color });
        addTerminator({ group: terminatorGroup, point: obj.point, color: obj.color, latLonToVec3 });
        if (obj.showOverlay) {
          addVisibilityHemisphere({
            group: visibilityGroup,
            point: obj.point,
            color: obj.color,
            latLonToVec3,
            visible: showVis,
            body: obj.body
          });
        }
      });

      // Night side overlay (dark blue) to match Earth viewer styling
      if (sun) {
        addNightHemisphere({
          group: visibilityGroup,
          point: sun,
          latLonToVec3,
          visible: document.getElementById('toggleSunVisibility').checked,
          body: 'sun'
        });
      }

      const twilightAngle = Math.max(0, parseFloat(document.getElementById('twilightAngle').value) || 0);
      addTwilightBand({
        group: visibilityGroup,
        point: sun,
        latLonToVec3,
        angle: twilightAngle,
        body: 'twilight'
      });

      const fmt = (v) => v.toFixed(2);
      const info = `
        <div><strong>Subsolar:</strong> lat ${fmt(sun.lat)} deg, lon ${fmt(sun.lon)} deg</div>
        <div><strong>Sub-Venus:</strong> lat ${fmt(venus.lat)} deg, lon ${fmt(venus.lon)} deg</div>
      `;
      document.getElementById('subpoints').innerHTML = info;
      const orbitInfo = drawOrbitDiagram(date);
      updateOrbitText(orbitInfo);
      updateLocalTime(date);
      const horizons = computeHorizons(date);
      updateSkyOverlay(date, orbitInfo, horizons);
      updateEarthArrows(date, horizons);
      applyCameraMode(sun);
      render();
    }

    // Plot initial defaults (no point pre-selected)
    plotPoints();
    updateCelestial();

    // Hover coordinate display
    const infoPanel = document.getElementById('infoPanel');
    const sidePanels = document.getElementById('sidePanels');
    const toggleInfoBtn = document.getElementById('toggleInfoBtn');
    const toggleControlsBtn = document.getElementById('toggleControlsBtn');
    const tourPanel = document.getElementById('tourPanel');
    const creditsToggle = document.getElementById('creditsToggle');
    const footer = document.querySelector('footer');
    const isMobile = () => isMobileView();

    function resizeRendererToContainer() {
      resizeCore();
    }

    initViewerPanels({
      infoPanel,
      sidePanels,
      toggleInfoBtn,
      toggleControlsBtn,
      tourPanel,
      creditsToggle,
      footer,
      isMobile,
      collapsibleIds: ['sunVenusSection', 'cameraSection', 'twilightSection', 'pointSection'],
      defaultInfoVisible: isMobileView() ? true : false,
      defaultControlsVisible: true,
      onApply: resizeRendererToContainer,
      onResize: resizeSkyRenderer
    });

    // Apply initial sizing
    resizeSkyRenderer();

    // No default point; user must select

    function onResize() {
      resizeRendererToContainer();
      resizeSkyRenderer();
      render();
    }
    addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      if (skyPanelVisible()) skyInset.updateControls();
      render();
    }
    function render() {
      renderer.render(scene, camera);
      renderSky();
    }
    animate();

