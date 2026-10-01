// Procedural canvas textures: no image files needed.
import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
function jitter(rand, [r, g, b], amt) {
  const k = 1 + (rand() - 0.5) * amt;
  return hex(r * k, g * k, b * k);
}

// --- Paving ----------------------------------------------------------------

/** Herringbone brick pavers (klinkers), the classic Amsterdam street surface. 1 tile = 2m. */
export function klinkerTexture(base = [128, 62, 48], seed = 1) {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = '#4a3a33';
  g.fillRect(0, 0, S, S);
  const u = S / 16; // brick width (12.5cm) -> 2m tile
  for (let i = -2; i < 34; i++) {
    for (let j = -2; j < 34; j++) {
      // herringbone: alternate horizontal / vertical pairs
      const x = i * u, y = j * u;
      const horiz = (i + j) % 2 === 0;
      g.fillStyle = jitter(rand, base, 0.35);
      if (horiz) g.fillRect(x + 1, y + 1, u * 2 - 2, u - 2);
      else g.fillRect(x + 1, y + 1, u - 2, u * 2 - 2);
    }
  }
  // grime
  for (let k = 0; k < 2500; k++) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
    g.fillRect(rand() * S, rand() * S, 2 + rand() * 6, 2 + rand() * 6);
  }
  return toTexture(c);
}

/** Grey concrete sidewalk tiles (stoeptegels), 30cm. 1 tile = 1.8m */
export function tilesTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(7);
  g.fillStyle = '#6d6a66';
  g.fillRect(0, 0, S, S);
  const n = 6, u = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.fillStyle = jitter(rand, [158, 154, 148], 0.12);
      g.fillRect(i * u + 1, j * u + 1, u - 2, u - 2);
    }
  for (let k = 0; k < 800; k++) {
    g.fillStyle = `rgba(30,30,30,${rand() * 0.1})`;
    g.beginPath();
    g.arc(rand() * S, rand() * S, rand() * 3, 0, 7);
    g.fill();
  }
  return toTexture(c);
}

export function asphaltTexture(base = [62, 62, 64], seed = 3) {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = hex(...base);
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) {
    const v = rand() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rand() * 0.12})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  return toTexture(c);
}

