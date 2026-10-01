// Streets, bike lanes, sidewalks, quay walls, bridges and water.
import * as THREE from 'three';
import * as L from './layout.js';
import { ChunkedBuilders, MeshBuilder } from '../util/geo.js';

const TAU = Math.PI * 2;
const Y_OFF = { road: 0, bike: 0.006, strip: 0.012, edge: 0.1, side: 0.12, plaza: 0.004, grass: 0.0 };

/** Absolute ranges of each strip of a cross section starting at `start`. */
export function stripRanges(xs, start) {
  let a = start;
  return xs.map((s) => {
    const r = { a, b: a + s.w, kind: s.kind, mat: s.mat };
    a += s.w;
    return r;
  });
}
/** Lateral range [lo, hi] of road + bike lanes, relative to cross-section start. */
export function carriageway(xs) {
  let a = 0, lo = Infinity, hi = -Infinity;
  for (const s of xs) {
    if (s.kind === 'road' || s.kind === 'bike') {
      lo = Math.min(lo, a);
      hi = Math.max(hi, a + s.w);
    }
    a += s.w;
  }
  return [lo, hi];
}
export function roadRange(xs) {
  let a = 0;
  for (const s of xs) {
    if (s.kind === 'road') return [a, a + s.w];
    a += s.w;
  }
  return [0, 0];
}

// --- angular interval bookkeeping -------------------------------------------
const lineFn = (dv, e) => (r) => L.lineThetaAt(dv, e, r);
const constFn = (v) => () => v;
const shift = (f, k) => (k === 0 ? f : (r) => f(r) + k * TAU);

/**
 * Remaining angular intervals of a ring strip after removing `cuts`.
 * cuts: [{lo: fn(r), hi: fn(r)}]; sector: 'all' | 'ring' | 'wedge'.
 */
function computeIntervals(cuts, sector, rm) {
  const out = [];
  if (sector === 'all') {
    if (cuts.length === 0) return [{ from: constFn(-Math.PI), to: constFn(Math.PI) }];
    const cs = cuts.map((c) => ({ ...c, a: c.lo(rm) })).sort((p, q) => p.a - q.a);
    const base = cs[0].a;
    // normalise all into [base, base + TAU)
    for (const c of cs) {
      const k = Math.floor((c.lo(rm) - base) / TAU + 1e-9);
      c.lo = shift(c.lo, -k);
      c.hi = shift(c.hi, -k);
    }
    cs.sort((p, q) => p.lo(rm) - q.lo(rm));
    let cur = cs[0].hi;
    for (let i = 1; i < cs.length; i++) {
      const c = cs[i];
      if (c.lo(rm) > cur(rm) + 1e-4) out.push({ from: cur, to: c.lo });
      if (c.hi(rm) > cur(rm)) cur = c.hi;
    }
    const end = shift(cs[0].lo, 1);
    if (end(rm) > cur(rm) + 1e-4) out.push({ from: cur, to: end });
    return out;
  }
  let s0, s1, norm;
  if (sector === 'ring') {
    s0 = -L.THETA_MAX; s1 = L.THETA_MAX;
    norm = (f) => {
      const v = f(rm);
      const k = Math.round(v / TAU);
      return shift(f, -k);
    };
  } else {
    s0 = L.THETA_MAX; s1 = TAU - L.THETA_MAX;
    norm = (f) => {
      const v = f(rm);
      const k = Math.floor(v / TAU);
      return shift(f, -k);
    };
  }
  const cs = cuts.map((c) => ({ lo: norm(c.lo), hi: norm(c.hi) }));
  for (const c of cs) {
    // keep hi consistent with lo
    if (c.hi(rm) < c.lo(rm)) c.hi = shift(c.hi, 1);
  }
  cs.sort((p, q) => p.lo(rm) - q.lo(rm));
  let cur = constFn(s0);
  for (const c of cs) {
    if (c.hi(rm) < s0 || c.lo(rm) > s1) continue;
    if (c.lo(rm) > cur(rm) + 1e-4) out.push({ from: cur, to: c.lo });
    if (c.hi(rm) > cur(rm)) cur = c.hi;
  }
  if (s1 > cur(rm) + 1e-4) out.push({ from: cur, to: constFn(s1) });
  return out;
}

export class StreetBuilder {
  constructor(mats) {
    this.mats = mats;
    this.cb = new ChunkedBuilders(220);
    this.bulbs = []; // bridge light positions
    this.bridges = [];
    this.curbBuilder = this.cb; // curbs share chunk builders (mat 'curb')
  }

