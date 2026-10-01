// Fietsen in Amsterdam — entry point.
import * as THREE from 'three';
import * as L from './city/layout.js';
import { createMaterials } from './city/materials.js';
import { StreetBuilder } from './city/streets.js';
import { HouseBuilder } from './city/houses.js';
import { PropBuilder } from './city/props.js';
import { LandmarkBuilder, isExcluded, LANDMARKS } from './city/landmarks.js';
import { StaticColliders } from './city/collision.js';
import { PeopleRenderer, randomLook } from './models/people.js';
import { BikeFleet } from './models/bike.js';
import { Player } from './sim/player.js';
import { Environment, amsterdamNowHours, sunDirection } from './sim/environment.js';
import { NavGraph } from './sim/nav.js';
import { Traffic } from './sim/traffic.js';
import { AudioEngine } from './sim/audio.js';
import { Game, TrafficLights, fmtTime } from './sim/game.js';
import { Input, Bus } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { clamp, mulberry32 } from './util/math.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const DPR = window.devicePixelRatio || 1;
const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowSize: 1024, lampLights: 2, cyclists: 22, walkers: 34, cars: 8, boats: 5, rainDrops: 2500, far: 900 },
  medium: { pixelRatio: Math.min(DPR, 1.5), shadows: true, shadowSize: 1024, lampLights: 4, cyclists: 36, walkers: 58, cars: 12, boats: 8, rainDrops: 5000, far: 1250 },
  high: { pixelRatio: Math.min(DPR, 2), shadows: true, shadowSize: 2048, lampLights: 8, cyclists: 50, walkers: 80, cars: 16, boats: 10, rainDrops: 8000, far: 2200 },
};
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const options = { mode: 'free', time: 'live', weather: 'live', quality: params.get('q') || (isTouch ? 'low' : 'medium') };
const MANUAL = params.has('manual');

