// A Dutch city bike ("omafiets"): step-through frame, closed chain case,
// swept-back handlebar, front crate, mudguards and a bell.
// Local frame: origin on the ground halfway between the wheels, forward = -Z.
import * as THREE from 'three';

export const BIKE = {
  wheelR: 0.355,
  wheelbase: 1.12,
  bb: new THREE.Vector3(0, 0.29, 0.03),
  frontAxle: new THREE.Vector3(0, 0.355, -0.56),
  rearAxle: new THREE.Vector3(0, 0.355, 0.56),
  headTop: new THREE.Vector3(0, 0.98, -0.4),
  headBottom: new THREE.Vector3(0, 0.72, -0.47),
  saddle: new THREE.Vector3(0, 1.0, 0.22),
  crank: 0.17,
  gripL: new THREE.Vector3(-0.27, 1.06, -0.2),
  gripR: new THREE.Vector3(0.27, 1.06, -0.2),
};
// steering axis direction (bottom -> top)
export const STEER_AXIS = new THREE.Vector3().subVectors(BIKE.headTop, BIKE.headBottom).normalize();

export const FRAME_COLORS = ['#141414', '#141414', '#141414', '#1d2533', '#1f3326', '#e9e6dd', '#7d1f1f', '#8fbfb0', '#4a4a4f', '#2b2d42', '#6b4c3b'];

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function tube(points, r, segs = 8, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, segs, r, radial, false);
}
function rod(a, b, r, radial = 5) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const I = () => new THREE.Matrix4();

/**
 * Returns { frame, steer, frontWheel, rearWheel, cranks } where each is a
 * list of { geo, m (Matrix4), color } in the bike's local frame. The steer
 * assembly and wheels are given relative to their own pivots:
 *   steer pivot = BIKE.headBottom, wheel pivots = axles, cranks pivot = bb.
 */