  // ---- arc strips ----------------------------------------------------------
  emitArc(ra, rb, from, to, kind, mat, yExtra = 0, opts = {}) {
    const rm = (ra + rb) / 2;
    const scale = this.mats.scale[mat] || 2;
    const t0 = from(rm), t1 = to(rm);
    const len = rm * (t1 - t0);
    if (len < 0.05) return;
    // split long arcs into chunk-sized pieces
    const pieces = Math.max(1, Math.ceil(len / 110));
    const yOff = (Y_OFF[kind] ?? 0) + yExtra;
    for (let p = 0; p < pieces; p++) {
      const fa = p / pieces, fb = (p + 1) / pieces;
      const segLen = len / pieces;
      // fine subdivision only where a bridge lifts the surface
      let hilly = false;
      if (opts.flatY === undefined) {
        for (let k = 0; k <= Math.ceil(segLen / 2) && !hilly; k++) {
          const th = t0 + (t1 - t0) * (fa + ((fb - fa) * k) / Math.ceil(segLen / 2));
          for (const r of [ra, rm, rb]) if (L.heightAt(r * Math.sin(th), r * Math.cos(th)) > 0.001) hilly = true;
        }
      }
      const nSeg = Math.max(1, Math.ceil(segLen / (hilly ? 1.5 : Math.min(8, 0.06 * rm + 2))));
      const nRows = hilly ? Math.max(2, Math.ceil((rb - ra) / 3) + 1) : 2;
      const rows = [], uvs = [];
      for (let ri = 0; ri < nRows; ri++) {
        const r = ra + ((rb - ra) * ri) / (nRows - 1);
        const ta = from(r), tb = to(r);
        const row = [], uvRow = [];
        for (let i = 0; i <= nSeg; i++) {
          const f = fa + ((fb - fa) * i) / nSeg;
          const th = ta + (tb - ta) * f;
          const x = r * Math.sin(th), z = r * Math.cos(th);
          const y = (opts.flatY ?? L.heightAt(x, z)) + yOff;
          row.push([x, y, z]);
          const thm = t0 + (t1 - t0) * f;
          const u = (rm * thm) / scale;
          const v = mat === 'bike' ? (r - ra) / (rb - ra) : r / scale;
          uvRow.push(mat === 'bike' ? [u, v] : [u, v]);
        }
        rows.push(row);
        uvs.push(uvRow);
      }
      const mid = rows[0][Math.floor(nSeg / 2)];
      const b = this.cb.get(mat, mid[0], mid[2]);
      b.grid(rows, uvs);
      // curbs for raised strips
      if (kind === 'side' || kind === 'edge') {
        const cb = this.cb.get('curb', mid[0], mid[2]);
        const h = yOff;
        this.curbAlong(cb, rows[0], h, -1);
        this.curbAlong(cb, rows[rows.length - 1], h, 1);
        if (p === 0) this.curbEnd(cb, rows.map((r) => r[0]), h);
        if (p === pieces - 1) this.curbEnd(cb, rows.map((r) => r[r.length - 1]), h);
      }
    }
  }

