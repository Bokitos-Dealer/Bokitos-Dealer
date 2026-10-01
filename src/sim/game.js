// Rules of the road, police & fines, reputation, missions and discovery.
import * as THREE from 'three';
import * as L from '../city/layout.js';
import { clamp, mulberry32, pick, range, wrapAngle, DEG } from '../util/math.js';
import { LANDMARKS } from '../city/landmarks.js';
import { stripRanges, carriageway } from '../city/streets.js';
import { walkerJoints, newJoints } from '../models/rider.js';

const FOODS = ['Stamppot boerenkool', 'Bitterballen (12x)', 'Patat met mayo', 'Kibbeling', 'Pizza margherita', 'Shoarma broodje', 'Kapsalon', 'Pad thai', 'Rijsttafel for two', 'Poffertjes', 'Poké bowl', 'Erwtensoep', 'Sushi box', 'Falafel wrap'];
const RESTAURANTS = ['Eetcafé De Gracht', 'Snackbar Het Hoekje', 'Pizzeria Bella', 'Wok To Walk-in', 'Café Het Paleis', 'De Pannenkoekenboot', 'Febo-ish Automatiek', 'Thai Corner', 'Sushi Singel', 'Broodjeszaak Jordaan'];

// --- traffic lights -------------------------------------------------------------
const LIGHT_SPOTS = [
  ['Stadhouderskade', 'Vijzelstraat'],
  ['Stadhouderskade', 'Leidsestraat'],
  ['Stadhouderskade', 'Raadhuisstraat'],
  ['Stadhouderskade', 'Utrechtsestraat'],
  ['Stadhouderskade', 'Spiegelstraat'],
  ['Prins Hendrikkade', 'Damrak'],
  ['Singel', 'Vijzelstraat'],
];

export class TrafficLights {
  constructor(scene, nav, mats) {
    this.list = [];
    const bulbs = [];
    for (const [bandName, dvName] of LIGHT_SPOTS) {
      for (const b of L.BANDS) {
        if (b.name !== bandName || (b.type !== 'street' && b.type !== 'quay')) continue;
        const dv = L.STREET_DIVIDERS.find((d) => d.name === dvName && L.dividerCovers(d, b.r0, b.r1));
        if (!dv) continue;
        const node = nav.nodeMap.get(`b${b.id}:d${dv.id}`);
        if (!node) continue;
        const [c0, c1] = carriageway(b.xs);
        const [d0, d1] = carriageway(dv.xs);
        const tl = { band: b, dv, node, rc: [b.r0 + c0, b.r0 + c1], dc: [dv.off - dv.hw + d0, dv.off - dv.hw + d1], phase: Math.random() * 42, heads: [] };
        node.light = tl;
        // poles at the four corners
        const strips = stripRanges(b.xs, b.r0);
        void strips;
        for (const sr of [-1, 1])
          for (const sd of [-1, 1]) {
            const r = sr < 0 ? tl.rc[0] - 0.6 : tl.rc[1] + 0.6;
            const d = sd < 0 ? tl.dc[0] - 0.6 : tl.dc[1] + 0.6;
            const s = Math.sqrt(Math.max(0, r * r - d * d));
            const P = L.dividerPoint(dv, s, d);
            // head facing traffic coming along the divider (radial approach) on one side, ring on the other
            const kind = (sr < 0) === (sd < 0) ? 'radial' : 'ring';
            tl.heads.push({ x: P.x, z: P.z, kind, bulbs: bulbs.length });
            for (let k = 0; k < 3; k++) bulbs.push({ x: P.x, y: 3.2 - k * 0.32, z: P.z, kind, color: k });
          }
        this.list.push(tl);
        break;
      }
    }
    // geometry: poles + heads (static), bulbs (instanced, colour updated)
    const poleG = new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6).translate(0, 1.8, 0);
    const headG = new THREE.BoxGeometry(0.32, 1.05, 0.25).translate(0, 2.88, 0);
    const n = this.list.reduce((a, t) => a + t.heads.length, 0);
    this.poles = new THREE.InstancedMesh(poleG, mats.m.iron, n);
    this.headsMesh = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 }), n);
    const M = new THREE.Matrix4();
    let i = 0;
    for (const tl of this.list) for (const h of tl.heads) {
      M.makeTranslation(h.x, L.heightAt(h.x, h.z) + 0.12, h.z);
      this.poles.setMatrixAt(i, M);
      this.headsMesh.setMatrixAt(i, M);
      i++;
    }
    scene.add(this.poles, this.headsMesh);
    this.bulbs = bulbs;
    this.bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
    bulbs.forEach((b, k) => this.bulbMesh.setMatrixAt(k, M.makeTranslation(b.x, b.y + L.heightAt(b.x, b.z), b.z)));
    this.bulbMesh.setColorAt(0, new THREE.Color());
    scene.add(this.bulbMesh);
    this.col = new THREE.Color();
  }
  /** 'green' | 'amber' | 'red' for an approach kind. */
  state(tl, kind) {
    const p = tl.phase % 42;
    // 0-16 radial green, 16-19 radial amber, 19-21 all red, 21-37 ring green, 37-40 ring amber, 40-42 all red
    if (kind === 'radial') return p < 16 ? 'green' : p < 19 ? 'amber' : 'red';
    return p >= 21 && p < 37 ? 'green' : p >= 37 && p < 40 ? 'amber' : 'red';
  }
  update(dt) {
    const colors = [
      [0xff2a1a, 0x3a0805],
      [0xffb000, 0x3a2800],
      [0x2aff6a, 0x06301a],
    ];
    for (const tl of this.list) {
      tl.phase += dt;
      for (const h of tl.heads) {
        const st = this.state(tl, h.kind);
        const on = st === 'red' ? 0 : st === 'amber' ? 1 : 2;
        for (let k = 0; k < 3; k++) this.bulbMesh.setColorAt(h.bulbs + k, this.col.set(colors[k][k === on ? 0 : 1]));
      }
    }
    this.bulbMesh.instanceColor.needsUpdate = true;
  }
  /** Which light box (if any) contains (x,z). Returns { tl, kind of approach }. */
  inBox(x, z) {
    for (const tl of this.list) {
      const r = Math.hypot(x, z);
      if (r < tl.rc[0] || r > tl.rc[1]) continue;
      const d = L.perpDist(tl.dv, x, z);
      if (d < tl.dc[0] || d > tl.dc[1]) continue;
      return tl;
    }
    return null;
  }
}

