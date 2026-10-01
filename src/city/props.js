// Street life that doesn't move: elm trees, lamp posts, Amsterdammertjes,
// parked bikes (thousands), parked cars, houseboats, bike racks, benches.
import * as THREE from 'three';
import * as L from './layout.js';
import { ChunkedBuilders } from '../util/geo.js';
import { simpleBikeParts, mergeParts, bikeMaterial, FRAME_COLORS } from '../models/bike.js';
import { mulberry32, range, pick, hash2 } from '../util/math.js';

const CAR_COLORS = ['#1c1c1e', '#e8e8e6', '#9aa0a6', '#2b3e5c', '#5c1f1f', '#3a4a3a', '#d8d2c4', '#202830', '#7a7a7a', '#b5651d', '#ffffff', '#101010'];

function leafTexture(seed, autumn) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = '#2f4a22';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const t = rand();
    let col;
    if (autumn && t < 0.18) col = `hsl(${40 + rand() * 15},${55 + rand() * 20}%,${35 + rand() * 20}%)`;
    else col = `hsl(${85 + rand() * 35},${35 + rand() * 25}%,${18 + rand() * 22}%)`;
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(rand() * S, rand() * S, 2 + rand() * 5, 1.5 + rand() * 3, rand() * 3, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function crownGeometry(rand) {
  const parts = [];
  const blobs = [
    [0, 0, 0, 2.6], [1.6, -0.4, 0.6, 1.9], [-1.5, -0.3, -0.5, 2.0], [0.3, 0.9, -1.4, 1.8], [-0.2, 0.6, 1.5, 1.8],
  ];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.82 + rand() * 0.32;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.85 + y, p.getZ(i) * k + z);
    }
    g.computeVertexNormals();
    parts.push(g);
  }
  // merge
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    // fluffy normals: blend with radial direction for softer shading
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i) - 0.3, z = P.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      const nx = N.getX(i) * 0.5 + (x / l) * 0.5, ny = N.getY(i) * 0.5 + (y / l) * 0.5, nz = N.getZ(i) * 0.5 + (z / l) * 0.5;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor[(o + i) * 3] = nx / nl;
      nor[(o + i) * 3 + 1] = ny / nl;
      nor[(o + i) * 3 + 2] = nz / nl;
    }
    uv.set(g.attributes.uv.array.map((v, i) => v * 3 + (i % 2 ? 0 : 0.37)), o * 2);
    o += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function crownGeometryLow(rand) {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0, 0, 2.9], [1.5, -0.3, 0.5, 2.1], [-1.4, -0.2, -0.6, 2.2]]) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    parts.push(g);
  }
  void rand;
  const out = mergeSimple(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  out.computeVertexNormals();
  return out;
}

function trunkGeometry() {
  const geos = [];
  const t = new THREE.CylinderGeometry(0.15, 0.25, 5.4, 7);
  t.translate(0, 2.7, 0);
  geos.push(t);
  for (const [ax, az, len] of [[0.7, 0.3, 2.2], [-0.6, -0.4, 2], [0.2, -0.8, 1.9]]) {
    const b = new THREE.CylinderGeometry(0.06, 0.1, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(ax);
    b.rotateX(az);
    b.translate(0, 4.4, 0);
    geos.push(b);
  }
  return mergeSimple(geos);
}

function mergeSimple(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const g0 of geos) {
    const g = g0.index ? g0 : g0;
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array);
    else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < g.attributes.position.count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

function lampGeometries() {
  const pole = [];
  const base = new THREE.CylinderGeometry(0.13, 0.19, 0.7, 8);
  base.translate(0, 0.35, 0);
  pole.push(base);
  const shaft = new THREE.CylinderGeometry(0.055, 0.075, 3.6, 7);
  shaft.translate(0, 2.4, 0);
  pole.push(shaft);
  const collar = new THREE.CylinderGeometry(0.11, 0.08, 0.18, 8);
  collar.translate(0, 4.25, 0);
  pole.push(collar);
  const cap = new THREE.ConeGeometry(0.3, 0.32, 6);
  cap.translate(0, 5.08, 0);
  pole.push(cap);
  const finial = new THREE.SphereGeometry(0.05, 6, 4);
  finial.translate(0, 5.3, 0);
  pole.push(finial);
  const glass = new THREE.CylinderGeometry(0.26, 0.15, 0.6, 6);
  glass.translate(0, 4.63, 0);
  return { pole: mergeSimple(pole), glass };
}

function bollardGeometry() {
  const g = new THREE.CylinderGeometry(0.085, 0.11, 0.82, 8);
  g.translate(0, 0.41, 0);
  const top = new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  top.translate(0, 0.82, 0);
  const ring = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8);
  ring.translate(0, 0.66, 0);
  return mergeSimple([g, top, ring]);
}