export function bikeParts({ color = '#141414', detail = 1, crate = true, crateColor = null, rack = true, childSeat = false } = {}) {
  const frame = [], steer = [], frontWheel = [], rearWheel = [], cranks = [];
  const black = '#111111', chrome = '#b9bcc0', tire = '#1a1a1a', brown = '#4a3221';
  const R = BIKE.wheelR;
  const tubeR = 0.017;
  const tSeg = detail > 0 ? 10 : 4, rSeg = detail > 0 ? 6 : 4;

  // --- wheels (pivot at axle; wheel plane = YZ)
  const wheel = (list) => {
    const tireG = new THREE.TorusGeometry(R - 0.022, 0.024, detail > 0 ? 6 : 4, detail > 0 ? 28 : 12);
    tireG.rotateY(Math.PI / 2);
    list.push({ geo: tireG, m: I(), color: tire });
    if (detail > 0) {
      const rim = new THREE.TorusGeometry(R - 0.05, 0.01, 4, 28);
      rim.rotateY(Math.PI / 2);
      list.push({ geo: rim, m: I(), color: chrome });
      const n = detail > 1 ? 28 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const side = i % 2 ? 0.025 : -0.025;
        const sp = rod(v3(side, 0, 0), v3(0, Math.cos(a) * (R - 0.055), Math.sin(a) * (R - 0.055)), 0.0028, 3);
        list.push({ geo: sp, m: I(), color: chrome });
      }
      const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.09, 10);
      hub.rotateZ(Math.PI / 2);
      list.push({ geo: hub, m: I(), color: chrome });
    }
  };
  wheel(frontWheel);
  wheel(rearWheel);

  const F = (geo, c = color) => frame.push({ geo, m: I(), color: c });
  // --- frame: double curved step-through tubes
  F(tube([v3(0, 0.93, -0.42), v3(0, 0.78, -0.33), v3(0, 0.5, -0.16), v3(0, 0.36, -0.02), BIKE.bb], tubeR, tSeg, rSeg));
  F(tube([v3(0, 0.8, -0.45), v3(0, 0.62, -0.36), v3(0, 0.4, -0.18), v3(0, 0.32, -0.04), BIKE.bb], tubeR * 0.9, tSeg, rSeg));
  // head tube
  F(rod(BIKE.headBottom, BIKE.headTop, 0.022, rSeg));
  // seat tube & seatpost
  F(rod(BIKE.bb, v3(0, 0.9, 0.18), tubeR, rSeg));
  F(rod(v3(0, 0.9, 0.18), v3(0, 0.98, 0.205), 0.012, 4), chrome);
  // stays
  for (const x of [-0.055, 0.055]) {
    F(rod(v3(x * 0.5, BIKE.bb.y, BIKE.bb.z), v3(x, BIKE.rearAxle.y, BIKE.rearAxle.z), 0.011, 4));
    F(rod(v3(x * 0.3, 0.86, 0.18), v3(x, BIKE.rearAxle.y, BIKE.rearAxle.z), 0.011, 4));
  }
  // closed chain case (right side)
  {
    const g = new THREE.BoxGeometry(0.05, 0.16, 0.62);
    const mid = new THREE.Vector3().addVectors(BIKE.bb, BIKE.rearAxle).multiplyScalar(0.5);
    const ang = Math.atan2(BIKE.rearAxle.y - BIKE.bb.y, BIKE.rearAxle.z - BIKE.bb.z);
    g.rotateX(-ang);
    g.translate(0.075, mid.y, mid.z);
    F(g, '#0c0c0c');
    const disc = new THREE.CylinderGeometry(0.11, 0.11, 0.05, detail > 0 ? 14 : 8);
    disc.rotateZ(Math.PI / 2);
    disc.translate(0.075, BIKE.bb.y, BIKE.bb.z);
    F(disc, '#0c0c0c');
  }
  // rear mudguard & rack
  {
    const g = new THREE.TorusGeometry(R + 0.035, 0.022, 3, detail > 0 ? 14 : 7, Math.PI * 0.95);
    g.rotateY(Math.PI / 2);
    g.rotateX(-0.05);
    g.translate(0, BIKE.rearAxle.y, BIKE.rearAxle.z);
    F(g, color);
    if (rack) {
      const top = new THREE.BoxGeometry(0.15, 0.018, 0.5);
      top.translate(0, 0.79, 0.52);
      F(top, black);
      for (const x of [-0.07, 0.07]) F(rod(v3(x, 0.78, 0.72), v3(x * 0.8, BIKE.rearAxle.y, BIKE.rearAxle.z), 0.008, 3), black);
    }
    // rear light + reflector
    const rl = new THREE.BoxGeometry(0.06, 0.04, 0.03);
    rl.translate(0, 0.76, 0.78);
    F(rl, '#b0151b');
  }
  if (childSeat) {
    const seat = new THREE.BoxGeometry(0.3, 0.3, 0.32);
    seat.translate(0, 0.98, 0.55);
    F(seat, '#2d2d2d');
  }
  // saddle (sprung leather style)
  {
    const g = new THREE.BoxGeometry(0.17, 0.055, 0.25);
    g.translate(BIKE.saddle.x, BIKE.saddle.y, BIKE.saddle.z);
    F(g, brown);
    for (const x of [-0.05, 0.05]) {
      const sp = new THREE.CylinderGeometry(0.018, 0.018, 0.05, 5);
      sp.translate(x, BIKE.saddle.y - 0.05, BIKE.saddle.z + 0.08);
      F(sp, chrome);
    }
  }
  // kickstand (folded)
  F(rod(v3(0.06, 0.33, 0.25), v3(0.08, 0.12, 0.45), 0.008, 3), chrome);

  // --- steering assembly, relative to headBottom pivot
  const hb = BIKE.headBottom;
  const S = (geo, c = color) => steer.push({ geo, m: at(-hb.x, -hb.y, -hb.z), color: c });
  // fork blades
  for (const x of [-0.045, 0.045]) {
    S(tube([v3(x * 0.5, hb.y, hb.z), v3(x, 0.55, -0.52), v3(x, BIKE.frontAxle.y, BIKE.frontAxle.z)], 0.012, 5, 4));
  }
  // front mudguard
  {
    const g = new THREE.TorusGeometry(R + 0.035, 0.022, 3, detail > 0 ? 14 : 7, Math.PI * 0.85);
    g.rotateY(Math.PI / 2);
    g.rotateX(Math.PI * 0.62);
    g.translate(0, BIKE.frontAxle.y, BIKE.frontAxle.z);
    S(g, color);
  }
  // stem + swept-back handlebar
  S(rod(BIKE.headTop, v3(0, 1.07, -0.43), 0.014, 5), chrome);
  const bar = [v3(-0.29, 1.05, -0.19), v3(-0.24, 1.06, -0.3), v3(-0.12, 1.07, -0.42), v3(0, 1.07, -0.44), v3(0.12, 1.07, -0.42), v3(0.24, 1.06, -0.3), v3(0.29, 1.05, -0.19)];
  S(tube(bar, 0.011, detail > 0 ? 20 : 8, rSeg), chrome);
  for (const g of [BIKE.gripL, BIKE.gripR]) {
    const grip = rod(v3(g.x * 1.07, g.y - 0.005, g.z + 0.03), v3(g.x * 0.8, g.y + 0.005, g.z - 0.06), 0.017, 6);
    S(grip, '#2b1d14');
  }
  // bell on the left
  {
    const bell = new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    bell.translate(-0.17, 1.085, -0.39);
    S(bell, chrome);
  }
  // brake levers
  for (const s of [-1, 1]) S(rod(v3(0.2 * s, 1.07, -0.33), v3(0.25 * s, 1.03, -0.24), 0.006, 3), chrome);
  // headlight
  {
    const lamp = new THREE.CylinderGeometry(0.035, 0.03, 0.07, 10);
    lamp.rotateX(Math.PI / 2);
    lamp.translate(0, 0.8, -0.56);
    S(lamp, black);
    const lens = new THREE.CircleGeometry(0.03, 10);
    lens.rotateY(Math.PI);
    lens.translate(0, 0.8, -0.596);
    S(lens, '#fff7d6');
  }
  // front crate on a carrier
  if (crate) {
    const c = crateColor || (Math.random() < 0.5 ? '#2a2a2a' : '#8a5a33');
    const W = 0.4, D = 0.32, Hc = 0.24, y0 = 0.86, z0 = -0.74;
    const wall = (sx, sy, sz, x, y, z) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(x, y, z);
      S(g, c);
    };
    wall(W, 0.02, D, 0, y0, z0);
    wall(W, Hc, 0.02, 0, y0 + Hc / 2, z0 - D / 2);
    wall(W, Hc, 0.02, 0, y0 + Hc / 2, z0 + D / 2);
    wall(0.02, Hc, D, -W / 2, y0 + Hc / 2, z0);
    wall(0.02, Hc, D, W / 2, y0 + Hc / 2, z0);
    S(rod(v3(0, 0.62, -0.54), v3(0, y0, z0 + 0.1), 0.01, 3), black);
  }

  // --- cranks & pedals, pivot at BB
  for (const s of [-1, 1]) {
    const x = 0.11 * s;
    const arm = new THREE.BoxGeometry(0.02, BIKE.crank, 0.03);
    arm.translate(x, s > 0 ? -BIKE.crank / 2 : BIKE.crank / 2, 0);
    cranks.push({ geo: arm, m: I(), color: '#2a2a2a' });
    const pedal = new THREE.BoxGeometry(0.1, 0.025, 0.065);
    pedal.translate(x + 0.06 * s, s > 0 ? -BIKE.crank : BIKE.crank, 0);
    cranks.push({ geo: pedal, m: I(), color: '#222' });
  }
  return { frame, steer, frontWheel, rearWheel, cranks };
}

