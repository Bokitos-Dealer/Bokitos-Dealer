// The player's bike: physics, collisions and the camera rig.
import * as THREE from 'three';
import * as L from '../city/layout.js';
import { clamp, damp, lerp, noise1, wrapAngle } from '../util/math.js';
import { BikeObject, BIKE } from '../models/bike.js';
const BIKE_HB = BIKE.headBottom;
import { riderJoints } from '../models/rider.js';

export const GEARS = [3.2, 4.3, 5.8]; // metres travelled per crank revolution (3-speed hub)
const MASS = 96; // rider + heavy Dutch bike
const G = 9.81;
const WHEELBASE = 1.12;
const CRR = { asphalt: 0.0055, bike: 0.005, klinker: 0.0095, tiles: 0.008, strip: 0.013, granite: 0.008, plaza: 0.009, grass: 0.03 };
const ROUGH = { asphalt: 0.15, bike: 0.12, klinker: 0.55, tiles: 0.35, strip: 0.75, granite: 0.3, plaza: 0.45, grass: 0.6 };

/** Tram rail lines as simple analytic shapes (for the "wheel stuck in the rail" hazard). */
function railDistances(x, z) {
  const out = [];
  for (const dv of L.STREET_DIVIDERS) {
    if (!dv.tram) continue;
    const d = L.perpDist(dv, x, z);
    const s = L.alongDist(dv, x, z);
    if (s < dv.start - 1 || s > dv.end + 1) continue;
    for (const tc of dv.tram)
      for (const off of [-0.7175, 0.7175]) {
        const dd = d - (dv.off + tc + off);
        if (Math.abs(dd) < 1.2) out.push({ id: `${dv.id}:${tc}:${off}`, d: dd, tx: Math.sin(dv.th), tz: Math.cos(dv.th) });
      }
  }
  const r = Math.hypot(x, z), th = Math.atan2(x, z);
  for (const b of L.BANDS) {
    if (!b.tram || r < b.r0 - 2 || r > b.r1 + 2 || L.inWedge(th)) continue;
    for (const rc of b.tram)
      for (const off of [-0.7175, 0.7175]) {
        const dd = r - (rc + off);
        if (Math.abs(dd) < 1.2) out.push({ id: `b${b.id}:${rc}:${off}`, d: dd, tx: Math.cos(th), tz: -Math.sin(th) });
      }
  }
  if (Math.abs(z) < 56 && r < L.R_PLAZA + 1) {
    for (const sgn of [-1, 1])
      for (const off of [-0.7175, 0.7175]) {
        const t = clamp((z + 30) / 60, 0, 1);
        const xr = sgn * (2.5 + (2.2 - 2.5) * t) + off;
        const dd = x - xr;
        if (Math.abs(dd) < 1.2) out.push({ id: `dam:${sgn}:${off}`, d: dd, tx: 0, tz: 1 });
      }
  }
  return out;
}

export class Player {
  constructor(scene, colliders, bus) {
    this.scene = scene;
    this.col = colliders;
    this.bus = bus;
    this.bike = new BikeObject({ color: '#141414', detail: 2, crate: false });
    scene.add(this.bike.group);
    this.root = this.bike.group;
    // headlight
    this.headlight = new THREE.SpotLight(0xfff1d0, 0, 50, 0.45, 0.6, 1.2);
    this.headlight.position.set(0, 0.8, -0.6);
    this.headlight.target.position.set(0, 0.2, -12);
    this.bike.steerPivot.add(this.headlight);
    this.bike.steerPivot.add(this.headlight.target);
    this.headlight.castShadow = false;
    // rear light glow
    this.reset({ x: 0, z: -330, yaw: Math.PI });
    this.look = { yaw: 0, pitch: 0, lastMove: 0 };
    this.viewMode = 'fp';
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.jolt = 0;
    this.joints = null;
    this.stats = { distance: 0, topSpeed: 0, crashes: 0, splashes: 0, bridges: 0, time: 0 };
    this.lastBridge = null;
  }

