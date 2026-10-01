// Keyboard, mouse-look and touch controls.
import { damp } from '../util/math.js';

export class Input {
  constructor(canvas, bus) {
    this.canvas = canvas;
    this.bus = bus;
    this.keys = new Set();
    this.state = { pedal: 0, brake: 0, steer: 0, sprint: false };
    this.touch = { steer: 0, pedal: false, brake: false, active: false };
    this.mouse = { dx: 0, dy: 0 };
    this.enabled = false;
    this.steerSmooth = 0;

    addEventListener('keydown', (e) => {
      if (!this.enabled && e.code !== 'Escape') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.bus.emit('key', e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (this.enabled && !this.isTouch && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch {
          /* pointer lock not available (e.g. sandboxed frame) */
        }
      }
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      } else if (this.enabled && e.buttons & 2) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  /** Hook up on-screen touch controls. */
  bindTouch(root) {
    const steerPad = root.querySelector('#t-steer');
    const knob = root.querySelector('#t-knob');
    const btn = (id, on, off) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        on();
      });
      const up = () => {
        el.classList.remove('down');
        off && off();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    btn('#t-pedal', () => (this.touch.pedal = true), () => (this.touch.pedal = false));
    btn('#t-brake', () => (this.touch.brake = true), () => (this.touch.brake = false));
    btn('#t-bell', () => this.bus.emit('key', 'Space'));
    btn('#t-gearup', () => this.bus.emit('key', 'KeyE'));
    btn('#t-geardown', () => this.bus.emit('key', 'KeyQ'));
    btn('#t-light', () => this.bus.emit('key', 'KeyL'));
    btn('#t-cam', () => this.bus.emit('key', 'KeyC'));
    btn('#t-sprint', () => (this.touch.sprint = true), () => (this.touch.sprint = false));
    if (steerPad) {
      let id = null, cx = 0;
      steerPad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        id = e.pointerId;
        steerPad.setPointerCapture(id);
        const r = steerPad.getBoundingClientRect();
        cx = r.left + r.width / 2;
        this.touch.active = true;
        move(e);
      });
      const move = (e) => {
        if (e.pointerId !== id) return;
        const r = steerPad.getBoundingClientRect();
        const v = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
        this.touch.steer = v;
        if (knob) knob.style.transform = `translateX(${v * (r.width / 2 - 28)}px)`;
      };
      steerPad.addEventListener('pointermove', move);
      const end = () => {
        id = null;
        this.touch.steer = 0;
        this.touch.active = false;
        if (knob) knob.style.transform = '';
      };
      steerPad.addEventListener('pointerup', end);
      steerPad.addEventListener('pointercancel', end);
    }
  }

  update(dt) {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    let steer = (right ? 1 : 0) - (left ? 1 : 0);
    if (this.touch.active) steer = this.touch.steer;
    // keyboard steering eases in so you can make gentle corrections
    this.steerSmooth = this.touch.active ? steer : damp(this.steerSmooth, steer, steer === 0 ? 10 : 4.5, dt);
    this.state.steer = this.steerSmooth;
    this.state.pedal = k.has('KeyW') || k.has('ArrowUp') || this.touch.pedal ? 1 : 0;
    this.state.brake = k.has('KeyS') || k.has('ArrowDown') || this.touch.brake ? 1 : 0;
    this.state.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || !!this.touch.sprint;
    return this.state;
  }

  consumeMouse() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = this.mouse.dy = 0;
    return d;
  }
}

/** Minimal event bus. */
export class Bus {
  constructor() {
    this.h = new Map();
  }
  on(name, fn) {
    if (!this.h.has(name)) this.h.set(name, []);
    this.h.get(name).push(fn);
  }
  emit(name, data) {
    const l = this.h.get(name);
    if (l) for (const fn of l) fn(data);
  }
}
