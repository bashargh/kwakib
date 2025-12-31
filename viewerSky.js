import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const createSkyInset = ({
  containerId = 'sky3dContainer',
  cameraPosition = [2.0, 1.6, 2.0],
  target = [0, 0.15, 0],
  minDistance = 1.6,
  maxDistance = 3.6
} = {}) => {
  let skyScene = null;
  let skyRenderer = null;
  let skyCamera = null;
  let skyControls = null;
  let skyArrowsGroup = null;
  let skyBaseBuilt = false;

  const getContainer = () => document.getElementById(containerId);

  const createLabelSprite = (text, color = '#cfe2ff') => {
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
  };

  const buildSkyBase = () => {
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
  };

  const ensure = () => {
    if (skyScene) return;
    const container = getContainer();
    if (!container) return;
    skyScene = new THREE.Scene();
    const w = container.clientWidth || 320;
    const h = container.clientHeight || 220;
    skyCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 10);
    skyCamera.position.set(...cameraPosition);
    skyRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    skyRenderer.setPixelRatio(window.devicePixelRatio || 1);
    skyRenderer.setSize(w, h);
    container.appendChild(skyRenderer.domElement);
    skyControls = new OrbitControls(skyCamera, skyRenderer.domElement);
    skyControls.enablePan = false;
    skyControls.minDistance = minDistance;
    skyControls.maxDistance = maxDistance;
    skyControls.target.set(...target);
    skyControls.update();
    skyArrowsGroup = new THREE.Group();
    skyScene.add(skyArrowsGroup);
    buildSkyBase();
  };

  const resize = () => {
    if (!skyRenderer || !skyCamera) return;
    const container = getContainer();
    if (!container) return;
    const w = container.clientWidth || 320;
    const h = container.clientHeight || 220;
    skyCamera.aspect = w / h;
    skyCamera.updateProjectionMatrix();
    skyRenderer.setSize(w, h);
  };

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

  const clearArrows = () => {
    if (skyArrowsGroup) skyArrowsGroup.clear();
  };

  const addArrow = (azDeg, altDeg, color, opts = {}) => {
    ensure();
    if (!skyArrowsGroup) return;
    const floorAlt = opts.floorAlt !== undefined ? opts.floorAlt : altDeg;
    const drawAlt = Math.max(altDeg, floorAlt);
    const dir = dirFromAzAlt(azDeg, drawAlt);
    const start = new THREE.Vector3(0, 0, 0);
    const len = opts.length ?? 1.1;
    const end = dir.clone().multiplyScalar(len);
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = opts.dashed
      ? new THREE.LineDashedMaterial({
        color,
        linewidth: 2,
        dashSize: 0.05,
        gapSize: 0.025,
        opacity: opts.opacity ?? 1,
        transparent: true
      })
      : new THREE.LineBasicMaterial({
        color,
        linewidth: 2,
        opacity: opts.opacity ?? 1,
        transparent: opts.opacity !== undefined
      });
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
  };

  const render = () => {
    if (!skyRenderer || !skyScene || !skyCamera) return;
    skyRenderer.render(skyScene, skyCamera);
  };

  const updateControls = () => {
    if (skyControls) skyControls.update();
  };

  return {
    ensure,
    resize,
    clearArrows,
    addArrow,
    render,
    updateControls
  };
};
