import * as THREE from 'three';
import {
  createNightHemisphere,
  createTerminatorCircle,
  createTwilightBand,
  createVisibilityHemisphere
} from './viewerGlobe.js';

export const addSubpointMarker = ({
  group,
  markerGeom,
  point,
  color,
  latLonToVec3,
  radius = 1.02
}) => {
  if (!group || !markerGeom || !point) return;
  const pos = latLonToVec3(point.lat, point.lon, radius);
  const marker = new THREE.Mesh(markerGeom, new THREE.MeshBasicMaterial({ color }));
  marker.position.copy(pos);
  group.add(marker);
};

export const addLatLonLines = ({ group, point, color }) => {
  if (!group || !point) return;
  const latLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 181 }, (_, i) => {
        const phi = THREE.MathUtils.degToRad(i * 2);
        const lat = THREE.MathUtils.degToRad(point.lat);
        return new THREE.Vector3(
          Math.cos(lat) * Math.sin(phi),
          Math.sin(lat),
          Math.cos(lat) * Math.cos(phi)
        );
      })
    ),
    new THREE.LineBasicMaterial({ color, linewidth: 1.5 })
  );
  const lon = THREE.MathUtils.degToRad(point.lon);
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
    new THREE.LineBasicMaterial({ color, linewidth: 1.5 })
  );
  group.add(latLine);
  group.add(lonLine);
};

export const addTerminator = ({
  group,
  point,
  color,
  latLonToVec3,
  radius = 1.01
}) => {
  if (!group || !point) return;
  const dir = latLonToVec3(point.lat, point.lon, 1).normalize();
  const terminator = createTerminatorCircle(dir, color, radius);
  group.add(terminator);
};

export const addVisibilityHemisphere = ({
  group,
  point,
  color,
  latLonToVec3,
  opacity = 0.12,
  visible = true,
  body
}) => {
  if (!group || !point) return;
  const dir = latLonToVec3(point.lat, point.lon, 1).normalize();
  const hemi = createVisibilityHemisphere(dir, color, opacity);
  hemi.visible = !!visible;
  if (body) hemi.userData.body = body;
  group.add(hemi);
};

export const addNightHemisphere = ({
  group,
  point,
  latLonToVec3,
  color = 0x0a1f4d,
  opacity = 0.42,
  scale = 1.9,
  visible = true,
  body = 'sun'
}) => {
  if (!group || !point) return;
  const night = createNightHemisphere(latLonToVec3(point.lat, point.lon, 1), color, opacity, scale);
  night.visible = !!visible;
  if (body) night.userData.body = body;
  group.add(night);
};

export const addTwilightBand = ({
  group,
  point,
  latLonToVec3,
  angle,
  color = 0xcc9933,
  opacity = 0.18,
  body = 'twilight'
}) => {
  if (!group || !point || !Number.isFinite(angle) || angle <= 0) return;
  const twilightBand = createTwilightBand(
    latLonToVec3(point.lat, point.lon, 1),
    color,
    opacity,
    angle
  );
  if (body) twilightBand.userData.body = body;
  group.add(twilightBand);
};
