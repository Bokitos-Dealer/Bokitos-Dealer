// Everyone else in town: cyclists, pedestrians & tourists, cars & vans,
// trams and canal boats.
import * as THREE from 'three';
import * as L from '../city/layout.js';
import { clamp, damp, lerp, mulberry32, pick, range, wrapAngle } from '../util/math.js';
import { randomLook, JACKETS } from '../models/people.js';
import { riderJoints, walkerJoints, newJoints } from '../models/rider.js';
import { FRAME_COLORS } from '../models/bike.js';
import { carGeometries, tramSection, tourBoat, smallBoat } from '../models/vehicles.js';

const CAR_COLORS = ['#1c1c1e', '#e8e8e6', '#9aa0a6', '#2b3e5c', '#5c1f1f', '#3a4a3a', '#d8d2c4', '#202830', '#7a7a7a', '#101010', '#f0f0f0'];
const SORRY = ['Sorry!', 'Oops, sorry!', 'Oh! Sorry!', 'Excuse me!', 'Sorry sorry!', 'Entschuldigung!', 'Pardon!'];
const ANGRY = ['Hé! Kijk uit!', 'Pas op!', 'Kijk dan uit!', 'Hallo?!', 'Jeetje!', 'Doe normaal!'];
const LOCAL_BELL = ['Doorrijden!', 'Aan de kant!', 'Rechts houden!', 'Hallo!', 'Mag ik even?'];