/** Very low-poly parked bike (~250 triangles) for the thousands of parked bikes. */
export function simpleBikeParts({ color = '#141414', crate = false, crateColor = '#2a2a2a' } = {}) {
  const parts = [];
  const add = (geo, c) => parts.push({ geo, m: I(), color: c });
  const R = BIKE.wheelR;
  for (const z of [BIKE.frontAxle.z, BIKE.rearAxle.z]) {
    const t = new THREE.TorusGeometry(R - 0.02, 0.026, 3, 12);
    t.rotateY(Math.PI / 2);
    t.translate(0, R, z);
    add(t, '#151515');
  }
  add(rod(v3(0, 0.92, -0.42), v3(0, 0.36, -0.06), 0.02, 4), color);
  add(rod(v3(0, 0.36, -0.06), BIKE.bb, 0.02, 4), color);
  add(rod(BIKE.bb, v3(0, 0.95, 0.19), 0.018, 4), color);
  add(rod(BIKE.headBottom, BIKE.frontAxle, 0.014, 4), color);
  add(rod(BIKE.headBottom, BIKE.headTop, 0.022, 4), color);
  add(rod(v3(0, 0.88, 0.17), BIKE.rearAxle, 0.012, 3), color);
  {
    const g = new THREE.BoxGeometry(0.05, 0.15, 0.6);
    g.rotateX(-Math.atan2(BIKE.rearAxle.y - BIKE.bb.y, BIKE.rearAxle.z - BIKE.bb.z));
    g.translate(0.07, (BIKE.bb.y + BIKE.rearAxle.y) / 2, (BIKE.bb.z + BIKE.rearAxle.z) / 2);
    add(g, '#0c0c0c');
  }
  add(rod(BIKE.headTop, v3(0, 1.07, -0.43), 0.013, 3), '#9a9da0');
  add(rod(v3(-0.29, 1.05, -0.2), v3(0, 1.07, -0.44), 0.012, 3), '#9a9da0');
  add(rod(v3(0.29, 1.05, -0.2), v3(0, 1.07, -0.44), 0.012, 3), '#9a9da0');
  const saddle = new THREE.BoxGeometry(0.16, 0.06, 0.25);
  saddle.translate(0, 1.0, 0.22);
  add(saddle, '#3b2a1c');
  const rack = new THREE.BoxGeometry(0.15, 0.02, 0.48);
  rack.translate(0, 0.79, 0.52);
  add(rack, '#151515');
  if (crate) {
    const c = new THREE.BoxGeometry(0.4, 0.24, 0.32);
    c.translate(0, 0.98, -0.74);
    add(c, crateColor);
  }
  return parts;
}

