// Canal houses (grachtenpanden): narrow, tall, gabled, slightly leaning.
import * as THREE from 'three';
import * as L from './layout.js';
import { ChunkedBuilders } from '../util/geo.js';
import { FACADE_STYLES } from './textures.js';
import { mulberry32, range } from '../util/math.js';

const STYLE_W = [0.22, 0.15, 0.08, 0.12, 0.07, 0.1, 0.07, 0.19];
const GABLES = [
  ['step', 0.12], ['neck', 0.18], ['bell', 0.18], ['spout', 0.08], ['cornice', 0.32], ['triangle', 0.12],
];
const DOOR_COLORS = ['#1f3b2d', '#161616', '#1d2a44', '#5a1c1c', '#2d4a3e', '#3b2a1e', '#0f2a2a'];

function weighted(rand, items) {
  let t = rand() * items.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of items) if ((t -= w) <= 0) return v;
  return items[0][0];
}

/** 2D gable outline (x in [0,w], y in [0,h]) — listed counter-clockwise starting bottom-left. */
function gableOutline(type, w, h, rand) {
  const pts = [];
  if (type === 'step') {
    const steps = w > 7 ? 4 : 3;
    const sw = (w * 0.5 - w * 0.12) / steps;
    const sh = (h * 0.92) / (steps + 0.4);
    pts.push([0, 0]);
    let x = 0, y = 0;
    for (let i = 0; i < steps; i++) {
      y += sh;
      pts.push([x, y]);
      x += sw;
      pts.push([x, y]);
    }
    pts.push([x, h]);
    pts.push([w - x, h]);
    for (let i = steps - 1; i >= 0; i--) {
      pts.push([w - x, y]);
      x -= sw;
      pts.push([w - x, y]);
      y -= sh;
    }
    pts.push([w, 0]);
    // reorder to CCW: we built left side upward then right side downward which is clockwise in (x,y)
    return pts.reverse();
  }
  if (type === 'neck') {
    const nx = w * 0.27, a = h * 0.12, b = h * 0.42, top = h * 0.82;
    const left = [[0, 0], [0, a]];
    // claw curve from (0,a) to (nx,b)
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      left.push([nx * t, a + (b - a) * Math.sin((t * Math.PI) / 2)]);
    }
    left.push([nx, top]);
    // pediment arc
    const ped = [];
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      ped.push([nx + (w - 2 * nx) * t, top + (h - top) * Math.sin(t * Math.PI)]);
    }
    const right = left.map(([x, y]) => [w - x, y]).reverse();
    return [...left, ...ped, ...right].reverse();
  }
  if (type === 'bell') {
    const n = 14;
    const left = [[0, 0]];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const y = h * 0.85 * t;
      const x = w * 0.3 * (0.5 - 0.5 * Math.cos(t * Math.PI)) + w * 0.03 * Math.sin(t * Math.PI * 2);
      left.push([x, y]);
    }
    const ped = [];
    const x0 = left[left.length - 1][0];
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      ped.push([x0 + (w - 2 * x0) * t, h * 0.85 + h * 0.15 * Math.sin(t * Math.PI)]);
    }
    const right = left.map(([x, y]) => [w - x, y]).reverse();
    return [...left, ...ped, ...right].reverse();
  }
  if (type === 'spout') {
    const top = w * 0.14;
    return [[0, 0], [0, h * 0.08], [w / 2 - top, h], [w / 2 + top, h], [w, h * 0.08], [w, 0]].reverse();
  }
  // triangle
  return [[0, 0], [w / 2, h], [w, 0]].reverse();
}

export class HouseBuilder {
  constructor(mats, isExcluded) {
    this.mats = mats;
    this.isExcluded = isExcluded;
    this.cb = new ChunkedBuilders(300);
    this.addresses = [];
    this.count = 0;
    this.rand = mulberry32(1606);
    this.streetNumbers = new Map();
  }

  build(scene) {
    const blocks = L.computeBlocks();
    for (const blk of blocks) this.block(blk);
    const m = this.mats.m;
    const materials = { roof: m.roof, detail: m.detail, sidewall: m.sidewall };
    m.facades.forEach((mat, i) => (materials['f' + i] = mat));
    const group = new THREE.Group();
    group.name = 'houses';
    this.cb.toMeshes(group, materials, { castShadow: true, receiveShadow: true });
    scene.add(group);
    return group;
  }

