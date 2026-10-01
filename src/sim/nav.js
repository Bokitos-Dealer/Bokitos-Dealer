// Street graph: intersections are nodes, street segments are edges.
// Used by AI traffic and by the GPS route planner.
import * as L from '../city/layout.js';
import { stripRanges } from '../city/streets.js';

const TAU = Math.PI * 2;

function ringLanes(b) {
  const strips = stripRanges(b.xs, b.r0);
  const road = strips.find((s) => s.kind === 'road');
  const bikes = strips.filter((s) => s.kind === 'bike');
  const sides = strips.filter((s) => s.kind === 'side');
  // +theta travel keeps right = larger radius
  const bikePos = bikes.length >= 2 ? (bikes[1].a + bikes[1].b) / 2 : road.b - 0.85;
  const bikeNeg = bikes.length >= 2 ? (bikes[0].a + bikes[0].b) / 2 : road.a + 0.85;
  const rc = (road.a + road.b) / 2, rw = road.b - road.a;
  return {
    bike: [bikePos, bikeNeg],
    car: rw > 8 ? [rc + rw * 0.25, rc - rw * 0.25] : [rc + 0.5, rc - 0.5],
    walk: sides.map((s) => (s.a + s.b) / 2),
    road: [road.a, road.b],
    hasBikeLane: bikes.length >= 2,
  };
}

function radialLanes(dv) {
  const strips = stripRanges(dv.xs, dv.off - dv.hw);
  const road = strips.find((s) => s.kind === 'road') || strips.find((s) => s.kind === 'bike');
  const bikes = strips.filter((s) => s.kind === 'bike');
  const sides = strips.filter((s) => s.kind === 'side');
  // outward travel keeps right = lower perp coordinate
  const outB = bikes.length >= 2 ? (bikes[0].a + bikes[0].b) / 2 : road.a + 0.85;
  const inB = bikes.length >= 2 ? (bikes[1].a + bikes[1].b) / 2 : road.b - 0.85;
  const rc = (road.a + road.b) / 2, rw = road.b - road.a;
  const carOff = dv.tram ? rw * 0.33 : rw > 8 ? rw * 0.25 : 0.6;
  return {
    bike: [outB, inB],
    car: [rc - carOff, rc + carOff],
    walk: sides.map((s) => (s.a + s.b) / 2),
    road: [road.a, road.b],
    hasBikeLane: bikes.length >= 2,
  };
}