  reset({ x, z, yaw }) {
    this.x = x;
    this.z = z;
    this.y = L.heightAt(x, z);
    this.yaw = yaw;
    this.v = 0;
    this.steer = 0;
    this.lean = 0;
    this.wheelAngle = 0;
    this.crank = 0;
    this.gear = 1;
    this.cadence = 0;
    this.stamina = 1;
    this.light = false;
    this.signal = 0;
    this.signalTime = 0;
    this.stand = 0;
    this.footDown = 1;
    this.state = 'ride'; // ride | crash | splash
    this.stateTime = 0;
    this.safe = [];
    this.safeTimer = 0;
    this.surface = L.surfaceAt(x, z);
    this.prevRails = new Map();
    this.power = 0;
    this.reverse = 0;
    this.brakeHeld = 0;
    this.yawRate = 0;
  }

  get fwdX() {
    return -Math.sin(this.yaw);
  }
  get fwdZ() {
    return -Math.cos(this.yaw);
  }

  shift(dir) {
    const g = clamp(this.gear + dir, 0, GEARS.length - 1);
    if (g !== this.gear) {
      this.gear = g;
      this.bus.emit('gear', g);
    }
  }

  /**
   * input: { pedal 0..1, brake 0..1, steer -1..1, sprint bool }
   * env: { wind: {x,z}, wet 0..1 }
   */
  update(dt, input, env, traffic) {
    this.stats.time += dt;
    if (this.state !== 'ride') return this.updateFallen(dt);
    const surf = (this.surface = L.surfaceAt(this.x, this.z));
    const mat = surf.mat || 'klinker';
    const wet = env.wet;

    // --- pedalling ---------------------------------------------------------
    const dev = GEARS[this.gear];
    this.cadence = (this.v / dev) * 60;
    const sprint = input.sprint && this.stamina > 0.05;
    const pMax = sprint ? 420 : 175;
    const torqueMax = sprint ? 115 : 62; // Nm at the cranks
    let F = 0;
    if (input.pedal > 0 && this.reverse === 0) {
      const cad = this.cadence;
      const powerFactor = cad < 85 ? 1 : clamp(1 - (cad - 85) / 60, 0, 1);
      const P = pMax * powerFactor * input.pedal;
      const Ftorque = (torqueMax * Math.PI * 2) / dev;
      F = Math.min(P / Math.max(this.v, 0.5), Ftorque) * input.pedal;
      this.power = F * this.v;
    } else this.power = 0;
    // stamina
    const drain = sprint && input.pedal > 0 ? 0.075 : 0;
    const recover = this.power < 120 ? 0.035 : 0.01;
    this.stamina = clamp(this.stamina - drain * dt + recover * dt * (drain ? 0 : 1), 0, 1);
    this.stand = damp(this.stand, sprint && input.pedal > 0 ? 1 : 0, 5, dt);

    // --- resistances --------------------------------------------------------
    const crr = (CRR[mat] ?? 0.01) * (1 + wet * 0.1);
    const Froll = this.v > 0.01 ? crr * MASS * G : 0;
    const fx = this.fwdX, fz = this.fwdZ;
    const headwind = -(env.wind.x * fx + env.wind.z * fz); // >0 = wind in your face
    const vAir = this.v + headwind;
    const Fair = 0.5 * 1.225 * (0.58 + this.stand * 0.05) * vAir * Math.abs(vAir);
    // slope from ground heights ahead/behind
    const hF = L.heightAt(this.x + fx * 0.6, this.z + fz * 0.6);
    const hB = L.heightAt(this.x - fx * 0.6, this.z - fz * 0.6);
    const slope = (hF - hB) / 1.2;
    const Fgrav = MASS * G * slope;
    const brakeDecel = (wet > 0.3 ? 3.0 : 4.4) * input.brake;
    let a = (F - Froll - Fair - Fgrav) / MASS;
    if (this.v > 0.01) a -= brakeDecel;
    this.v = Math.max(0, this.v + a * dt);
    if (input.brake > 0.5 && this.v > 4 && Math.random() < dt * 0.6) this.bus.emit('squeal');
    if (input.brake > 0.5) this.brakeHeld += dt;
    else this.brakeHeld = 0;
    // walking the bike backwards when stuck
    if (this.v < 0.05 && this.brakeHeld > 0.45) this.reverse = 0.8;
    else if (input.brake < 0.5 || input.pedal > 0) this.reverse = 0;
    if (this.v > 0.01 && Fgrav < 0 && input.pedal === 0) {
      // rolling downhill
    }

    // --- steering, lean, wobble ------------------------------------------------
    const maxSteer = 0.6 / (1 + this.v * 0.42);
    let target = input.steer * maxSteer;
    if (this.v < 1.4 && this.v > 0.1) target += (noise1(this.stats.time * 2.3) - 0.5) * 0.12 * (1.4 - this.v);
    this.steer = damp(this.steer, target, 7, dt);
    const speedForTurn = this.reverse ? -this.reverse : this.v;
    this.yawRate = (speedForTurn * Math.tan(this.steer)) / WHEELBASE;
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    const latAcc = this.v * this.yawRate;
    const targetLean = Math.atan(latAcc / G);
    this.lean = damp(this.lean, clamp(targetLean, -0.6, 0.6), 6, dt);
    // grip limit
    const mu = (wet > 0.3 ? 0.55 : 0.82) * (mat === 'strip' || mat === 'klinker' ? 0.92 : 1);
    if (Math.abs(latAcc) > mu * G && this.v > 3) {
      this.crash('Your wheel slipped on the ' + (wet > 0.3 ? 'wet ' : '') + (mat === 'klinker' ? 'klinkers' : 'road') + '!');
      return;
    }
    this.footDown = damp(this.footDown, this.v < 0.4 && input.pedal === 0 ? 1 : 0, 6, dt);

    // --- move & collide ------------------------------------------------------
    const step = (this.reverse ? -this.reverse : this.v) * dt;
    let nx = this.x + fx * step, nz = this.z + fz * step;
    const blocked = (px, pz) => {
      const s = L.surfaceAt(px, pz);
      return s.kind === 'building' || s.kind === 'out';
    };
    const dirSign = this.reverse ? -1 : 1;
    const probeX = dirSign > 0 ? nx + fx * 0.75 : nx - fx * 0.6;
    const probeZ = dirSign > 0 ? nz + fz * 0.75 : nz - fz * 0.6;
    if (blocked(probeX, probeZ) || blocked(nx, nz)) {
      const impact = this.v;
      if (impact > 4.6) {
        this.crash('You rode straight into a wall.');
        return;
      }
      if (impact > 0.5) this.bus.emit('bump', impact);
      this.v = 0;
      this.reverse = 0;
      nx = this.x;
      nz = this.z;
    }
    // static obstacles
    for (const [ox, oz, rad] of [[0, 0, 0.32], [fx * 0.62, fz * 0.62, 0.22], [-fx * 0.55, -fz * 0.55, 0.2]]) {
      const hit = this.col.collide(nx + ox, nz + oz, rad);
      if (hit) {
        const into = -(fx * hit.nx + fz * hit.nz);
        const impact = this.v * Math.max(0, into);
        if (impact > 4.4 && hit.tag !== 'bollard') {
          this.crash(hit.tag === 'tree' ? 'You hit a tree.' : hit.tag === 'car' ? 'You crashed into a parked car.' : hit.tag === 'bike' ? 'You crashed into a row of parked bikes.' : 'You hit a ' + hit.tag + '.');
          return;
        }
        if (impact > 3.6 && hit.tag === 'bollard') {
          this.crash('Ouch! An Amsterdammertje (bollard) stopped you.');
          return;
        }
        nx += hit.nx * hit.depth;
        nz += hit.nz * hit.depth;
        if (impact > 0.3) {
          this.v *= 0.35;
          this.bus.emit('bump', impact);
        }
        // deflect heading along the obstacle
        const side = fx * hit.nz - fz * hit.nx;
        this.yaw = wrapAngle(this.yaw + Math.sign(side) * 0.02);
      }
    }
    // moving traffic
    if (traffic) {
      const hit = traffic.hitTest(nx, nz, 0.45, this);
      if (hit) {
        const rel = Math.hypot(this.v * fx - hit.vx, this.v * fz - hit.vz);
        if (rel > 2.8 || hit.kind === 'tram') {
          this.crash(hit.message || 'Collision!', hit);
          return;
        }
        nx += hit.nx * hit.depth;
        nz += hit.nz * hit.depth;
        this.v *= 0.5;
        this.bus.emit('bump', rel);
        hit.agent && traffic.annoy(hit.agent);
      }
    }
    // tram rails
    const rails = railDistances(nx, nz);
    const seen = new Set();
    for (const rl of rails) {
      seen.add(rl.id);
      const prev = this.prevRails.get(rl.id);
      if (prev !== undefined && Math.sign(prev) !== Math.sign(rl.d) && this.v > 1.6) {
        const cosA = Math.abs(fx * rl.tx + fz * rl.tz);
        const angle = Math.acos(clamp(cosA, 0, 1));
        if (angle < 0.33) {
          this.crash('Your front wheel got stuck in the tram rails! Cross them at a sharper angle.');
          return;
        }
        this.bus.emit('rail', angle);
      }
      this.prevRails.set(rl.id, rl.d);
    }
    for (const k of this.prevRails.keys()) if (!seen.has(k)) this.prevRails.delete(k);

    // bridge parapets: you cannot ride off the side of a bridge
    let ns = L.surfaceAt(nx, nz);
    if (ns.kind === 'water' && (surf.bridge || this.y > 0.2)) {
      const impact = this.v;
      if (impact > 5.5) {
        this.crash('You slammed into the bridge railing.');
        return;
      }
      if (impact > 0.5) this.bus.emit('bump', impact);
      this.v *= 0.2;
      this.yaw = wrapAngle(this.yaw + (Math.random() < 0.5 ? 0.05 : -0.05));
      nx = this.x;
      nz = this.z;
      ns = L.surfaceAt(nx, nz);
    }
    // commit
    const oldY = this.y;
    this.distanceStep = Math.hypot(nx - this.x, nz - this.z);
    this.stats.distance += this.distanceStep;
    this.x = nx;
    this.z = nz;
    const curb = (s) => (s.kind === 'side' ? 0.12 : s.kind === 'edge' ? 0.1 : 0);
    const groundY = ns.kind === 'water' ? L.WATER_Y : ns.h + curb(ns);
    if (ns.kind === 'water') {
      this.splash();
      return;
    }
    const dy = groundY - oldY;
    if (Math.abs(dy) > 0.06 && Math.abs(dy) < 0.3) {
      this.jolt = Math.min(1, this.jolt + Math.abs(dy) * 4 * (0.5 + this.v * 0.1));
      this.bus.emit('curb', Math.abs(dy));
      if (dy > 0) this.v *= 0.9;
    }
    this.y = groundY;
    this.stats.topSpeed = Math.max(this.stats.topSpeed, this.v);
    // bridges
    if (ns.bridge && ns.name !== this.lastBridge) {
      this.lastBridge = ns.name;
      this.stats.bridges++;
    } else if (!ns.bridge) this.lastBridge = null;
    // remember safe spots to respawn after a splash
    this.safeTimer += dt;
    if (this.safeTimer > 0.5 && (ns.kind === 'road' || ns.kind === 'bike') && !ns.bridge && this.v > 0.5) {
      this.safeTimer = 0;
      this.safe.push({ x: this.x, z: this.z, yaw: this.yaw });
      if (this.safe.length > 20) this.safe.shift();
    }

    // animation
    this.wheelAngle += (step / 0.355);
    const crankRate = (this.v / dev) * Math.PI * 2;
    if (input.pedal > 0 || this.power > 0) this.crank += crankRate * dt;
    this.jolt = damp(this.jolt, 0, 6, dt);
    this.roughness = (ROUGH[mat] ?? 0.4) * (ns.bridge ? 0.8 : 1);
    this.signalTime = Math.max(0, this.signalTime - dt);
    if (this.signalTime === 0) this.signal = 0;
  }

