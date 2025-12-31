import * as THREE from 'three';

export const bindGlobePointer = ({
  renderer,
  camera,
  globe,
  getLocalVector,
  onHover,
  onClick,
  onLeave,
  dragThreshold = 5
} = {}) => {
  if (!renderer || !camera || !globe) {
    return { dispose: () => {} };
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownPos = null;
  let pointerMoved = false;

  const updatePointer = (event, rect) => {
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const getLatLon = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    updatePointer(event, rect);
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(globe, false);
    if (!intersects.length) return null;
    const hit = intersects[0].point.clone();
    const local = getLocalVector ? getLocalVector(hit) : hit.normalize();
    if (!local) return null;
    const normalized = local.clone().normalize();
    const lat = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(normalized.x, normalized.z));
    return { lat, lon };
  };

  const onPointerDown = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerDownPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointerMoved = false;
  };

  const onPointerMove = (event) => {
    if (pointerDownPos) {
      const rect = renderer.domElement.getBoundingClientRect();
      const dx = (event.clientX - rect.left) - pointerDownPos.x;
      const dy = (event.clientY - rect.top) - pointerDownPos.y;
      if (Math.hypot(dx, dy) > dragThreshold) pointerMoved = true;
    }
    const hit = getLatLon(event);
    if (typeof onHover === 'function') {
      if (hit) onHover(hit.lat, hit.lon, event);
      else onHover(null, null, event);
    }
  };

  const onPointerClick = (event) => {
    if (pointerMoved) {
      pointerDownPos = null;
      pointerMoved = false;
      return;
    }
    const hit = getLatLon(event);
    if (hit && typeof onClick === 'function') {
      onClick(hit.lat, hit.lon, event);
    }
    pointerDownPos = null;
    pointerMoved = false;
  };

  const onPointerLeave = (event) => {
    pointerDownPos = null;
    pointerMoved = false;
    if (typeof onHover === 'function') onHover(null, null, event);
    if (typeof onLeave === 'function') onLeave(event);
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('click', onPointerClick);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  const dispose = () => {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('click', onPointerClick);
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
  };

  return { dispose };
};
