// Instanced low-poly people. Every limb of every person is one instance of a
// shared "bone" mesh, so a whole crowd costs a handful of draw calls.
import * as THREE from 'three';

export const SKIN = ['#f1c9a5', '#e0ac85', '#c68b62', '#8d5a3b', '#5c3a24', '#f4d3b8', '#d9a07a'];
export const HAIR = ['#2a1d14', '#4b3121', '#7a5230', '#c9a15a', '#e2c27f', '#1a1a1a', '#8c8c8c', '#a0522d', '#d8d8d8'];
export const JACKETS = ['#1f2a3a', '#2e2e2e', '#6b2737', '#2f4f3f', '#c4a35a', '#8a8f96', '#a33a2a', '#3c5a8a', '#e8e2d4', '#556b2f', '#d4824a', '#111111', '#7d5ba6', '#f2c14e'];
export const PANTS = ['#1d2433', '#2b2b2b', '#3a3f4a', '#4a3b2a', '#22314a', '#6b6b6b', '#c2b59b', '#111'];
export const SHOES = ['#151515', '#3a2a1e', '#eeeeee', '#5a3a28'];

const UP = new THREE.Vector3(0, 1, 0);

function limbGeometry() {
  // unit-length tapered cylinder along +y (from 0 to 1), radius 1
  const g = new THREE.CylinderGeometry(0.85, 1, 1, 7, 1, false);
  g.translate(0, 0.5, 0);
  return g;
}
function torsoGeometry() {
  // torso along +y from pelvis (0) to neck (1); local x = shoulder width, z = depth
  const g = new THREE.CylinderGeometry(1, 0.9, 1, 8, 2);
  g.translate(0, 0.5, 0);
  // flatten front-back
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const widen = y > 0.7 ? 1.08 : y < 0.2 ? 0.95 : 1;
    p.setX(i, p.getX(i) * widen);
    p.setZ(i, p.getZ(i) * 0.62);
  }
  g.computeVertexNormals();
  return g;
}

export class PeopleRenderer {
  constructor(scene, max = 300) {
    this.max = max;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const mk = (geo, n, cast = true) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.count = 0;
      m.castShadow = cast;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.limbs = mk(limbGeometry(), max * 8);
    this.torso = mk(torsoGeometry(), max);
    this.heads = mk(new THREE.SphereGeometry(1, 10, 8), max);
    const hairG = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    this.hair = mk(hairG, max);
    const footG = new THREE.BoxGeometry(1, 1, 1);
    footG.translate(0, 0.5, 0);
    this.feet = mk(footG, max * 2);
    this.hands = mk(new THREE.SphereGeometry(1, 6, 4), max * 2, false);
    this.props = mk(new THREE.BoxGeometry(1, 1, 1), max * 2);
    const umb = new THREE.ConeGeometry(1, 0.35, 10, 1, true);
    umb.translate(0, -0.175, 0);
    this.umbrellas = mk(umb, max, true);
    this.all = [this.limbs, this.torso, this.heads, this.hair, this.feet, this.hands, this.props, this.umbrellas];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
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
  _push(mesh, matrix, color) {
    const i = mesh.count;
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, this._c.set(color));
    mesh.count = i + 1;
  }
  limb(P, Q, r, color) {
    const d = this._v.subVectors(Q, P);
    const len = d.length();
    if (len < 1e-4) return;
    this._q.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
    this._m.compose(P, this._q, this._s.set(r, len, r));
    this._push(this.limbs, this._m, color);
  }
  /** Torso from pelvis P to neck Q, facing direction f (unit, horizontal-ish). */
  torsoAt(P, Q, f, w, color) {
    const y = this._v.subVectors(Q, P);
    const len = y.length();
    y.normalize();
    const x = new THREE.Vector3().crossVectors(y, f).normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    this._m.makeBasis(x, y, z).scale(this._s.set(w, len, w)).setPosition(P);
    this._push(this.torso, this._m, color);
  }
  sphere(mesh, C, r, color, yaw = 0, sy = 1) {
    this._q.setFromAxisAngle(UP, yaw);
    this._m.compose(C, this._q, this._s.set(r, r * sy, r));
    this._push(mesh, this._m, color);
  }
  box(mesh, C, yaw, sx, sy, sz, color, pitch = 0) {
    this._q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    this._m.compose(C, this._q, this._s.set(sx, sy, sz));
    this._push(mesh, this._m, color);
  }