  crash(message, info) {
    if (this.state !== 'ride') return;
    this.state = 'crash';
    this.stateTime = 0;
    this.crashV = this.v;
    this.v = 0;
    this.stats.crashes++;
    this.bus.emit('crash', { message, info, speed: this.crashV });
  }

  splash() {
    this.state = 'splash';
    this.stateTime = 0;
    this.splashV = this.v;
    this.v = 0;
    this.stats.splashes++;
    this.bus.emit('splash', { name: L.surfaceAt(this.x, this.z).name });
  }

  updateFallen(dt) {
    this.stateTime += dt;
    if (this.state === 'splash') {
      const t = this.stateTime;
      this.y = lerp(this.y, L.WATER_Y - 0.6, clamp(t * 2.2, 0, 1));
      if (t > 3.2) this.respawn();
    } else if (this.state === 'crash') {
      if (this.stateTime > 2.6) this.recover();
    }
  }

  respawn() {
    const s = this.safe.length > 6 ? this.safe[this.safe.length - 6] : this.safe[0] || { x: 0, z: -40, yaw: 0 };
    this.reset({ x: s.x, z: s.z, yaw: s.yaw });
    this.bus.emit('respawn');
  }

  recover() {
    this.state = 'ride';
    this.stateTime = 0;
    this.v = 0;
    this.footDown = 1;
    // step back from the obstacle a little
    this.x -= this.fwdX * 0.6;
    this.z -= this.fwdZ * 0.6;
    if (L.surfaceAt(this.x, this.z).kind === 'water') return this.respawn();
    this.bus.emit('recover');
  }