  block(blk) {
    const { r0: ra, r1: rb, band } = blk;
    const deep = rb - ra;
    let depth = Math.min(14, deep / 2);
    const sideOk = deep - 2 * depth > 6;
    // street names for addresses
    const nameAt = (x, z) => L.surfaceAt(x, z).name || '';
    // inner arc (faces towards the centre)
    this.arcFace(blk, ra, -1, band.edge ? 18 : depth, nameAt);
    if (!band.edge) this.arcFace(blk, rb, 1, depth, nameAt);
    if (sideOk && !band.edge) {
      this.sideFace(blk, blk.A, blk.eA, -1, ra + depth, rb - depth, depth, nameAt);
      this.sideFace(blk, blk.B, blk.eB, 1, ra + depth, rb - depth, depth, nameAt);
    } else if (band.edge) {
      this.sideFace(blk, blk.A, blk.eA, -1, ra + 18, rb, 14, nameAt);
      this.sideFace(blk, blk.B, blk.eB, 1, ra + 18, rb, 14, nameAt);
    }
  }

  widths(total, kind) {
    const out = [];
    let left = total;
    const rand = this.rand;
    while (left > 0.1) {
      let w;
      if (kind === 'grand') w = range(rand, 7, 12);
      else if (kind === 'side') w = range(rand, 4.6, 7.5);
      else w = rand() < 0.12 ? range(rand, 9, 12) : range(rand, 5.2, 8.6);
      if (left - w < 4.2) w = left;
      out.push(w);
      left -= w;
    }
    return out;
  }

  arcFace(blk, R, sigma, depth, nameAt) {
    const Rd = R - sigma * depth;
    let tA = L.lineThetaAt(blk.A, blk.eA, R), tB = L.lineThetaAt(blk.B, blk.eB, R);
    if (tB < tA) tB += Math.PI * 2;
    let bA = L.lineThetaAt(blk.A, blk.eA, Rd), bB = L.lineThetaAt(blk.B, blk.eB, Rd);
    if (bB < bA) bB += Math.PI * 2;
    if (Math.abs(bA - tA) > Math.PI) bA += Math.sign(tA - bA) * Math.PI * 2;
    if (Math.abs(bB - tB) > Math.PI) bB += Math.sign(tB - bB) * Math.PI * 2;
    const len = R * (tB - tA);
    if (len < 4) return;
    const grand = blk.band.r0 === 331.5 || blk.band.r0 === 278 || R < 60;
    const ws = this.widths(len, grand ? 'grand' : 'canal');
    let acc = 0;
    for (let k = 0; k < ws.length; k++) {
      const f0 = acc / len, f1 = (acc + ws[k]) / len;
      acc += ws[k];
      const t1 = tA + (tB - tA) * f0, t2 = tA + (tB - tA) * f1;
      const P1 = [R * Math.sin(t1), R * Math.cos(t1)], P2 = [R * Math.sin(t2), R * Math.cos(t2)];
      const q1 = k === 0 ? bA : t1;
      const q2 = k === ws.length - 1 ? bB : t2;
      const Q1 = [Rd * Math.sin(q1), Rd * Math.cos(q1)], Q2 = [Rd * Math.sin(q2), Rd * Math.cos(q2)];
      const tm = (t1 + t2) / 2;
      const N = [sigma * Math.sin(tm), sigma * Math.cos(tm)];
      this.house(P1, P2, Q1, Q2, N, { band: blk.band, grand, nameAt, cornerA: k === 0, cornerB: k === ws.length - 1 });
    }
  }

  sideFace(blk, dv, e, sideSign, rFrom, rTo, depth, nameAt) {
    if (rTo - rFrom < 5) return;
    // the block lies at perp > e for side A (sideSign -1 means facing -n), perp < e for side B
    const n = [Math.cos(dv.th), -Math.sin(dv.th)];
    const N = [n[0] * sideSign, n[1] * sideSign];
    const eBack = e - sideSign * depth;
    const s0 = Math.sqrt(rFrom * rFrom - e * e), s1 = Math.sqrt(rTo * rTo - e * e);
    const ws = this.widths(s1 - s0, 'side');
    let acc = s0;
    for (const w of ws) {
      const sa = acc, sb = acc + w;
      acc = sb;
      const A = L.dividerPoint(dv, sa, e), B = L.dividerPoint(dv, sb, e);
      const A2 = L.dividerPoint(dv, sa, eBack), B2 = L.dividerPoint(dv, sb, eBack);
      this.house([A.x, A.z], [B.x, B.z], [A2.x, A2.z], [B2.x, B2.z], N, { band: blk.band, side: true, nameAt });
    }
  }

