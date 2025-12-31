import * as THREE from 'three';

export const addHighlightLines = ({ group, latDeg, lonDeg, color }) => {
  if (!group || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return;
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
  group.add(latLine);

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
  group.add(lonLine);
};

export const buildGreatCirclePoints = (a, b, steps, radius) => {
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
};

export const buildGreatCircleArc = (a, b, steps, radius) => {
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
};

export const updatePointMetrics = ({
  points,
  target,
  earthRadiusKm,
  copyText,
  formatCopy
}) => {
  const targetEl = target || document.getElementById('pointMetrics');
  if (!targetEl) return;
  if (!points || points.length < 2) {
    targetEl.innerHTML = '';
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
  const distanceKm = (earthRadiusKm ?? 0) * c;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 360) % 360;
  const distanceText = `${distanceKm.toFixed(distanceKm >= 1000 ? 0 : 1)} km`;
  const headingText = `${bearing.toFixed(1)}°`;
  const routeLabel = typeof copyText === 'function' ? copyText('metricsRouteLabel', 'A-B') : 'A-B';
  const routeLabelHtml = `<span dir="ltr">${routeLabel}</span>`;
  const distanceLabel = typeof formatCopy === 'function'
    ? formatCopy('metricsDistanceLabel', 'Distance ({route})', { route: routeLabelHtml })
    : `Distance (${routeLabelHtml})`;
  const headingLabel = typeof formatCopy === 'function'
    ? formatCopy('metricsHeadingLabel', 'Initial heading ({route})', { route: routeLabelHtml })
    : `Initial heading (${routeLabelHtml})`;
  targetEl.innerHTML = `<div><strong>${distanceLabel}:</strong> ${distanceText}</div>` +
    `<div><strong>${headingLabel}:</strong> ${headingText}</div>`;
};