/** Red bike lane (fietspad) with a white edge line on one side. u along the lane, v across. */
export function bikeLaneTexture() {
  const W = 128, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rand = mulberry32(11);
  g.fillStyle = '#8a3f37';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 5000; k++) {
    const v = rand() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v * 0.7},${v * 0.6},${rand() * 0.1})`;
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
  }
  // edge lines along u (x axis = along lane)
  g.fillStyle = 'rgba(235,235,230,0.9)';
  g.fillRect(0, 4, W, 6);
  g.fillRect(0, H - 10, W, 6);
  return toTexture(c);
}

export function graniteTexture() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(5);
  g.fillStyle = '#a7a39b';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 3000; k++) {
    const v = 100 + rand() * 120;
    g.fillStyle = `rgba(${v},${v},${v},0.3)`;
    g.fillRect(rand() * S, rand() * S, 1, 1);
  }
  g.fillStyle = 'rgba(40,40,40,0.5)';
  for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 1, S);
  return toTexture(c);
}

/** Dam / station square: large light stone setts. */
export function plazaTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(9);
  g.fillStyle = '#7b766e';
  g.fillRect(0, 0, S, S);
  const u = S / 8;
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const off = j % 2 ? u / 2 : 0;
      g.fillStyle = jitter(rand, [176, 168, 154], 0.14);
      g.fillRect(i * u + off + 1, j * u + 1, u - 2, u - 2);
      if (i === 0 && off) g.fillRect(off - u + 1, j * u + 1, u - 2, u - 2);
    }
  return toTexture(c);
}

export function grassTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(13);
  g.fillStyle = '#4d6b33';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 12000; k++) {
    g.fillStyle = jitter(rand, [80, 112, 52], 0.6);
    g.fillRect(rand() * S, rand() * S, 1, 2 + rand() * 3);
  }
  return toTexture(c);
}

/** Generic brick wall (quay walls, bridges). 1 tile = 1m. */
export function brickTexture(base = [110, 52, 40], seed = 21, mortar = '#6b6158') {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  g.fillStyle = mortar;
  g.fillRect(0, 0, S, S);
  const bw = S / 4.5, bh = S / 16;
  for (let j = 0; j < 16; j++) {
    const off = (j % 2) * bw * 0.5;
    for (let i = -1; i < 6; i++) {
      g.fillStyle = jitter(rand, base, 0.3);
      g.fillRect(i * bw + off + 1, j * bh + 1, bw - 2, bh - 2);
    }
  }
  return toTexture(c);
}

export function roofTexture() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const rand = mulberry32(31);
  g.fillStyle = '#2b2b2e';
  g.fillRect(0, 0, S, S);
  const rows = 8;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < 8; i++) {
      const off = (j % 2) * 8;
      g.fillStyle = jitter(rand, [62, 58, 60], 0.3);
      g.fillRect(i * 16 + off + 1, j * 16 + 1, 14, 14);
    }
  return toTexture(c);
}

// --- Facades ---------------------------------------------------------------

export const FACADE_STYLES = [
  { name: 'darkbrick', wall: [86, 44, 34], trim: '#efeae0', frame: '#f4f1ea', mortar: '#4b3d36' },
  { name: 'redbrick', wall: [138, 62, 44], trim: '#efeae0', frame: '#f4f1ea', mortar: '#6a564b' },
  { name: 'blackbrick', wall: [42, 38, 37], trim: '#e9e5dc', frame: '#f4f1ea', mortar: '#2a2725' },
  { name: 'white', wall: [226, 222, 210], trim: '#ffffff', frame: '#2c3b33', plain: true },
  { name: 'grey', wall: [118, 128, 124], trim: '#f4f1ea', frame: '#f4f1ea', plain: true },
  { name: 'sand', wall: [196, 170, 128], trim: '#fbf7ee', frame: '#3c2e26', plain: true },
  { name: 'oxblood', wall: [102, 34, 30], trim: '#efeae0', frame: '#f4f1ea', plain: true },
  { name: 'brownbrick', wall: [112, 74, 52], trim: '#efeae0', frame: '#f4f1ea', mortar: '#5a4a40' },
];

/**
 * A facade tile of 4 bays x 4 floors. Returns { map, emissive }.
 * Window panes are dark with a soft sky reflection; the emissive map lights
 * a random subset of windows at night.
 */
export function facadeTextures(style, seed) {
  const BW = 128, FH = 160; // pixels per bay / floor
  const W = BW * 4, H = FH * 4;
  const c = canvas(W, H);
  const e = canvas(W, H);
  const g = c.getContext('2d');
  const ge = e.getContext('2d');
  const rand = mulberry32(seed);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);

  // wall
  g.fillStyle = hex(...style.wall);
  g.fillRect(0, 0, W, H);
  if (!style.plain) {
    g.fillStyle = style.mortar;
    const bh = 6;
    for (let y = 0; y < H; y += bh) {
      g.fillRect(0, y, W, 1);
      const off = (y / bh) % 2 ? 9 : 0;
      for (let x = off; x < W; x += 18) g.fillRect(x, y, 1, bh);
    }
    for (let k = 0; k < 4000; k++) {
      const [r, gg, b] = style.wall;
      const kk = 0.75 + rand() * 0.5;
      g.fillStyle = `rgba(${r * kk | 0},${gg * kk | 0},${b * kk | 0},0.6)`;
      g.fillRect(rand() * W, rand() * H, 8 + rand() * 9, 5);
    }
  } else {
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = `rgba(0,0,0,${rand() * 0.04})`;
      g.fillRect(rand() * W, rand() * H, 3 + rand() * 10, 3 + rand() * 10);
    }
  }
  // weathering streaks
  for (let k = 0; k < 30; k++) {
    const x = rand() * W;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 2 + rand() * 6, H);
  }

  // windows: floors in canvas are top->bottom; v=0 is the bottom in UV space
  for (let f = 0; f < 4; f++) {
    for (let b = 0; b < 4; b++) {
      const x0 = b * BW, y0 = f * FH;
      const ww = BW * 0.56, wh = FH * 0.66;
      const wx = x0 + (BW - ww) / 2, wy = y0 + FH * 0.16;
      // stone lintel / sill
      g.fillStyle = style.trim;
      g.fillRect(wx - 6, wy - 8, ww + 12, 7);
      g.fillRect(wx - 4, wy + wh, ww + 8, 6);
      // frame
      g.fillStyle = style.frame;
      g.fillRect(wx, wy, ww, wh);
      // glass with reflection
      const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grad.addColorStop(0, '#5d6f7d');
      grad.addColorStop(0.45, '#26303a');
      grad.addColorStop(1, '#151a20');
      const lit = rand() < 0.42;
      const warm = ['#ffd38a', '#ffe2a8', '#ffc76e', '#f7e9c9', '#bcd7ff'][Math.floor(rand() * 5)];
      const curtain = rand() < 0.35;
      const panes = [
        [wx + 6, wy + 6, ww / 2 - 9, wh / 2 - 8],
        [wx + ww / 2 + 3, wy + 6, ww / 2 - 9, wh / 2 - 8],
        [wx + 6, wy + wh / 2 + 2, ww / 2 - 9, wh / 2 - 8],
        [wx + ww / 2 + 3, wy + wh / 2 + 2, ww / 2 - 9, wh / 2 - 8],
      ];
      for (const [px, py, pw, ph] of panes) {
        g.fillStyle = grad;
        g.fillRect(px, py, pw, ph);
        // small sash bars (roedes)
        g.fillStyle = style.frame;
        g.fillRect(px + pw / 2 - 1, py, 2, ph);
        g.fillRect(px, py + ph / 2 - 1, pw, 2);
        if (lit) {
          ge.fillStyle = warm;
          ge.fillRect(px, py, pw, ph);
          ge.fillStyle = 'rgba(0,0,0,0.35)';
          ge.fillRect(px + pw / 2 - 1, py, 2, ph);
          ge.fillRect(px, py + ph / 2 - 1, pw, 2);
        }
      }
      if (curtain) {
        g.fillStyle = 'rgba(240,235,220,0.55)';
        g.fillRect(wx + 6, wy + 6, ww * 0.22, wh - 12);
        g.fillRect(wx + ww - 6 - ww * 0.22, wy + 6, ww * 0.22, wh - 12);
        if (lit) {
          ge.fillStyle = 'rgba(80,60,30,0.5)';
          ge.fillRect(wx + 6, wy + 6, ww * 0.22, wh - 12);
          ge.fillRect(wx + ww - 6 - ww * 0.22, wy + 6, ww * 0.22, wh - 12);
        }
      }
      // plants on some sills
      if (rand() < 0.15) {
        g.fillStyle = ['#3f7a35', '#c2364a', '#e0a124'][Math.floor(rand() * 3)];
        g.fillRect(wx + 4, wy + wh - 12, ww - 8, 8);
      }
    }
  }
  const map = toTexture(c);
  const emissive = toTexture(e);
  return { map, emissive };
}

/** Wooden texture for boats & shutters. */
export function woodTexture(base = [120, 82, 50]) {
  const W = 64, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rand = mulberry32(41);
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = jitter(rand, base, 0.25);
    g.fillRect(0, y, W, 15);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + 15, W, 1);
  }
  return toTexture(c);
}

/** Tileable normal map for water ripples, built from summed sine waves. */
export function waterNormalTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const rand = mulberry32(77);
  const waves = [];
  for (let i = 0; i < 18; i++) {
    const kx = Math.round((rand() - 0.5) * 16);
    const ky = Math.round((rand() - 0.5) * 16);
    waves.push({ kx, ky, a: (0.6 + rand()) / (1 + Math.hypot(kx, ky) * 0.25), p: rand() * 6.28 });
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const ph = ((w.kx * x + w.ky * y) / S) * Math.PI * 2 + w.p;
        const cs = Math.cos(ph) * w.a;
        dx += cs * w.kx;
        dy += cs * w.ky;
      }
      const n = Math.hypot(dx * 0.05, dy * 0.05, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((-dx * 0.05) / n * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy * 0.05) / n * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / n * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/** Soft round glow sprite for lamps. */
export function glowTexture() {
  const S = 64;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,210,140,0.5)');
  grad.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
}

/** Text sign texture (street-name plates, shop signs). */
export function signTexture(text, { bg = '#ffffff', fg = '#1b3f8b', w = 512, h = 96, font = 'bold 56px sans-serif', border = '#1b3f8b' } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
  }
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return toTexture(c, { repeat: false });
}
