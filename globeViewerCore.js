import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addEarthGrid, loadEarthTexture } from './viewerGlobe.js';

export const createGlobeViewerCore = ({ container, onTextureLoad } = {}) => {
  const getSceneSize = () => {
    const rect = container?.getBoundingClientRect();
    const rectWidth = rect?.width || 0;
    const rectHeight = rect?.height || 0;
    if (rectWidth > 1 && rectHeight > 1) {
      return { width: rectWidth, height: rectHeight };
    }
    const root = document.documentElement;
    const cssWidth = parseFloat(root.style.getPropertyValue('--viewport-width'));
    const cssHeight = parseFloat(root.style.getPropertyValue('--viewport-height'));
    const vv = window.visualViewport;
    const fallbackWidth = Number.isFinite(cssWidth) && cssWidth > 0
      ? cssWidth
      : (vv?.width || innerWidth);
    const fallbackHeight = Number.isFinite(cssHeight) && cssHeight > 0
      ? cssHeight
      : (vv?.height || innerHeight);
    const width = Math.max(1, fallbackWidth || innerWidth);
    const height = Math.max(1, fallbackHeight || innerHeight);
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.45;

  const texLoader = new THREE.TextureLoader();
  const earthMaterial = new THREE.MeshBasicMaterial({ color: 0xbbbbbb });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), earthMaterial);
  const planetGroup = new THREE.Group();
  scene.add(planetGroup);
  const earthBaseYaw = -Math.PI / 2;
  earth.rotation.y = earthBaseYaw;
  planetGroup.add(earth);

  const groups = {
    gridGroup: new THREE.Group(),
    userHighlightGroup: new THREE.Group(),
    userMarkersGroup: new THREE.Group(),
    userPathGroup: new THREE.Group(),
    celestialGroup: new THREE.Group(),
    terminatorGroup: new THREE.Group(),
    visibilityGroup: new THREE.Group(),
    eclipticGroup: new THREE.Group(),
    tourHighlightGroup: new THREE.Group()
  };
  Object.values(groups).forEach(group => planetGroup.add(group));
  addEarthGrid(groups.gridGroup);

  const render = () => {
    renderer.render(scene, camera);
  };

  loadEarthTexture({
    loader: texLoader,
    material: earthMaterial,
    onLoad: () => {
      render();
      if (typeof onTextureLoad === 'function') onTextureLoad();
    },
    onFallbackError: (err) => console.warn('Earth texture fallback failed', err)
  });

  const resize = () => {
    const size = getSceneSize();
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height);
    return size;
  };

  return {
    scene,
    camera,
    renderer,
    controls,
    render,
    resize,
    getSceneSize,
    earth,
    earthMaterial,
    planetGroup,
    baseCameraDistance,
    earthBaseYaw,
    groups
  };
};
