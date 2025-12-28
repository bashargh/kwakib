import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import {
      normalizeDeg as normalizeLon,
      subpointFromBody
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
    import {
      adjustDate,
      caretUnit,
      formatLocalTime,
      formatUTC,
      parseUTC,
      pointTimeZone,
      rangeForUnit
    } from './viewerTime.js';
    const Astronomy = globalThis.Astronomy;
    let lastSubpoints = null;
    let terminatorSide = 1; // 1 for dawn, -1 for dusk
    let skyScene = null;
    let skyRenderer = null;
    let skyCamera = null;
    let skyControls = null;
    let skyArrowsGroup = null;
    let skyBaseBuilt = false;
    const getSubpoints = (date) => {
      const when = date || new Date();
      return {
        sun: subpointFromBody(Astronomy.Body.Sun, when),
        venus: subpointFromBody(Astronomy.Body.Venus, when)
      };
    };

    const container = document.getElementById('scene');
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    container.appendChild(renderer.domElement);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const orbitCanvas = document.getElementById('orbitCanvas');
    const orbitCtx = orbitCanvas?.getContext('2d');
    const ORBIT_AVG = { earth: 1.0, venus: 0.723 };
    const ROT_EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();
    const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const texLoader = new THREE.TextureLoader();
    const earthMaterial = new THREE.MeshBasicMaterial({
      color: 0xbbbbbb
    });

    loadEarthTexture({
      loader: texLoader,
      material: earthMaterial,
      onLoad: () => render(),
      onFallbackError: (err) => console.warn('Earth texture fallback failed', err)
    });
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 128),
      // Basic material keeps the whole globe evenly lit (no dark side)
      earthMaterial
    );
    // Align texture so longitude 0 matches the grid (prime meridian at front)
    earth.rotation.y = -Math.PI / 2;
    scene.add(earth);
    
    const gridGroup = new THREE.Group();
    const userHighlightGroup = new THREE.Group();
    const userMarkersGroup = new THREE.Group();
    const celestialGroup = new THREE.Group();
    const terminatorGroup = new THREE.Group();
    const visibilityGroup = new THREE.Group();
    const indicatorGroup = new THREE.Group(); // arrows or other indicators
    scene.add(gridGroup);
    scene.add(userHighlightGroup);
    scene.add(userMarkersGroup);
    scene.add(celestialGroup);
    scene.add(terminatorGroup);
    scene.add(visibilityGroup);
    scene.add(indicatorGroup);

    addEarthGrid(gridGroup);
    function getSelectedPoint() {
      const lat = parseFloat(document.getElementById('lat1').value);
      const lonRaw = parseFloat(document.getElementById('lon1').value);
      if (!Number.isFinite(lat) || !Number.isFinite(lonRaw)) return null;
      return { lat: THREE.MathUtils.clamp(lat, -90, 90), lon: normalizeLon(lonRaw) };
    }
    function updateLocalTime(date) {
      const box = document.getElementById('localTime');
      if (!box) return;
      const point = getSelectedPoint();
      if (!point) { box.innerHTML = ''; return; }
      const utc = date ?? new Date();
      const tz = pointTimeZone(point) || defaultTimeZone;
        const formatted = formatLocalTime(utc, tz);
        box.innerHTML = `
          <div><strong>Local time (${tz}):</strong> ${formatted}</div>
        `;
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
    function ensureSkyScene() {
      if (skyScene) return;
      const container = document.getElementById('sky3dContainer');
      if (!container) return;
      skyScene = new THREE.Scene();
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 220;
      skyCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 10);
      skyCamera.position.set(2.0, 1.6, 2.0);
      skyRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      skyRenderer.setPixelRatio(devicePixelRatio);
      skyRenderer.setSize(w, h);
      container.appendChild(skyRenderer.domElement);
      skyControls = new OrbitControls(skyCamera, skyRenderer.domElement);
      skyControls.enablePan = false;
      skyControls.minDistance = 1.6;
      skyControls.maxDistance = 3.6;
      skyControls.target.set(0, 0.15, 0);
      skyControls.update();
      skyArrowsGroup = new THREE.Group();
      skyScene.add(skyArrowsGroup);
      buildSkyBase();
    }
    function resizeSkyRenderer() {
      if (!skyRenderer || !skyCamera) return;
      const container = document.getElementById('sky3dContainer');
      if (!container) return;
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 220;
      skyCamera.aspect = w / h;
      skyCamera.updateProjectionMatrix();
      skyRenderer.setSize(w, h);
    }
    function createLabelSprite(text, color = '#cfe2ff') {
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.45, 0.22, 1);
      return sprite;
    }
    function buildSkyBase() {
      if (!skyScene || skyBaseBuilt) return;
      skyBaseBuilt = true;
      const base = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.0, 128),
        new THREE.MeshBasicMaterial({ color: 0x2a89ff, opacity: 0.65, transparent: true, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      base.add(ring);
      const innerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.52, 128),
        new THREE.MeshBasicMaterial({ color: 0x1f2b45, opacity: 0.9, transparent: true, side: THREE.DoubleSide })
      );
      innerRing.rotation.x = -Math.PI / 2;
      base.add(innerRing);
      const addAxisLine = (dir) => {
        const geom = new THREE.BufferGeometry().setFromPoints([
          dir.clone().multiplyScalar(-1),
          dir.clone().multiplyScalar(1)
        ]);
        const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0x3d4f70, linewidth: 1 }));
        base.add(line);
      };
      addAxisLine(new THREE.Vector3(1, 0, 0));
      addAxisLine(new THREE.Vector3(0, 0, 1));
      const obs = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffaa33 })
      );
      obs.position.set(0, 0, 0);
      base.add(obs);
      const upLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.4, 0)]),
        new THREE.LineBasicMaterial({ color: 0x66aaff, linewidth: 2 })
      );
      const upCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, 0.1, 12),
        new THREE.MeshBasicMaterial({ color: 0x66aaff })
      );
      upCone.position.set(0, 0.45, 0);
      base.add(upLine);
      base.add(upCone);
      const north = createLabelSprite('N');
      north.position.set(0, 0.02, 1.05);
      base.add(north);
      const south = createLabelSprite('S');
      south.position.set(0, 0.02, -1.05);
      base.add(south);
      const east = createLabelSprite('E');
      east.position.set(1.05, 0.02, 0);
      base.add(east);
      const west = createLabelSprite('W');
      west.position.set(-1.05, 0.02, 0);
      base.add(west);
      skyScene.add(base);
    }
    const dirFromAzAlt = (azDeg, altDeg) => {
      const azRad = THREE.MathUtils.degToRad(azDeg);
      const altRad = THREE.MathUtils.degToRad(altDeg);
      const north = new THREE.Vector3(0, 0, 1);
      const east = new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3(0, 1, 0);
      const horiz = new THREE.Vector3()
        .addScaledVector(north, Math.cos(azRad))
        .addScaledVector(east, Math.sin(azRad))
        .normalize();
      return new THREE.Vector3()
        .addScaledVector(horiz, Math.cos(altRad))
        .addScaledVector(up, Math.sin(altRad))
        .normalize();
    };
    function clearSkyArrows() {
      if (skyArrowsGroup) skyArrowsGroup.clear();
    }
    function addSkyArrow(azDeg, altDeg, color, opts = {}) {
      ensureSkyScene();
      if (!skyArrowsGroup) return;
      const floorAlt = opts.floorAlt !== undefined ? opts.floorAlt : altDeg;
      const drawAlt = Math.max(altDeg, floorAlt);
      const dir = dirFromAzAlt(azDeg, drawAlt);
      const start = new THREE.Vector3(0, 0, 0);
      const len = opts.length ?? 1.1;
      const end = dir.clone().multiplyScalar(len);
      const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const mat = opts.dashed
        ? new THREE.LineDashedMaterial({ color, linewidth: 2, dashSize: 0.05, gapSize: 0.025, opacity: opts.opacity ?? 1, transparent: true })
        : new THREE.LineBasicMaterial({ color, linewidth: 2, opacity: opts.opacity ?? 1, transparent: opts.opacity !== undefined });
      const line = new THREE.Line(geom, mat);
      if (opts.dashed) line.computeLineDistances();
      skyArrowsGroup.add(line);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, 0.12, 12),
        new THREE.MeshBasicMaterial({ color, opacity: opts.opacity ?? 1, transparent: opts.opacity !== undefined })
      );
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      skyArrowsGroup.add(cone);
    }
    const skyPanelVisible = () => true;
    function renderSky() {
      if (!skyRenderer || !skyScene || !skyCamera) return;
      if (!skyPanelVisible()) return;
      skyRenderer.render(skyScene, skyCamera);
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
      const overlayOn = (document.getElementById('toggleSkyArrows')?.checked ?? false) && skyPanelVisible();
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
      const fmtDeg = (v) => Number.isFinite(v) ? `${v.toFixed(1)} deg` : 'n/a';
      const sunNote = sunHor.altitude <= 0 ? ' (below horizon here)' : '';
      const venusNote = venusHor.altitude <= 0 ? ' (below horizon here)' : '';
      box.innerHTML = `
        <div><strong>Sun:</strong> az ${fmtDeg(sunHor.azimuth)}, alt ${fmtDeg(sunHor.altitude)}${sunNote}</div>
        <div><strong>Venus:</strong> az ${fmtDeg(venusHor.azimuth)}, alt ${fmtDeg(venusHor.altitude)}${venusNote}</div>
      `;
      if (venusBox) {
        venusBox.innerHTML = '';
      }
      renderSky();
    }
    function updateEarthArrows(date, horizons) {
      const data = horizons || computeHorizons(date);
      if (!data) return;
      const { point, sunHor, venusHor } = data;
      const overlayOn = document.getElementById('toggleSkyArrows')?.checked ?? false;
      if (!overlayOn) return;
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
      const w = orbitCanvas.width;
      const h = orbitCanvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const margin = 18;
      const scale = (Math.min(w, h) / 2 - margin) / maxR;

      orbitCtx.clearRect(0, 0, w, h);
      orbitCtx.fillStyle = '#0b1222';
      orbitCtx.fillRect(0, 0, w, h);

      orbitCtx.strokeStyle = '#1a2235';
      orbitCtx.lineWidth = 1;
      orbitCtx.beginPath();
      orbitCtx.moveTo(0, cy);
      orbitCtx.lineTo(w, cy);
      orbitCtx.moveTo(cx, 0);
      orbitCtx.lineTo(cx, h);
      orbitCtx.stroke();

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

      orbitCtx.fillStyle = '#cfdcff';
      orbitCtx.font = '12px Arial';
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
    const visControls = ['toggleSunVisibility', 'toggleVenusVisibility'];
    visControls.forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const sunOn = document.getElementById('toggleSunVisibility').checked;
        const venusOn = document.getElementById('toggleVenusVisibility').checked;
        visibilityGroup.children.forEach(mesh => {
          if (mesh.userData.body === 'sun') mesh.visible = sunOn;
          if (mesh.userData.body === 'venus') mesh.visible = venusOn;
        });
        render();
      });
    });
    document.getElementById('toggleSkyArrows').addEventListener('change', () => updateCelestial());
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
    document.getElementById('resetNowBtn').addEventListener('click', (e) => {
      e.preventDefault();
      seedDateTime();
      updateCelestial();
    });
    const twilightInput = document.getElementById('twilightAngle');
      const twilightValue = document.getElementById('twilightValue');
      twilightValue.textContent = `${twilightInput.value} deg`;
      twilightInput.addEventListener('input', () => {
        twilightValue.textContent = `${twilightInput.value} deg`;
        updateCelestial();
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
        const p = intersects[0].point.clone().normalize();
        const lat = THREE.MathUtils.radToDeg(Math.asin(p.y));
        const lon = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z));
        hoverLabel.textContent = `Hover: lat ${lat.toFixed(2)}, lon ${lon.toFixed(2)}`;
      } else {
        hoverLabel.textContent = '';
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
        const p = intersects[0].point.clone().normalize();
        const lat = THREE.MathUtils.radToDeg(Math.asin(p.y));
        const lon = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z));
        setPoint(lat, lon);
      }
      pointerDownPos = null;
      pointerMoved = false;
    }
    function onPointerLeave() {
      pointerDownPos = null;
      pointerMoved = false;
      hoverLabel.textContent = '';
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
        // Terminator great circle (day/night boundary for sun or Venus)
        const dir = latLonToVec3(obj.point.lat, obj.point.lon, 1).normalize();
        const terminator = createTerminatorCircle(dir, obj.color, 1.01);
        terminatorGroup.add(terminator);
        if (obj.showOverlay) {
          const hemi = createVisibilityHemisphere(dir, obj.color, 0.12);
          hemi.visible = showVis;
          hemi.userData.body = obj.body;
          visibilityGroup.add(hemi);
        }
      });

      // Night side overlay (dark blue) to match Earth viewer styling
      if (sun) {
        const night = createNightHemisphere(latLonToVec3(sun.lat, sun.lon, 1), 0x0a1f4d, 0.42, 1.9);
        night.visible = document.getElementById('toggleSunVisibility').checked;
        night.userData.body = 'sun';
        visibilityGroup.add(night);
      }

      const twilightAngle = Math.max(0, parseFloat(document.getElementById('twilightAngle').value) || 0);
      if (twilightAngle > 0) {
        const twilightBand = createTwilightBand(
          latLonToVec3(sun.lat, sun.lon, 1),
          0xcc9933,
          0.18,
          twilightAngle
        );
        twilightBand.userData.body = 'twilight';
        visibilityGroup.add(twilightBand);
      }

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
    const isMobile = () => innerWidth <= 900;
    let infoVisible = innerWidth > 900 ? false : true;
    let controlsVisible = true;
    const collapsibleIds = ['sunVenusSection', 'cameraSection', 'twilightSection', 'pointSection'];
    let lastMobileState = isMobile();
    function setCollapsed(id, collapsed) {
      const el = document.getElementById(id);
      if (!el) return;
      if (collapsed) el.classList.add('collapsed'); else el.classList.remove('collapsed');
      const header = el.querySelector('.section-header');
      if (header) header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    function syncCollapsibles(forceMobileState = null) {
      const mobile = forceMobileState !== null ? forceMobileState : isMobile();
      collapsibleIds.forEach(id => setCollapsed(id, mobile));
      lastMobileState = mobile;
    }
    document.querySelectorAll('.section-header').forEach(header => {
      header.addEventListener('click', () => {
        const target = header.dataset.target;
        if (!target) return;
        const el = document.getElementById(target);
        if (!el) return;
        const nextState = !el.classList.contains('collapsed');
        setCollapsed(target, nextState);
      });
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          header.click();
        }
      });
    });
    syncCollapsibles(lastMobileState);

    function resizeRendererToContainer() {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }

    function positionTourPanel() {
      if (!tourPanel) return;
      const infoRect = infoPanel?.getBoundingClientRect();
      if (infoPanel && infoVisible && infoPanel.style.display !== 'none' && infoRect && innerWidth > 900) {
        tourPanel.style.left = `${infoPanel.offsetLeft}px`;
        tourPanel.style.top = `${infoPanel.offsetTop + infoPanel.offsetHeight + 12}px`;
      } else if (innerWidth > 900) {
        tourPanel.style.left = '12px';
        tourPanel.style.top = '64px';
      }
    }
    function applyPanelVisibility() {
      if (isMobile()) {
        infoVisible = true;
        controlsVisible = true;
      }
      const nowMobile = isMobile();
      if (nowMobile !== lastMobileState) {
        syncCollapsibles(nowMobile);
      }
      infoPanel.style.display = infoVisible ? 'block' : 'none';
      sidePanels.style.display = controlsVisible ? (isMobile() ? 'block' : 'flex') : 'none';
      positionTourPanel();
      resizeRendererToContainer();
    }
    toggleInfoBtn.addEventListener('click', () => {
      infoVisible = !infoVisible;
      applyPanelVisibility();
    });
    toggleControlsBtn.addEventListener('click', () => {
      controlsVisible = !controlsVisible;
      applyPanelVisibility();
    });
    addEventListener('resize', () => {
      applyPanelVisibility();
      resizeSkyRenderer();
    });
    applyPanelVisibility();
    let creditsOpen = false;
    const setCreditsOpen = (open) => {
      if (!footer) return;
      creditsOpen = open;
      footer.classList.toggle('show', open);
    };
    if (creditsToggle && footer) {
      creditsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setCreditsOpen(!creditsOpen);
      });
      document.addEventListener('click', (e) => {
        if (!creditsOpen) return;
        const target = e.target;
        if (footer.contains(target) || creditsToggle.contains(target)) return;
        setCreditsOpen(false);
      });
    }

    // Apply initial sizing
    resizeSkyRenderer();

    // No default point; user must select

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.45;

    function onResize() {
      resizeRendererToContainer();
      resizeSkyRenderer();
      render();
    }
    addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      if (skyControls && skyPanelVisible()) skyControls.update();
      render();
    }
    function render() {
      renderer.render(scene, camera);
      renderSky();
    }
    animate();

