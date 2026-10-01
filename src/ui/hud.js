// Heads-up display (DOM based).
import * as THREE from 'three';
import { GEARS } from '../sim/player.js';
import { fmtClock } from '../sim/game.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      speed: $('h-speed'), gear: $('h-gear'), cadence: $('h-cadence'), stamina: $('h-stamina-fill'),
      clock: $('h-clock'), weather: $('h-weather'), wind: $('h-wind-arrow'), windTxt: $('h-wind-txt'),
      money: $('h-money'), rep: $('h-rep-fill'), repTxt: $('h-rep-txt'), street: $('h-street'),
      mTitle: $('h-m-title'), mText: $('h-m-text'), mTimer: $('h-m-timer'), route: $('h-route'),
      toasts: $('h-toasts'), overlay: $('h-overlay'), overlayTitle: $('h-overlay-title'), overlayText: $('h-overlay-text'),
      light: $('h-light'), speech: $('h-speech'), discover: $('h-discover'), hint: $('h-hint'), slope: $('h-slope'),
    };
    this.lastStreet = '';
    this.streetTimer = 0;
    this.v = new THREE.Vector3();
    this.bubbles = new Map();
  }
  show(on) {
    $('hud').classList.toggle('hidden', !on);
  }
  update(dt, { player, env, game, camera, traffic }) {
    const e = this.el;
    const kmh = player.v * 3.6;
    e.speed.textContent = Math.round(kmh);
    e.gear.innerHTML = GEARS.map((_, i) => `<span class="${i === player.gear ? 'on' : ''}">${i + 1}</span>`).join('');
    e.cadence.textContent = `${Math.round(player.cadence)} rpm · ${Math.round(player.power)} W`;
    e.stamina.style.width = `${Math.round(player.stamina * 100)}%`;
    e.stamina.classList.toggle('low', player.stamina < 0.25);
    const w = env.describe();
    e.clock.textContent = fmtClock(env.hours);
    e.weather.textContent = `${w.label} · ${w.temp}°C`;
    // wind arrow relative to the rider (arrow shows where the wind blows to)
    const windYaw = Math.atan2(-env.wind.x, -env.wind.z);
    const rel = windYaw - player.yaw;
    e.wind.style.transform = `rotate(${-rel}rad)`;
    const head = -(env.wind.x * player.fwdX + env.wind.z * player.fwdZ);
    e.windTxt.textContent = `${w.bft} Bft ${w.from}${head > 2 ? ' · tegenwind!' : head < -2 ? ' · tailwind' : ''}`;
    e.money.textContent = `€ ${game.money.toFixed(2)}`;
    e.rep.style.width = `${game.rep}%`;
    e.repTxt.textContent = repTitle(game.rep);
    e.light.classList.toggle('on', player.light);
    // slope indicator
    const s = player.surface;
    e.slope.textContent = s && s.bridge ? '⌒ bridge' : '';
    // street name
    const name = s && s.name ? s.name : '';
    if (name && name !== this.lastStreet) {
      this.lastStreet = name;
      e.street.textContent = name;
      e.street.classList.remove('fade');
      void e.street.offsetWidth;
      e.street.classList.add('show');
      this.streetTimer = 3.5;
    }
    this.streetTimer -= dt;
    if (this.streetTimer < 0) e.street.classList.remove('show');
    // speech bubbles
    this.updateBubbles(camera, traffic);
  }
  updateBubbles(camera, traffic) {
    const used = new Set();
    for (const a of traffic.speakers) {
      if (!a.speech) continue;
      if ((a.x - camera.position.x) ** 2 + (a.z - camera.position.z) ** 2 > 45 * 45) continue;
      this.v.set(a.x, (a.y || 0) + 2.2, a.z).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue;
      let b = this.bubbles.get(a);
      if (!b) {
        b = document.createElement('div');
        b.className = 'bubble';
        this.el.speech.appendChild(b);
        this.bubbles.set(a, b);
      }
      b.textContent = a.speech.text;
      b.style.left = `${((this.v.x + 1) / 2) * innerWidth}px`;
      b.style.top = `${((1 - this.v.y) / 2) * innerHeight}px`;
      used.add(a);
    }
    for (const [a, b] of this.bubbles) {
      if (!used.has(a)) {
        b.remove();
        this.bubbles.delete(a);
      }
    }
  }
  toast(text, kind = 'info', secs = 3.5) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.prepend(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    setTimeout(() => d.classList.add('out'), secs * 1000);
    setTimeout(() => d.remove(), secs * 1000 + 600);
  }
  setMission(title, text, timer) {
    this.el.mTitle.textContent = title;
    this.el.mText.textContent = text;
    this.el.mTimer.textContent = timer || '';
  }
  setRouteHint(text) {
    this.el.route.textContent = text;
  }
  clearRoute() {
    this.el.route.textContent = '';
  }
  overlay(title, text) {
    if (!title) {
      this.el.overlay.classList.remove('show');
      return;
    }
    this.el.overlayTitle.textContent = title;
    this.el.overlayText.textContent = text || '';
    this.el.overlay.classList.add('show');
  }
  discover(lm, n, total) {
    const d = this.el.discover;
    d.innerHTML = `<div class="d-k">Discovered ${n}/${total}</div><div class="d-t">${lm.name}</div><div class="d-f">${lm.fact}</div>`;
    d.classList.add('show');
    clearTimeout(this.discT);
    this.discT = setTimeout(() => d.classList.remove('show'), 7000);
  }
  hint(text) {
    this.el.hint.textContent = text || '';
    this.el.hint.classList.toggle('show', !!text);
  }
}

function repTitle(r) {
  if (r < 15) return 'Lost tourist';
  if (r < 35) return 'Tourist on a rental bike';
  if (r < 55) return 'Expat';
  if (r < 75) return 'Amsterdammer';
  if (r < 92) return 'Echte Amsterdammer';
  return 'Fietskoning(in)';
}