  ringBell() {
    this.bus.emit('bell', { x: this.x, z: this.z, fx: this.fwdX, fz: this.fwdZ });
  }

  setSignal(dir) {
    this.signal = dir;
    this.signalTime = 2.5;
    this.bus.emit('signal', dir);
  }

  /** Update bike object & rider pose; returns world joints for rendering. */
  updateVisual(dt, people, look) {
    const g = this.root;
    let roll = -this.lean;
    let pitch = 0;
    let yOff = 0;
    if (this.state === 'crash') {
      const t = clamp(this.stateTime / 0.5, 0, 1);
      roll = lerp(-this.lean, -1.35 * (this.lean >= 0 ? 1 : -1), t);
      yOff = -0.05 * t;
    }
    if (this.state === 'splash') pitch = clamp(this.stateTime * 1.5, 0, 0.9);
    const footTilt = this.footDown * 0.09; // lean onto the foot when stopped
    g.position.set(this.x, this.y + yOff, this.z);
    g.rotation.set(pitch, this.yaw, roll + footTilt, 'YXZ');
    g.updateMatrixWorld(true);
    this.bike.set(this.steer, this.wheelAngle, this.crank);
    // First-person "viewmodel": raise and push the handlebar a little so the
    // bars, bell and your hands sit at the bottom of the view, like real life.
    const fp = this.viewMode === 'fp';
    const lift = fp ? 0.24 : 0, push = fp ? 0.12 : 0;
    this.bike.steerPivot.position.set(BIKE_HB.x, BIKE_HB.y + lift, BIKE_HB.z - push);
    const height = 1;
    this.joints = riderJoints(g.matrixWorld, this.steer, this.crank, { stand: this.stand, footDown: this.footDown, signal: this.signal, height, viewLift: lift, viewPush: push }, this.joints || undefined);
    if (people) people.person(this.joints, { ...look, hideHead: this.viewMode === 'fp', hideTorso: this.viewMode === 'fp' });
    // headlight
    this.headlight.intensity = this.light ? 90 : 0;
  }