  /** P1,P2 front corners; Q1,Q2 the matching back corners; N outward facade normal. */
  house(P1, P2, Q1, Q2, N, opts) {
    const rand = this.rand;
    const cx = (P1[0] + P2[0] + Q1[0] + Q2[0]) / 4, cz = (P1[1] + P2[1] + Q1[1] + Q2[1]) / 4;
    if (this.isExcluded(cx, cz) || this.isExcluded((P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2)) return;
    // make P1 the left corner seen from the street
    const right = [N[1], -N[0]];
    let cornerL = !!opts.cornerA, cornerR = !!opts.cornerB;
    if ((P2[0] - P1[0]) * right[0] + (P2[1] - P1[1]) * right[1] < 0) {
      [P1, P2] = [P2, P1];
      [Q1, Q2] = [Q2, Q1];
      [cornerL, cornerR] = [cornerR, cornerL];
    }
    const w = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
    if (w < 2.5) return;
    this.count++;
    const band = opts.band;
    let floors;
    if (band.edge) floors = 5 + Math.floor(rand() * 2);
    else if (opts.side) floors = 3 + Math.floor(rand() * 2);
    else if (opts.grand) floors = 4 + Math.floor(rand() * 2);
    else floors = 4 + (rand() < 0.4 ? 1 : 0) - (rand() < 0.15 ? 1 : 0);
    const groundH = 3.6, floorH = 3.05;
    const H = groundH + (floors - 1) * floorH;
    let gable = weighted(rand, GABLES);
    if (band.edge || w > 10.5) gable = 'cornice';
    const styleIdx = (() => {
      let t = rand();
      for (let i = 0; i < STYLE_W.length; i++) if ((t -= STYLE_W[i]) <= 0) return i;
      return 0;
    })();
    const style = FACADE_STYLES[styleIdx];
    const hg = gable === 'cornice' ? 0 : Math.min(w * (gable === 'triangle' || gable === 'spout' ? 0.75 : 1.05), 8.5);
    const Htot = H + hg;
    // lean (dancing houses)
    const leanF = rand() < 0.5 ? range(rand, 0, 0.18) : 0;
    const leanS = rand() < 0.4 ? range(rand, -0.22, 0.22) : 0;
    const lx = N[0] * leanF + right[0] * leanS, lz = N[1] * leanF + right[1] * leanS;
    const V = (p, y, inset = 0) => [p[0] - N[0] * inset + (lx * y) / Htot, y, p[1] - N[1] * inset + (lz * y) / Htot];

    const fb = this.cb.get('f' + styleIdx, cx, cz);
    const det = this.cb.get('detail', cx, cz, true);
    const roof = this.cb.get('roof', cx, cz);

    // --- facade UVs
    const bays = Math.max(2, Math.min(5, Math.round(w / 1.85)));
    const u0 = Math.floor(rand() * 4) / 4, v0 = Math.floor(rand() * 4) / 4;
    const uAt = (fx) => u0 + (fx * bays) / 4;
    const vAt = (y) => v0 + (y < groundH ? (y / groundH) * 0.25 : 0.25 + ((y - groundH) / floorH) * 0.25);
    // front facade
    fb.quad(V(P1, 0), V(P2, 0), V(P2, H), V(P1, H), [uAt(0), vAt(0), uAt(1), vAt(0), uAt(1), vAt(H), uAt(0), vAt(H)]);
    // sides & back: plain wall patch of the texture
    const sw = this.cb.get('sidewall', cx, cz, true);
    sw.setColor(style.wall.map((c) => Math.pow(c / 255, 2.2) * 1.15));
    const wallUv = (len) => [0, 0, len / 3, 0, len / 3, H / 3, 0, H / 3];
    const dR = Math.hypot(Q2[0] - P2[0], Q2[1] - P2[1]);
    // corner houses get windows on the side facing the cross street
    const sideUv = (len) => {
      const u1 = u0 + Math.max(1, Math.round(len / (w / bays))) / 4 * 0.75;
      return [u0, vAt(0), u1, vAt(0), u1, vAt(H), u0, vAt(H)];
    };
    (cornerR ? fb : sw).quad(V(P2, 0), V(Q2, 0), V(Q2, H), V(P2, H), cornerR ? sideUv(dR) : wallUv(dR));
    (cornerL ? fb : sw).quad(V(Q1, 0), V(P1, 0), V(P1, H), V(Q1, H), cornerL ? sideUv(dR) : wallUv(dR));
    sw.quad(V(Q2, 0), V(Q1, 0), V(Q1, H), V(Q2, H), wallUv(w));

    const wallCol = `rgb(${style.wall.join(',')})`;
    const trimCol = style.trim;
    const PM = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2], QM = [(Q1[0] + Q2[0]) / 2, (Q1[1] + Q2[1]) / 2];

    if (gable === 'cornice') {
      // roof with ridge parallel to facade
      const hr = 2.6;
      const ins = 0.5;
      const ridgeF = Math.min(4, dR / 2);
      const R1 = [P1[0] + (Q1[0] - P1[0]) * (ridgeF / dR), P1[1] + (Q1[1] - P1[1]) * (ridgeF / dR)];
      const R2 = [P2[0] + (Q2[0] - P2[0]) * (ridgeF / dR), P2[1] + (Q2[1] - P2[1]) * (ridgeF / dR)];
      roof.quad(V(P1, H, ins), V(P2, H, ins), V(R2, H + hr), V(R1, H + hr), [0, 0, w / 3, 0, w / 3, 1, 0, 1]);
      roof.quad(V(R1, H + hr), V(R2, H + hr), V(Q2, H), V(Q1, H), [0, 0, w / 3, 0, w / 3, 2, 0, 2]);
      det.setColor(wallCol);
      det.tri(V(P2, H, ins), V(Q2, H), V(R2, H + hr));
      det.tri(V(Q1, H), V(P1, H, ins), V(R1, H + hr));
      // cornice
      det.setColor(trimCol);
      boxOriented(det, V, P1, P2, N, H - 0.55, H + 0.15, -0.35, 0.05);
      // little attic dormer with hoist hatch on some
      if (rand() < 0.45 && w > 5) {
        const half = 0.75 / w;
        det.setColor(wallCol);
        boxOriented(det, V, lerp2(P1, P2, 0.5 - half), lerp2(P1, P2, 0.5 + half), N, H + 0.15, H + 1.7, 0.1, 1.0);
        det.setColor(trimCol);
        boxOriented(det, V, lerp2(P1, P2, 0.5 - half * 0.7), lerp2(P1, P2, 0.5 + half * 0.7), N, H + 0.35, H + 1.5, 0.05, 0.12);
        det.setColor('#2b2420');
        boxOriented(det, V, lerp2(P1, P2, 0.47), lerp2(P1, P2, 0.53), N, H + 1.75, H + 1.92, -0.8, 0.1);
      }
    } else {
      // front gable
      const outline = gableOutline(gable, w, hg, rand);
      const tris = THREE.ShapeUtils.triangulateShape(outline.map(([x, y]) => new THREE.Vector2(x, y)), []);
      const G = (x, y, inset = 0) => V(lerp2(P1, P2, x / w), H + y, inset);
      for (const [a, b, c] of tris) {
        const pa = outline[a], pb = outline[b], pc = outline[c];
        const uv = [uAt(pa[0] / w), vAt(H + pa[1]), uAt(pb[0] / w), vAt(H + pb[1]), uAt(pc[0] / w), vAt(H + pc[1])];
        // ensure front facing (normal along N)
        const A = G(pa[0], pa[1]), B = G(pb[0], pb[1]), C = G(pc[0], pc[1]);
        const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
        const nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        if (nx * N[0] + nz * N[1] >= 0) fb.tri(A, B, C, uv);
        else fb.tri(A, C, B, [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]]);
      }
      // outline thickness / coping
      const coping = gable === 'step' || gable === 'triangle' ? wallCol : trimCol;
      det.setColor(coping);
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i], q = outline[(i + 1) % outline.length];
        if (p[1] < 0.01 && q[1] < 0.01) continue;
        const A = G(p[0], p[1]), B = G(q[0], q[1]), C = G(q[0], q[1], 0.4), D = G(p[0], p[1], 0.4);
        // outward normal of a CCW outline edge, mapped to world space
        const ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey) || 1;
        const n2x = ey / el, n2y = -ex / el;
        quadN(det, A, B, C, D, [(right[0] * n2x), n2y, (right[1] * n2x)]);
      }
      // roof behind
      const hr = Math.min(hg * 0.85, w * 0.8);
      const ins = 0.4;
      roof.quad(V(P1, H, ins), V(PM, H + hr, ins), V(QM, H + hr), V(Q1, H), [0, 0, 1, 0, 1, dR / 3, 0, dR / 3]);
      roof.quad(V(PM, H + hr, ins), V(P2, H, ins), V(Q2, H), V(QM, H + hr), [0, 0, 1, 0, 1, dR / 3, 0, dR / 3]);
      det.setColor(wallCol);
      det.tri(V(Q2, H), V(Q1, H), V(QM, H + hr));
      det.tri(V(P1, H, ins), V(P2, H, ins), V(PM, H + hr, ins));
      // trim band under gable
      det.setColor(trimCol);
      boxOriented(det, V, P1, P2, N, H - 0.18, H + 0.04, -0.12, 0.02);
      // hoist beam (hijsbalk)
      if (rand() < 0.85) {
        const yb = H + hg * 0.72;
        det.setColor('#2b2420');
        boxOriented(det, V, lerp2(P1, P2, 0.47), lerp2(P1, P2, 0.53), N, yb, yb + 0.18, -0.9, 0.1);
      }
    }
    // chimney
    if (rand() < 0.35) {
      det.setColor(wallCol);
      const C0 = lerp2(lerp2(P1, Q1, 0.6), lerp2(P2, Q2, 0.6), 0.25);
      const C1 = lerp2(lerp2(P1, Q1, 0.6), lerp2(P2, Q2, 0.6), 0.32);
      boxOriented(det, V, C0, C1, N, H, H + (gable === 'cornice' ? 3.3 : hg * 0.8), 0, 0.5);
    }
    // door
    const bay = Math.floor(rand() * bays);
    const fx = (bay + 0.5) / bays;
    const dw = Math.min(1.15, w / bays - 0.3) / w;
    det.setColor(trimCol);
    boxOriented(det, V, lerp2(P1, P2, fx - dw / 2 - 0.12 / w), lerp2(P1, P2, fx + dw / 2 + 0.12 / w), N, 0.0, 2.75, -0.03, 0.04);
    det.setColor(DOOR_COLORS[Math.floor(rand() * DOOR_COLORS.length)]);
    boxOriented(det, V, lerp2(P1, P2, fx - dw / 2), lerp2(P1, P2, fx + dw / 2), N, 0.12, 2.5, -0.07, 0.05);
    // basement / stoop step
    det.setColor('#8d877c');
    boxOriented(det, V, lerp2(P1, P2, fx - dw / 2 - 0.1 / w), lerp2(P1, P2, fx + dw / 2 + 0.1 / w), N, 0.0, 0.14, -0.35, 0.02);

    // address for missions
    const name = opts.nameAt(PM[0] + N[0] * 3, PM[1] + N[1] * 3);
    if (name) {
      const n = (this.streetNumbers.get(name) || 0) + (1 + Math.floor(rand() * 2));
      this.streetNumbers.set(name, n);
      const door = lerp2(P1, P2, fx);
      this.addresses.push({ x: door[0] + N[0] * 1.6, z: door[1] + N[1] * 1.6, nx: N[0], nz: N[1], street: name, number: n });
    }
  }
}