/** Merge a parts list into one BufferGeometry with vertex colours. */
export function mergeParts(parts, extraMatrix = null) {
  const pos = [], nor = [], col = [], idx = [];
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const p of parts) {
    const m = extraMatrix ? new THREE.Matrix4().multiplyMatrices(extraMatrix, p.m) : p.m;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const g = p.geo.index ? p.geo : p.geo;
    const P = g.attributes.position, N = g.attributes.normal;
    const base = pos.length / 3;
    c.set(p.color);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      col.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

const bikeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 });
export function bikeMaterial() {
  return bikeMat;
}

/**
 * Animated bike object: group with steering, wheels and cranks.
 * set(steer, wheelAngle, crankAngle)
 */
export class BikeObject {
  constructor(opts = {}) {
    const parts = bikeParts(opts);
    const mat = opts.material || bikeMat;
    this.group = new THREE.Group();
    const mk = (list) => {
      const mesh = new THREE.Mesh(mergeParts(list), mat);
      mesh.castShadow = true;
      return mesh;
    };
    this.frame = mk(parts.frame);
    this.group.add(this.frame);
    this.steerPivot = new THREE.Group();
    this.steerPivot.position.copy(BIKE.headBottom);
    this.group.add(this.steerPivot);
    this.steerMesh = mk(parts.steer);
    this.steerPivot.add(this.steerMesh);
    this.frontWheel = mk(parts.frontWheel);
    // front wheel hangs from the steering pivot
    this.frontWheelPivot = new THREE.Group();
    this.frontWheelPivot.position.copy(BIKE.frontAxle).sub(BIKE.headBottom);
    this.steerPivot.add(this.frontWheelPivot);
    this.frontWheelPivot.add(this.frontWheel);
    this.rearWheel = mk(parts.rearWheel);
    this.rearWheel.position.copy(BIKE.rearAxle);
    this.group.add(this.rearWheel);
    this.cranks = mk(parts.cranks);
    this.cranks.position.copy(BIKE.bb);
    this.group.add(this.cranks);
    this._q = new THREE.Quaternion();
  }
  set(steer, wheelAngle, crankAngle) {
    this._q.setFromAxisAngle(STEER_AXIS, steer);
    this.steerPivot.quaternion.copy(this._q);
    this.frontWheel.rotation.x = -wheelAngle;
    this.rearWheel.rotation.x = -wheelAngle;
    this.cranks.rotation.x = -crankAngle;
  }
  /** World-space-free pedal positions in bike local frame for a crank angle. */
  static pedalPos(crankAngle, side) {
    // side +1 right pedal, -1 left; right crank points down at angle 0
    const a = crankAngle + (side > 0 ? 0 : Math.PI);
    return new THREE.Vector3(0.17 * side, BIKE.bb.y - Math.cos(a) * BIKE.crank, BIKE.bb.z + Math.sin(a) * BIKE.crank);
  }
}

