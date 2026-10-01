// Shared materials. The environment module tweaks these at runtime
// (wet streets in the rain, lit windows at night).
import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials() {
  const tex = {
    klinker: T.klinkerTexture([118, 66, 54], 1),
    strip: T.klinkerTexture([92, 70, 60], 2),
    tiles: T.tilesTexture(),
    asphalt: T.asphaltTexture(),
    bike: T.bikeLaneTexture(),
    granite: T.graniteTexture(),
    plaza: T.plazaTexture(),
    grass: T.grassTexture(),
    brick: T.brickTexture([104, 50, 38], 21),
    quay: T.brickTexture([78, 46, 38], 22, '#4b4540'),
    roof: T.roofTexture(),
    waterN: T.waterNormalTexture(),
    glow: T.glowTexture(),
    wood: T.woodTexture(),
    wallGrey: T.brickTexture([235, 235, 235], 23, '#bdbdbd'),
  };

  const ground = (map, rough = 0.92, color = 0xffffff) =>
    new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, color });

  const m = {
    klinker: ground(tex.klinker, 0.9),
    strip: ground(tex.strip, 0.95),
    tiles: ground(tex.tiles, 0.88),
    asphalt: ground(tex.asphalt, 0.85),
    bike: ground(tex.bike, 0.85),
    granite: ground(tex.granite, 0.7),
    plaza: ground(tex.plaza, 0.85),
    grass: ground(tex.grass, 1.0),
    curb: ground(tex.granite, 0.75, 0xcfcac2),
    brick: ground(tex.brick, 0.9),
    quay: ground(tex.quay, 0.95),
    archStone: new THREE.MeshStandardMaterial({ color: 0xc9c2b3, roughness: 0.8 }),
    roof: ground(tex.roof, 0.8),
    iron: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.45, metalness: 0.6 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.5, metalness: 0.7 }),
    detail: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    detailGloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }),
    wood: ground(tex.wood, 0.85),
    white: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc977, emissiveIntensity: 0, roughness: 0.3 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a3a48, roughness: 0.1, metalness: 0.5 }),
    sidewall: new THREE.MeshStandardMaterial({ map: tex.wallGrey, vertexColors: true, roughness: 0.92 }),
  };

  // Tile scale (meters per texture repeat) per ground material.
  const scale = { klinker: 2, strip: 2, tiles: 1.8, asphalt: 6, bike: 4, granite: 2, plaza: 6, grass: 5 };

  // Water: dark greenish canal water reflecting the sky.
  m.water = new THREE.MeshStandardMaterial({
    color: 0x1f2f2c,
    roughness: 0.06,
    metalness: 0.0,
    normalMap: tex.waterN,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  tex.waterN.repeat.set(220, 220);

  // Facades: one material per style.
  m.facades = T.FACADE_STYLES.map((s, i) => {
    const { map, emissive } = T.facadeTextures(s, 100 + i * 7);
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap: emissive,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.88,
    });
  });

  // Materials that get darker/shinier when wet.
  const wettable = ['klinker', 'strip', 'tiles', 'asphalt', 'bike', 'granite', 'plaza', 'curb'].map((k) => m[k]);
  for (const mat of wettable) {
    mat.userData.dryRough = mat.roughness;
    mat.userData.dryColor = mat.color.clone();
  }

  return { tex, m, scale, wettable };
}

export function setWetness(mats, wet) {
  for (const mat of mats.wettable) {
    mat.roughness = mat.userData.dryRough * (1 - wet * 0.62);
    mat.color.copy(mat.userData.dryColor).multiplyScalar(1 - wet * 0.32);
  }
}
