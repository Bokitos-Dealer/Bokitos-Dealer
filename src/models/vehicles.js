// Cars, trams and canal boats.
import * as THREE from 'three';
import { MeshBuilder } from '../util/geo.js';

const box = (b, sx, sy, sz, x, y, z, color, rx = 0) => {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  b.addGeometry(g, new THREE.Matrix4(), color);
};
const cyl = (b, r, len, x, y, z, color, axis = 'x', seg = 10) => {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  b.addGeometry(g, new THREE.Matrix4(), color);
};

/** Car: forward = -Z. Returns { body (to be tinted), rest (vertex coloured) } geometries. */
export function carGeometries(kind = 'car') {
  const body = new MeshBuilder(true);
  const rest = new MeshBuilder(true);
  if (kind === 'van') {
    box(body, 1.95, 1.9, 5.1, 0, 1.35, 0, '#ffffff');
    box(rest, 1.85, 0.6, 0.06, 0, 1.75, -2.56, '#1b232b');
    for (const s of [-1, 1]) box(rest, 0.05, 0.55, 0.9, s * 0.98, 1.75, -1.9, '#1b232b');
  } else {
    box(body, 1.78, 0.62, 4.3, 0, 0.62, 0, '#ffffff');
    box(body, 1.62, 0.5, 2.1, 0, 1.18, 0.25, '#ffffff');
    box(rest, 1.66, 0.42, 2.0, 0, 1.17, 0.25, '#1b232b');
    box(rest, 1.4, 0.4, 0.05, 0, 1.12, -0.82, '#1b232b', 0.5);
  }
  const len = kind === 'van' ? 5.1 : 4.3;
  box(rest, kind === 'van' ? 1.9 : 1.74, 0.14, 0.06, 0, 0.62, -len / 2 - 0.01, '#d9d9d9');
  for (const s of [-1, 1]) {
    box(rest, 0.3, 0.12, 0.05, s * 0.6, 0.75, -len / 2 - 0.02, '#fffbe8');
    box(rest, 0.28, 0.12, 0.05, s * 0.6, 0.78, len / 2 + 0.02, '#8b1010');
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) cyl(rest, 0.32, 0.24, sx * 0.86, 0.32, sz * (len / 2 - 0.8), '#151515');
  return { body: body.build(), rest: rest.build(), len, width: kind === 'van' ? 1.95 : 1.78 };
}

/** One tram section, 10m long (forward -Z). cab: 'front' | 'rear' | 'mid' */
export function tramSection(cab = 'mid') {
  const b = new MeshBuilder(true);
  const L = 10, W = 2.4;
  box(b, W, 2.5, L, 0, 1.75, 0, '#f2f2ee');
  box(b, W + 0.02, 0.35, L, 0, 0.55, 0, '#3a3f46');
  // windows band
  for (const s of [-1, 1]) {
    box(b, 0.04, 1.0, L * 0.86, s * (W / 2 + 0.01), 2.05, 0, '#1a232c');
    // doors
    box(b, 0.05, 2.0, 1.3, s * (W / 2 + 0.02), 1.5, -1.5, '#27313a');
  }
  box(b, W - 0.2, 0.25, L - 0.6, 0, 3.12, 0, '#d9d9d6');
  // blue/red stripe
  box(b, W + 0.03, 0.12, L, 0, 1.25, 0, '#1f4e9c');
  if (cab !== 'mid') {
    const z = cab === 'front' ? -L / 2 - 0.25 : L / 2 + 0.25;
    box(b, W - 0.05, 2.4, 0.5, 0, 1.7, z, '#f2f2ee');
    box(b, W - 0.25, 1.1, 0.06, 0, 2.15, z + (cab === 'front' ? -0.26 : 0.26), '#141b22');
    for (const s of [-1, 1]) box(b, 0.25, 0.14, 0.06, s * 0.8, 0.95, z + (cab === 'front' ? -0.27 : 0.27), cab === 'front' ? '#fffbe2' : '#a01010');
    // destination sign
    box(b, 1.4, 0.25, 0.06, 0, 2.85, z + (cab === 'front' ? -0.27 : 0.27), '#f0b429');
  }
  // pantograph on the middle section
  if (cab === 'mid') {
    box(b, 0.1, 0.9, 0.1, 0, 3.7, 0, '#333');
    box(b, 1.4, 0.05, 0.15, 0, 4.15, 0, '#333');
  }
  // bogies
  for (const z of [-3.3, 3.3]) box(b, 2.0, 0.45, 1.8, 0, 0.35, z, '#222');
  return b.build();
}

export function tourBoat() {
  const b = new MeshBuilder(true);
  const L = 20, W = 4.2;
  box(b, W, 0.9, L, 0, 0.35, 0, '#1d2f4a');
  box(b, W - 0.1, 0.12, L - 0.3, 0, 0.82, 0, '#c8c2b0');
  box(b, W - 0.2, 0.75, L - 3, 0, 1.25, 0.5, '#9fb4c3');
  box(b, W - 0.3, 0.06, L - 3.2, 0, 1.65, 0.5, '#d7e1e8');
  // bow
  const g = new THREE.ConeGeometry(W / 2, 2.4, 4, 1);
  g.rotateX(-Math.PI / 2);
  g.rotateZ(Math.PI / 4);
  g.scale(1, 0.32, 1);
  g.translate(0, 0.35, -L / 2 - 1.1);
  b.addGeometry(g, new THREE.Matrix4(), '#1d2f4a');
  return b.build();
}

export function smallBoat(color = '#6b4a2f') {
  const b = new MeshBuilder(true);
  box(b, 2.0, 0.6, 5.6, 0, 0.2, 0, color);
  box(b, 1.7, 0.1, 5.2, 0, 0.42, 0, '#d8cfb8');
  box(b, 1.6, 0.4, 0.5, 0, 0.62, 1.6, '#7d5a3a');
  box(b, 1.6, 0.4, 0.5, 0, 0.62, -0.5, '#7d5a3a');
  return b.build();
}