  /**
   * Draw a full person from world-space joints.
   * j: { pelvis, neck, head, hipL, hipR, kneeL, kneeR, ankleL, ankleR, shL, shR, elL, elR, haL, haR, fwd (Vector3), yaw }
   * look: { skin, hair, jacket, pants, shoes, hairLen, build, hideHead, umbrella, bag }
   */
  person(j, look) {
    const b = look.build || 1;
    if (!look.hideTorso) this.torsoAt(j.pelvis, j.neck, j.fwd, 0.17 * b, look.jacket);
    if (!look.hideHead) {
      this.sphere(this.heads, j.head, 0.105, look.skin, j.yaw, 1.15);
      const hc = j.head.clone();
      hc.y += 0.025;
      this.sphere(this.hair, hc, 0.112 * (look.hairLen || 1), look.hair, j.yaw, 1.1);
      // neck
      this.limb(j.neck, j.head, 0.045, look.skin);
    }
    this.limb(j.hipL, j.kneeL, 0.075 * b, look.pants);
    this.limb(j.kneeL, j.ankleL, 0.058 * b, look.pants);
    this.limb(j.hipR, j.kneeR, 0.075 * b, look.pants);
    this.limb(j.kneeR, j.ankleR, 0.058 * b, look.pants);
    if (!look.hideArms) {
      this.limb(j.shL, j.elL, 0.055 * b, look.jacket);
      this.limb(j.elL, j.haL, 0.047 * b, look.jacket);
      this.limb(j.shR, j.elR, 0.055 * b, look.jacket);
      this.limb(j.elR, j.haR, 0.047 * b, look.jacket);
      this.sphere(this.hands, j.haL, 0.045, look.skin);
      this.sphere(this.hands, j.haR, 0.045, look.skin);
    }
    // shoes
    for (const a of [j.ankleL, j.ankleR]) {
      const c = a.clone();
      c.y -= 0.07;
      c.addScaledVector(j.footFwd || j.fwd, 0.05);
      this.box(this.feet, c, j.footYaw ?? j.yaw, 0.1, 0.08, 0.26, look.shoes, j.footPitch || 0);
    }
    if (look.bag) {
      const c = j.neck.clone().lerp(j.pelvis, 0.45).addScaledVector(j.fwd, -0.15);
      this.box(this.props, c, j.yaw, 0.3, 0.38, 0.14, look.bag);
    }
    if (look.umbrella) {
      const top = j.haR.clone();
      top.y += 0.95;
      this.limb(j.haR, top, 0.012, '#222');
      this.sphere(this.umbrellas, top.setY(top.y + 0.18), 0.55, look.umbrella);
    }
    if (look.phone) {
      const c = j.haR.clone();
      this.box(this.props, c, j.yaw, 0.08, 0.15, 0.015, '#111', -0.3);
    }
  }
}

// ---------------------------------------------------------------------------
// Pose helpers (all in world space)
// ---------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** Two-bone IK: returns the middle joint for root R, target T, lengths a,b, pole direction. */
export function solveIK(R, T, a, b, pole, out) {
  const d = _a.subVectors(T, R);
  let dist = d.length();
  const maxD = a + b - 1e-3, minD = Math.abs(a - b) + 1e-3;
  const dn = d.clone().normalize();
  if (dist > maxD) dist = maxD;
  if (dist < minD) dist = minD;
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  // pole orthogonal to the bone line
  const p = _b.copy(pole).addScaledVector(dn, -pole.dot(dn));
  if (p.lengthSq() < 1e-8) p.set(0, 1, 0);
  p.normalize();
  return out.copy(R).addScaledVector(dn, x).addScaledVector(p, h);
}

export function randomLook(rand, opts = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length) % a.length];
  return {
    skin: pick(SKIN),
    hair: pick(HAIR),
    jacket: opts.jacket || pick(JACKETS),
    pants: pick(PANTS),
    shoes: pick(SHOES),
    hairLen: rand() < 0.45 ? 1.25 : 1,
    build: 0.92 + rand() * 0.18,
    height: 0.93 + rand() * 0.14,
    bag: rand() < 0.25 ? pick(['#222', '#5a3a28', '#2f4f3f', '#7a2a2a']) : null,
  };
}
export { _c as _tmp };