async function boot() {
  if (isTouch) document.body.classList.add('touch');
  const progress = (f, text) => {
    $('load-fill').style.width = `${Math.round(f * 100)}%`;
    $('load-text').textContent = text;
  };
  const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(QUALITY[options.quality].pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  $('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, QUALITY[options.quality].far);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const now = new Date();
  const autumn = now.getMonth() >= 8 && now.getMonth() <= 10;
  progress(0.05, 'Mixing the paint for the canal houses…');
  await nextFrame();
  const mats = createMaterials();
  progress(0.15, 'Laying the klinkers and digging the canals…');
  await nextFrame();
  const streets = new StreetBuilder(mats);
  streets.build(scene);
  progress(0.4, 'Building canal houses (they lean a little, that is normal)…');
  await nextFrame();
  const houses = new HouseBuilder(mats, isExcluded);
  houses.build(scene);
  progress(0.6, `Planting elms and parking a few thousand bikes…`);
  await nextFrame();
  const colliders = new StaticColliders();
  const props = new PropBuilder(mats, colliders, isExcluded, { autumn });
  props.build(scene);
  progress(0.75, 'Raising the Westertoren and Centraal Station…');
  await nextFrame();
  const landmarks = new LandmarkBuilder(mats, colliders);
  landmarks.build(scene, streets);
  progress(0.85, 'Waking up the city…');
  await nextFrame();

  const bus = new Bus();
  const env = new Environment(renderer, scene, mats, QUALITY[options.quality]);
  env.makeLampGlows(props.lamps, mats.tex.glow);
  const nav = new NavGraph();
  const people = new PeopleRenderer(scene, 320);
  const fleet = new BikeFleet(scene, 80);
  const player = new Player(scene, colliders, bus);
  const traffic = new Traffic(scene, nav, people, fleet, bus, QUALITY[options.quality]);
  const lights = new TrafficLights(scene, nav, mats);
  traffic.lights = lights;
  const audio = new AudioEngine();
  const hud = new Hud();
  const minimap = new Minimap($('minimap'), $('bigmap-canvas'));
  const input = new Input(renderer.domElement, bus);
  input.bindTouch($('touch'));
  const game = new Game({ scene, nav, player, traffic, env, audio, hud, bus, lights, people, addresses: houses.addresses });
  const playerLook = { ...randomLook(mulberry32(5)), jacket: '#2b4d6e', pants: '#2a2f38', skin: '#e8b892', shoes: '#151515', height: 1 };
  progress(1, 'Klaar! (Ready!)');
  await nextFrame();

  // start position: in front of Centraal Station, facing the city
  player.reset({ x: 0, z: -356, yaw: Math.PI });
  traffic.spawnAll(player);
  env.setPreset('cloudy');
  env.applyImmediately();
  env.hours = amsterdamNowHours();

  // ---------------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------------
  let playing = false, paused = false, showBig = false;
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  for (const group of document.querySelectorAll('.opts')) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      for (const x of group.querySelectorAll('button')) x.classList.toggle('on', x === b);
      const key = group.dataset.opt, v = b.dataset.v;
      if (key in options) options[key] = v;
      if (key === 'timescale') env.timeScale = +v;
      if (key === 'weather2') {
        env.setPreset(v);
        env.dynamic = false;
      }
      if (key === 'density') {
        traffic.density = +v;
        traffic.spawnAll(player);
      }
      if (key === 'quality') applyQuality(v);
    });
  }
  // default quality button state
  for (const b of document.querySelectorAll('[data-opt="quality"] button')) b.classList.toggle('on', b.dataset.v === options.quality);
  $('volume').addEventListener('input', (e) => audio.setVolume(+e.target.value));

  function applyQuality(name) {
    const q = QUALITY[name];
    renderer.setPixelRatio(q.pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    env.quality = q;
    env.sun.castShadow = q.shadows;
    if (q.shadowSize !== env.sun.shadow.mapSize.x) {
      env.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (env.sun.shadow.map) {
        env.sun.shadow.map.dispose();
        env.sun.shadow.map = null;
      }
    }
    env.lampLights.forEach((l, i) => (l.visible = i < q.lampLights));
    camera.far = q.far;
    camera.updateProjectionMatrix();
    traffic.q = q;
  }
  applyQuality(options.quality);

  function goldenHour() {
    // find the evening hour where the sun is ~5 degrees high
    let best = 18.5;
    for (let h = 15; h < 22; h += 0.05) {
      const s = sunDirection(h, env.dayOfYear, env.offset);
      if (s.elevation < 5) {
        best = h;
        break;
      }
    }
    return best - 0.3;
  }

  async function startGame() {
    audio.start();
    $('menu').classList.add('hidden');
    if (isTouch) $('touch').classList.remove('hidden');
    hud.show(true);
    // time
    env.hours = options.time === 'live' ? amsterdamNowHours() : options.time === 'golden' ? goldenHour() : +options.time;
    // weather
    env.dynamic = options.weather === 'dutch';
    if (options.weather === 'live') {
      hud.toast('Fetching the current weather in Amsterdam…', 'info', 2.5);
      const ok = await env.fetchLive();
      if (!ok) {
        env.setPreset('cloudy');
        env.dynamic = true;
        hud.toast('Live weather unavailable here, so you get typically Dutch weather instead.', 'warn', 4);
      }
    } else if (options.weather === 'dutch') env.setPreset('cloudy');
    else env.setPreset(options.weather);
    env.applyImmediately();
    player.reset({ x: 0, z: -356, yaw: Math.PI });
    player.camJump = true;
    traffic.density = 1;
    game.start(options.mode);
    traffic.spawnAll(player);
    if (env.darkness > 0.55) player.light = true;
    playing = true;
    paused = false;
    input.enabled = true;
    if (isTouch) hud.toast('Hold Pedal to ride, drag the pad to steer, 🔔 to ring your bell.', 'info', 6);
    else {
      hud.hint('W pedal · A/D steer · Space bell · Q/E gears · mouse to look around · Esc pause');
      setTimeout(() => hud.hint(''), 9000);
    }
    if (options.mode === 'free') hud.toast('Welkom in Amsterdam! Ride down the Damrak to the Dam.', 'info', 5);
  }
  $('start').addEventListener('click', startGame);

  function setPaused(p) {
    if (!playing) return;
    paused = p;
    $('pause').classList.toggle('hidden', !p);
    if (p) {
      if (document.pointerLockElement) document.exitPointerLock();
      const s = player.stats;
      $('stats').innerHTML = [
        ['Distance', `${(s.distance / 1000).toFixed(2)} km`],
        ['Riding time', fmtTime(s.time)],
        ['Top speed', `${(s.topSpeed * 3.6).toFixed(1)} km/h`],
        ['Bridges crossed', s.bridges],
        ['Crashes', s.crashes],
        ['Canal swims', s.splashes],
        ['Fines', `€${game.fines.reduce((a, f) => a + f.amount, 0)}`],
        ['Landmarks', `${game.discovered.size}/${LANDMARKS.length}`],
      ].map(([k, v]) => `<div>${k}</div><div><b>${v}</b></div>`).join('');
    }
  }
  $('resume').addEventListener('click', () => setPaused(false));
  $('t-pause').addEventListener('click', () => setPaused(true));
  $('to-menu').addEventListener('click', () => {
    setPaused(false);
    playing = false;
    input.enabled = false;
    hud.show(false);
    $('touch').classList.add('hidden');
    $('menu').classList.remove('hidden');
    game.clearTarget();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing && !paused) setPaused(true);
  });

  bus.on('key', (code) => {
    if (code === 'Escape' || code === 'KeyP') {
      if (showBig) toggleBig();
      else if (playing) setPaused(!paused);
      return;
    }
    if (!playing || paused) return;
    switch (code) {
      case 'Space':
        audio.bell(null, 2150);
        player.ringBell();
        traffic.onBell(player.x, player.z, player.fwdX, player.fwdZ);
        break;
      case 'KeyQ': player.shift(-1); audio.click(); break;
      case 'KeyE': player.shift(1); audio.click(); break;
      case 'KeyL': player.light = !player.light; audio.click(); break;
      case 'KeyC':
        player.viewMode = player.viewMode === 'fp' ? 'chase' : 'fp';
        player.camJump = true;
        break;
      case 'KeyM': toggleBig(); break;
      case 'KeyZ': player.setSignal(-1); break;
      case 'KeyX': player.setSignal(1); break;
      case 'KeyN':
        if (options.mode === 'tour') game.start('tour');
        if (options.mode === 'delivery') game.newDelivery();
        break;
      case 'KeyR':
        if (player.state === 'ride') player.respawn();
        break;
    }
  });
  function toggleBig() {
    showBig = !showBig;
    $('bigmap').classList.toggle('hidden', !showBig);
  }

  bus.on('crash', (e) => {
    audio.crash();
    hud.overlay('Gevallen!', e.message);
  });
  bus.on('splash', (e) => {
    audio.splash();
    $('vignette').classList.add('water');
    hud.overlay('Plons!', `You rode into the ${e.name || 'canal'}. Every year roughly 12,000 to 15,000 bikes are fished out of Amsterdam's canals. Yours just joined them.`);
  });
  const clearOverlay = () => {
    hud.overlay(null);
    $('vignette').classList.remove('water');
    player.camJump = true;
  };
  bus.on('respawn', clearOverlay);
  bus.on('recover', clearOverlay);
  bus.on('bump', (s) => audio.bump(Math.min(2, s / 2)));
  bus.on('curb', (h) => audio.bump(h * 5));
  bus.on('squeal', () => audio.squeal());
  bus.on('rail', () => audio.bump(0.4));
  bus.on('aiBell', (p) => audio.bell({ x: p.x, y: 1.2, z: p.z }, 1800 + Math.random() * 900));
  bus.on('tramBell', (p) => {
    audio.tramBell({ x: p.x, y: 2, z: p.z });
    if (Math.hypot(p.x - player.x, p.z - player.z) < 40 && game.once('tram', 8)) hud.toast('🚋 Tram bell! Get off the tracks.', 'warn', 2);
  });
  bus.on('honk', (p) => audio.honk({ x: p.x, y: 1, z: p.z }));
  bus.on('annoyed', (a) => {
    if (a && a.speech) audio.say(a.speech.text);
  });

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------------------------------------------------------------------------
  // main loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  let frame = 0;
  let menuT = 0;
  let lastQuarter = -1;
  const camFwd = new THREE.Vector3();
  const tower = landmarks.towerTop || { x: 0, y: 60, z: 0 };
  const noInput = { pedal: 0, brake: 0, steer: 0, sprint: false };

  let manualDt = 0;
  function loop(now) {
    if (!MANUAL) requestAnimationFrame(loop);
    let dt = MANUAL ? manualDt : Math.min(0.05, (now - last) / 1000);
    last = now;
    frame++;
    if (paused) dt = 0;
    const active = playing && !paused;
    const inp = active ? input.update(dt) : noInput;
    if (active) {
      const m = input.consumeMouse();
      if (m.dx || m.dy) {
        player.look.yaw = clamp(player.look.yaw - m.dx * 0.0025, -2.0, 2.0);
        player.look.pitch = clamp(player.look.pitch - m.dy * 0.0025, -0.9, 0.7);
        player.look.lastMove = 0;
      }
    } else input.consumeMouse();
    if (dt > 0) {
      if (playing) player.update(dt, inp, env, traffic);
      traffic.update(dt, player, env, camera, lights);
      if (playing) game.update(dt);
    }
    // visuals
    people.begin();
    fleet.begin();
    if (playing) player.updateVisual(dt, people, playerLook);
    else player.root.visible = false;
    if (playing) player.root.visible = true;
    traffic.render(camera, env.t);
    game.render();
    people.end();
    fleet.end();
    if (playing) player.updateCamera(camera, dt, env);
    else {
      // cinematic menu camera gliding along the Herengracht
      menuT += dt;
      const th = -0.35 + menuT * 0.012;
      const r = 355;
      camera.position.set(r * Math.sin(th), 9 + Math.sin(menuT * 0.2) * 2, r * Math.cos(th));
      const t2 = th + 0.06;
      camera.lookAt(r * Math.sin(t2), 4, r * Math.cos(t2));
    }
    env.update(dt, camera, playing ? { x: player.x, y: player.y, z: player.z } : camera.position, props.lamps);
    streets.bulbMesh.visible = env.darkness > 0.3;
    if (landmarks.bulbMesh) landmarks.bulbMesh.visible = env.darkness > 0.3;
    if (frame % 10 === 0) props.updateLOD(camera.position);
    // church bells every quarter hour
    const quarter = Math.floor(env.hours * 4);
    if (quarter !== lastQuarter) {
      if (lastQuarter !== -1 && playing) {
        const q = quarter % 4;
        const h = Math.floor(env.hours) % 12 || 12;
        audio.carillon(tower, q, q === 0 ? h : 0);
      }
      lastQuarter = quarter;
    }
    if (playing) {
      camera.getWorldDirection(camFwd);
      const fx = player.fwdX, fz = player.fwdZ;
      let tramDist = 999;
      for (const t of traffic.trams) tramDist = Math.min(tramDist, Math.hypot(t.x - player.x, t.z - player.z));
      audio.update(dt, {
        camera: camera.position,
        camFwd,
        speed: player.v,
        riding: player.state === 'ride',
        pedalling: inp.pedal > 0,
        roughness: player.roughness,
        airSpeed: player.v - (env.wind.x * fx + env.wind.z * fz),
        windSpeed: env.wind.speed,
        rain: env.weather.rain,
        wet: env.wet,
        night: env.darkness,
        trafficNear: 1,
        tramDist,
        nearIJ: player.z < -250,
      });
      hud.update(dt, { player, env, game, camera, traffic });
      if (frame % 2 === 0) minimap.draw(player, game.route, game.target, { trams: traffic.trams });
      if (showBig && frame % 6 === 0) minimap.drawBig(player, game.route, game.target, game.discovered);
    }
    if (!MANUAL || manualDt === 0) renderer.render(scene, camera);
    if (params.has('debug') && frame % 60 === 0) {
      const i = renderer.info.render;
      console.log(`calls ${i.calls} tris ${i.triangles} fps ~${Math.round(1 / Math.max(dt, 1e-3))}`);
    }
  }
  if (!MANUAL) requestAnimationFrame(loop);

  // Automated testing: advance the simulation without rendering, then draw one frame.
  const advance = (seconds, keys = []) => {
    for (const k of keys) input.keys.add(k);
    const steps = Math.round(seconds / (1 / 30));
    for (let i = 0; i < steps; i++) {
      manualDt = 1 / 30;
      loop(performance.now());
    }
    for (const k of keys) input.keys.delete(k);
    manualDt = 0;
    loop(performance.now());
  };

  // test hooks for automated screenshots
  window.__game = { player, env, game, traffic, options, startGame, camera, renderer, L, setPaused, advance, input, bus, hud };
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('load-text');
  if (t) t.textContent = 'Something went wrong while building the city: ' + e.message;
});
