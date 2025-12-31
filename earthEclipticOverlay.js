import * as THREE from 'three';
import { createTerminatorCircle } from './viewerGlobe.js';

export const createEclipticOverlay = ({
  Astronomy,
  OBLIQUITY_RAD,
  eclipticGroup,
  latLonToVec3,
  normalizeDeg,
  clearGroupWithDispose
}) => {
  const clear = () => {
    clearGroupWithDispose(eclipticGroup);
  };

  const update = (date) => {
    clear();
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
  };

  return { update, clear };
};
