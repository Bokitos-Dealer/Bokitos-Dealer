// Poses for cyclists (feet on the pedals, hands on the grips) and walkers.
import * as THREE from 'three';
import { BIKE, STEER_AXIS, BikeObject } from './bike.js';
import { solveIK } from './people.js';

const V = () => new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const POLE_KNEE = new THREE.Vector3(0, 0.25, -1);
const POLE_ELBOW_L = new THREE.Vector3(-1, -0.6, 0.8);
const POLE_ELBOW_R = new THREE.Vector3(1, -0.6, 0.8);

function newJoints() {
  return {
    pelvis: V(), neck: V(), head: V(), hipL: V(), hipR: V(), kneeL: V(), kneeR: V(), ankleL: V(), ankleR: V(),
    shL: V(), shR: V(), elL: V(), elR: V(), haL: V(), haR: V(), fwd: V(), footFwd: V(), yaw: 0, footYaw: 0,
  };
}

/**
 * Cyclist joints in world space.
 * root: Matrix4 of the bike; opts: { stand (0..1), footDown (0..1), signal (-1 left, 1 right, 0), height, headYaw }
 */
export function riderJoints(root, steer, crank, opts = {}, j = newJoints()) {
  const h = opts.height || 1;
  const stand = opts.stand || 0;
  const L1 = 0.44 * h, L2 = 0.45 * h, UA = 0.29 * h, FA = 0.3 * h;
  // local positions
  const pelvis = new THREE.Vector3(0, 1.04 + stand * 0.22, 0.21 - stand * 0.17);
  const neck = pelvis.clone().add(new THREE.Vector3(0, 0.5 * h, -0.07 - stand * 0.16));
  const head = neck.clone().add(new THREE.Vector3(0, 0.155 * h, -0.025));
  const hipL = pelvis.clone().add(new THREE.Vector3(-0.095, -0.03, 0));
  const hipR = pelvis.clone().add(new THREE.Vector3(0.095, -0.03, 0));
  const shL = neck.clone().add(new THREE.Vector3(-0.18, -0.05, 0.02));
  const shR = neck.clone().add(new THREE.Vector3(0.18, -0.05, 0.02));
  // grips rotate with the steering
  tmpQ.setFromAxisAngle(STEER_AXIS, steer);
  const lift = opts.viewLift || 0, push = opts.viewPush || 0;
  const grip = (g) => g.clone().sub(BIKE.headBottom).applyQuaternion(tmpQ).add(BIKE.headBottom).add(new THREE.Vector3(0, lift, -push));
  let haL = grip(BIKE.gripL), haR = grip(BIKE.gripR);
  haL.y += 0.02; haR.y += 0.02;
  if (opts.signal === -1) haL = shL.clone().add(new THREE.Vector3(-0.6, -0.08, -0.05));
  if (opts.signal === 1) haR = shR.clone().add(new THREE.Vector3(0.6, -0.08, -0.05));
  if (opts.wave) haR = shR.clone().add(new THREE.Vector3(0.25, 0.45, -0.1));
  // feet on pedals
  const pl = BikeObject.pedalPos(crank, -1).add(new THREE.Vector3(0.0, 0.06, 0.02));
  const pr = BikeObject.pedalPos(crank, 1).add(new THREE.Vector3(0.0, 0.06, 0.02));
  if (opts.footDown) {
    const t = opts.footDown;
    pl.lerp(new THREE.Vector3(-0.34, 0.08 - 0.0, 0.0), t);
    pr.lerp(new THREE.Vector3(0.17, 0.3, -0.05), t * 0.5);
    pelvis.y -= 0.0;
  }
  // world transform
  const W = (v) => v.applyMatrix4(root);
  j.pelvis.copy(W(pelvis));
  j.neck.copy(W(neck));
  j.head.copy(W(head));
  j.hipL.copy(W(hipL));
  j.hipR.copy(W(hipR));
  j.shL.copy(W(shL));
  j.shR.copy(W(shR));
  j.haL.copy(W(haL));
  j.haR.copy(W(haR));
  j.ankleL.copy(W(pl));
  j.ankleR.copy(W(pr));
  const fwd = new THREE.Vector3(0, 0, -1).transformDirection(root);
  j.fwd.copy(fwd);
  j.footFwd.copy(fwd);
  j.yaw = Math.atan2(-fwd.x, -fwd.z);
  j.footYaw = j.yaw;
  const pole = POLE_KNEE.clone().transformDirection(root);
  solveIK(j.hipL, j.ankleL, L1, L2, pole, j.kneeL);
  solveIK(j.hipR, j.ankleR, L1, L2, pole, j.kneeR);
  solveIK(j.shL, j.haL, UA, FA, POLE_ELBOW_L.clone().transformDirection(root), j.elL);
  solveIK(j.shR, j.haR, UA, FA, POLE_ELBOW_R.clone().transformDirection(root), j.elR);
  return j;
}