// --- the game ------------------------------------------------------------------
export class Game {
  constructor({ scene, nav, player, traffic, env, audio, hud, bus, lights, people, addresses }) {
    Object.assign(this, { scene, nav, player, traffic, env, audio, hud, bus, lights, people, addresses });
    this.money = 0;
    this.rep = 50;
    this.mode = 'free';
    this.discovered = new Set();
    this.rand = mulberry32(Date.now() & 0xffff);
    this.route = null;
    this.routeTimer = 0;
    this.target = null;
    this.mission = null;
    this.timers = { sidewalk: 0, nolight: 0, lightWarned: 0, wrongWay: 0 };
    this.inLight = null;
    this.police = [];
    this.policeTimer = 0;
    this.lastTurnYaw = player.yaw;
    this.turnAcc = 0;
    this.signalUsed = 0;
    this.fines = [];
    this.joints = newJoints();
    this.policeLook = { skin: '#e0ac85', hair: '#2a1d14', jacket: '#d7f03a', pants: '#1b2333', shoes: '#111', build: 1.05, height: 1.02 };
    // 3D target beacon
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb627, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffb627 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    this.beacon = new THREE.Group();
    this.beacon.add(beam, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.placePolice();
    bus.on('crash', (e) => this.onCrash(e));
    bus.on('splash', () => this.onSplash());
    bus.on('annoyed', () => this.addRep(-3));
    bus.on('blocking', () => {
      if (this.once('blocking', 25)) this.hud.toast('A local rings their bell at you. Keep right so others can pass!', 'warn');
      this.addRep(-0.5);
    });
  }

  /** true at most once every `secs` seconds per key (rate-limits messages). */
  once(key, secs) {
    const now = this.player.stats.time;
    this.cool = this.cool || {};
    if (this.cool[key] !== undefined && now - this.cool[key] < secs) return false;
    this.cool[key] = now;
    return true;
  }

  addRep(d) {
    this.rep = clamp(this.rep + d, 0, 100);
  }

  // ---- police -------------------------------------------------------------------
  placePolice() {
    this.police = [];
    const spots = this.nav.nodes.filter((n) => n.edges.length >= 4);
    for (let i = 0; i < 4; i++) {
      const n = pick(this.rand, spots);
      const a = this.rand() * Math.PI * 2;
      this.police.push({ x: n.x + Math.cos(a) * 9, z: n.z + Math.sin(a) * 9, yaw: this.rand() * 6.28 });
    }
  }
  policeNear(x, z, r) {
    for (const p of this.police) if (Math.hypot(p.x - x, p.z - z) < r) return p;
    return null;
  }
  fine(amount, reason) {
    this.money -= amount;
    this.fines.push({ amount, reason });
    this.audio.fine();
    this.hud.toast(`🚓 Boete! €${amount} — ${reason}`, 'bad', 5);
    this.addRep(-4);
  }

  // ---- missions ------------------------------------------------------------------
  start(mode) {
    this.mode = mode;
    this.mission = null;
    this.target = null;
    if (mode === 'delivery') this.newDelivery();
    if (mode === 'tour') this.startTour();
    if (mode === 'commute') this.startCommute();
    if (mode === 'free') this.hud.setMission('Free ride', 'Explore Amsterdam. Discover the landmarks (0/' + LANDMARKS.length + ').', '');
  }

  setTarget(x, z, label) {
    this.target = { x, z, label };
    this.beacon.visible = true;
    this.beacon.position.set(x, L.heightAt(x, z), z);
    this.routeTimer = 0;
  }
  clearTarget() {
    this.target = null;
    this.route = null;
    this.beacon.visible = false;
  }

  randomAddress(minD, maxD, from = this.player) {
    for (let i = 0; i < 200; i++) {
      const a = pick(this.rand, this.addresses);
      const d = Math.hypot(a.x - from.x, a.z - from.z);
      if (d > minD && d < maxD && L.surfaceAt(a.x, a.z).kind !== 'building') return a;
    }
    return this.addresses[0];
  }

  /** One of the k addresses closest to (x,z). */
  addressNear(x, z, k = 12) {
    const sorted = this.addresses
      .map((a) => [Math.hypot(a.x - x, a.z - z), a])
      .sort((p, q) => p[0] - q[0])
      .slice(0, k);
    return sorted[Math.floor(this.rand() * sorted.length)][1];
  }

  newDelivery() {
    const shop = this.randomAddress(150, 450);
    const name = pick(this.rand, RESTAURANTS);
    this.mission = { kind: 'delivery', stage: 'pickup', shop, shopName: name, food: pick(this.rand, FOODS), crashesAtStart: this.player.stats.crashes, finesAtStart: this.fines.length, order: 1000 + Math.floor(this.rand() * 9000) };
    this.setTarget(shop.x, shop.z, name);
    this.hud.setMission('🛵 Delivery', `Pick up order #${this.mission.order} at ${name}, ${shop.street} ${shop.number}`, '');
    this.hud.toast(`New order: ${this.mission.food}`, 'info');
  }

  startTour() {
    const left = LANDMARKS.filter((l) => l.id !== 'dam');
    const order = [];
    let cur = { x: this.player.x, z: this.player.z };
    while (left.length) {
      left.sort((a, b) => Math.hypot(a.pos.x - cur.x, a.pos.z - cur.z) - Math.hypot(b.pos.x - cur.x, b.pos.z - cur.z));
      const n = left.shift();
      order.push(n);
      cur = n.pos;
    }
    this.mission = { kind: 'tour', order, idx: 0, t0: this.player.stats.time };
    this.nextTourStop();
  }
  nextTourStop() {
    const m = this.mission;
    if (m.idx >= m.order.length) {
      const t = this.player.stats.time - m.t0;
      this.hud.toast(`🏁 Tour complete in ${fmtTime(t)}! You've seen the highlights of Amsterdam.`, 'good', 8);
      this.money += 25;
      this.audio.coin();
      this.clearTarget();
      this.mission = null;
      this.hud.setMission('Tour complete', `Time: ${fmtTime(t)} · Press N for a new tour`, '');
      return;
    }
    const lm = m.order[m.idx];
    this.setTarget(lm.pos.x, lm.pos.z, lm.name);
    this.hud.setMission('🗺️ City tour', `Stop ${m.idx + 1}/${m.order.length}: ${lm.name}`, '');
  }

  startCommute() {
    // morning rush hour: from the Jordaan side to an office on the east side
    const home = this.addressNear(L.polarX(505, -100 * DEG), L.polarZ(505, -100 * DEG));
    const work = this.addressNear(L.polarX(470, 70 * DEG), L.polarZ(470, 70 * DEG));
    // leave the front door and ride along the street, in the direction of work
    const out = Math.atan2(-home.nx, -home.nz);
    const toWork = { x: work.x - home.x, z: work.z - home.z };
    const score = (y) => -Math.sin(y) * toWork.x - Math.cos(y) * toWork.z;
    const yaw = score(out + Math.PI / 2) > score(out - Math.PI / 2) ? out + Math.PI / 2 : out - Math.PI / 2;
    this.player.reset({ x: home.x + home.nx * 1.5, z: home.z + home.nz * 1.5, yaw });
    this.player.camJump = true;
    this.env.hours = 8 + 31 / 60;
    this.traffic.density = 1.5;
    this.mission = { kind: 'commute', work, deadline: 9 };
    this.setTarget(work.x, work.z, 'Office');
    this.hud.setMission('💼 Commute', `Get to work at ${work.street} ${work.number} before 09:00`, '');
    this.hud.toast('Rush hour! Thousands of Amsterdammers are on their way to work.', 'info', 5);
  }

  // ---- events --------------------------------------------------------------------
  onCrash(e) {
    this.addRep(e.info && e.info.kind === 'walk' ? -8 : -4);
    if (e.info && e.info.agent) this.traffic.annoy(e.info.agent);
    if (this.mission && this.mission.kind === 'delivery') this.mission.damaged = true;
  }
  onSplash() {
    this.addRep(-2);
    if (this.mission && this.mission.kind === 'delivery' && this.mission.stage === 'deliver') {
      this.mission.soaked = true;
    }
  }

  // ---- per frame -------------------------------------------------------------------
  update(dt) {
    const p = this.player;
    const surf = p.surface || L.surfaceAt(p.x, p.z);
    this.lights.update(dt);
    // police shuffle
    this.policeTimer += dt;
    if (this.policeTimer > 420) {
      this.policeTimer = 0;
      this.placePolice();
    }
    if (p.state !== 'ride') return;

    // discovery
    for (const lm of LANDMARKS) {
      if (this.discovered.has(lm.id)) continue;
      if (Math.hypot(p.x - lm.pos.x, p.z - lm.pos.z) < lm.radius) {
        this.discovered.add(lm.id);
        this.audio.chime();
        this.hud.discover(lm, this.discovered.size, LANDMARKS.length);
        this.addRep(1);
        if (this.mode === 'free') this.hud.setMission('Free ride', `Explore Amsterdam. Landmarks discovered: ${this.discovered.size}/${LANDMARKS.length}`, '');
      }
    }

    // red lights
    const box = this.lights.inBox(p.x, p.z);
    if (box && box !== this.inLight && p.v > 1) {
      const u = { x: Math.sin(box.dv.th), z: Math.cos(box.dv.th) };
      const along = Math.abs(p.fwdX * u.x + p.fwdZ * u.z);
      const kind = along > 0.7 ? 'radial' : 'ring';
      const st = this.lights.state(box, kind);
      if (st === 'red') {
        const cop = this.policeNear(p.x, p.z, 70);
        if (cop) this.fine(110, 'Door rood licht gereden (ran a red light)');
        else {
          if (this.once('red', 30)) this.hud.toast('You ran a red light. Locals do it all the time… but it is still €110 if the police see you.', 'warn', 4);
          this.addRep(-1);
        }
      }
    }
    this.inLight = box;

    // lights at night
    const dark = this.env.darkness > 0.55;
    if (dark && !p.light && p.v > 1) {
      this.timers.nolight += dt;
      if (this.timers.nolight > 4 && this.timers.lightWarned <= 0) {
        this.hud.toast('It is dark — turn on your bike light (L). Riding without lights costs €65.', 'warn', 4);
        this.timers.lightWarned = 30;
      }
      if (this.timers.nolight > 8 && this.policeNear(p.x, p.z, 45)) {
        this.fine(65, 'Fietsen zonder licht (no bike light)');
        this.timers.nolight = -60;
      }
    } else this.timers.nolight = Math.min(this.timers.nolight, 0) + (this.timers.nolight < 0 ? dt : 0);
    this.timers.lightWarned -= dt;

    // sidewalk
    if (surf.kind === 'side' && p.v > 2.2) {
      this.timers.sidewalk += dt;
      if (this.timers.sidewalk > 2.5) {
        if (this.policeNear(p.x, p.z, 40)) {
          this.fine(110, 'Fietsen op de stoep (riding on the pavement)');
          this.timers.sidewalk = -30;
        } else if (this.timers.sidewalk > 2.5 && this.timers.sidewalk < 2.5 + dt * 1.5) {
          this.hud.toast('You are riding on the pavement (stoep). Pedestrians glare at you.', 'warn', 3);
          this.addRep(-1);
        }
      }
    } else if (this.timers.sidewalk > 0) this.timers.sidewalk = 0;
    else this.timers.sidewalk = Math.min(0, this.timers.sidewalk + dt);

    // ghost cyclist (spookfietser)
    let wrong = false;
    if (surf.kind === 'bike') {
      if (surf.divider) {
        const u = { x: Math.sin(surf.divider.th), z: Math.cos(surf.divider.th) };
        const out = p.fwdX * u.x + p.fwdZ * u.z;
        if (Math.abs(out) > 0.5) wrong = (surf.lateral < 0) !== (out > 0);
      } else if (surf.band) {
        const th = Math.atan2(p.x, p.z);
        const t = p.fwdX * Math.cos(th) - p.fwdZ * Math.sin(th);
        const r = Math.hypot(p.x, p.z);
        const mid = surf.band.r0 + (surf.band.r1 - surf.band.r0) * 0.45;
        if (Math.abs(t) > 0.5) wrong = (r > mid) !== (t > 0);
      }
    }
    if (wrong && p.v > 2) {
      this.timers.wrongWay += dt;
      if (this.timers.wrongWay > 1.5 && this.timers.wrongWay < 1.5 + dt * 1.5) {
        this.hud.toast('👻 Spookfietser! You are riding against traffic in the bike lane. Keep right!', 'warn', 4);
        this.addRep(-2);
        this.audio.bell({ x: p.x + p.fwdX * 10, y: 1.2, z: p.z + p.fwdZ * 10 }, 2400);
      }
    } else this.timers.wrongWay = 0;

    // hand signals before turns
    const dyaw = wrapAngle(p.yaw - this.lastTurnYaw);
    this.lastTurnYaw = p.yaw;
    this.turnAcc = this.turnAcc * Math.exp(-dt / 2.5) + dyaw;
    if (p.signal) this.signalUsed = 3;
    this.signalUsed -= dt;
    if (Math.abs(this.turnAcc) > 1.2) {
      if (this.signalUsed > 0) {
        this.addRep(1.5);
        if (this.once('signal', 15)) this.hud.toast('👋 Nice hand signal! The locals approve.', 'good', 2.5);
      }
      this.turnAcc = 0;
    }
    // rain makes you a true Amsterdammer
    if (this.env.weather.rain > 0.3 && p.v > 2) this.addRep(dt * 0.02);

    this.updateMission(dt);
    this.updateRoute(dt);
    if (this.beacon.visible) this.beacon.children[1].rotation.z += dt;
  }

  updateMission(dt) {
    const p = this.player, m = this.mission;
    if (!m) return;
    const tdist = this.target ? Math.hypot(p.x - this.target.x, p.z - this.target.z) : Infinity;
    if (m.kind === 'delivery') {
      if (m.stage === 'pickup' && tdist < 7 && p.v < 1.2) {
        m.stage = 'deliver';
        m.customer = this.randomAddress(450, 1100);
        const d = Math.hypot(m.customer.x - p.x, m.customer.z - p.z);
        m.timeLimit = Math.round(d * 1.45 / 4.6 + 45);
        m.t = 0;
        this.audio.chime();
        this.setTarget(m.customer.x, m.customer.z, 'Customer');
        this.hud.toast(`Picked up: ${m.food}. Deliver it hot!`, 'good');
        return;
      }
      if (m.stage === 'deliver') {
        m.t += dt;
        const left = m.timeLimit - m.t;
        this.hud.setMission('🛵 Delivery', `Deliver ${m.food} to ${m.customer.street} ${m.customer.number}`, `${left >= 0 ? '⏱ ' + fmtTime(left) : '⏱ late ' + fmtTime(-left)}`);
        if (tdist < 7 && p.v < 1.2) {
          let pay = 6.5;
          let tip = left > 0 ? Math.min(6, left / 20) : 0;
          let note = left > 0 ? 'On time!' : 'Late…';
          if (m.damaged) { tip *= 0.3; note += ' The food got a bit squashed.'; }
          if (m.soaked) { tip = 0; pay *= 0.5; note += ' …and it went for a swim in the canal.'; }
          const stars = clamp(Math.round((left > 0 ? 4 : 2) + (tip > 3 ? 1 : 0) - (m.damaged ? 1 : 0) - (m.soaked ? 2 : 0)), 1, 5);
          this.money += pay + tip;
          this.addRep(left > 0 ? 2 : -1);
          this.audio.coin();
          this.hud.toast(`Delivered! €${(pay + tip).toFixed(2)} (tip €${tip.toFixed(2)}) ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} ${note}`, 'good', 6);
          this.newDelivery();
        }
      } else this.hud.setMission('🛵 Delivery', `Pick up order #${m.order} at ${m.shopName}, ${m.shop.street} ${m.shop.number}`, '');
    }
    if (m.kind === 'tour' && this.target && tdist < Math.max(18, m.order[m.idx].radius * 0.6)) {
      const lm = m.order[m.idx];
      this.audio.chime();
      this.hud.toast(`📍 ${lm.name} — ${lm.fact}`, 'info', 9);
      m.idx++;
      this.nextTourStop();
    }
    if (m.kind === 'commute') {
      const h = this.env.hours;
      const mins = Math.round((m.deadline - h) * 60);
      this.hud.setMission('💼 Commute', `Get to work at ${m.work.street} ${m.work.number} before 09:00`, mins >= 0 ? `${mins} min left` : `${-mins} min late`);
      if (tdist < 8 && p.v < 1.2) {
        const onTime = h <= m.deadline;
        this.audio.coin();
        this.hud.toast(onTime ? `Made it to work on time (${fmtClock(h)}). Lekker gefietst!` : `Te laat! You arrived at ${fmtClock(h)}. Your boss sighs.`, onTime ? 'good' : 'bad', 7);
        this.money += onTime ? 15 : 0;
        this.addRep(onTime ? 3 : -1);
        this.clearTarget();
        this.mission = null;
        this.traffic.density = 1;
        this.hud.setMission('Commute done', 'Free ride: enjoy the city.', '');
      }
    }
  }

  updateRoute(dt) {
    if (!this.target) return;
    this.routeTimer -= dt;
    if (this.routeTimer > 0) return;
    this.routeTimer = 1.5;
    const p = this.player;
    const ne = this.nav.nearestEdge(p.x, p.z);
    const tn = this.nav.nearestEdge(this.target.x, this.target.z);
    if (!ne || !tn) return;
    // choose the edge endpoint ahead of the player
    const startCands = [ne.edge.a, ne.edge.b];
    let best = null;
    for (const s of startCands) {
      for (const g of [tn.edge.a, tn.edge.b]) {
        const r = this.nav.route(s, g);
        if (!r) continue;
        const len = r.reduce((a, x) => a + x.edge.len, 0) + Math.hypot(s.x - p.x, s.z - p.z) + Math.hypot(g.x - this.target.x, g.z - this.target.z);
        if (!best || len < best.len) best = { r, len, s, g };
      }
    }
    if (!best) return;
    const pts = [{ x: p.x, z: p.z }, { x: best.s.x, z: best.s.z }];
    for (const step of best.r) {
      const e = step.edge;
      const fwd = step.from === e.a;
      const n = Math.max(2, Math.ceil(e.len / 12));
      for (let i = 1; i <= n; i++) {
        const s = (e.len * i) / n;
        pts.push(this.nav.pointOn(e, fwd ? s : e.len - s, 0, true));
      }
    }
    pts.push({ x: this.target.x, z: this.target.z });
    this.route = { pts, len: best.len, steps: best.r, start: best.s };
    // next turn instruction
    let acc = Math.hypot(best.s.x - p.x, best.s.z - p.z);
    let instr = `${Math.round(best.len)} m to ${this.target.label}`;
    for (let i = 0; i + 1 < best.r.length; i++) {
      const a = best.r[i], b = best.r[i + 1];
      acc += a.edge.len;
      if (a.edge.name !== b.edge.name) {
        const inDir = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
        const outDir = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        const turn = wrapAngle(outDir - inDir);
        const dirTxt = Math.abs(turn) < 0.4 ? 'continue onto' : turn > 0 ? 'turn left onto' : 'turn right onto';
        if (acc - a.edge.len < 400) instr = `In ${Math.max(10, Math.round((acc - (best.r[0].edge.len - 0)) / 10) * 10)} m ${dirTxt} ${b.edge.name}`;
        break;
      }
    }
    this.hud.setRouteHint(instr, Math.round(best.len));
  }

  render() {
    for (const c of this.police) {
      const j = walkerJoints({ x: c.x, y: L.heightAt(c.x, c.z) + 0.12, z: c.z, yaw: c.yaw, phase: 0, speed: 0, height: 1.02 }, this.joints);
      this.people.person(j, this.policeLook);
    }
  }
}

export function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtClock(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export { range };