  curbAlong(b, row, h, side) {
    for (let i = 0; i + 1 < row.length; i++) {
      const p = row[i], q = row[i + 1];
      const a = [p[0], p[1] - h, p[2]], bb = [q[0], q[1] - h, q[2]];
      const c = [q[0], q[1], q[2]], d = [p[0], p[1], p[2]];
      if (side > 0) b.quad(a, bb, c, d, [0, 0, 0.5, 0, 0.5, 0.06, 0, 0.06]);
      else b.quad(bb, a, d, c, [0, 0, 0.5, 0, 0.5, 0.06, 0, 0.06]);
    }
  }
  curbEnd(b, pts, h) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      // both windings so the end face is visible from either side
      b.quad([p[0], p[1] - h, p[2]], [q[0], q[1] - h, q[2]], [q[0], q[1], q[2]], [p[0], p[1], p[2]]);
      b.quad([q[0], q[1] - h, q[2]], [p[0], p[1] - h, p[2]], [p[0], p[1], p[2]], [q[0], q[1], q[2]]);
    }
  }

  // ---- radial strips -------------------------------------------------------
  emitRadial(dv, la, lb, sFrom, sTo, kind, mat, yExtra = 0) {
    // la/lb: absolute perp coords; sFrom/sTo: functions of perp coord d -> along s
    const scale = this.mats.scale[mat] || 2;
    const lm = (la + lb) / 2;
    const s0m = sFrom(lm), s1m = sTo(lm);
    const len = s1m - s0m;
    if (len < 0.05) return;
    const pieces = Math.max(1, Math.ceil(len / 110));
    const yOff = (Y_OFF[kind] ?? 0) + yExtra + 0.018;
    for (let p = 0; p < pieces; p++) {
      const fa = p / pieces, fb = (p + 1) / pieces;
      let hilly = false;
      const nTest = Math.ceil(len / pieces / 2);
      for (let k = 0; k <= nTest && !hilly; k++) {
        const s = s0m + len * (fa + ((fb - fa) * k) / nTest);
        for (const d of [la, lm, lb]) {
          const P = L.dividerPoint(dv, s, d);
          if (L.heightAt(P.x, P.z) > 0.001) hilly = true;
        }
      }
      const nSeg = Math.max(1, Math.ceil(len / pieces / (hilly ? 1.5 : 10)));
      const nRows = hilly ? Math.max(2, Math.ceil((lb - la) / 3) + 1) : 2;
      const rows = [], uvs = [];
      for (let ri = 0; ri < nRows; ri++) {
        const d = la + ((lb - la) * ri) / (nRows - 1);
        const sa = sFrom(d), sb = sTo(d);
        const row = [], uvRow = [];
        for (let i = 0; i <= nSeg; i++) {
          const f = fa + ((fb - fa) * i) / nSeg;
          const s = sa + (sb - sa) * f;
          const P = L.dividerPoint(dv, s, d);
          const y = L.heightAt(P.x, P.z) + yOff;
          row.push([P.x, y, P.z]);
          const sm = s0m + len * f;
          const v = mat === 'bike' ? (d - la) / (lb - la) : d / scale;
          uvRow.push([sm / scale, v]);
        }
        rows.push(row);
        uvs.push(uvRow);
      }
      const mid = rows[0][Math.floor(nSeg / 2)];
      const b = this.cb.get(mat, mid[0], mid[2]);
      // rows go across the street (perp increasing), columns along s: flip winding
      const flipped = rows[0].map((_, j) => rows.map((r) => r[j]));
      const flippedUv = uvs[0].map((_, j) => uvs.map((r) => r[j]));
      b.grid(flipped, flippedUv);
      if (kind === 'side' || kind === 'edge') {
        const cb = this.cb.get('curb', mid[0], mid[2]);
        this.curbAlong(cb, rows[0], yOff, 1);
        this.curbAlong(cb, rows[rows.length - 1], yOff, -1);
        if (p === 0) this.curbEnd(cb, rows.map((r) => r[0]), yOff);
        if (p === pieces - 1) this.curbEnd(cb, rows.map((r) => r[r.length - 1]), yOff);
      }
    }
  }

  // ---- whole city ----------------------------------------------------------
  buildRings() {
    for (const b of L.BANDS) {
      if (b.type !== 'quay' && b.type !== 'street') continue;
      const strips = stripRanges(b.xs, b.r0);
      const dvs = L.activeDividers(b).filter((d) => d.kind === 'street');
      const crossesAmstel = b.r1 > 243 && b.sector !== 'wedge';
      for (const st of strips) {
        const cuts = [];
        if (st.kind !== 'road') {
          for (const dv of dvs) {
            const [lo, hi] = carriageway(dv.xs);
            cuts.push({ lo: lineFn(dv, dv.off - dv.hw + lo), hi: lineFn(dv, dv.off - dv.hw + hi) });
          }
        }
        if (crossesAmstel) {
          if (!b.amstelBridge) cuts.push({ lo: lineFn(L.AMSTEL, -28), hi: lineFn(L.AMSTEL, 28) });
        }
        const rm = (st.a + st.b) / 2;
        const ints = computeIntervals(cuts, b.sector, rm);
        for (const it of ints) this.emitArc(st.a, st.b, it.from, it.to, st.kind, st.mat);
      }
      // tram rails
      if (b.tram) {
        for (const rc of b.tram) {
          for (const off of [-0.7175, 0.7175]) {
            const r = rc + off;
            const ints = computeIntervals([], b.sector, r);
            for (const it of ints) this.emitRail(r, it.from, it.to);
          }
        }
      }
    }
    // base layer under everything (fills intersection corners & courtyards)
    for (const b of L.BANDS) {
      if (b.type === 'canal' || b.type === 'plaza') continue;
      const cuts = [];
      if (b.r1 > 243 && b.sector !== 'wedge') cuts.push({ lo: lineFn(L.AMSTEL, -25), hi: lineFn(L.AMSTEL, 25) });
      const ints = computeIntervals(cuts, b.sector, (b.r0 + b.r1) / 2);
      for (const it of ints) this.emitArc(b.r0, b.r1, it.from, it.to, 'base', 'strip', -0.05, { flatY: 0 });
    }
  }

  emitRail(r, from, to) {
    const rm = r;
    const t0 = from(rm), t1 = to(rm);
    const len = rm * (t1 - t0);
    const n = Math.ceil(len / 2);
    for (let p = 0; p < n; p += 50) {
      const pts = [];
      for (let i = p; i <= Math.min(n, p + 50); i++) {
        const th = t0 + ((t1 - t0) * i) / n;
        pts.push([r * Math.sin(th), r * Math.cos(th)]);
      }
      this.railLine(pts);
    }
  }
  railLine(pts) {
    const mid = pts[Math.floor(pts.length / 2)];
    const b = this.cb.get('rail', mid[0], mid[1]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * 0.04, nz = (dx / l) * 0.04;
      const y0 = L.heightAt(x0, z0) + 0.032, y1 = L.heightAt(x1, z1) + 0.032;
      b.quad([x0 - nx, y0, z0 - nz], [x0 + nx, y0, z0 + nz], [x1 + nx, y1, z1 + nz], [x1 - nx, y1, z1 - nz], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 0]);
    }
  }

  buildRadials() {
    for (const dv of L.STREET_DIVIDERS) {
      const strips = stripRanges(dv.xs, dv.off - dv.hw);
      // s from start to end, measured at given perp coordinate d
      const sAt = (R) => (d) => Math.sqrt(Math.max(0, R * R - d * d));
      for (const st of strips) {
        const lm = (st.a + st.b) / 2;
        const sMid = (dv.start + dv.end) / 2;
        const P = L.dividerPoint(dv, sMid, lm);
        // cut ranges (in radius) where ring carriageways cross
        let cuts = [];
        if (st.kind !== 'road') {
          for (const b of L.BANDS) {
            if (b.type !== 'quay' && b.type !== 'street') continue;
            if (b.r1 <= dv.start || b.r0 >= dv.end) continue;
            // is the band present on this side of the street?
            const testR = (b.r0 + b.r1) / 2;
            const sT = Math.sqrt(Math.max(0, testR * testR - lm * lm));
            const Q = L.dividerPoint(dv, sT, lm);
            const thQ = Math.atan2(Q.x, Q.z);
            if (L.bandAt(testR, thQ) !== b) continue;
            const [lo, hi] = carriageway(b.xs);
            cuts.push([b.r0 + lo, b.r0 + hi]);
          }
        }
        cuts.sort((a, b) => a[0] - b[0]);
        let cur = dv.start;
        const segs = [];
        for (const [a, b] of cuts) {
          if (a > cur + 0.05) segs.push([cur, Math.min(a, dv.end)]);
          cur = Math.max(cur, b);
        }
        if (dv.end > cur + 0.05) segs.push([cur, dv.end]);
        for (const [ra, rb] of segs) {
          let mat = st.mat;
          if (dv.passage && ra >= L.R_EDGE - 1 && st.kind === 'bike') mat = 'tiles';
          this.emitRadial(dv, st.a, st.b, sAt(ra), sAt(rb), st.kind, mat);
        }
        void P;
      }
      if (dv.tram) {
        for (const tc of dv.tram) {
          for (const off of [-0.7175, 0.7175]) {
            const d = dv.off + tc + off;
            const pts = [];
            const s0 = Math.sqrt(dv.start * dv.start - d * d), s1 = Math.sqrt(dv.end * dv.end - d * d);
            for (let s = s0; s <= s1; s += 2) {
              const P = L.dividerPoint(dv, s, d);
              pts.push([P.x, P.z]);
              if (pts.length > 50) {
                this.railLine(pts);
                pts.splice(0, pts.length - 1);
              }
            }
            if (pts.length > 1) this.railLine(pts);
          }
        }
      }
    }
    // tram rails across the Dam (Damrak -> Vijzelstraat)
    for (const sgn of [-1, 1])
      for (const off of [-0.7175, 0.7175]) {
        const pts = [];
        for (let z = -56; z <= 56; z += 2) {
          const t = Math.min(1, Math.max(0, (z + 30) / 60));
          pts.push([sgn * (2.5 + (2.2 - 2.5) * t) + off, z]);
        }
        this.railLine(pts);
      }
  }

  buildPlazas() {
    // Dam
    const b = this.cb.get('plaza', 0, 0);
    const n = 64;
    const rows = [], uvs = [];
    for (const r of [0.01, 18, 36, L.R_PLAZA]) {
      const row = [], uv = [];
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * TAU - Math.PI;
        const x = r * Math.sin(th), z = r * Math.cos(th);
        row.push([x, Y_OFF.plaza, z]);
        uv.push([x / 6, z / 6]);
      }
      rows.push(row);
      uvs.push(uv);
    }
    b.grid(rows, uvs);
    // Stationsplein
    const S = L.STATION_ISLAND;
    this.flatRect(S.x0, S.z0, S.x1, S.z1, 'plaza', Y_OFF.plaza, 6);
    // Museumplein (grass + gravel)
    const M = L.MUSEUMPLEIN;
    this.emitArc(M.r0, M.r1, constFn(M.th0), constFn(M.th1), 'grass', 'grass', 0, { flatY: 0 });
    this.emitArc(L.R_EDGE, M.r0, constFn(M.th0), constFn(M.th1), 'plaza', 'plaza', 0, { flatY: 0 });
  }

  flatRect(x0, z0, x1, z1, mat, y, scale) {
    const b = this.cb.get(mat, (x0 + x1) / 2, (z0 + z1) / 2);
    const nx = Math.ceil((x1 - x0) / 20), nz = Math.ceil((z1 - z0) / 20);
    const rows = [], uvs = [];
    for (let j = 0; j <= nz; j++) {
      const row = [], uv = [];
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
        row.push([x, y, z]);
        uv.push([x / scale, z / scale]);
      }
      rows.push(row);
      uvs.push(uv);
    }
    // rows along +z, columns along +x: upward-facing winding
    b.grid(rows, uvs);
  }

  // ---- quay walls ------------------------------------------------------------
  buildQuayWalls() {
    const runs = [];
    const sample = (pts) => {
      // pts: [{x,z,nx,nz}] ; nx,nz points to the water
      let run = [];
      for (const p of pts) {
        const w = L.isWaterBase(p.x + p.nx * 0.5, p.z + p.nz * 0.5);
        const l = !L.isWaterBase(p.x - p.nx * 0.5, p.z - p.nz * 0.5);
        if (w && l) run.push(p);
        else if (run.length) {
          if (run.length > 1) runs.push(run);
          run = [];
        }
      }
      if (run.length > 1) runs.push(run);
    };
    for (const c of L.CANALS) {
      for (const [r, sgn] of [[c.r - c.hw, 1], [c.r + c.hw, -1]]) {
        const pts = [];
        const step = 1.5 / r;
        const a0 = c.full ? -Math.PI : -L.THETA_MAX - 0.12;
        const a1 = c.full ? Math.PI : L.THETA_MAX + 0.12;
        for (let th = a0; th <= a1 + 1e-9; th += step) {
          pts.push({ x: r * Math.sin(th), z: r * Math.cos(th), nx: sgn * Math.sin(th), nz: sgn * Math.cos(th) });
        }
        sample(pts);
      }
    }
    // Amstel banks
    for (const [d, sgn] of [[-L.AMSTEL_HW, 1], [L.AMSTEL_HW, -1]]) {
      const pts = [];
      const n = { x: Math.cos(L.AMSTEL.th), z: -Math.sin(L.AMSTEL.th) };
      for (let s = 240; s <= 820; s += 1.5) {
        const P = L.dividerPoint(L.AMSTEL, s, d);
        pts.push({ x: P.x, z: P.z, nx: n.x * sgn, nz: n.z * sgn });
      }
      sample(pts);
    }
    // IJ waterfront
    {
      const pts = [];
      const r = L.R_IJ;
      for (let th = L.THETA_MAX; th <= TAU - L.THETA_MAX; th += 1.5 / r) {
        pts.push({ x: r * Math.sin(th), z: r * Math.cos(th), nx: Math.sin(th), nz: Math.cos(th) });
      }
      sample(pts);
    }
    // boundary streets along the IJ
    for (const dv of L.STREET_DIVIDERS.filter((d) => d.boundary)) {
      for (const sgn of [-1, 1]) {
        const pts = [];
        const n = { x: Math.cos(dv.th) * sgn, z: -Math.sin(dv.th) * sgn };
        for (let s = 300; s <= L.R_EDGE; s += 1.5) {
          const P = L.dividerPoint(dv, s, dv.hw * sgn);
          pts.push({ x: P.x, z: P.z, nx: n.x, nz: n.z });
        }
        sample(pts);
      }
    }
    // station island
    {
      const S = L.STATION_ISLAND;
      const edges = [
        [[S.x0, S.z1], [S.x1, S.z1], 0, 1],
        [[S.x1, S.z1], [S.x1, S.z0], 1, 0],
        [[S.x1, S.z0], [S.x0, S.z0], 0, -1],
        [[S.x0, S.z0], [S.x0, S.z1], -1, 0],
      ];
      for (const [a, b, nx, nz] of edges) {
        const pts = [];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 0; t <= len; t += 1.5) {
          const f = t / len;
          pts.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, nx, nz });
        }
        sample(pts);
      }
    }
    const top = 0.1, bot = L.WATER_Y - 1.0;
    for (const run of runs) {
      let u = 0;
      for (let i = 0; i + 1 < run.length; i++) {
        const p = run[i], q = run[i + 1];
        const du = Math.hypot(q.x - p.x, q.z - p.z);
        const b = this.cb.get('quay', p.x, p.z);
        // face points towards water (normal n): order so that cross gives n
        const nrm = [p.nx, 0, p.nz];
        const A = [p.x, bot, p.z], B = [q.x, bot, q.z], C = [q.x, top, q.z], D = [p.x, top, p.z];
        // determine winding
        const ux = B[0] - A[0], uz = B[2] - A[2];
        // cross(u, up) = (uz*1 - 0, ..., -ux) => (−? ) compute normal of (A,B,D): (B-A)x(D-A) = (ux,0,uz)x(0,h,0) = (-uz*h, 0, ux*h)
        const nxq = -uz, nzq = ux;
        const uv = [u / 2, bot / 2, (u + du) / 2, bot / 2, (u + du) / 2, top / 2, u / 2, top / 2];
        if (nxq * nrm[0] + nzq * nrm[2] >= 0) b.quad(A, B, C, D, uv, nrm);
        else b.quad(B, A, D, C, [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]], nrm);
        u += du;
      }
    }
  }

  // ---- bridges -----------------------------------------------------------------
  buildBridges() {
    // radial streets over ring canals
    for (const dv of L.STREET_DIVIDERS) {
      for (const c of L.CANALS) {
        if (!(dv.start <= c.r - c.hw && dv.end >= c.r + c.hw)) continue;
        const th = L.lineThetaAt(dv, dv.off, c.r);
        if (!L.canalExistsAt(c, th)) continue;
        const span = c.hw;
        const sideAt = (e) => (u) => {
          const r = c.r + u;
          const s = Math.sqrt(Math.max(0, r * r - e * e));
          return L.dividerPoint(dv, s, e);
        };
        const n = { x: Math.cos(dv.th), z: -Math.sin(dv.th) };
        this.bridge({
          name: dv.name + ' / ' + c.name,
          span,
          sides: [
            { at: sideAt(dv.off - dv.hw), inner: sideAt(dv.off - dv.hw + 0.3), n: { x: -n.x, z: -n.z } },
            { at: sideAt(dv.off + dv.hw), inner: sideAt(dv.off + dv.hw - 0.3), n },
          ],
          spans: span * 2 > 28 ? 3 : 1,
          center: L.dividerPoint(dv, c.r, dv.off),
        });
      }
      if (dv.name === 'Damrak') {
        const sideAt = (e) => (u) => L.dividerPoint(dv, 334.5 + u, e);
        const n = { x: Math.cos(dv.th), z: -Math.sin(dv.th) };
        this.bridge({
          name: 'Stationsplein brug',
          span: 14.5,
          sides: [
            { at: sideAt(-dv.hw), inner: sideAt(-dv.hw + 0.3), n: { x: -n.x, z: -n.z } },
            { at: sideAt(dv.hw), inner: sideAt(dv.hw - 0.3), n },
          ],
          spans: 3,
          center: L.dividerPoint(dv, 334.5, 0),
        });
      }
    }
    // ring streets over the Amstel
    for (const b of L.BANDS) {
      if (!b.amstelBridge) continue;
      const sideAt = (r) => (u) => {
        const th = L.lineThetaAt(L.AMSTEL, u, r);
        return { x: r * Math.sin(th), z: r * Math.cos(th) };
      };
      const rm = (b.r0 + b.r1) / 2;
      const thm = L.lineThetaAt(L.AMSTEL, 0, rm);
      const desc = {
        name: b.amstelBridge,
        span: L.AMSTEL_HW,
        sides: [
          { at: sideAt(b.r0), inner: sideAt(b.r0 + 0.3), n: { x: -Math.sin(thm), z: -Math.cos(thm) } },
          { at: sideAt(b.r1), inner: sideAt(b.r1 - 0.3), n: { x: Math.sin(thm), z: Math.cos(thm) } },
        ],
        spans: 3,
        center: { x: rm * Math.sin(thm), z: rm * Math.cos(thm) },
        magere: b.amstelBridge === 'Magere Brug',
        band: b,
      };
      this.bridge(desc);
    }
  }

  /**
   * Generic arched brick bridge. Each side provides at(u) -> {x,z} along the
   * crossing coordinate u in [-span-APPROACH, span+APPROACH].
   */
  bridge(desc) {
    this.bridges.push(desc);
    if (desc.magere) return; // built as a landmark
    const L0 = desc.span + L.APPROACH;
    const step = 0.5;
    const nSpans = desc.spans;
    const pier = nSpans > 1 ? 1.4 : 0;
    const spanW = (2 * desc.span - pier * (nSpans - 1)) / nSpans;
    const spring = L.WATER_Y - 0.25;
    const deckAt = (side, u) => {
      const P = side.inner(u);
      return L.heightAt(P.x, P.z);
    };
    // arch underside height at u
    const archAt = (u, side) => {
      if (Math.abs(u) >= desc.span) return null;
      const x = u + desc.span;
      const k = Math.floor(x / (spanW + pier));
      const local = x - k * (spanW + pier);
      if (local > spanW || k >= nSpans) return spring; // pier
      const half = spanW / 2;
      const mid = -desc.span + k * (spanW + pier) + half;
      const apex = deckAt(side, mid) - 0.75;
      const t = (local - half) / half;
      return spring + (apex - spring) * Math.sqrt(Math.max(0, 1 - t * t));
    };
    for (const side of desc.sides) {
      const brick = this.cb.get('brick', desc.center.x, desc.center.z);
      const cap = this.cb.get('granite', desc.center.x, desc.center.z);
      const stone = this.cb.get('archStone', desc.center.x, desc.center.z);
      const iron = this.cb.get('iron', desc.center.x, desc.center.z);
      const us = [];
      for (let u = -L0; u <= L0 + 1e-6; u += step) us.push(u);
      const PAR = 0.42;
      let uAcc = 0;
      for (let i = 0; i + 1 < us.length; i++) {
        const u0 = us[i], u1 = us[i + 1];
        const P0 = side.at(u0), P1 = side.at(u1);
        const I0 = side.inner(u0), I1 = side.inner(u1);
        const d0 = deckAt(side, u0), d1 = deckAt(side, u1);
        const a0 = archAt(u0, side), a1 = archAt(u1, side);
        const b0 = a0 ?? -0.05, b1 = a1 ?? -0.05;
        const nrm = [side.n.x, 0, side.n.z];
        const seg = Math.hypot(P1.x - P0.x, P1.z - P0.z);
        const uv = [uAcc, b0, uAcc + seg, b1, uAcc + seg, d1 + PAR, uAcc, d0 + PAR];
        orientedQuad(brick, [P0.x, b0, P0.z], [P1.x, b1, P1.z], [P1.x, d1 + PAR, P1.z], [P0.x, d0 + PAR, P0.z], nrm, uv);
        // inner parapet face
        const inN = [-side.n.x, 0, -side.n.z];
        orientedQuad(brick, [I0.x, d0, I0.z], [I1.x, d1, I1.z], [I1.x, d1 + PAR, I1.z], [I0.x, d0 + PAR, I0.z], inN, [uAcc, 0, uAcc + seg, 0, uAcc + seg, PAR, uAcc, PAR]);
        // cap
        orientedQuad(cap, [P0.x, d0 + PAR, P0.z], [P1.x, d1 + PAR, P1.z], [I1.x, d1 + PAR, I1.z], [I0.x, d0 + PAR, I0.z], [0, 1, 0], [uAcc / 2, 0, (uAcc + seg) / 2, 0, (uAcc + seg) / 2, 0.15, uAcc / 2, 0.15]);
        // arch ring (stone band along intrados)
        if (a0 !== null && a1 !== null && a0 > spring + 0.01 && a1 > spring + 0.01) {
          const o = 0.04;
          const Q0 = { x: P0.x + side.n.x * o, z: P0.z + side.n.z * o }, Q1 = { x: P1.x + side.n.x * o, z: P1.z + side.n.z * o };
          orientedQuad(stone, [Q0.x, a0, Q0.z], [Q1.x, a1, Q1.z], [Q1.x, a1 + 0.38, Q1.z], [Q0.x, a0 + 0.38, Q0.z], nrm);
          if (i % 2 === 0) this.bulbs.push([Q0.x + side.n.x * 0.06, a0 + 0.5, Q0.z + side.n.z * 0.06]);
        }
        // parapet-top lights & railing posts
        if (Math.abs(u0) < desc.span && i % 3 === 0) {
          const M = { x: (P0.x + I0.x) / 2, z: (P0.z + I0.z) / 2 };
          this.bulbs.push([M.x, d0 + PAR + 0.66, M.z]);
          addBox(iron, M.x, d0 + PAR + 0.3, M.z, 0.035, 0.6, 0.035);
        }
        if (Math.abs(u0) < desc.span + 0.5) {
          const M0 = { x: (P0.x + I0.x) / 2, z: (P0.z + I0.z) / 2 }, M1 = { x: (P1.x + I1.x) / 2, z: (P1.z + I1.z) / 2 };
          railSeg(iron, M0, d0 + PAR + 0.6, M1, d1 + PAR + 0.6, 0.03);
        }
        uAcc += seg;
      }
    }
    // vault underside between the two sides
    const [sa, sb] = desc.sides;
    const vault = this.cb.get('brick', desc.center.x, desc.center.z);
    for (let u = -desc.span; u < desc.span - 1e-6; u += step) {
      const u1 = Math.min(desc.span, u + step);
      const A0 = sa.at(u), A1 = sa.at(u1), B0 = sb.at(u), B1 = sb.at(u1);
      const ya0 = archAt(u, sa), ya1 = archAt(u1, sa), yb0 = archAt(u, sb), yb1 = archAt(u1, sb);
      if (ya0 === null || ya1 === null) continue;
      orientedQuad(vault, [A0.x, ya0, A0.z], [A1.x, ya1, A1.z], [B1.x, yb1, B1.z], [B0.x, yb0, B0.z], [0, -1, 0]);
    }
  }

  buildWater(scene) {
    const g = new THREE.PlaneGeometry(4200, 4200, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, this.mats.m.water);
    mesh.position.y = L.WATER_Y;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  buildOuterGround() {
    // pavement-coloured ground beyond the playable city (under filler buildings)
    const cuts = [
      { lo: lineFn(L.AMSTEL, -L.AMSTEL_HW), hi: lineFn(L.AMSTEL, L.AMSTEL_HW) },
      { lo: constFn(L.MUSEUMPLEIN.th0), hi: constFn(L.MUSEUMPLEIN.th1) },
    ];
    for (const [r0, r1] of [[L.R_EDGE, 900], [900, 1400]]) {
      const ints = computeIntervals(cuts, 'ring', (r0 + r1) / 2);
      for (const it of ints) this.emitArc(r0, r1, it.from, it.to, 'base', 'strip', -0.06, { flatY: 0 });
    }
    // ground behind Museumplein
    this.emitArc(L.MUSEUMPLEIN.r1, 1400, constFn(L.MUSEUMPLEIN.th0), constFn(L.MUSEUMPLEIN.th1), 'base', 'grass', -0.06, { flatY: 0 });
  }

  build(scene) {
    this.buildRings();
    this.buildRadials();
    this.buildPlazas();
    this.buildQuayWalls();
    this.buildBridges();
    this.buildOuterGround();
    const m = this.mats.m;
    const materials = {
      klinker: m.klinker, strip: m.strip, tiles: m.tiles, asphalt: m.asphalt, bike: m.bike, granite: m.granite,
      plaza: m.plaza, grass: m.grass, curb: m.curb, quay: m.quay, brick: m.brick, archStone: m.archStone,
      iron: m.iron, rail: m.rail,
    };
    const group = new THREE.Group();
    group.name = 'streets';
    this.cb.toMeshes(group, materials, { castShadow: false, receiveShadow: true });
    // bridges cast shadows
    for (const mesh of group.children) {
      if (mesh.material === m.brick || mesh.material === m.iron) mesh.castShadow = true;
    }
    scene.add(group);
    this.water = this.buildWater(scene);
    // bridge light bulbs
    const bulbGeo = new THREE.SphereGeometry(0.06, 6, 4);
    const inst = new THREE.InstancedMesh(bulbGeo, m.bulb, this.bulbs.length);
    const mtx = new THREE.Matrix4();
    this.bulbs.forEach((p, i) => inst.setMatrixAt(i, mtx.makeTranslation(p[0], p[1], p[2])));
    inst.frustumCulled = false;
    inst.visible = false;
    scene.add(inst);
    this.bulbMesh = inst;
    return group;
  }
}