/**
 * Walking person joints in world space.
 * p: {x, y, z, yaw, phase, speed (m/s), height, pose: 'walk'|'stand'|'photo'|'phone'}
 */
export function walkerJoints(p, j = newJoints()) {
  const h = p.height || 1;
  const s = Math.min(1, (p.speed || 0) / 1.4);
  const ph = p.phase || 0;
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  // local -> world (local forward -z)
  const W = (out, x, y, z) => out.set(p.x + x * cy + z * sy, p.y + y, p.z - x * sy + z * cy);
  const bob = Math.abs(Math.sin(ph)) * 0.03 * s;
  const pelvisY = 0.93 * h + bob;
  W(j.pelvis, 0, pelvisY, 0);
  W(j.neck, 0, pelvisY + 0.52 * h, -0.02);
  W(j.head, 0, pelvisY + 0.68 * h, -0.03);
  const L = 0.45 * h;
  for (const side of [-1, 1]) {
    const a = Math.sin(ph + (side > 0 ? Math.PI : 0)) * 0.42 * s;
    const bend = Math.max(0, Math.sin(ph + (side > 0 ? Math.PI : 0) + 1.6)) * 0.7 * s;
    const hx = side * 0.09;
    const hip = side < 0 ? j.hipL : j.hipR;
    const knee = side < 0 ? j.kneeL : j.kneeR;
    const ankle = side < 0 ? j.ankleL : j.ankleR;
    W(hip, hx, pelvisY - 0.03, 0);
    const ky = pelvisY - 0.03 - Math.cos(a) * L, kz = -Math.sin(a) * L;
    W(knee, hx, ky, kz);
    const b = a - bend;
    W(ankle, hx, Math.max(0.07, ky - Math.cos(b) * L), kz - Math.sin(b) * L);
    // arms swing opposite
    const sh = side < 0 ? j.shL : j.shR;
    const el = side < 0 ? j.elL : j.elR;
    const ha = side < 0 ? j.haL : j.haR;
    W(sh, side * 0.18, pelvisY + 0.47 * h, -0.0);
    const aa = -a * 0.8;
    if (p.pose === 'photo' || (p.pose === 'phone' && side > 0)) {
      W(el, side * 0.16, pelvisY + 0.38 * h, -0.22);
      W(ha, side * 0.05, pelvisY + 0.5 * h, -0.4);
    } else if (p.umbrella && side > 0) {
      W(el, side * 0.24, pelvisY + 0.25 * h, -0.12);
      W(ha, side * 0.12, pelvisY + 0.42 * h, -0.28);
    } else {
      W(el, side * 0.22, pelvisY + 0.47 * h - Math.cos(aa) * 0.29, -Math.sin(aa) * 0.29);
      W(ha, side * 0.23, pelvisY + 0.47 * h - Math.cos(aa) * 0.29 - Math.cos(aa * 1.3) * 0.28, -Math.sin(aa) * 0.29 - Math.sin(aa * 1.3) * 0.28 - 0.04);
    }
  }
  j.fwd.set(-sy, 0, -cy);
  j.footFwd.copy(j.fwd);
  j.yaw = p.yaw;
  j.footYaw = p.yaw;
  return j;
}

export { newJoints };