export class Traffic {
  constructor(scene, nav, people, fleet, bus, quality) {
    this.scene = scene;
    this.nav = nav;
    this.people = people;
    this.fleet = fleet;
    this.bus = bus;
    this.q = quality;
    this.rand = mulberry32(99);
    this.agents = [];
    this.cars = [];
    this.trams = [];
    this.boats = [];
    this.speakers = [];
    this.density = 1;
    this.joints = newJoints();
    this.grid = new Map();

    // car instancing (cars + vans)
    const mkCarSet = (kind, n) => {
      const g = carGeometries(kind);
      const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 });
      const restMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
      const body = new THREE.InstancedMesh(g.body, bodyMat, n);
      const rest = new THREE.InstancedMesh(g.rest, restMat, n);
      for (const m of [body, rest]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.count = 0;
        m.castShadow = true;
        m.frustumCulled = false;
        scene.add(m);
      }
      body.setColorAt(0, new THREE.Color());
      return { body, rest, len: g.len, width: g.width };
    };
    this.carSet = mkCarSet('car', 40);
    this.vanSet = mkCarSet('van', 12);
    // hazard light blinkers
    this.blinkers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffa21a }), 48);
    this.blinkers.count = 0;
    this.blinkers.frustumCulled = false;
    scene.add(this.blinkers);

    // trams
    const tramMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 });
    this.tramGeo = { front: tramSection('front'), mid: tramSection('mid'), rear: tramSection('rear') };
    this.tramMat = tramMat;
    // boats
    const boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 });
    this.boatTour = new THREE.InstancedMesh(tourBoat(), boatMat, 12);
    this.boatSmall = new THREE.InstancedMesh(smallBoat(), boatMat, 12);
    for (const m of [this.boatTour, this.boatSmall]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      scene.add(m);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
    this.buildTrams();
  }

  // ---------------------------------------------------------------------------
  // spawning
  // ---------------------------------------------------------------------------
  pickEdgeNear(px, pz, minD, maxD, filter) {
    const nav = this.nav;
    for (let tries = 0; tries < 60; tries++) {
      const e = nav.edges[Math.floor(this.rand() * nav.edges.length)];
      if (filter && !filter(e)) continue;
      const m = nav.mids[e.id];
      const d = Math.hypot(m.x - px, m.z - pz);
      if (d >= minD && d <= maxD) return e;
    }
    return null;
  }

  placeOnEdge(a, e, from, s) {
    a.edge = e;
    a.from = from;
    a.s = s;
    a.lat = a.latTarget = this.nav.lane(e, from, a.lane, this.rand);
    const p = this.edgePos(a);
    a.x = p.x;
    a.z = p.z;
    a.y = L.heightAt(p.x, p.z);
    a.yaw = p.yaw;
  }

  edgePos(a, s = a.s, lat = a.lat) {
    const e = a.edge;
    const fwd = a.from === e.a;
    const param = fwd ? s : e.len - s;
    const p = this.nav.pointOn(e, clamp(param, 0, e.len), lat);
    const p2 = this.nav.pointOn(e, clamp(param + (fwd ? 0.5 : -0.5), 0, e.len), lat);
    let yaw = Math.atan2(-(p2.x - p.x), -(p2.z - p.z));
    if (Math.abs(p2.x - p.x) + Math.abs(p2.z - p.z) < 1e-6) yaw = a.yaw || 0;
    return { x: p.x, z: p.z, yaw };
  }

  carAllowed(e) {
    return e.kind !== 'line' && !(e.dv && e.dv.passage) && e.name !== 'Damrak';
  }

  makeAgent(type) {
    const r = this.rand;
    const a = { type, lane: type === 'walk' ? 'walk' : type === 'car' ? 'car' : 'bike', id: this.agents.length + this.cars.length };
    if (type === 'bike') {
      a.look = randomLook(r);
      a.color = pick(r, FRAME_COLORS);
      a.crate = r() < 0.55;
      a.vDes = range(r, 3.6, 6.4);
      a.crank = r() * 6;
      a.wheel = 0;
      a.steer = 0;
      a.lean = 0;
      a.redRunner = r() < 0.45;
    } else if (type === 'walk') {
      a.look = randomLook(r);
      a.tourist = r() < 0.3;
      if (a.tourist) {
        a.look.jacket = pick(r, ['#e23d3d', '#f2c230', '#3fa7d6', '#ff7f2a', '#8e4ad6', '#2ecc71', '#ff6fb5', '#ffffff']);
        a.look.bag = '#222';
        a.lane = r() < 0.65 ? 'bike' : 'walk';
      }
      a.vDes = a.tourist ? range(r, 0.8, 1.2) : range(r, 1.15, 1.55);
      a.phase = r() * 6;
      a.pose = 'walk';
    } else {
      a.van = r() < 0.25;
      a.color = a.van ? pick(r, ['#ffffff', '#f2f2f2', '#d8d8d8', '#c62828', '#1565c0']) : pick(r, CAR_COLORS);
      a.vDes = range(r, 5.5, 8);
      a.len = a.van ? this.vanSet.len : this.carSet.len;
    }
    a.speed = a.vDes * 0.6;
    a.timer = 0;
    a.bellCd = 0;
    a.blocked = 0;
    a.passing = 0;
    return a;
  }

  spawnAll(player) {
    const q = this.q;
    this.agents = [];
    this.cars = [];
    for (let i = 0; i < Math.round(q.cyclists * this.density); i++) this.agents.push(this.makeAgent('bike'));
    for (let i = 0; i < Math.round(q.walkers * this.density); i++) this.agents.push(this.makeAgent('walk'));
    for (let i = 0; i < q.cars; i++) this.cars.push(this.makeAgent('car'));
    for (const a of [...this.agents, ...this.cars]) this.respawn(a, player, 10, 200);
    this.boats = [];
    for (let i = 0; i < q.boats; i++) {
      const b = { tour: i % 3 !== 2 };
      this.respawnBoat(b, player, true);
      this.boats.push(b);
    }
  }

  respawn(a, player, minD = 90, maxD = 230) {
    const filter = a.type === 'car' ? (e) => this.carAllowed(e) : null;
    const e = this.pickEdgeNear(player.x, player.z, minD, maxD, filter) || this.nav.edges[Math.floor(this.rand() * this.nav.edges.length)];
    const from = this.rand() < 0.5 ? e.a : e.b;
    this.placeOnEdge(a, e, from, this.rand() * e.len);
    a.speed = a.vDes;
    a.state = 'go';
    a.parkTimer = 0;
    if (a.type === 'walk') {
      a.umbrella = null;
      a.wantsUmbrella = this.rand() < 0.65;
    }
  }

  nextEdge(a) {
    const e = a.edge;
    const node = a.from === e.a ? e.b : e.a;
    let options = node.edges.filter((x) => x !== e);
    if (a.type === 'car') options = options.filter((x) => this.carAllowed(x));
    if (a.route && a.route.length) {
      const nx = a.route.shift();
      if (options.includes(nx)) options = [nx];
    }
    if (!options.length) options = [e];
    // prefer going straight on
    let best = options[0];
    if (options.length > 1) {
      const dirIn = Math.atan2(node.x - (a.x || node.x), node.z - (a.z || node.z));
      const scored = options.map((o) => {
        const other = o.a === node ? o.b : o.a;
        const ang = Math.atan2(other.x - node.x, other.z - node.z);
        const turn = Math.abs(wrapAngle(ang - dirIn));
        return { o, w: (turn < 0.5 ? 2.2 : 1) * (0.5 + this.rand()) };
      });
      scored.sort((p, q) => q.w - p.w);
      best = scored[0].o;
    }
    // keep continuity: compute lateral matching the current world position
    const prevX = a.x, prevZ = a.z;
    a.edge = best;
    a.from = node;
    a.latTarget = this.nav.lane(best, node, a.lane, this.rand);
    if (best.kind === 'ring') a.lat = Math.hypot(prevX, prevZ);
    else if (best.kind === 'radial') a.lat = L.perpDist(best.dv, prevX, prevZ);
    else a.lat = a.latTarget;
    if (a.type === 'walk' && a.tourist && this.rand() < 0.4) a.lane = this.rand() < 0.5 ? 'bike' : 'walk';
    a.s = Math.max(0, a.s - e.len);
  }

  // ---------------------------------------------------------------------------
  // trams
  // ---------------------------------------------------------------------------
  buildTrams() {
    const lines = [];
    // Line 1: Centraal - Damrak - Dam - Vijzelstraat
    const off1 = (z) => (z < -55 ? 2.5 : z > 55 ? 2.2 : lerp(2.5, 2.2, (z + 55) / 110));
    const z0 = -366, z1 = 626;
    lines.push({
      name: '24',
      len: z1 - z0,
      pos: (p, dir) => {
        const z = dir > 0 ? z0 + p : z1 - p;
        const x = dir > 0 ? -off1(z) : off1(z);
        return { x, z, yaw: dir > 0 ? Math.PI : 0 };
      },
      stops: [6, 300, 420, 600, 800, 985],
      stopNames: ['Centraal Station', 'Dam', 'Rokin', 'Muntplein', 'Keizersgracht', 'Weteringcircuit'],
    });
    // Line 2: Stadhouderskade
    const ta = -L.THETA_MAX + 0.04, tb = L.THETA_MAX - 0.04;
    const rP = 634.8, rN = 630.4;
    lines.push({
      name: '7',
      len: rP * (tb - ta),
      pos: (p, dir) => {
        const r = dir > 0 ? rP : rN;
        const th = dir > 0 ? ta + p / rP : tb - p / rN;
        const yaw = dir > 0 ? Math.atan2(-Math.cos(th), Math.sin(th)) : Math.atan2(Math.cos(th), -Math.sin(th));
        return { x: r * Math.sin(th), z: r * Math.cos(th), yaw };
      },
      stops: [200, 600, 1000, 1400, 1800, 2200],
    });
    this.tramLines = lines;
    const mkTram = (line, p, dir) => {
      const parts = ['front', 'mid', 'rear'].map((k) => {
        const m = new THREE.Mesh(this.tramGeo[k], this.tramMat);
        m.castShadow = true;
        this.scene.add(m);
        return m;
      });
      return { line, p, dir, v: 6, parts, dwell: 0, nextStop: 0, bellCd: 0, x: 0, z: 0 };
    };
    for (const line of lines) {
      for (let k = 0; k < 2; k++) {
        this.trams.push(mkTram(line, line.len * (0.2 + k * 0.45), k === 0 ? 1 : -1));
      }
    }
  }

  updateTrams(dt, player, camera) {
    for (const t of this.trams) {
      const line = t.line;
      // obstacle ahead: player on the track?
      const head = line.pos(Math.min(line.len, t.p + 2), t.dir);
      const fx = -Math.sin(head.yaw), fz = -Math.cos(head.yaw);
      let target = 8.3;
      const dxp = player.x - head.x, dzp = player.z - head.z;
      const ahead = dxp * fx + dzp * fz;
      const lat = Math.abs(dxp * -fz + dzp * fx);
      if (ahead > 0 && ahead < 30 && lat < 1.7 && player.state === 'ride') {
        target = Math.max(0, (ahead - 6) * 0.45);
        if (t.bellCd <= 0) {
          this.bus.emit('tramBell', { x: head.x, z: head.z });
          t.bellCd = 2.5;
        }
      }
      t.bellCd -= dt;
      // stops
      const ns = line.stops.find((s) => s > t.p + 0.5);
      if (t.dwell > 0) {
        t.dwell -= dt;
        target = 0;
      } else if (ns !== undefined && ns - t.p < 22) {
        target = Math.min(target, Math.max(1.2, (ns - t.p) * 0.4));
        if (ns - t.p < 0.6) {
          t.dwell = 12;
          t.p = ns + 0.6;
        }
      }
      const acc = target > t.v ? 1.0 : -2.2;
      t.v = clamp(t.v + acc * dt, 0, Math.max(target, 0));
      if (target > t.v) t.v = Math.min(target, t.v + 1.0 * dt);
      t.p += t.v * dt;
      if (t.p >= line.len - 1) {
        // terminus: swap to the other track when nobody is watching closely
        const end = line.pos(line.len - 1, t.dir);
        const d = Math.hypot(end.x - camera.position.x, end.z - camera.position.z);
        t.v = 0;
        t.p = line.len - 1;
        t.wait = (t.wait || 0) + dt;
        if (t.wait > 15 && (d > 70 || t.wait > 40)) {
          t.dir *= -1;
          t.p = 0;
          t.wait = 0;
        }
      }
      // place sections
      const offs = [0, 10.55, 21.1];
      t.parts.forEach((m, i) => {
        const p = line.pos(clamp(t.p - offs[i] - 5, 0, line.len), t.dir);
        const p2 = line.pos(clamp(t.p - offs[i] - 4, 0, line.len), t.dir);
        const yaw = Math.abs(p2.x - p.x) + Math.abs(p2.z - p.z) > 1e-4 ? Math.atan2(-(p2.x - p.x), -(p2.z - p.z)) : p.yaw;
        m.position.set(p.x, L.heightAt(p.x, p.z) + 0.03, p.z);
        m.rotation.set(0, yaw, 0);
        if (i === 0) {
          t.x = p.x;
          t.z = p.z;
          t.yaw = yaw;
        }
      });
      t.segments = t.parts.map((m) => ({ x: m.position.x, z: m.position.z, yaw: m.rotation.y }));
      t.vx = -Math.sin(t.yaw) * t.v;
      t.vz = -Math.cos(t.yaw) * t.v;
    }
  }

  // ---------------------------------------------------------------------------
  // boats
  // ---------------------------------------------------------------------------
  respawnBoat(b, player, initial = false) {
    const canals = L.CANALS.filter((c) => c.id !== 'voorburgwal' && c.id !== 'singelgracht');
    // nearest canals to the player get priority
    const pr = Math.hypot(player.x, player.z);
    canals.sort((a, c) => Math.abs(a.r - pr) - Math.abs(c.r - pr));
    const c = canals[Math.floor(this.rand() * Math.min(3, canals.length))];
    b.canal = c;
    b.dir = this.rand() < 0.5 ? 1 : -1;
    const pth = Math.atan2(player.x, player.z);
    const off = (initial ? range(this.rand, -0.35, 0.35) : (this.rand() < 0.5 ? -1 : 1) * range(this.rand, 0.2, 0.4));
    b.th = clamp(pth + off, -L.THETA_MAX + 0.05, L.THETA_MAX - 0.05);
    b.r = c.r + b.dir * 3.2;
    b.v = b.tour ? range(this.rand, 2.0, 2.8) : range(this.rand, 2.5, 3.5);
  }

  updateBoats(dt, player) {
    for (const b of this.boats) {
      b.th += (b.dir * b.v * dt) / b.r;
      const lim = b.canal.full ? Math.PI : L.THETA_MAX;
      if (Math.abs(b.th) > lim - 0.03) {
        if (b.canal.full) b.th = -b.th + Math.sign(b.th) * 0.0;
        else {
          b.dir *= -1;
          b.r = b.canal.r + b.dir * 3.2;
        }
      }
      b.x = b.r * Math.sin(b.th);
      b.z = b.r * Math.cos(b.th);
      b.yaw = b.dir > 0 ? Math.atan2(-Math.cos(b.th), Math.sin(b.th)) : Math.atan2(Math.cos(b.th), -Math.sin(b.th));
      if (Math.hypot(b.x - player.x, b.z - player.z) > 320) this.respawnBoat(b, player);
    }
  }

  // ---------------------------------------------------------------------------
  // main update
  // ---------------------------------------------------------------------------
  rebuildGrid() {
    const g = this.grid;
    g.clear();
    const add = (o) => {
      const k = (Math.floor(o.x / 12) * 73856093) ^ (Math.floor(o.z / 12) * 19349663);
      let l = g.get(k);
      if (!l) g.set(k, (l = []));
      l.push(o);
    };
    for (const a of this.agents) add(a);
    for (const c of this.cars) add(c);
  }
  near(x, z, cb) {
    const ix = Math.floor(x / 12), iz = Math.floor(z / 12);
    for (let i = ix - 1; i <= ix + 1; i++)
      for (let j = iz - 1; j <= iz + 1; j++) {
        const l = this.grid.get((i * 73856093) ^ (j * 19349663));
        if (l) for (const o of l) cb(o);
      }
  }

  say(a, text, dur = 2.2) {
    a.speech = { text, t: dur };
    if (!this.speakers.includes(a)) this.speakers.push(a);
  }

  update(dt, player, env, camera, lights) {
    this.rebuildGrid();
    const raining = env.weather.rain > 0.15;
    const all = [...this.agents, ...this.cars];
    for (const a of all) {
      // too far away: recycle near the player
      const dp = Math.hypot(a.x - player.x, a.z - player.z);
      if (dp > 260) {
        this.respawn(a, player);
        continue;
      }
      a.bellCd -= dt;
      if (a.speech) {
        a.speech.t -= dt;
        if (a.speech.t <= 0) a.speech = null;
      }
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      // --- behaviour states
      let vT = a.vDes;
      if (a.type === 'walk') {
        if (raining && a.wantsUmbrella && !a.umbrella) a.umbrella = pick(this.rand, ['#1b1b1b', '#2b4d8c', '#a3262a', '#f0c419', '#3b7d3a', '#ffffff']);
        if (!raining) a.umbrella = null;
        if (a.state === 'photo') {
          vT = 0;
          a.timer -= dt;
          if (a.timer <= 0) a.state = 'go';
        } else if (a.tourist && this.rand() < dt * 0.05) {
          a.state = 'photo';
          a.timer = range(this.rand, 2.5, 6);
        }
      }
      if (a.type === 'car') {
        if (a.state === 'parked') {
          vT = 0;
          a.timer -= dt;
          if (a.timer <= 0) a.state = 'go';
        } else if (a.van && this.rand() < dt * 0.012 && dp > 25) {
          // delivery van stops right in the street with its hazards on
          a.state = 'parked';
          a.timer = range(this.rand, 15, 40);
        }
      }
      // --- traffic lights (cars always stop, about half of the cyclists do)
      const nextNode = a.from === a.edge.a ? a.edge.b : a.edge.a;
      if (nextNode.light && this.lights && a.type !== 'walk' && (a.type === 'car' || !a.redRunner)) {
        const tl = nextNode.light;
        const kind = a.edge.kind === 'radial' ? 'radial' : 'ring';
        if (this.lights.state(tl, kind) !== 'green') {
          const half = kind === 'radial' ? (tl.rc[1] - tl.rc[0]) / 2 : (tl.dc[1] - tl.dc[0]) / 2;
          const dist = a.edge.len - a.s;
          const stopAt = half + 1.5;
          if (dist > stopAt - 1 && dist < stopAt + 30) vT = Math.min(vT, Math.max(0, (dist - stopAt) * 0.9));
        }
      }
      // --- look ahead for obstacles
      const look = a.type === 'car' ? 16 : a.type === 'bike' ? 10 : 2.5;
      let minGap = Infinity, blocker = null;
      const consider = (o, ox, oz, ov) => {
        const dx = ox - a.x, dz = oz - a.z;
        const ahead = dx * fx + dz * fz;
        if (ahead <= 0.3 || ahead > look) return;
        const lat = Math.abs(dx * -fz + dz * fx);
        const width = a.type === 'car' ? 1.6 : 0.8;
        if (lat > width) return;
        if (ahead < minGap) {
          minGap = ahead;
          blocker = { o, v: ov };
        }
      };
      this.near(a.x, a.z, (o) => {
        if (o === a) return;
        if (a.type === 'walk' && o.type !== 'walk') return;
        if (a.type !== 'walk' && o.type === 'walk' && o.lane === 'walk') return; // walkers on the pavement don't block
        consider(o, o.x, o.z, o.speed * Math.cos(wrapAngle(o.yaw - a.yaw)));
      });
      if (player.state === 'ride') consider(player, player.x, player.z, player.v * Math.cos(wrapAngle(player.yaw - a.yaw)));
      for (const t of this.trams) for (const sgm of t.segments || []) consider(t, sgm.x, sgm.z, t.v);
      if (blocker) {
        const gap = a.type === 'car' ? 6 : a.type === 'bike' ? 2.6 : 1.0;
        const allowed = Math.max(0, (minGap - gap) * (a.type === 'car' ? 0.9 : 1.5) + Math.max(0, blocker.v));
        vT = Math.min(vT, allowed);
        if (a.type === 'bike' && vT < a.vDes * 0.6) {
          a.blocked += dt;
          if (blocker.o === player && a.bellCd <= 0 && minGap < 8) {
            this.bus.emit('aiBell', { x: a.x, z: a.z });
            if (this.rand() < 0.5) this.say(a, pick(this.rand, LOCAL_BELL));
            a.bellCd = range(this.rand, 3, 6);
            this.bus.emit('blocking');
          } else if (blocker.o.type === 'walk' && a.bellCd <= 0) {
            this.bus.emit('aiBell', { x: a.x, z: a.z });
            a.bellCd = 4;
            this.scare(blocker.o);
          }
        }
        if (a.type === 'car' && blocker.o === player && minGap < 10 && a.bellCd <= 0 && this.rand() < 0.3) {
          this.bus.emit('honk', { x: a.x, z: a.z });
          a.bellCd = 6;
        }
      } else a.blocked = Math.max(0, a.blocked - dt);
      // overtake: cyclists swing out
      if (a.type === 'bike') {
        if (a.blocked > 0.8) a.passing = 2.5;
        a.passing = Math.max(0, a.passing - dt);
      }
      // slopes slow cyclists
      if (a.type === 'bike') {
        const h1 = L.heightAt(a.x + fx, a.z + fz), h0 = L.heightAt(a.x, a.z);
        vT *= clamp(1 - (h1 - h0) * 3.5, 0.55, 1.25);
      }
      a.speed = damp(a.speed, vT, vT < a.speed ? 4 : 1.2, dt);
      a.s += a.speed * dt;
      while (a.s > a.edge.len) this.nextEdge(a);
      const passOff = a.type === 'bike' && a.passing > 0 ? 1.4 : 0;
      // lateral offset towards the centre of the road when passing
      let latT = a.latTarget;
      if (passOff) {
        const p0 = this.edgePos(a, a.s, a.latTarget), p1 = this.edgePos(a, a.s, a.latTarget + 1);
        const leftX = fz, leftZ = -fx; // left of travel
        const sign = (p1.x - p0.x) * leftX + (p1.z - p0.z) * leftZ > 0 ? 1 : -1;
        latT += sign * passOff;
      }
      a.lat = damp(a.lat, latT, 1.6, dt);
      const p = this.edgePos(a);
      const dx = p.x - a.x, dz = p.z - a.z;
      const moved = Math.hypot(dx, dz);
      a.x = p.x;
      a.z = p.z;
      a.vx = moved > 1e-5 ? (dx / Math.max(dt, 1e-3)) : 0;
      a.vz = moved > 1e-5 ? (dz / Math.max(dt, 1e-3)) : 0;
      if (moved > 0.002) {
        const yawT = Math.atan2(-dx, -dz);
        const dy = wrapAngle(yawT - a.yaw);
        const rate = a.type === 'car' ? 4 : 7;
        const step = clamp(dy, -rate * dt * 1.5, rate * dt * 1.5);
        a.yawRate = step / Math.max(dt, 1e-3);
        a.yaw = wrapAngle(a.yaw + step);
      } else a.yawRate = 0;
      // height
      if (a.type === 'walk') {
        a.surfT = (a.surfT || 0) - dt;
        if (a.surfT <= 0) {
          a.surfT = 0.5;
          const s = L.surfaceAt(a.x, a.z);
          a.curb = s.kind === 'side' ? 0.12 : 0;
          if (s.kind === 'water' || s.kind === 'building') a.lat = a.latTarget;
        }
        a.y = L.heightAt(a.x, a.z) + (a.curb || 0);
        a.phase += a.speed * dt * 4.2;
      } else {
        a.y = L.heightAt(a.x, a.z);
      }
      if (a.type === 'bike') {
        a.wheel += (a.speed * dt) / 0.355;
        if (a.speed > 0.5) a.crank += ((a.speed / 4.3) * Math.PI * 2 * dt);
        const latAcc = a.speed * (a.yawRate || 0);
        a.lean = damp(a.lean, clamp(Math.atan(latAcc / 9.81), -0.5, 0.5), 5, dt);
        a.steer = damp(a.steer, clamp(((a.yawRate || 0) * 1.12) / Math.max(a.speed, 0.5), -0.5, 0.5), 6, dt);
      }
    }
    this.updateTrams(dt, player, camera);
    this.updateBoats(dt, player);
    this.speakers = this.speakers.filter((a) => a.speech);
    void lights;
  }

  /** Tourist or cyclist reacts to the player's bell. */
  onBell(x, z, fx, fz) {
    for (const a of this.agents) {
      const dx = a.x - x, dz = a.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 24) continue;
      const ahead = (dx * fx + dz * fz) / (d || 1);
      if (ahead < 0.3) continue;
      if (a.type === 'walk') this.scare(a);
      else if (a.type === 'bike' && d < 12 && this.rand() < 0.3) this.say(a, pick(this.rand, ['Ja ja!', 'Rustig!', 'Hoi!', '👍']));
    }
  }
  scare(a) {
    if (a.type !== 'walk') return;
    if (a.lane !== 'walk' || a.state === 'photo') {
      a.lane = 'walk';
      a.state = 'go';
      a.latTarget = this.nav.lane(a.edge, a.from, 'walk', this.rand);
      if (a.tourist) this.say(a, pick(this.rand, SORRY));
      a.scared = 1;
      a.speed = Math.max(a.speed, 1.4);
    }
  }
  annoy(a) {
    this.say(a, pick(this.rand, ANGRY));
    this.bus.emit('annoyed', a);
  }

  /** Collision test against moving traffic. */
  hitTest(x, z, rad, player) {
    let best = null;
    const test = (o, cx, cz, hx, hz, yaw, kind, msg) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const dx = x - cx, dz = z - cz;
      // local: x across, z along
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz);
      const ex = lx - qx, ez = lz - qz;
      const d = Math.hypot(ex, ez);
      if (d < rad) {
        const nlx = d > 1e-5 ? ex / d : 1, nlz = d > 1e-5 ? ez / d : 0;
        const nx = nlx * c + nlz * s, nz = -nlx * s + nlz * c;
        const hit = { nx, nz, depth: rad - d, vx: o.vx || 0, vz: o.vz || 0, kind, message: msg, agent: o.type ? o : null };
        if (!best || hit.depth > best.depth) best = hit;
      }
    };
    this.near(x, z, (o) => {
      if (o.type === 'walk') test(o, o.x, o.z, 0.22, 0.18, o.yaw, 'walk', o.tourist ? 'You ran into a tourist.' : 'You ran into a pedestrian.');
      else if (o.type === 'bike') test(o, o.x, o.z, 0.25, 0.85, o.yaw, 'bike', 'You collided with another cyclist.');
      else test(o, o.x, o.z, (o.van ? 1.95 : 1.78) / 2, o.len / 2, o.yaw, 'car', o.state === 'parked' ? 'You crashed into a delivery van.' : 'You were hit by a car.');
    });
    for (const t of this.trams) for (const sg of t.segments || []) test(t, sg.x, sg.z, 1.2, 5.4, sg.yaw, 'tram', 'Hit by a tram! In Amsterdam the tram always wins.');
    void player;
    return best;
  }

  // ---------------------------------------------------------------------------
  // rendering
  // ---------------------------------------------------------------------------
  render(camera, time) {
    const people = this.people, fleet = this.fleet;
    const m = this._m, q = this._q, v = this._v;
    const cx = camera.position.x, cz = camera.position.z;
    const blinkOn = Math.floor(time * 2.5) % 2 === 0;
    let blinkN = 0;
    for (const a of this.agents) {
      if ((a.x - cx) ** 2 + (a.z - cz) ** 2 > 230 * 230) continue;
      if (a.type === 'bike') {
        this._e.set(0, a.yaw, -a.lean, 'YXZ');
        q.setFromEuler(this._e);
        m.compose(v.set(a.x, a.y, a.z), q, this._s);
        fleet.add(m, a.steer, a.wheel, a.crank, a.color, a.crate);
        const j = riderJoints(m, a.steer, a.crank, { height: a.look.height, footDown: a.speed < 0.3 ? 1 : 0 }, this.joints);
        people.person(j, a.look);
      } else {
        const pose = a.state === 'photo' ? 'photo' : 'walk';
        const j = walkerJoints({ x: a.x, y: a.y, z: a.z, yaw: a.yaw, phase: a.phase, speed: a.state === 'photo' ? 0 : a.speed, height: a.look.height, pose, umbrella: a.umbrella }, this.joints);
        people.person(j, { ...a.look, umbrella: a.umbrella, phone: pose === 'photo' });
      }
    }
    // cars
    for (const set of [this.carSet, this.vanSet]) {
      set.body.count = 0;
      set.rest.count = 0;
    }
    for (const c of this.cars) {
      const set = c.van ? this.vanSet : this.carSet;
      q.setFromAxisAngle(this._v.set(0, 1, 0), c.yaw);
      m.compose(v.set(c.x, c.y, c.z), q, this._s);
      const i = set.body.count;
      if (i >= set.body.instanceMatrix.count) continue;
      set.body.setMatrixAt(i, m);
      set.body.setColorAt(i, this._c.set(c.color));
      set.rest.setMatrixAt(i, m);
      set.body.count = set.rest.count = i + 1;
      if (c.state === 'parked' && blinkOn && blinkN + 4 <= 48) {
        const hl = set.len / 2;
        for (const [sx, sz] of [[-0.75, -hl], [0.75, -hl], [-0.75, hl], [0.75, hl]]) {
          const wx = c.x + sx * Math.cos(c.yaw) + sz * Math.sin(c.yaw);
          const wz = c.z - sx * Math.sin(c.yaw) + sz * Math.cos(c.yaw);
          this.blinkers.setMatrixAt(blinkN++, new THREE.Matrix4().makeTranslation(wx, c.y + 0.8, wz));
        }
      }
    }
    this.blinkers.count = blinkN;
    this.blinkers.instanceMatrix.needsUpdate = true;
    for (const set of [this.carSet, this.vanSet]) {
      set.body.instanceMatrix.needsUpdate = true;
      set.rest.instanceMatrix.needsUpdate = true;
      if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
    }
    // boats
    this.boatTour.count = 0;
    this.boatSmall.count = 0;
    for (const b of this.boats) {
      const mesh = b.tour ? this.boatTour : this.boatSmall;
      q.setFromAxisAngle(this._v.set(0, 1, 0), b.yaw);
      m.compose(v.set(b.x, L.WATER_Y + 0.05 + Math.sin(time * 1.3 + b.th * 50) * 0.03, b.z), q, this._s);
      mesh.setMatrixAt(mesh.count++, m);
    }
    this.boatTour.instanceMatrix.needsUpdate = true;
    this.boatSmall.instanceMatrix.needsUpdate = true;
  }
}

export { JACKETS };