function rackGeometry() {
  const arc = new THREE.TorusGeometry(0.32, 0.024, 5, 10, Math.PI);
  arc.translate(0, 0.5, 0);
  const l1 = new THREE.CylinderGeometry(0.024, 0.024, 0.5, 5);
  l1.translate(0.32, 0.25, 0);
  const l2 = l1.clone();
  l2.translate(-0.64, 0, 0);
  return mergeSimple([arc, l1, l2]);
}

export class PropBuilder {
  constructor(mats, colliders, isExcluded, season = { autumn: true }) {
    this.mats = mats;
    this.col = colliders;
    this.isExcluded = isExcluded;
    this.rand = mulberry32(4242);
    this.season = season;
    this.trees = [];
    this.lamps = [];
    this.bollards = [];
    this.racks = [];
    this.cb = new ChunkedBuilders(220);
    this.parkedBikeCount = 0;
    this.carCount = 0;
    const rand = this.rand;
    // prebuilt merged geometry variants for parked bikes (relative matrices)
    this.bikeVariants = [];
    for (let i = 0; i < 8; i++) {
      const parts = simpleBikeParts({ color: FRAME_COLORS[i % FRAME_COLORS.length], crate: i % 3 !== 2, crateColor: i % 2 ? '#2a2a2a' : '#7b5130' });
      this.bikeVariants.push(mergeParts(parts));
    }
    void rand;
  }

  // ---- placement helpers ---------------------------------------------------
  okAt(x, z, kind) {
    const s = L.surfaceAt(x, z);
    return s.kind === kind && s.h < 0.01 && !s.bridge && !this.isExcluded(x, z);
  }

  /** Walk along a parametric line; fn(t) -> {x,z,tx,tz} with arc length param. */
  walk(len, at, place) {
    let s = 1.5;
    while (s < len - 1.5) {
      const adv = place(s, at);
      s += adv;
    }
  }

