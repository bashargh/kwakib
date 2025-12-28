import * as THREE from 'three';

export const latLonToVec3 = (latDeg, lonDeg, radius = 1) => {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const x = Math.cos(lat) * Math.sin(lon) * radius;
  const y = Math.sin(lat) * radius;
  const z = Math.cos(lat) * Math.cos(lon) * radius;
  return new THREE.Vector3(x, y, z);
};

export const addLatitudeLine = (group, latDeg, color, width = 1) => {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const pts = [];
  for (let i = 0; i <= 360; i += 2) {
    const phi = THREE.MathUtils.degToRad(i);
    const x = Math.cos(lat) * Math.sin(phi);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.cos(phi);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color, linewidth: width }));
  group.add(line);
  return line;
};

export const addLongitudeLine = (group, lonDeg, color, width = 1) => {
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const pts = [];
  for (let lat = -90; lat <= 90; lat += 2) {
    const latRad = THREE.MathUtils.degToRad(lat);
    const x = Math.cos(latRad) * Math.sin(lon);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.cos(lon);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, linewidth: width }));
  group.add(line);
  return line;
};

export const addEarthGrid = (group) => {
  for (let lat = -75; lat <= 75; lat += 15) {
    if (lat === 0 || Math.abs(lat) === 23.5) continue;
    addLatitudeLine(group, lat, 0x2a89ff, 1);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    if (lon === 0) continue;
    addLongitudeLine(group, lon, 0x2a89ff, 1);
  }

  addLatitudeLine(group, 0, 0xff4444, 3);        // Equator
  addLatitudeLine(group, 23.5, 0xffaa33, 2.5);   // Tropic of Cancer
  addLatitudeLine(group, -23.5, 0xffaa33, 2.5);  // Tropic of Capricorn
  addLongitudeLine(group, 0, 0xffffff, 1.5);     // Prime meridian
  addLongitudeLine(group, 180, 0x888888, 1);     // 180 meridian
};

export const loadEarthTexture = ({
  loader,
  material,
  onLoad,
  localUrl = '2k_earth_daymap.jpg',
  fallbackUrl = 'https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg',
  onFallbackStart,
  onFallbackError
}) => {
  const applyTexture = (tex) => {
    material.map = tex;
    material.needsUpdate = true;
    if (onLoad) onLoad(tex);
  };
  loader.load(
    localUrl,
    (tex) => applyTexture(tex),
    undefined,
    () => {
      if (onFallbackStart) onFallbackStart();
      loader.load(
        fallbackUrl,
        (tex) => applyTexture(tex),
        undefined,
        (err) => {
          if (onFallbackError) onFallbackError(err);
        }
      );
    }
  );
};

export const createTerminatorCircle = (direction, color, radius = 1.01) => {
  const dir = direction.clone().normalize();
  const arbitrary = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, arbitrary).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  const pts = [];
  for (let deg = 0; deg <= 360; deg += 2) {
    const rad = THREE.MathUtils.degToRad(deg);
    const p = new THREE.Vector3()
      .addScaledVector(u, Math.cos(rad))
      .addScaledVector(v, Math.sin(rad))
      .multiplyScalar(radius);
    pts.push(p);
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
};

export const createVisibilityHemisphere = (direction, color, opacity) => {
  const dir = direction.clone().normalize();
  const geom = new THREE.SphereGeometry(1.01, 128, 128);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDir: { value: dir },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      void main() {
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDir;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormalWorld;
      void main() {
        float d = dot(normalize(vNormalWorld), normalize(uDir));
        if (d <= 0.0) discard;
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 2;
  return mesh;
};

export const createNightHemisphere = (direction, color, opacity, renderOrder = 1.5) => {
  const dir = direction.clone().normalize();
  const geom = new THREE.SphereGeometry(1.011, 128, 128);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDir: { value: dir },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      void main() {
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDir;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormalWorld;
      void main() {
        float d = dot(normalize(vNormalWorld), normalize(uDir));
        if (d > 0.0) discard; // only night side
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = renderOrder;
  return mesh;
};

export const createTwilightBand = (direction, color, opacity, angleDeg) => {
  const dir = direction.clone().normalize();
  const geom = new THREE.SphereGeometry(1.012, 128, 128);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDir: { value: dir },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uThreshold: { value: -Math.sin(THREE.MathUtils.degToRad(angleDeg)) }
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      void main() {
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDir;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uThreshold;
      varying vec3 vNormalWorld;
      void main() {
        float d = dot(normalize(vNormalWorld), normalize(uDir));
        if (d > 0.0) discard;           // daylight
        if (d < uThreshold) discard;    // deeper night than limit
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 1.8;
  return mesh;
};
