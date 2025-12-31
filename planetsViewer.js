import * as THREE from 'three';
    import {
      OBLIQUITY_RAD,
      normalizeDeg as normalizeLon,
      subpointFromBody
    } from './astroCore.js';
import {
      createTerminatorCircle,
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
      addTwilightBand
    } from './viewerOverlays.js';
    const Astronomy = globalThis.Astronomy;
    let lastSubpoints = null;
    const labelDataset = (typeof document !== 'undefined' && document.body) ? document.body.dataset : {};
    const LABELS = {
      sun: labelDataset.labelSun || 'Sun',
      subsolar: labelDataset.labelSubsolar || 'Subsolar',
      visiblePlanets: labelDataset.labelVisiblePlanets || 'Visible planets',
      none: labelDataset.labelNone || 'None',
      orbitScale: labelDataset.labelOrbitScale || 'Orbit scale',
      az: labelDataset.labelAz || 'az',
      alt: labelDataset.labelAlt || 'alt',
      deg: labelDataset.labelDeg || ' deg',
      na: labelDataset.labelNa || 'n/a',
      belowHorizon: labelDataset.labelBelowHorizon || ' (below horizon here)',
      pairSep: labelDataset.labelPairSep || ',',
      joinSep: labelDataset.labelJoinSep || ', '
    };
    const planetLabelOverrides = {
      mercury: labelDataset.planetMercury,
      venus: labelDataset.planetVenus,
      earth: labelDataset.planetEarth,
      mars: labelDataset.planetMars,
      jupiter: labelDataset.planetJupiter,
      saturn: labelDataset.planetSaturn,
      uranus: labelDataset.planetUranus,
      neptune: labelDataset.planetNeptune
    };
    const getPlanetLabel = (planet) => planetLabelOverrides[planet.key] || planet.label;
    const PLANET_DEFS = [
      { key: 'mercury', body: Astronomy.Body.Mercury, label: 'Mercury', color: 0xb6b1ad, orbit: 0.387, sky: true },
      { key: 'venus', body: Astronomy.Body.Venus, label: 'Venus', color: 0xff77cc, orbit: 0.723, sky: true },
      { key: 'earth', body: Astronomy.Body.Earth, label: 'Earth', color: 0x4da3ff, orbit: 1.0, sky: false },
      { key: 'mars', body: Astronomy.Body.Mars, label: 'Mars', color: 0xff3b30, orbit: 1.524, sky: true },
      { key: 'jupiter', body: Astronomy.Body.Jupiter, label: 'Jupiter', color: 0xd08a4b, orbit: 5.203, sky: true },
      { key: 'saturn', body: Astronomy.Body.Saturn, label: 'Saturn', color: 0xe7d27b, orbit: 9.537, sky: true },
      { key: 'uranus', body: Astronomy.Body.Uranus, label: 'Uranus', color: 0x86d4ff, orbit: 19.191, sky: true },
      { key: 'neptune', body: Astronomy.Body.Neptune, label: 'Neptune', color: 0x5aa2ff, orbit: 30.07, sky: true }
    ];
    const SKY_PLANETS = PLANET_DEFS.filter(p => p.sky);
    const ORBIT_SCALE = {
      label: 'log10(1 + AU)',
      radius: (r) => Math.log10(r + 1)
    };
    const colorToHex = (value) => `#${value.toString(16).padStart(6, '0')}`;
    const getSubpoints = (date) => {
      const when = date || new Date();
      return {
        sun: subpointFromBody(Astronomy.Body.Sun, when),
        planets: SKY_PLANETS.map((planet) => ({
          ...planet,
          label: getPlanetLabel(planet),
          point: subpointFromBody(planet.body, when)
        }))
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
        visibilityGroup,
        eclipticGroup
      },
      resize: resizeCore
    } = createGlobeViewerCore({ container });
    const orbitCanvas = document.getElementById('orbitCanvas');
    const orbitCtx = orbitCanvas?.getContext('2d');
    const ROT_EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
    const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const indicatorGroup = new THREE.Group(); // arrows or other indicators
    planetGroup.add(indicatorGroup);
    const skyInset = createSkyInset({
      containerId: 'sky3dContainer',
      cameraPosition: [1.6, 1.2, 1.6],
      minDistance: 1.4,
      maxDistance: 3.0,
      target: [0, 0.2, 0]
    });
    function updateEclipticLine(date) {
      eclipticGroup.clear();
      if (!date || typeof Astronomy === 'undefined') return;
      const time = Astronomy.MakeTime(date);
      const gast = Astronomy.SiderealTime(time); // hours
      const obliqDeg = OBLIQUITY_RAD * 180 / Math.PI;
      const raHours = 18;
      const decDeg = 90 - obliqDeg;
      const lon = normalizeLon((raHours - gast) * 15);
      const normal = latLonToVec3(decDeg, lon, 1).normalize();
      const eclipticRadius = 1.006;
      const ecliptic = createTerminatorCircle(normal, 0x7ee787, eclipticRadius);
      ecliptic.material.transparent = true;
      ecliptic.material.opacity = 0.85;
      eclipticGroup.add(ecliptic);
      const nodeLon = normalizeLon(-gast * 15);
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
      const sunHor = Astronomy.Horizon(time, observer, sunEq.ra, sunEq.dec, 'normal');
      const planets = SKY_PLANETS.map((planet) => {
        const eq = Astronomy.Equator(planet.body, time, observer, true, true);
        const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
        return { ...planet, label: getPlanetLabel(planet), hor };
      });
      return { point, time, sunHor, planets };
    }
    function updateSkyOverlay(date, orbitInfo, horizons) {
      const box = document.getElementById('skyView');
      const planetsBox = document.getElementById('planetsReadout');
      const hint = document.getElementById('skyHint');
      const sunWarning = document.getElementById('skySunWarning');
      const skyContainer = document.getElementById('sky3dContainer');
      const data = horizons || computeHorizons(date);
      if (!box) return;
      if (!data) {
        box.innerHTML = '';
        if (planetsBox) planetsBox.innerHTML = '';
        if (hint) hint.style.display = 'flex';
        if (sunWarning) sunWarning.style.display = 'none';
        if (skyContainer) skyContainer.classList.remove('sun-visible');
        clearSkyArrows();
        renderSky();
        return;
      }
      if (hint) hint.style.display = 'none';
      const { sunHor, planets } = data;
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
        planets.forEach((planet) => {
          if (planet.hor.altitude > 0) {
            addSkyArrow(planet.hor.azimuth, planet.hor.altitude, planet.color, { length: 1.2, opacity: 0.9 });
          }
        });
      }
      const entries = [
        { label: LABELS.sun, az: sunHor.azimuth, alt: sunHor.altitude },
        ...planets.map(planet => ({
          label: planet.label,
          az: planet.hor.azimuth,
          alt: planet.hor.altitude
        }))
      ];
      box.innerHTML = formatSkyRows({
        entries,
        labels: {
          az: LABELS.az,
          alt: LABELS.alt,
          deg: LABELS.deg,
          na: LABELS.na,
          belowHorizon: LABELS.belowHorizon,
          pairSep: LABELS.pairSep
        }
      });
      if (planetsBox) {
        const visible = planets.filter(p => p.hor.altitude > 0).map(p => p.label);
        planetsBox.innerHTML = `<div><strong>${LABELS.visiblePlanets}:</strong> ${visible.length ? visible.join(LABELS.joinSep) : LABELS.none}</div>`;
      }
      renderSky();
    }
    function updateEarthArrows(date, horizons) {
      const data = horizons || computeHorizons(date);
      if (!data) return;
      const { point, sunHor, planets } = data;
      updateUpArrow(point);
      if (sunHor.altitude > 0) {
        addAzAltArrow(point, sunHor.azimuth, sunHor.altitude, 0xffdd55, { length: 0.34, opacity: 0.9 });
      }
      planets.forEach((planet) => {
        if (planet.hor.altitude > 0) {
          addAzAltArrow(point, planet.hor.azimuth, planet.hor.altitude, planet.color, { length: 0.32, opacity: 0.9 });
        }
      });
    }
    function heliocentricEcliptic(body, time) {
      const vec = Astronomy.HelioVector(body, time);
      return Astronomy.RotateVector(ROT_EQJ_TO_ECL, vec);
    }
    function drawOrbitDiagram(date) {
      if (!orbitCanvas || !orbitCtx) return null;
      const time = Astronomy.MakeTime(date);
      const planetStates = PLANET_DEFS.map((planet) => {
        const ecl = heliocentricEcliptic(planet.body, time);
        const r = Math.hypot(ecl.x, ecl.y);
        return { ...planet, label: getPlanetLabel(planet), ecl, r, rScaled: ORBIT_SCALE.radius(r) };
      });
      const maxScaled = Math.max(
        ...planetStates.map(p => p.rScaled),
        ...PLANET_DEFS.map(p => ORBIT_SCALE.radius(p.orbit)),
        1
      );
      const { w, h, cx, cy } = prepareOrbitCanvas({ canvas: orbitCanvas, ctx: orbitCtx });
      const margin = 18;
      const scale = (Math.min(w, h) / 2 - margin) / maxScaled;

      const drawOrbit = (r, color) => {
        const rad = ORBIT_SCALE.radius(r) * scale;
        orbitCtx.setLineDash([5, 4]);
        orbitCtx.strokeStyle = color;
        orbitCtx.beginPath();
        orbitCtx.arc(cx, cy, rad, 0, Math.PI * 2);
        orbitCtx.stroke();
        orbitCtx.setLineDash([]);
      };
      orbitCtx.save();
      orbitCtx.globalAlpha = 0.6;
      PLANET_DEFS.forEach((planet) => drawOrbit(planet.orbit, colorToHex(planet.color)));
      orbitCtx.restore();

      const toScreen = (v) => {
        const r = Math.hypot(v.x, v.y);
        if (r === 0) return { x: cx, y: cy };
        const scaled = ORBIT_SCALE.radius(r);
        const factor = scaled / r;
        return { x: cx + v.x * factor * scale, y: cy - v.y * factor * scale };
      };

      orbitCtx.fillStyle = '#ffdd55';
      orbitCtx.beginPath();
      orbitCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      orbitCtx.fill();
      planetStates.forEach((planet) => {
        const pos = toScreen(planet.ecl);
        orbitCtx.fillStyle = colorToHex(planet.color);
        orbitCtx.beginPath();
        orbitCtx.arc(pos.x, pos.y, planet.key === 'earth' ? 5 : 4, 0, Math.PI * 2);
        orbitCtx.fill();
      });

      setOrbitLabelStyle(orbitCtx);
      orbitCtx.fillText(LABELS.sun, cx + 8, cy - 8);
      const legend = [
        { label: LABELS.sun, color: '#ffdd55' },
        ...planetStates.map((planet) => ({ label: planet.label, color: colorToHex(planet.color) }))
      ];
      return { scaleLabel: ORBIT_SCALE.label, legend };
    }
    function updateOrbitText(info) {
      const scaleBox = document.getElementById('orbitScale');
      const box = document.getElementById('orbitData');
      if (!box && !scaleBox) return;
      if (!info) {
        if (box) box.innerHTML = '';
        if (scaleBox) scaleBox.innerHTML = '';
        return;
      }
      const legend = info.legend.map(item => (
        `<span style="display:inline-flex; align-items:center; gap:6px; margin-right:10px;"><span style="display:inline-block; width:10px; height:10px; background:${item.color}; border-radius:2px;"></span>${item.label}</span>`
      )).join('');
      if (scaleBox) {
        scaleBox.innerHTML = `<strong>${LABELS.orbitScale}:</strong> ${info.scaleLabel}`;
      }
      if (box) {
        box.innerHTML = `<div style="font-size:11px; line-height:1.4;">${legend}</div>`;
      }
    }
    const markerRadius = () => (innerWidth <= 900 ? 0.018 : 0.01);

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
    const applyCameraMode = () => {
      // Geo sync only for planets view.
    };
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
      onVisibilityChange: () => updateCelestial(),
      visibilityToggleIds: ['toggleSunVisibility']
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
      const { sun, planets } = getSubpoints(date);
      lastSubpoints = { sun, planets };
      updateEclipticLine(date);
      const markerGeom = new THREE.SphereGeometry(markerRadius(), 16, 16);
      addSubpointMarker({
        group: celestialGroup,
        markerGeom,
        point: sun,
        color: 0xffdd55,
        latLonToVec3
      });
      addLatLonLines({ group: celestialGroup, point: sun, color: 0xffdd55 });
      addTerminator({ group: terminatorGroup, point: sun, color: 0xffdd55, latLonToVec3 });
      planets.forEach((planet) => {
        addSubpointMarker({
          group: celestialGroup,
          markerGeom,
          point: planet.point,
          color: planet.color,
          latLonToVec3
        });
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
      document.getElementById('subpoints').innerHTML =
        `<div><strong>${LABELS.subsolar}:</strong> lat ${fmt(sun.lat)} deg, lon ${fmt(sun.lon)} deg</div>`;
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
    const isMobile = () => innerWidth <= 900;

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
      defaultInfoVisible: innerWidth > 900 ? false : true,
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

