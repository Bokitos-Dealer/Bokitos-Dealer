// Minimap: the city is painted once into an offscreen canvas from the same
// analytic layout; each frame we draw a rotated window around the player.
import * as L from '../city/layout.js';
import { stripRanges } from '../city/streets.js';
import { LANDMARKS } from '../city/landmarks.js';

const EXT = { x0: -950, x1: 950, z0: -1000, z1: 950 };
const PX = 1.2; // pixels per metre in the offscreen map

export class Minimap {
  constructor(canvas, bigCanvas) {
    this.canvas = canvas;
    this.big = bigCanvas;
    this.map = document.createElement('canvas');
    this.map.width = Math.round((EXT.x1 - EXT.x0) * PX);
    this.map.height = Math.round((EXT.z1 - EXT.z0) * PX);
    this.paint();
    this.zoom = 1.6; // screen pixels per metre
  }
  toMap(x, z) {
    return [(x - EXT.x0) * PX, (z - EXT.z0) * PX];
  }
  paint() {
    const g = this.map.getContext('2d');
    g.fillStyle = '#1e2a28';
    g.fillRect(0, 0, this.map.width, this.map.height);
    g.save();
    g.scale(PX, PX);
    g.translate(-EXT.x0, -EXT.z0);
    // city blocks
    g.fillStyle = '#5a4b43';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, L.R_EDGE, Math.PI / 2 - L.THETA_MAX, Math.PI / 2 + L.THETA_MAX);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(0, 0, L.R_IJ, 0, Math.PI * 2);
    g.fill();
    // beyond the edge (filler city)
    g.fillStyle = '#3d3632';
    g.beginPath();
    g.arc(0, 0, 1300, Math.PI / 2 - L.THETA_MAX, Math.PI / 2 + L.THETA_MAX);
    g.arc(0, 0, L.R_EDGE, Math.PI / 2 + L.THETA_MAX, Math.PI / 2 - L.THETA_MAX, true);
    g.fill();
    // note: canvas angle a corresponds to polar theta = PI/2 - a (theta measured from +z)
    const arcTh = (r, th0, th1) => {
      g.beginPath();
      const n = Math.max(8, Math.ceil((r * Math.abs(th1 - th0)) / 6));
      for (let i = 0; i <= n; i++) {
        const th = th0 + ((th1 - th0) * i) / n;
        const x = r * Math.sin(th), z = r * Math.cos(th);
        if (i === 0) g.moveTo(x, z);
        else g.lineTo(x, z);
      }
      g.stroke();
    };
    const sectorRange = (b) => (b.sector === 'all' ? [-Math.PI, Math.PI] : b.sector === 'ring' ? [-L.THETA_MAX, L.THETA_MAX] : [L.THETA_MAX, Math.PI * 2 - L.THETA_MAX]);
    // water
    g.strokeStyle = g.fillStyle = '#3d6e86';
    for (const c of L.CANALS) {
      g.lineWidth = c.hw * 2;
      if (c.full) arcTh(c.r, -Math.PI, Math.PI);
      else arcTh(c.r, -L.THETA_MAX - 0.1, L.THETA_MAX + 0.1);
    }
    // IJ
    g.beginPath();
    g.moveTo(L.R_IJ * Math.sin(L.THETA_MAX), L.R_IJ * Math.cos(L.THETA_MAX));
    for (let th = L.THETA_MAX; th <= Math.PI * 2 - L.THETA_MAX; th += 0.02) g.lineTo(L.R_IJ * Math.sin(th), L.R_IJ * Math.cos(th));
    g.lineTo(1300 * Math.sin(-L.THETA_MAX), 1300 * Math.cos(-L.THETA_MAX));
    g.lineTo(-1400, -1400);
    g.lineTo(1400, -1400);
    g.lineTo(1300 * Math.sin(L.THETA_MAX), 1300 * Math.cos(L.THETA_MAX));
    g.closePath();
    g.fill();
    // Amstel
    g.lineWidth = L.AMSTEL_HW * 2;
    g.lineCap = 'butt';
    const a0 = L.dividerPoint(L.AMSTEL, 243, 0), a1 = L.dividerPoint(L.AMSTEL, 1300, 0);
    g.beginPath();
    g.moveTo(a0.x, a0.z);
    g.lineTo(a1.x, a1.z);
    g.stroke();
    // streets
    const streetCol = '#cfc6b8', bikeCol = '#b45a4c';
    g.strokeStyle = streetCol;
    for (const b of L.BANDS) {
      if (b.type !== 'quay' && b.type !== 'street') continue;
      const [t0, t1] = sectorRange(b);
      for (const s of stripRanges(b.xs, b.r0)) {
        if (s.kind === 'edge') continue;
        g.lineWidth = s.b - s.a + 0.2;
        g.strokeStyle = s.kind === 'bike' ? bikeCol : s.kind === 'strip' ? '#8f8579' : streetCol;
        arcTh((s.a + s.b) / 2, t0, t1);
      }
    }
    for (const dv of L.STREET_DIVIDERS) {
      for (const s of stripRanges(dv.xs, dv.off - dv.hw)) {
        if (s.kind === 'edge') continue;
        g.lineWidth = s.b - s.a + 0.2;
        g.strokeStyle = s.kind === 'bike' ? bikeCol : s.kind === 'strip' ? '#8f8579' : streetCol;
        const d = (s.a + s.b) / 2;
        const p0 = L.dividerPoint(dv, Math.sqrt(Math.max(0, dv.start ** 2 - d * d)), d);
        const p1 = L.dividerPoint(dv, Math.sqrt(Math.max(0, dv.end ** 2 - d * d)), d);
        g.beginPath();
        g.moveTo(p0.x, p0.z);
        g.lineTo(p1.x, p1.z);
        g.stroke();
      }
    }
    // squares
    g.fillStyle = '#d9d1c2';
    g.beginPath();
    g.arc(0, 0, L.R_PLAZA, 0, Math.PI * 2);
    g.fill();
    const S = L.STATION_ISLAND;
    g.fillRect(S.x0, S.z0, S.x1 - S.x0, S.z1 - S.z0);
    g.fillStyle = '#7a3a2c';
    const SB = L.STATION_BUILDING;
    g.fillRect(SB.x0, SB.z0, SB.x1 - SB.x0, SB.z1 - SB.z0);
    g.fillStyle = '#5d7d45';
    g.beginPath();
    const M = L.MUSEUMPLEIN;
    for (let th = M.th0; th <= M.th1; th += 0.01) g.lineTo(M.r0 * Math.sin(th), M.r0 * Math.cos(th));
    for (let th = M.th1; th >= M.th0; th -= 0.01) g.lineTo(M.r1 * Math.sin(th), M.r1 * Math.cos(th));
    g.fill();
    // landmarks
    for (const lm of LANDMARKS) {
      g.fillStyle = '#ffd36b';
      g.beginPath();
      g.arc(lm.pos.x, lm.pos.z, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /** Draw the heading-up minimap. */
  draw(player, route, target, extras = {}) {
    const c = this.canvas;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    const z = this.zoom;
    g.save();
    g.clearRect(0, 0, W, H);
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#1e2a28';
    g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2 + H * 0.12);
    // heading up: forward is (−sin yaw, −cos yaw) in world; rotate so that it points to −y on screen
    g.rotate(player.yaw);
    g.scale(z / PX, z / PX);
    const [mx, mz] = this.toMap(player.x, player.z);
    g.drawImage(this.map, -mx, -mz);
    g.scale(PX, PX);
    g.translate(-player.x, -player.z);
    if (route && route.pts.length > 1) {
      g.strokeStyle = '#ffb627';
      g.lineWidth = 6 / z;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(route.pts[0].x, route.pts[0].z);
      for (const p of route.pts) g.lineTo(p.x, p.z);
      g.stroke();
    }
    if (target) {
      g.fillStyle = '#ffb627';
      g.beginPath();
      g.arc(target.x, target.z, 9 / z, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 2 / z;
      g.stroke();
    }
    if (extras.trams) {
      g.fillStyle = '#f2f2ee';
      for (const t of extras.trams) for (const s of t.segments || []) g.fillRect(s.x - 2, s.z - 2, 4, 4);
    }
    g.restore();
    // player arrow
    g.save();
    g.translate(W / 2, H / 2 + H * 0.12);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // north indicator
    g.save();
    g.translate(W / 2, H / 2 + H * 0.12);
    g.rotate(player.yaw);
    g.fillStyle = '#e04b3a';
    g.font = 'bold 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const R = W / 2 - 14;
    g.translate(0, -R);
    g.rotate(-player.yaw);
    g.fillText('N', 0, 0);
    g.restore();
  }

  /** Full city map overlay. */
  drawBig(player, route, target, discovered) {
    const c = this.big;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.fillStyle = '#16201f';
    g.fillRect(0, 0, W, H);
    const scale = Math.min(W / 1600, H / 1360);
    const CZ = 215;
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(scale / PX, scale / PX);
    const [cx, cz] = this.toMap(0, CZ);
    g.drawImage(this.map, -cx, -cz);
    g.scale(PX, PX);
    g.translate(0, -CZ);
    if (route) {
      g.strokeStyle = '#ffb627';
      g.lineWidth = 7;
      g.beginPath();
      for (const p of route.pts) g.lineTo(p.x, p.z);
      g.stroke();
    }
    g.font = `${Math.round(13 / scale)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const lm of LANDMARKS) {
      g.fillStyle = discovered.has(lm.id) ? '#ffd36b' : 'rgba(255,255,255,0.55)';
      g.fillText((discovered.has(lm.id) ? '★ ' : '') + lm.name, lm.pos.x, lm.pos.z - 14);
    }
    if (target) {
      g.fillStyle = '#ffb627';
      g.beginPath();
      g.arc(target.x, target.z, 14, 0, Math.PI * 2);
      g.fill();
    }
    g.translate(player.x, player.z);
    g.rotate(-player.yaw);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, -26);
    g.lineTo(16, 18);
    g.lineTo(0, 9);
    g.lineTo(-16, 18);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