/**
 * Instanced bikes for AI riders: all bikes in a few draw calls.
 * Frame-coloured parts get a per-instance colour.
 */
export class BikeFleet {
  constructor(scene, max = 80) {
    const white = '#ffffff';
    const parts = bikeParts({ color: white, detail: 1, crate: false, rack: true });
    const partsCrate = bikeParts({ color: white, detail: 1, crate: true, crateColor: '#2a2a2a', rack: true });
    const split = (list) => [list.filter((p) => p.color === white), list.filter((p) => p.color !== white)];
    const [frameC, frameP] = split(parts.frame);
    const [steerC, steerP] = split(parts.steer);
    const [, steerPCrate] = split(partsCrate.steer);
    const matC = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 });
    const matP = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
    const mk = (list, mat, n, colored) => {
      const m = new THREE.InstancedMesh(mergeParts(list), mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (colored) m.setColorAt(0, new THREE.Color());
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.frameC = mk(frameC, matC, max, true);
    this.frameP = mk(frameP, matP, max);
    this.steerC = mk(steerC, matC, max, true);
    this.steerP = mk(steerP, matP, max);
    this.steerPCrate = mk(steerPCrate, matP, max);
    this.wheels = mk(parts.frontWheel, matP, max * 2);
    this.cranks = mk(parts.cranks, matP, max);
    this.all = [this.frameC, this.frameP, this.steerC, this.steerP, this.steerPCrate, this.wheels, this.cranks];
    this._m = new THREE.Matrix4();
    this._t = new THREE.Matrix4();
    this._r = new THREE.Matrix4();
    this._c = new THREE.Color();
  }
  begin() {
    for (const m of this.all) m.count = 0;
  }
  end() {
    for (const m of this.all) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  _push(mesh, mtx, color) {
    const i = mesh.count;
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, mtx);
    if (color && mesh.instanceColor) mesh.setColorAt(i, this._c.set(color));
    mesh.count = i + 1;
  }
  /** root: Matrix4 of the bike (ground origin). */
  add(root, steer, wheelAngle, crankAngle, color, crate) {
    this._push(this.frameC, root, color);
    this._push(this.frameP, root);
    // steering
    const sm = this._m.copy(root).multiply(this._t.makeTranslation(BIKE.headBottom.x, BIKE.headBottom.y, BIKE.headBottom.z)).multiply(this._r.makeRotationAxis(STEER_AXIS, steer));
    this._push(this.steerC, sm, color);
    this._push(crate ? this.steerPCrate : this.steerP, sm);
    const fa = BIKE.frontAxle, hb = BIKE.headBottom;
    const fw = sm.clone().multiply(this._t.makeTranslation(fa.x - hb.x, fa.y - hb.y, fa.z - hb.z)).multiply(this._r.makeRotationX(-wheelAngle));
    this._push(this.wheels, fw);
    const rw = this._m.copy(root).multiply(this._t.makeTranslation(BIKE.rearAxle.x, BIKE.rearAxle.y, BIKE.rearAxle.z)).multiply(this._r.makeRotationX(-wheelAngle));
    this._push(this.wheels, rw);
    const cr = this._m.copy(root).multiply(this._t.makeTranslation(BIKE.bb.x, BIKE.bb.y, BIKE.bb.z)).multiply(this._r.makeRotationX(-crankAngle));
    this._push(this.cranks, cr);
  }
}