function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Box attached to the facade between A and B (front corners), from y0..y1, protruding from out0 to out1 (negative = outward). */
function boxOriented(b, V, A, B, N, y0, y1, out0, out1) {
  // inset positive goes into the building; negative protrudes
  const a0 = V(A, y0, out1), b0 = V(B, y0, out1), a1 = V(A, y1, out1), b1 = V(B, y1, out1);
  const c0 = V(A, y0, out0), d0 = V(B, y0, out0), c1 = V(A, y1, out0), d1 = V(B, y1, out0);
  // front (outermost = out0 since smaller inset)
  quadN(b, c0, d0, d1, c1, [N[0], 0, N[1]]);
  quadN(b, c1, d1, b1, a1, [0, 1, 0]);
  quadN(b, a0, b0, d0, c0, [0, -1, 0]);
  const rx = B[0] - A[0], rz = B[1] - A[1];
  const rl = Math.hypot(rx, rz) || 1;
  quadN(b, d0, b0, b1, d1, [rx / rl, 0, rz / rl]);
  quadN(b, a0, c0, c1, a1, [-rx / rl, 0, -rz / rl]);
}

function quadN(b, A, B, C, D, n) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) b.quad(A, B, C, D, undefined, n);
  else b.quad(B, A, D, C, undefined, n);
}