  addTree(x, z) {
    const r = this.rand;
    this.trees.push({ x, z, s: range(r, 0.85, 1.25), rot: r() * 6.28, tint: r() });
    this.col.addCircle(x, z, 0.32, 'tree');
  }
  addLamp(x, z) {
    this.lamps.push({ x, z, y: L.heightAt(x, z) });
    this.col.addCircle(x, z, 0.16, 'lamp');
  }
  addBollard(x, z) {
    this.bollards.push({ x, z });
    this.col.addCircle(x, z, 0.11, 'bollard');
  }
  /** Parked bike: heading = direction the bike points (yaw). */
  addParkedBike(x, z, yaw, lean = 0.06) {
    const g = this.bikeVariants[Math.floor(this.rand() * this.bikeVariants.length)];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, L.heightAt(x, z) + 0.12 * 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, lean, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    const b = this.cb.get('bikes', x, z, true);
    // vertex colors come from the variant geometry: add manually
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    const base = b.vertexCount;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      b.pos.push(v.x, v.y, v.z);
      b.nor.push(n.x, n.y, n.z);
      b.uv.push(0, 0);
      b.col.push(C.getX(i), C.getY(i), C.getZ(i));
    }
    for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    this.parkedBikeCount++;
  }
  addCar(x, z, yaw) {
    const r = this.rand;
    const b = this.cb.get('cars', x, z, true);
    const color = pick(r, CAR_COLORS);
    const len = range(r, 3.9, 4.7), wid = 1.78;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    const box = (sx, sy, sz, px, py, pz, c) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(px, py, pz);
      b.addGeometry(g, m, c);
    };
    box(wid, 0.62, len, 0, 0.55, 0, color);
    box(wid - 0.12, 0.5, len * 0.5, 0, 1.1, len * 0.04, '#1b232b');
    box(wid - 0.2, 0.06, len * 0.48, 0, 1.38, len * 0.04, color);
    box(wid + 0.02, 0.12, 0.1, 0, 0.6, -len / 2, '#cfcfcf');
    box(wid + 0.02, 0.1, 0.06, 0, 0.6, len / 2, '#8b1414');
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const w = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 10);
        w.rotateZ(Math.PI / 2);
        w.translate(sx * (wid / 2 - 0.08), 0.31, sz * (len / 2 - 0.75));
        b.addGeometry(w, m, '#151515');
      }
    // collision box: long axis along the car's local z (forward); world dir of local z = (sin yaw, cos yaw)
    this.col.addBox(x, z, len / 2, wid / 2, Math.atan2(Math.cos(yaw), Math.sin(yaw)), 'car');
    this.carCount++;
  }

  // ---- canal quays --------------------------------------------------------
  placeRingStrips() {
    for (const b of L.BANDS) {
      if (b.type !== 'quay' && b.type !== 'street') continue;
      let acc = b.r0, strip = null, side = null, road = null;
      for (const s of b.xs) {
        if (s.kind === 'strip') strip = [acc, acc + s.w];
        if (s.kind === 'side' && !side) side = [acc, acc + s.w];
        if (s.kind === 'road') road = [acc, acc + s.w];
        acc += s.w;
      }
      const sector = b.sector === 'all' ? [-Math.PI, Math.PI] : b.sector === 'ring' ? [-L.THETA_MAX, L.THETA_MAX] : [L.THETA_MAX, Math.PI * 2 - L.THETA_MAX];
      const isCanalQuay = b.type === 'quay';
      if (strip) {
        const rs = (strip[0] + strip[1]) / 2;
        const len = rs * (sector[1] - sector[0]);
        const at = (s) => {
          const th = sector[0] + s / rs;
          return { x: rs * Math.sin(th), z: rs * Math.cos(th), tx: Math.cos(th), tz: -Math.sin(th), th };
        };
        this.fillStrip(len, at, strip[1] - strip[0], isCanalQuay && b.name !== 'Stadhouderskade', b);
      }
      // bollards along the sidewalk edge next to the road
      if (side && road && isCanalQuay) {
        const edge = side[0] < road[0] ? side[1] - 0.18 : side[0] + 0.18;
        const len = edge * (sector[1] - sector[0]);
        let s = 0;
        while (s < len) {
          const th = sector[0] + s / edge;
          const x = edge * Math.sin(th), z = edge * Math.cos(th);
          const on = hash2(Math.floor(s / 70), b.id * 7) < 0.55;
          if (on && this.okAt(x, z, 'side')) {
            this.addBollard(x, z);
            s += 2.4;
          } else s += on ? 1 : 10;
        }
      }
    }
  }

  /** Fill a tree/parking strip with trees, cars, bikes and lamps. */
  fillStrip(len, at, width, cars, band) {
    const r = this.rand;
    let s = 2;
    let sinceLamp = 0;
    while (s < len - 2) {
      const p = at(s);
      if (!this.okAt(p.x, p.z, 'strip')) {
        s += 1;
        continue;
      }
      // tree
      this.addTree(p.x, p.z);
      // gap content until next tree
      const gap = range(r, 7.5, 10.5);
      const roll = r();
      const mid = at(s + gap / 2);
      const end = at(s + gap - 1);
      const okGap = this.okAt(mid.x, mid.z, 'strip') && this.okAt(end.x, end.z, 'strip');
      if (okGap) {
        sinceLamp += gap;
        const yaw = Math.atan2(mid.tx, mid.tz);
        if (sinceLamp > 28) {
          this.addLamp(mid.x, mid.z);
          sinceLamp = 0;
        } else if (cars && roll < 0.55 && width >= 2.4) {
          this.addCar(mid.x, mid.z, yaw + (r() < 0.5 ? 0 : Math.PI));
        } else if (roll < 0.82) {
          const n = 2 + Math.floor(r() * 5);
          for (let i = 0; i < n; i++) {
            const q = at(s + 2.2 + i * 0.72);
            if (!this.okAt(q.x, q.z, 'strip')) break;
            const ang = Math.atan2(q.tx, q.tz) + Math.PI / 2 + range(r, -0.35, 0.35) + (r() < 0.5 ? Math.PI : 0);
            this.addParkedBike(q.x, q.z, ang, range(r, -0.12, 0.12));
            this.col.addBox(q.x, q.z, 0.85, 0.3, Math.atan2(Math.cos(ang), Math.sin(ang)), 'bike');
          }
        }
        // else: open gap — nothing between you and the canal
      }
      s += gap;
    }
    void band;
  }

  placeAmstelQuays() {
    for (const dv of L.STREET_DIVIDERS) {
      if (dv.name !== 'Amstel') continue;
      const stripLat = dv.off < 0 ? -26.75 : 26.75;
      const len = dv.end - dv.start;
      const n = { x: Math.cos(dv.th), z: -Math.sin(dv.th) };
      const u = { x: Math.sin(dv.th), z: Math.cos(dv.th) };
      const at = (s) => {
        const P = L.dividerPoint(dv, dv.start + s, stripLat);
        return { x: P.x, z: P.z, tx: u.x, tz: u.z };
      };
      void n;
      this.fillStrip(len, at, 2.5, true, null);
    }
  }

  // ---- radial streets: lamps, bikes against walls, racks ---------------------
  placeRadials() {
    const r = this.rand;
    for (const dv of L.STREET_DIVIDERS) {
      if (dv.name === 'Amstel') continue;
      const sides = [];
      let acc = dv.off - dv.hw;
      for (const s of dv.xs) {
        if (s.kind === 'side') sides.push([acc, acc + s.w]);
        acc += s.w;
      }
      const len = dv.end - dv.start;
      sides.forEach(([a, b], i) => {
        const houseSide = i === 0 ? a : b; // outer edge touches the houses
        const curbSide = i === 0 ? b : a;
        const dirIn = i === 0 ? 1 : -1;
        // lamps near the curb
        for (let s = 8 + i * 12; s < len; s += 26) {
          const P = L.dividerPoint(dv, dv.start + s, curbSide - dirIn * 0.35);
          if (this.okAt(P.x, P.z, 'side')) this.addLamp(P.x, P.z);
        }
        // bikes parked against the house walls
        let s = 3;
        while (s < len - 3) {
          const cluster = r() < 0.45;
          if (cluster) {
            const n = 1 + Math.floor(r() * 4);
            for (let k = 0; k < n; k++) {
              const lat = houseSide + dirIn * 0.42;
              const P = L.dividerPoint(dv, dv.start + s + k * 0.75 * 2.4, lat);
              if (!this.okAt(P.x, P.z, 'side')) break;
              const yaw = dv.th + (r() < 0.5 ? 0 : Math.PI);
              this.addParkedBike(P.x, P.z, yaw, dirIn * range(r, 0.12, 0.2) * (yaw === dv.th ? 1 : -1));
              this.col.addBox(P.x, P.z, 0.9, 0.3, Math.atan2(Math.cos(yaw), Math.sin(yaw)), 'bike');
            }
            s += n * 1.8 + range(r, 4, 14);
          } else s += range(r, 6, 18);
        }
      });
    }
  }

  // ---- houseboats ----------------------------------------------------------
  placeHouseboats() {
    const r = this.rand;
    const b = this.cb;
    for (const c of L.CANALS) {
      if (c.id === 'voorburgwal') continue;
      for (const sgn of [-1, 1]) {
        const rr = c.r + sgn * (c.hw - 2.6);
        const th0 = c.full ? -Math.PI : -L.THETA_MAX, th1 = c.full ? Math.PI : L.THETA_MAX;
        let s = 0;
        const len = rr * (th1 - th0);
        while (s < len) {
          const boatLen = range(r, 14, 22);
          const thA = th0 + s / rr, thB = th0 + (s + boatLen) / rr;
          const thM = (thA + thB) / 2;
          const pts = [thA, thM, thB].map((t) => [rr * Math.sin(t), rr * Math.cos(t)]);
          // keep clear of bridges / junctions: water all around and no street above
          const clear = pts.every(([x, z]) => {
            const sf = L.surfaceAt(x, z);
            return sf.kind === 'water' && L.isWaterBase(x - 6 * Math.sin(thM) * sgn, z - 6 * Math.cos(thM) * sgn);
          }) && pts.every(([x, z]) => {
            // distance to bridges: sample along the canal both ways
            for (const d of [-9, 9]) {
              const t = Math.atan2(x, z) + d / rr;
              const sf = L.surfaceAt(rr * Math.sin(t), rr * Math.cos(t));
              if (sf.kind !== 'water') return false;
            }
            return true;
          });
          if (clear && hash2(Math.floor(s / 90), c.r + sgn) < (c.id === 'prinsen' ? 0.85 : 0.55) && r() < 0.8) {
            this.houseboat(b, pts[1][0], pts[1][1], thM, boatLen, r);
            s += boatLen + range(r, 2, 6);
          } else s += 6;
        }
      }
    }
  }

  houseboat(cb, x, z, yaw, len, r) {
    const b = cb.get('detail', x, z, true);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, L.WATER_Y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    const w = range(r, 3.8, 4.6);
    const box = (sx, sy, sz, px, py, pz, c) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(px, py, pz);
      b.addGeometry(g, m, c);
    };
    const hull = pick(r, ['#1e2a24', '#18202e', '#2a1a16', '#222222', '#30402f']);
    const cabin = pick(r, ['#6b4a2f', '#2f4f3f', '#3a5a7a', '#8b6f47', '#c9c3b5', '#7a2f2a', '#41534b']);
    box(len, 1.2, w, 0, 0.3, 0, hull);
    const cl = len * range(r, 0.62, 0.85);
    box(cl, 1.9, w - 0.5, (len - cl) / 2 - 0.4, 1.85, 0, cabin);
    // windows strip
    for (const side of [-1, 1]) box(cl * 0.8, 0.7, 0.05, (len - cl) / 2 - 0.4, 2.0, side * ((w - 0.5) / 2 + 0.02), '#1d2a33');
    box(cl + 0.3, 0.12, w - 0.3, (len - cl) / 2 - 0.4, 2.86, 0, '#2a2a2a');
    // roof garden
    for (let i = 0; i < 4; i++) box(0.5, 0.45, 0.5, range(r, -cl / 2, cl / 2) + (len - cl) / 2 - 0.4, 3.1, range(r, -1, 1), pick(r, ['#3e6b2f', '#4f7d35', '#b8433a', '#d9a521']));
    // deck chair / plants on the open deck
    box(0.6, 0.5, 0.6, -len / 2 + 1.3, 1.15, 0.6, '#5d7c3a');
    void yaw;
  }

  // ---- squares ---------------------------------------------------------------
  placeSquares() {
    const r = this.rand;
    // Dam: lamps around, benches
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * Math.PI * 2;
      const x = 50 * Math.sin(th), z = 50 * Math.cos(th);
      if (L.surfaceAt(x, z).kind === 'plaza') this.addLamp(x, z);
    }
    // Centraal Station bike parking: rows of racks with bikes
    const S = L.STATION_ISLAND;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 4; row++) {
        const zRow = S.z1 - 4 - row * 3.2;
        for (let x = 40; x < 130; x += 0.72) {
          const X = side * x;
          if (r() < 0.12) continue;
          this.addParkedBike(X, zRow, (r() < 0.5 ? 0 : Math.PI) + range(r, -0.1, 0.1), range(r, -0.05, 0.05));
        }
        this.col.addBox(side * 85, zRow, 45, 0.6, 0, 'bike');
      }
    }
  }

  /** Distance-based level of detail per chunk. */
  updateLOD(cam) {
    for (const e of this.lod) {
      const dx = Math.max(0, Math.abs(cam.x - e.x) - e.half), dz = Math.max(0, Math.abs(cam.z - e.z) - e.half);
      const d = Math.hypot(dx, dz);
      if (e.hideBeyond) {
        const v = d < e.hideBeyond;
        for (const o of e.near) o.visible = v;
      } else {
        const nearV = d < e.switchAt;
        for (const o of e.near) o.visible = nearV;
        for (const o of e.far) o.visible = !nearV && d < 620;
      }
    }
  }

  build(scene) {
    this.placeRingStrips();
    this.placeAmstelQuays();
    this.placeRadials();
    this.placeHouseboats();
    this.placeSquares();
    const m = this.mats.m;
    const group = new THREE.Group();
    group.name = 'props';
    this.lod = [];
    const chunkMeshes = this.cb.toMeshes(group, { bikes: bikeMaterial(), cars: m.detailGloss, detail: m.detail }, { castShadow: true, receiveShadow: true });
    for (const mesh of chunkMeshes) {
      const c = mesh.userData.chunk;
      const hide = c.mat === 'bikes' ? 190 : c.mat === 'cars' ? 400 : null;
      if (hide) this.lod.push({ x: c.x, z: c.z, half: c.size / 2, near: [mesh], far: [], hideBeyond: hide });
      if (c.mat === 'bikes') mesh.castShadow = false;
    }

    // instanced: trees (chunked for culling, two levels of detail)
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(3, this.season.autumn), roughness: 0.95 });
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 1 });
    this.leafMat = leafMat;
    this.barkMat = barkMat;
    const crownHi = crownGeometry(mulberry32(9));
    const crownLo = crownGeometryLow(mulberry32(9));
    const trunk = trunkGeometry();
    const trunkLo = new THREE.CylinderGeometry(0.15, 0.25, 5.4, 5).translate(0, 2.7, 0);
    const lampG = lampGeometries();
    const bollardG = bollardGeometry();
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0x4a1d16, roughness: 0.6, metalness: 0.2 });
    const SIZE = 220;
    const chunks = new Map();
    const chunkOf = (x, z) => {
      const k = `${Math.floor(x / SIZE)}|${Math.floor(z / SIZE)}`;
      if (!chunks.has(k)) chunks.set(k, { x: (Math.floor(x / SIZE) + 0.5) * SIZE, z: (Math.floor(z / SIZE) + 0.5) * SIZE, trees: [], lamps: [], bollards: [] });
      return chunks.get(k);
    };
    for (const t of this.trees) chunkOf(t.x, t.z).trees.push(t);
    for (const l of this.lamps) chunkOf(l.x, l.z).lamps.push(l);
    for (const bo of this.bollards) chunkOf(bo.x, bo.z).bollards.push(bo);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    this.lampGlassMeshes = [];
    const mkInst = (geo, mat, list, setter, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => setter(im, it, i));
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
      return im;
    };
    for (const ch of chunks.values()) {
      if (ch.trees.length) {
        const setTrunk = (im, t, i) => {
          Q.setFromAxisAngle(up, t.rot);
          im.setMatrixAt(i, M.compose(V.set(t.x, 0, t.z), Q, Sc.setScalar(t.s)));
        };
        const setCrown = (im, t, i) => {
          Q.setFromAxisAngle(up, t.rot);
          im.setMatrixAt(i, M.compose(V.set(t.x, 6.6 * t.s, t.z), Q, Sc.set(t.s * 1.15, t.s, t.s * 1.15)));
          const autumn = this.season.autumn ? t.tint * 0.25 : 0;
          col.setRGB(1 + autumn * 0.6, 1 + autumn * 0.15, 1 - autumn * 0.5);
          im.setColorAt(i, col);
        };
        const near = [mkInst(trunk, barkMat, ch.trees, setTrunk), mkInst(crownHi, leafMat, ch.trees, setCrown)];
        const far = [mkInst(trunkLo, barkMat, ch.trees, setTrunk, false), mkInst(crownLo, leafMat, ch.trees, setCrown, false)];
        this.lod.push({ x: ch.x, z: ch.z, half: SIZE / 2, near, far, switchAt: 170 });
      }
      if (ch.lamps.length) {
        const setL = (im, l, i) => im.setMatrixAt(i, M.makeTranslation(l.x, l.y, l.z));
        const pi = mkInst(lampG.pole, m.iron, ch.lamps, setL);
        const gi = mkInst(lampG.glass, m.lampGlass, ch.lamps, setL, false);
        this.lod.push({ x: ch.x, z: ch.z, half: SIZE / 2, near: [pi], far: [], hideBeyond: 330 });
        this.lampGlassMeshes.push(gi);
      }
      if (ch.bollards.length) {
        const bi = mkInst(bollardG, bollardMat, ch.bollards, (im, b, i) => im.setMatrixAt(i, M.makeTranslation(b.x, L.heightAt(b.x, b.z) + 0.12, b.z)), false);
        this.lod.push({ x: ch.x, z: ch.z, half: SIZE / 2, near: [bi], far: [], hideBeyond: 140 });
      }
    }
    void rackGeometry;
    scene.add(group);
    return group;
  }
}