  /** Camera placement. */
  updateCamera(camera, dt, env) {
    const fx = this.fwdX, fz = this.fwdZ;
    if (this.viewMode === 'fp' && this.state !== 'splash') {
      const head = this.joints.head;
      const t = this.stats.time;
      const cadHz = (this.cadence / 60) * 2;
      const bob = this.v > 0.3 ? Math.sin(this.crank * 2) * 0.012 * (0.4 + this.stand) : 0;
      const sway = Math.sin(this.crank) * 0.03 * this.stand;
      const vib = (this.roughness || 0.3) * Math.min(this.v, 8) * 0.0018;
      const nx = (noise1(t * 31) - 0.5) * vib, ny = (noise1(t * 37 + 5) - 0.5) * vib * 1.6;
      camera.position.set(head.x + fx * 0.06 + -fz * sway, head.y + 0.03 + bob + ny + this.jolt * 0.03 * Math.sin(t * 60), head.z + fz * 0.06 + fx * sway);
      camera.position.x += nx;
      // look recentering
      this.look.lastMove += dt;
      if (this.look.lastMove > 1.2 && !this.look.free) {
        this.look.yaw = damp(this.look.yaw, 0, 2.5, dt);
        this.look.pitch = damp(this.look.pitch, 0, 2.5, dt);
      }
      let roll = -this.lean * 0.75 + this.footDown * 0.04;
      let pitch = -0.2 + this.look.pitch - this.jolt * 0.02;
      if (this.state === 'crash') {
        const k = clamp(this.stateTime / 0.45, 0, 1);
        roll = lerp(roll, (this.lean >= 0 ? -1 : 1) * 1.2, k);
        pitch = lerp(pitch, -0.6, k);
        camera.position.y -= k * 1.1;
      }
      camera.rotation.set(pitch, this.yaw + this.look.yaw, roll, 'YXZ');
      void cadHz;
    } else {
      // chase camera
      const back = this.state === 'splash' ? 6 : 4.6;
      const desired = new THREE.Vector3(this.x - fx * back, this.y + 2.1 + (this.state === 'splash' ? 2 : 0), this.z - fz * back);
      // keep the camera out of buildings
      for (let k = 1; k <= 10; k++) {
        const t = k / 10;
        const px = this.x + (desired.x - this.x) * t, pz = this.z + (desired.z - this.z) * t;
        const s = L.surfaceAt(px, pz);
        const obstacle = t > 0.35 && this.col.collide(px, pz, 0.35);
        if (s.kind === 'building' || s.kind === 'out' || (obstacle && obstacle.tag !== 'bollard')) {
          const tt = Math.max(0.15, t - 0.15);
          desired.x = this.x + (desired.x - this.x) * tt;
          desired.z = this.z + (desired.z - this.z) * tt;
          desired.y += (1 - tt) * 1.5;
          break;
        }
      }
      if (this.camPos.lengthSq() === 0 || this.camJump) {
        this.camPos.copy(desired);
        this.camJump = false;
      }
      this.camPos.x = damp(this.camPos.x, desired.x, 5, dt);
      this.camPos.y = damp(this.camPos.y, desired.y, 5, dt);
      this.camPos.z = damp(this.camPos.z, desired.z, 5, dt);
      camera.position.copy(this.camPos);
      const target = new THREE.Vector3(this.x + fx * 2, this.y + 1.1, this.z + fz * 2);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      // allow mouse look offset in chase view
      camera.rotateY(this.look.yaw * 0.6);
    }
    void env;
  }
}
