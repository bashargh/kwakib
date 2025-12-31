import * as THREE from 'three';

export const createSeasonsOverlay = ({
  getTourState,
  tourHighlightGroup,
  tourDayColor,
  tourNightColor,
  latLonToVec3,
  clearGroupWithDispose
}) => {
  const drawLatitudeBand = (sun) => {
    clearGroupWithDispose(tourHighlightGroup);
    const tourState = getTourState();
    if (!tourState?.active || !tourState.poi || !sun) return;
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
  };

  return { drawLatitudeBand };
};