export class NavGraph {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.nodeMap = new Map();
    this.build();
  }
  node(key, x, z, extra = {}) {
    let n = this.nodeMap.get(key);
    if (!n) {
      n = { id: this.nodes.length, key, x, z, edges: [], ...extra };
      this.nodes.push(n);
      this.nodeMap.set(key, n);
    }
    return n;
  }
  edge(a, b, e) {
    const ed = { id: this.edges.length, a, b, ...e };
    this.edges.push(ed);
    a.edges.push(ed);
    b.edges.push(ed);
    return ed;
  }

  build() {
    const radialNodes = new Map(); // dv.id -> [{r, node}]
    const pushRad = (dv, r, n) => {
      if (!radialNodes.has(dv.id)) radialNodes.set(dv.id, []);
      radialNodes.get(dv.id).push({ r, n });
    };
    for (const b of L.BANDS) {
      if (b.type !== 'quay' && b.type !== 'street') continue;
      const rm = (b.r0 + b.r1) / 2;
      const lanes = ringLanes(b);
      const list = [];
      for (const dv of L.activeDividers(b)) {
        if (dv.kind !== 'street') continue;
        const th = L.lineThetaAt(dv, dv.off, rm);
        const n = this.node(`b${b.id}:d${dv.id}`, rm * Math.sin(th), rm * Math.cos(th), { name: b.name + ' / ' + dv.name });
        list.push({ th, n });
        pushRad(dv, rm, n);
      }
      // order around the ring
      const norm = (t) => (b.sector === 'wedge' ? ((t % TAU) + TAU) % TAU : t);
      list.sort((p, q) => norm(p.th) - norm(q.th));
      const pairs = [];
      for (let i = 0; i + 1 < list.length; i++) pairs.push([list[i], list[i + 1]]);
      if (b.sector === 'all' && list.length > 2) pairs.push([list[list.length - 1], { th: list[0].th + TAU, n: list[0].n }]);
      for (const [p, q] of pairs) {
        let ta = norm(p.th), tb = norm(q.th);
        if (b.sector === 'all' && tb < ta) tb += TAU;
        const tm = (ta + tb) / 2;
        const sm = L.surfaceAt(rm * Math.sin(tm), rm * Math.cos(tm));
        if (sm.kind === 'water' || sm.kind === 'building' || sm.kind === 'out') continue;
        this.edge(p.n, q.n, { kind: 'ring', band: b, rm, ta, tb, len: rm * (tb - ta), lanes, name: b.name, bridge: !!sm.bridge || null });
      }
    }
    // radial edges
    for (const dv of L.STREET_DIVIDERS) {
      const list = radialNodes.get(dv.id) || [];
      if (dv.start <= L.R_PLAZA + 1) {
        const P = L.dividerPoint(dv, L.R_PLAZA, dv.off);
        const n = this.node(`plaza:${dv.id}`, P.x, P.z, { name: 'Dam' });
        list.push({ r: L.R_PLAZA, n });
        this.plazaNodes = this.plazaNodes || [];
        this.plazaNodes.push(n);
      }
      if (dv.name === 'Damrak') list.push({ r: 362, n: this.node('station', 0, -362, { name: 'Centraal Station' }) });
      if (dv.passage) {
        const P = L.dividerPoint(dv, 850, 0);
        list.push({ r: 850, n: this.node('museumplein', P.x, P.z, { name: 'Museumplein' }) });
      }
      list.sort((p, q) => p.r - q.r);
      const lanes = radialLanes(dv);
      for (let i = 0; i + 1 < list.length; i++) {
        const p = list[i], q = list[i + 1];
        const off2 = dv.off * dv.off;
        const sa = Math.sqrt(Math.max(0, p.r * p.r - off2)), sb = Math.sqrt(Math.max(0, q.r * q.r - off2));
        this.edge(p.n, q.n, { kind: 'radial', dv, sa, sb, len: sb - sa, lanes, name: dv.name });
      }
    }
    // the Dam: connect plaza entrances through the centre
    const c = this.node('dam', 0, 0, { name: 'Dam' });
    for (const n of this.plazaNodes || []) {
      const len = Math.hypot(n.x, n.z);
      this.edge(c, n, { kind: 'line', ax: 0, az: 0, bx: n.x, bz: n.z, len, lanes: { bike: [1.2, -1.2], car: [1.5, -1.5], walk: [4, -4, 8, -8], road: [-3, 3] }, name: 'Dam', plaza: true });
    }
    this.mids = this.edges.map((e) => this.pointOn(e, e.len / 2, 0, true));
  }

  /** Point on edge at distance s from node a (forward) with absolute lateral `lat` (or relative for lines). */
  pointOn(e, s, lat, mid = false) {
    const t = e.len > 0 ? s / e.len : 0;
    if (e.kind === 'ring') {
      const th = e.ta + (e.tb - e.ta) * t;
      const r = mid ? e.rm : lat;
      return { x: r * Math.sin(th), z: r * Math.cos(th) };
    }
    if (e.kind === 'radial') {
      const sa = e.sa + (e.sb - e.sa) * t;
      return L.dividerPoint(e.dv, sa, mid ? e.dv.off : lat);
    }
    const dx = e.bx - e.ax, dz = e.bz - e.az, l = e.len || 1;
    const rx = -dz / l, rz = dx / l;
    const lx = mid ? 0 : lat;
    return { x: e.ax + dx * t + rx * lx, z: e.az + dz * t + rz * lx };
  }

  /** Lane lateral for an agent type travelling along e from node `from`. */
  lane(e, from, type, rand = Math.random) {
    const fwd = from === e.a; // travelling a -> b
    const ln = e.lanes;
    if (type === 'walk') {
      const w = ln.walk;
      return w.length ? w[Math.floor(rand() * w.length)] + (rand() - 0.5) * 0.8 : (fwd ? ln.bike[0] : ln.bike[1]);
    }
    const pair = type === 'car' ? ln.car : ln.bike;
    if (e.kind === 'line') return fwd ? Math.abs(pair[0]) : -Math.abs(pair[0]); // relative: right of travel
    return fwd ? pair[0] : pair[1];
  }

  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Nearest edge to (x,z): returns { edge, s (along from a), dist }. */
  nearestEdge(x, z) {
    let best = null;
    for (const e of this.edges) {
      const m = this.mids[e.id];
      if ((m.x - x) ** 2 + (m.z - z) ** 2 > (e.len / 2 + 40) ** 2) continue;
      const steps = Math.max(2, Math.ceil(e.len / 4));
      for (let i = 0; i <= steps; i++) {
        const s = (e.len * i) / steps;
        const p = this.pointOn(e, s, 0, true);
        const d = Math.hypot(p.x - x, p.z - z);
        if (!best || d < best.dist) best = { edge: e, s, dist: d };
      }
    }
    return best;
  }

  /** A* shortest route between nodes. Returns list of {edge, from, to}. */
  route(startNode, goalNode) {
    const open = new Map([[startNode.id, 0]]);
    const g = new Map([[startNode.id, 0]]);
    const came = new Map();
    const h = (n) => Math.hypot(n.x - goalNode.x, n.z - goalNode.z);
    const closed = new Set();
    while (open.size) {
      let cur = null, cf = Infinity;
      for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
      open.delete(cur);
      if (cur === goalNode.id) break;
      closed.add(cur);
      const n = this.nodes[cur];
      for (const e of n.edges) {
        const o = e.a === n ? e.b : e.a;
        if (closed.has(o.id)) continue;
        const ng = g.get(cur) + e.len;
        if (ng < (g.get(o.id) ?? Infinity)) {
          g.set(o.id, ng);
          came.set(o.id, { e, from: n });
          open.set(o.id, ng + h(o));
        }
      }
    }
    if (!came.has(goalNode.id) && startNode !== goalNode) return null;
    const path = [];
    let id = goalNode.id;
    while (id !== startNode.id) {
      const c = came.get(id);
      path.unshift({ edge: c.e, from: c.from, to: this.nodes[id] });
      id = c.from.id;
    }
    return path;
  }
}