// ---- small helpers -----------------------------------------------------------
function orientedQuad(b, A, B, C, D, nrm, uv) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const dot = cx * nrm[0] + cy * nrm[1] + cz * nrm[2];
  const uvs = uv || [0, 0, 1, 0, 1, 1, 0, 1];
  if (dot >= 0) b.quad(A, B, C, D, uvs, nrm);
  else b.quad(B, A, D, C, [uvs[2], uvs[3], uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5]], nrm);
}

const _box = new THREE.BoxGeometry(1, 1, 1);
const _m4 = new THREE.Matrix4();
export function addBox(b, x, y, z, sx, sy, sz, rotY = 0) {
  _m4.makeRotationY(rotY).scale(new THREE.Vector3(sx, sy, sz)).setPosition(x, y, z);
  b.addGeometry(_box, _m4);
}
function railSeg(b, P0, y0, P1, y1, t) {
  const dx = P1.x - P0.x, dz = P1.z - P0.z;
  const l = Math.hypot(dx, dz) || 1;
  const nx = (-dz / l) * t, nz = (dx / l) * t;
  b.quad([P0.x - nx, y0 + t, P0.z - nz], [P1.x - nx, y1 + t, P1.z - nz], [P1.x + nx, y1 + t, P1.z + nz], [P0.x + nx, y0 + t, P0.z + nz], undefined, [0, 1, 0]);
  b.quad([P0.x - nx, y0 - t, P0.z - nz], [P1.x - nx, y1 - t, P1.z - nz], [P1.x - nx, y1 + t, P1.z - nz], [P0.x - nx, y0 + t, P0.z - nz]);
  b.quad([P1.x + nx, y1 - t, P1.z + nz], [P0.x + nx, y0 - t, P0.z + nz], [P0.x + nx, y0 + t, P0.z + nz], [P1.x + nx, y1 + t, P1.z + nz]);
}

export { MeshBuilder };

export { computeIntervals, lineFn, constFn };
