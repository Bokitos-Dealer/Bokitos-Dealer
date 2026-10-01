// Famous places, built from simple shapes.
import * as THREE from 'three';
import * as L from './layout.js';
import { ChunkedBuilders } from '../util/geo.js';
import { mulberry32, range, pick, DEG } from '../util/math.js';

const P = (r, thDeg) => ({ x: L.polarX(r, thDeg * DEG), z: L.polarZ(r, thDeg * DEG) });

// Landmark definitions (also used by missions / discovery).
export const LANDMARKS = [
  { id: 'dam', name: 'Dam Square', nl: 'De Dam', pos: { x: 0, z: 0 }, radius: 45,
    fact: 'The Dam is where the city began: a dam in the Amstel river around 1270 gave Amsterdam its name.' },
  { id: 'palace', name: 'Royal Palace', nl: 'Koninklijk Paleis', pos: P(64, -128), radius: 40,
    fact: 'Built in the 17th century as the city hall, it became a royal palace under Louis Napoleon in 1808.' },
  { id: 'monument', name: 'National Monument', nl: 'Nationaal Monument', pos: P(36, 80), radius: 25,
    fact: 'Unveiled in 1956 in memory of the victims of the Second World War. Commemoration happens here every 4 May.' },
  { id: 'centraal', name: 'Centraal Station', nl: 'Centraal Station', pos: { x: 0, z: -362 }, radius: 45,
    fact: 'Designed by Pierre Cuypers and opened in 1889, it stands on artificial islands in the IJ. Its bike parking holds thousands of bikes.' },
  { id: 'westerkerk', name: 'Westerkerk', nl: 'Westerkerk', pos: P(437, -98), radius: 50,
    fact: 'Its 85 m tower, topped with the blue imperial crown, is the tallest church tower in Amsterdam. Rembrandt is buried here.' },
  { id: 'munt', name: 'Munttoren', nl: 'Munttoren', pos: P(226, 45), radius: 30,
    fact: 'Part of a medieval city gate. In 1672-73 the city minted coins here, which gave the tower its name.' },
  { id: 'magere', name: 'Magere Brug', nl: 'Magere Brug', pos: P(510, 40.25), radius: 35,
    fact: 'The "Skinny Bridge" is a white double drawbridge over the Amstel, lit by hundreds of bulbs at night.' },
  { id: 'rijks', name: 'Rijksmuseum', nl: 'Rijksmuseum', pos: P(705, -11.5), radius: 40,
    fact: 'Opened in 1885 (also by Cuypers). Cyclists ride right through the building via its famous passage.' },
  { id: 'bloemenmarkt', name: 'Bloemenmarkt', nl: 'Bloemenmarkt', pos: P(240, -6), radius: 30,
    fact: 'The floating flower market on the Singel has sold flowers and tulip bulbs from boats since 1862.' },
  { id: 'blauwbrug', name: 'Blauwbrug', nl: 'Blauwbrug', pos: P(337, 40.25), radius: 30,
    fact: 'The "Blue Bridge" over the Amstel. The current bridge dates from 1884 and was inspired by bridges in Paris.' },
];

const BLOCK_EXCLUSIONS = [];
function polarBoxExclusion(r0, r1, th0, th1, pad = 0) {
  BLOCK_EXCLUSIONS.push((x, z) => {
    const r = Math.hypot(x, z), th = Math.atan2(x, z) / DEG;
    return r > r0 - pad && r < r1 + pad && th > th0 && th < th1;
  });
}
polarBoxExclusion(55, 118, -150, -106); // Royal Palace
polarBoxExclusion(55, 118, -176, -153); // Nieuwe Kerk
polarBoxExclusion(393, 437, -103.5, -92); // Westerkerk
polarBoxExclusion(L.RIJKS.r0 - 4, L.RIJKS.r1, L.RIJKS.th0 / DEG, L.RIJKS.th1 / DEG); // Rijksmuseum
BLOCK_EXCLUSIONS.push((x, z) => {
  const m = P(224, 44.3);
  return Math.hypot(x - m.x, z - m.z) < 9;
});

export function isExcluded(x, z) {
  for (const f of BLOCK_EXCLUSIONS) if (f(x, z)) return true;
  return false;
}

// ---------------------------------------------------------------------------
export class LandmarkBuilder {
  constructor(mats, colliders) {
    this.mats = mats;
    this.col = colliders;
    this.cb = new ChunkedBuilders(400);
    this.bulbs = [];
    this.rand = mulberry32(777);
  }
  d(x, z) {
    return this.cb.get('detail', x, z, true);
  }
  /** Oriented box. center (x,y,z) with yaw; sx along local x, sz along local z. */
  box(b, x, y, z, sx, sy, sz, yaw, color) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    b.addGeometry(g, m, color);
  }
  geo(b, g, x, y, z, yaw, color, scale = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(scale, scale, scale));
    b.addGeometry(g, m, color);
  }
  /** Windowed wall using facade style `f` between points A and B (left->right seen from outside). */
  wall(f, A, B, y0, y1, bays, floors, uOff = 0) {
    const b = this.cb.get('f' + f, (A.x + B.x) / 2, (A.z + B.z) / 2);
    bays = Math.max(1, bays);
    b.quad([A.x, y0, A.z], [B.x, y0, B.z], [B.x, y1, B.z], [A.x, y1, A.z], [uOff, 0, uOff + bays / 4, 0, uOff + bays / 4, floors / 4, uOff, floors / 4]);
  }
  /** Rectangular windowed building: centre, yaw, width (local x), depth (local z), height. */
  building(f, cx, cz, yaw, w, dpt, h, floorH = 3.4, bayW = 2.2, roof = null, y0 = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // local x axis -> world (c, -s), local z -> world (s, c)
    const W = (lx, lz) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c });
    const corners = [W(-w / 2, dpt / 2), W(w / 2, dpt / 2), W(w / 2, -dpt / 2), W(-w / 2, -dpt / 2)];
    const floors = h / floorH;
    for (let i = 0; i < 4; i++) {
      const A = corners[i], B = corners[(i + 1) % 4];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      this.wall(f, A, B, y0, y0 + h, Math.round(len / bayW), floors);
    }
    h += y0;
    if (roof) {
      const rb = this.cb.get('roof', cx, cz);
      const rh = roof.h;
      const ridgeA = W(-w / 2 + (roof.hip ? dpt / 2 : 0), 0), ridgeB = W(w / 2 - (roof.hip ? dpt / 2 : 0), 0);
      const [c0, c1, c2, c3] = corners;
      rb.quad([c0.x, h, c0.z], [c1.x, h, c1.z], [ridgeB.x, h + rh, ridgeB.z], [ridgeA.x, h + rh, ridgeA.z], [0, 0, w / 3, 0, w / 3, 3, 0, 3]);
      rb.quad([c2.x, h, c2.z], [c3.x, h, c3.z], [ridgeA.x, h + rh, ridgeA.z], [ridgeB.x, h + rh, ridgeB.z], [0, 0, w / 3, 0, w / 3, 3, 0, 3]);
      const det = this.d(cx, cz);
      det.setColor(roof.endColor || '#3a3a3c');
      det.tri([c1.x, h, c1.z], [c2.x, h, c2.z], [ridgeB.x, h + rh, ridgeB.z]);
      det.tri([c3.x, h, c3.z], [c0.x, h, c0.z], [ridgeA.x, h + rh, ridgeA.z]);
    } else {
      const det = this.d(cx, cz);
      det.setColor('#4a4a4c');
      const [c0, c1, c2, c3] = corners;
      det.quad([c0.x, h, c0.z], [c1.x, h, c1.z], [c2.x, h, c2.z], [c3.x, h, c3.z], undefined, [0, 1, 0]);
    }
    return W;
  }

  // ---- individual landmarks ------------------------------------------------
  palace() {
    // facade faces the Dam (towards the centre)
    const th = -128 * DEG;
    const rc = 58 + 28;
    const cx = rc * Math.sin(th), cz = rc * Math.cos(th);
    const yaw = th; // local +z points outward (away from the Dam)
    const W = this.building(5, cx, cz, yaw, 78, 56, 26, 5.2, 3.2, null);
    const det = this.d(cx, cz);
    // central risalit + pediment
    const front = W(0, -28.6);
    this.box(det, front.x, 14, front.z, 26, 28, 1.6, yaw, '#cbbd9e');
    const peak = W(0, -29.2);
    const tri = new THREE.BufferGeometry();
    const pts = [new THREE.Vector3(-13, 0, 0), new THREE.Vector3(13, 0, 0), new THREE.Vector3(0, 6, 0)];
    tri.setFromPoints(pts);
    tri.setIndex([0, 1, 2, 0, 2, 1]);
    tri.computeVertexNormals();
    this.geo(det, tri, peak.x, 28, peak.z, yaw, '#bfb193');
    // cornice
    this.box(det, cx, 26.3, cz, 79, 0.8, 57, yaw, '#b8aa8c');
    // lead roof
    this.box(det, cx, 27.5, cz, 72, 2.4, 50, yaw, '#5b5e60');
    // cupola tower
    const oct = (r, h) => new THREE.CylinderGeometry(r, r, h, 8);
    this.geo(det, oct(5, 8), cx, 32.5, cz, yaw + Math.PI / 8, '#d6c9aa');
    this.geo(det, oct(3.8, 6), cx, 39.5, cz, yaw + Math.PI / 8, '#d6c9aa');
    const dome = new THREE.SphereGeometry(4.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.geo(det, dome, cx, 42.4, cz, 0, '#4f8f7a');
    this.geo(det, new THREE.CylinderGeometry(0.15, 0.3, 4, 5), cx, 48, cz, 0, '#c8a24a');
    this.geo(det, new THREE.SphereGeometry(0.7, 8, 6), cx, 50.3, cz, 0, '#d4af37');
    // entrance arches (dark)
    for (let i = -3; i <= 3; i++) {
      const p = W(i * 3.4, -29.5);
      this.box(det, p.x, 2.4, p.z, 2.2, 4.8, 0.3, yaw, '#2b2522');
    }
    // Nieuwe Kerk next door
    const th2 = -165 * DEG, r2 = 86;
    const nx = r2 * Math.sin(th2), nz = r2 * Math.cos(th2);
    this.building(0, nx, nz, th2 + Math.PI / 2, 52, 24, 16, 8, 4, { h: 14, endColor: '#5a3a2e' });
    const tw = this.d(nx, nz);
    const tower = { x: nx + Math.sin(th2) * -6, z: nz + Math.cos(th2) * -6 };
    this.geo(tw, new THREE.CylinderGeometry(2.2, 2.6, 8, 8), tower.x, 34, tower.z, 0, '#5d6a64');
    this.geo(tw, new THREE.ConeGeometry(2.2, 9, 8), tower.x, 42.5, tower.z, 0, '#4b7d6b');
  }

  monument() {
    const p = LANDMARKS.find((l) => l.id === 'monument').pos;
    const det = this.d(p.x, p.z);
    for (let i = 0; i < 4; i++) {
      this.geo(det, new THREE.CylinderGeometry(11 - i * 1.6, 11.4 - i * 1.6, 0.4, 28), p.x, 0.2 + i * 0.4, p.z, 0, '#d9d4c7');
    }
    const ob = new THREE.CylinderGeometry(1.5, 2.6, 22, 4);
    this.geo(det, ob, p.x, 12.6, p.z, Math.PI / 4, '#e7e2d6');
    this.geo(det, new THREE.BoxGeometry(5.5, 4, 2.5), p.x, 3.6, p.z + 2.2, 0, '#cfc9ba');
    this.col.addCircle(p.x, p.z, 7.5, 'monument');
  }

  centraal() {
    const S = L.STATION_BUILDING;
    const cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
    const w = S.x1 - S.x0, dp = S.z1 - S.z0;
    // main body (facade faces +z, the city)
    this.building(1, cx, cz, 0, w, dp, 17, 4.2, 3.4, { h: 7, hip: false, endColor: '#7b3a2a' });
    const det = this.d(cx, cz);
    // stone bands
    for (const y of [4.3, 8.6, 12.9]) this.box(det, cx, y, S.z1 + 0.05, w + 0.2, 0.35, 0.3, 0, '#d8ccb3');
    // central hall with gable
    this.building(1, cx, S.z1 - 10, 0, 56, 22, 22, 4.4, 3.4, { h: 9, endColor: '#7b3a2a' });
    // two towers
    for (const sx of [-1, 1]) {
      const tx = cx + sx * 34, tz = S.z1 - 4;
      this.building(1, tx, tz, 0, 10, 10, 34, 4.25, 2.5, null);
      this.box(det, tx, 34.5, tz, 11, 1, 11, 0, '#d8ccb3');
      const roof = new THREE.ConeGeometry(7.2, 12, 4);
      this.geo(det, roof, tx, 41, tz, Math.PI / 4, '#4f6a63');
      this.geo(det, new THREE.CylinderGeometry(0.12, 0.2, 5, 5), tx, 49.5, tz, 0, '#c8a24a');
      // clock faces / wind dial
      const disc = new THREE.CircleGeometry(2.4, 24);
      this.geo(det, disc, tx, 28, tz + 5.06, 0, sx < 0 ? '#f2efe6' : '#e7c46a');
    }
    // end pavilions
    for (const sx of [-1, 1]) this.building(1, cx + sx * (w / 2 - 9), S.z1 - 8, 0, 18, 16, 20, 4, 3, { h: 8, endColor: '#7b3a2a' });
    // train shed (glass & iron barrel roof) behind
    const shed = new THREE.CylinderGeometry(22, 22, 300, 24, 1, true, Math.PI / 2, Math.PI);
    shed.rotateZ(Math.PI / 2);
    this.geo(this.cb.get('glassRoof', cx, cz), shed, cx, 6, S.z0 - 18, 0, '#8e9aa3');
    // entrance arches
    for (let i = -2; i <= 2; i++) this.box(det, cx + i * 6, 3, S.z1 + 0.2, 4, 6, 0.4, 0, '#2a201b');
    // bike racks hint & tram stop canopy
    this.box(det, -20, 3.4, -356, 26, 0.3, 4.5, 0, '#cfd3d6');
    for (const x of [-32, -8]) this.box(det, x, 1.7, -356, 0.2, 3.4, 0.2, 0, '#555');
    this.col.addBox(-20, -356, 0.3, 0.3, 0, 'post');
  }

  westerkerk() {
    const thA = -103.5, thB = -92;
    const thm = (thA + thB) / 2 * DEG;
    // nave along the radial direction, tower at the Keizersgracht end
    const rN = 410;
    const nx = rN * Math.sin(thm), nz = rN * Math.cos(thm);
    this.building(0, nx, nz, thm, 26, 34, 15, 7.5, 4.2, null);
    const det = this.d(nx, nz);
    // steep roof
    const rb = this.cb.get('roof', nx, nz);
    const c = Math.cos(thm), s = Math.sin(thm);
    const W = (lx, lz) => ({ x: nx + lx * c + lz * s, z: nz - lx * s + lz * c });
    const a = W(-13, -17), b = W(13, -17), cc = W(13, 17), d = W(-13, 17), ra = W(0, -17), rb2 = W(0, 17);
    rb.quad([a.x, 15, a.z], [d.x, 15, d.z], [rb2.x, 27, rb2.z], [ra.x, 27, ra.z], [0, 0, 6, 0, 6, 4, 0, 4]);
    rb.quad([cc.x, 15, cc.z], [b.x, 15, b.z], [ra.x, 27, ra.z], [rb2.x, 27, rb2.z], [0, 0, 6, 0, 6, 4, 0, 4]);
    det.setColor('#6a3a2c');
    det.tri([b.x, 15, b.z], [a.x, 15, a.z], [ra.x, 27, ra.z]);
    det.tri([d.x, 15, d.z], [cc.x, 15, cc.z], [rb2.x, 27, rb2.z]);
    // transept
    this.building(0, nx, nz, thm + Math.PI / 2, 12, 34, 15, 7.5, 4.2, { h: 10, endColor: '#6a3a2c' });
    // tower
    const T = W(0, 23);
    this.building(0, T.x, T.z, thm, 9, 9, 30, 6, 3, null);
    this.box(det, T.x, 30.4, T.z, 9.8, 0.8, 9.8, thm, '#d8d0bf');
    this.box(det, T.x, 36, T.z, 7.5, 10.5, 7.5, thm, '#cfc6b3');
    this.box(det, T.x, 41.6, T.z, 8.4, 0.7, 8.4, thm, '#d8d0bf');
    const oct = (r, h) => new THREE.CylinderGeometry(r * 0.92, r, h, 8);
    this.geo(det, oct(3.6, 10), T.x, 47, T.z, thm, '#cfc6b3');
    // clock faces
    for (let k = 0; k < 4; k++) {
      const disc = new THREE.CircleGeometry(1.4, 20);
      const ang = thm + (k * Math.PI) / 2;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(T.x + Math.sin(ang) * 3.8, 45, T.z + Math.cos(ang) * 3.8),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      det.addGeometry(disc, m, '#1d2f5c');
    }
    this.geo(det, oct(2.8, 8), T.x, 56, T.z, thm, '#d8d0bf');
    this.geo(det, oct(2.0, 6), T.x, 63, T.z, thm, '#cfc6b3');
    // the blue imperial crown of Maximilian
    this.geo(det, new THREE.CylinderGeometry(2.3, 1.6, 1.2, 12), T.x, 66.6, T.z, 0, '#d4af37');
    const crown = new THREE.SphereGeometry(2.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    this.geo(det, crown, T.x, 67.2, T.z, 0, '#2c4f9e');
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      this.geo(det, new THREE.BoxGeometry(0.25, 2.4, 0.25), T.x + Math.sin(ang) * 1.9, 68.6, T.z + Math.cos(ang) * 1.9, ang, '#d4af37');
    }
    this.geo(det, new THREE.SphereGeometry(0.6, 8, 6), T.x, 70.2, T.z, 0, '#d4af37');
    this.geo(det, new THREE.CylinderGeometry(0.08, 0.35, 13, 6), T.x, 77, T.z, 0, '#c8a24a');
    this.geo(det, new THREE.BoxGeometry(1.4, 0.2, 0.2), T.x, 82.5, T.z, thm, '#d4af37');
    this.towerTop = { x: T.x, y: 80, z: T.z };
  }

  munttoren() {
    const p = P(224, 44.3);
    const det = this.d(p.x, p.z);
    const yaw = 44.3 * DEG;
    this.building(0, p.x, p.z, yaw, 8, 8, 13, 6.5, 2.6, null);
    this.box(det, p.x, 13.3, p.z, 8.6, 0.6, 8.6, yaw, '#d8d0bf');
    const oct = (r, h) => new THREE.CylinderGeometry(r * 0.94, r, h, 8);
    this.geo(det, oct(3.4, 7), p.x, 17, p.z, yaw, '#e3dccb');
    for (let k = 0; k < 4; k++) {
      const ang = yaw + (k * Math.PI) / 2;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x + Math.sin(ang) * 3.45, 17, p.z + Math.cos(ang) * 3.45),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      det.addGeometry(new THREE.CircleGeometry(1.3, 20), m, '#f4f0e4');
    }
    this.geo(det, oct(2.6, 4), p.x, 22.5, p.z, yaw, '#3d5e55');
    this.geo(det, new THREE.SphereGeometry(2.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), p.x, 24.5, p.z, 0, '#3d5e55');
    this.geo(det, oct(1.1, 3), p.x, 27.6, p.z, yaw, '#e3dccb');
    this.geo(det, new THREE.ConeGeometry(1.1, 5, 8), p.x, 31.6, p.z, yaw, '#3d5e55');
    this.geo(det, new THREE.BoxGeometry(1.2, 0.8, 0.15), p.x, 34.6, p.z, 0, '#d4af37');
  }

  magereBrug(desc) {
    // desc: bridge descriptor from StreetBuilder (ring street over the Amstel)
    const b = desc.band;
    const det = this.d(desc.center.x, desc.center.z);
    const white = '#f3f1ea';
    const rm = (b.r0 + b.r1) / 2;
    const pt = (u, r) => {
      const th = L.lineThetaAt(L.AMSTEL, u, r);
      return { x: r * Math.sin(th), z: r * Math.cos(th) };
    };
    // deck fascia and wooden trestle piers
    for (const r of [b.r0, b.r1]) {
      for (let u = -25; u < 25; u += 1) {
        const A = pt(u, r), B = pt(u + 1, r);
        const ya = L.heightAt(pt(u, rm).x, pt(u, rm).z), yb = L.heightAt(pt(u + 1, rm).x, pt(u + 1, rm).z);
        det.setColor(white);
        det.quad([A.x, ya - 0.7, A.z], [B.x, yb - 0.7, B.z], [B.x, yb + 0.05, B.z], [A.x, ya + 0.05, A.z]);
        det.quad([B.x, yb - 0.7, B.z], [A.x, ya - 0.7, A.z], [A.x, ya + 0.05, A.z], [B.x, yb + 0.05, B.z]);
        // railing
        if (Math.floor(u) % 2 === 0) {
          const g = new THREE.BoxGeometry(0.08, 1.0, 0.08);
          det.addGeometry(g, new THREE.Matrix4().makeTranslation(A.x, ya + 0.6, A.z), white);
        }
        const rail = (y) => {
          det.quad([A.x, ya + y, A.z], [B.x, yb + y, B.z], [B.x, yb + y + 0.08, B.z], [A.x, ya + y + 0.08, A.z]);
          det.quad([B.x, yb + y, B.z], [A.x, ya + y, A.z], [A.x, ya + y + 0.08, A.z], [B.x, yb + y + 0.08, B.z]);
        };
        rail(1.0);
        rail(0.55);
        if (Math.floor(u * 2) % 3 === 0) this.bulbs.push([A.x, ya + 1.15, A.z]);
      }
    }
    for (const u of [-25, -16.5, -8, 8, 16.5, 25]) {
      for (let r = b.r0 + 0.6; r <= b.r1 - 0.6; r += (b.r1 - b.r0 - 1.2) / 3) {
        const A = pt(u, r);
        this.box(det, A.x, L.WATER_Y + 0.6 + 0.5, A.z, 0.45, 2.6, 0.45, 0, white);
      }
    }
    // the two lift portals
    for (const u of [-6, 6]) {
      const yDeck = L.heightAt(pt(u, rm).x, pt(u, rm).z);
      const top = yDeck + 7.5;
      const posts = [pt(u, b.r0 - 0.4), pt(u, b.r1 + 0.4)];
      for (const A of posts) {
        this.box(det, A.x, (yDeck + top) / 2 - 0.3, A.z, 0.5, top - yDeck + 0.6, 0.5, 0, white);
        this.col.addCircle(A.x, A.z, 0.35, 'post');
      }
      // cross beam & balance beams
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        const r0 = b.r0 - 0.4 + ((b.r1 - b.r0 + 0.8) * i) / steps, r1 = b.r0 - 0.4 + ((b.r1 - b.r0 + 0.8) * (i + 1)) / steps;
        const A = pt(u, r0), B = pt(u, r1);
        this.box(det, (A.x + B.x) / 2, top, (A.z + B.z) / 2, Math.hypot(B.x - A.x, B.z - A.z) + 0.05, 0.45, 0.45, Math.atan2(-(B.z - A.z), B.x - A.x), white);
        this.bulbs.push([A.x, top + 0.35, A.z]);
      }
      for (const r of [b.r0 - 0.4, b.r1 + 0.4]) {
        const sgn = Math.sign(u);
        for (let k = 0; k < 9; k++) {
          const A = pt(u + sgn * k, r), B = pt(u + sgn * (k + 1), r);
          const yA = top - k * 0.12, yB = top - (k + 1) * 0.12;
          this.box(det, (A.x + B.x) / 2, (yA + yB) / 2 - 0.6, (A.z + B.z) / 2, 0.35, 0.35, Math.hypot(B.x - A.x, B.z - A.z) + 0.05, Math.atan2(B.x - A.x, B.z - A.z), white);
          this.bulbs.push([A.x, yA - 0.3, A.z]);
        }
      }
    }
  }

  rijksmuseum() {
    const R = L.RIJKS;
    const thp = -11.5 * DEG;
    const det = this.d(L.polarX(710, thp), L.polarZ(710, thp));
    const half = 5.2;
    // two wings either side of the passage
    for (const side of [-1, 1]) {
      const thEnd = side < 0 ? R.th0 : R.th1;
      const r0 = 692, r1 = 745;
      // build as a chain of straight segments along the arc
      const n = 6;
      for (let i = 0; i < n; i++) {
        const tA = thp + (thEnd - thp) * (i / n), tB = thp + (thEnd - thp) * ((i + 1) / n);
        const tm = (tA + tB) / 2;
        const rm = (r0 + r1) / 2;
        const segW = rm * Math.abs(tB - tA) + 0.6;
        let cx = rm * Math.sin(tm), cz = rm * Math.cos(tm);
        let w = segW;
        if (i === 0) {
          // keep the passage free: start at the passage edge
          const dv = { th: thp, off: 0 };
          const a = L.lineThetaAt(dv, side * half, rm);
          const tm2 = (a + tB) / 2;
          w = rm * Math.abs(tB - a);
          cx = rm * Math.sin(tm2);
          cz = rm * Math.cos(tm2);
        }
        this.building(1, cx, cz, Math.atan2(cx, cz), w, r1 - r0, 22, 5.5, 3.2, { h: 11, endColor: '#7b3a2a' });
      }
      // corner pavilion
      const pa = { x: 718 * Math.sin(thEnd - side * 1.2 * DEG), z: 718 * Math.cos(thEnd - side * 1.2 * DEG) };
      this.building(1, pa.x, pa.z, thEnd, 18, 56, 26, 5.2, 3, { h: 12, endColor: '#7b3a2a' });
      // central towers by the passage
      const tr = 694;
      const tpos = L.dividerPoint({ th: thp }, tr, side * (half + 6.5));
      this.building(1, tpos.x, tpos.z, thp, 12, 12, 34, 5.6, 3, null);
      const spire = new THREE.ConeGeometry(8.4, 16, 4);
      this.geo(det, spire, tpos.x, 42, tpos.z, thp + Math.PI / 4, '#3b4447');
      this.geo(det, new THREE.CylinderGeometry(0.1, 0.25, 5, 5), tpos.x, 52, tpos.z, 0, '#c8a24a');
    }
    // the bridge over the passage (cyclists ride underneath)
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const s0 = 690 + (58 * i) / steps, s1 = 690 + (58 * (i + 1)) / steps;
      const A = L.dividerPoint({ th: thp }, s0, -half), B = L.dividerPoint({ th: thp }, s1, -half);
      const C = L.dividerPoint({ th: thp }, s1, half), D = L.dividerPoint({ th: thp }, s0, half);
      det.setColor('#e6dccb');
      det.quad([A.x, 7.5, A.z], [B.x, 7.5, B.z], [C.x, 7.5, C.z], [D.x, 7.5, D.z], undefined, [0, -1, 0]);
      det.quad([D.x, 7.5, D.z], [C.x, 7.5, C.z], [B.x, 7.5, B.z], [A.x, 7.5, A.z], undefined, [0, -1, 0]);
      // tunnel walls with tiles
      for (const [p, q] of [[A, B], [C, D]]) {
        det.setColor('#c9b98f');
        det.quad([p.x, 0, p.z], [q.x, 0, q.z], [q.x, 7.5, q.z], [p.x, 7.5, p.z]);
        det.quad([q.x, 0, q.z], [p.x, 0, p.z], [p.x, 7.5, p.z], [q.x, 7.5, q.z]);
      }
      if (i % 2 === 0) {
        const M = L.dividerPoint({ th: thp }, s0, 0);
        this.bulbs.push([M.x, 7.3, M.z]);
      }
    }
    // block above the passage
    const mid = L.dividerPoint({ th: thp }, 717, 0);
    this.building(1, mid.x, mid.z, thp + Math.PI / 2, 56, 11, 14.5, 5, 3, { h: 9, endColor: '#7b3a2a' }, 7.5);
    // arches at both ends of the passage
    for (const s of [690, 746]) {
      const a = L.dividerPoint({ th: thp }, s, 0);
      const arch = new THREE.TorusGeometry(5.2, 0.6, 6, 16, Math.PI);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(a.x, 7.4, a.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, thp + Math.PI / 2, 0)), new THREE.Vector3(1, 0.4, 1));
      det.addGeometry(arch, m, '#d8ccb3');
    }
  }

  bloemenmarkt() {
    const r = this.rand;
    const det = this.d(L.polarX(245, -6 * DEG), L.polarZ(245, -6 * DEG));
    for (let th = -10; th < -1; th += 0.9) {
      const rr = 246.2;
      const t = th * DEG;
      const x = rr * Math.sin(t), z = rr * Math.cos(t);
      const yaw = t;
      // floating base
      this.box(det, x, L.WATER_Y + 0.5, z, 3.6, 1.0, 4.6, yaw, '#2d3b2f');
      // greenhouse stall
      this.box(det, x, L.WATER_Y + 2.6, z, 3.4, 3.2, 4.2, yaw, '#e9efe7');
      this.box(det, x, L.WATER_Y + 4.4, z, 3.8, 0.4, 4.8, yaw, '#2f5d3a');
      // flowers facing the quay (inner side)
      for (let k = 0; k < 6; k++) {
        const off = -1.4 + (k * 2.8) / 5;
        const px = x - Math.sin(t) * 2.5 + Math.cos(t) * off, pz = z - Math.cos(t) * 2.5 - Math.sin(t) * off;
        this.box(det, px, 0.25, pz, 0.45, 0.5, 0.45, yaw, pick(r, ['#e23d3d', '#f2c230', '#f07ab0', '#ffffff', '#ff7f2a', '#8e4ad6', '#d6264f']));
      }
    }
  }

  /** Low-detail city beyond the playable area + Amsterdam Noord across the IJ. */
  filler() {
    const r = this.rand;
    for (let ring = 0; ring < 5; ring++) {
      const rr = 790 + ring * 95;
      for (let th = -L.THETA_MAX + 0.03; th < L.THETA_MAX - 0.03; th += 26 / rr) {
        const x = rr * Math.sin(th), z = rr * Math.cos(th);
        if (th > L.MUSEUMPLEIN.th0 - 0.03 && th < L.MUSEUMPLEIN.th1 + 0.03 && rr < 1000) continue;
        if (Math.abs(L.perpDist(L.AMSTEL, x, z)) < 40) continue;
        const h = range(r, 12, 24);
        this.building(pick(r, [0, 1, 2, 4, 5, 7]), x, z, th, range(r, 18, 26), range(r, 30, 60), h, 3.2, 2.2, { h: 4, endColor: '#4a3a33' });
      }
    }
    // Noord skyline
    for (let i = 0; i < 26; i++) {
      const x = -700 + i * 56 + range(r, -10, 10), z = -760 - range(r, 0, 220);
      this.building(pick(r, [3, 4, 6]), x, z, range(r, -0.2, 0.2), range(r, 30, 50), range(r, 20, 40), range(r, 12, 30), 3.2, 2.4, null);
    }
    // a tall tower and an angular white museum on the far bank
    this.building(4, 120, -720, 0.1, 26, 26, 82, 3.4, 2.4, null);
    const det = this.d(-160, -700);
    const eye = new THREE.TetrahedronGeometry(30, 0);
    this.geo(det, eye, -160, 8, -700, 0.6, '#f4f4f2');
  }

  build(scene, streetBuilder) {
    this.palace();
    this.monument();
    this.centraal();
    this.westerkerk();
    this.munttoren();
    this.rijksmuseum();
    this.bloemenmarkt();
    this.filler();
    const mb = streetBuilder.bridges.find((b) => b.magere);
    if (mb) this.magereBrug(mb);
    const m = this.mats.m;
    const materials = { detail: m.detail, roof: m.roof, glassRoof: new THREE.MeshStandardMaterial({ color: 0x9aa7b0, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide }) };
    m.facades.forEach((mat, i) => (materials['f' + i] = mat));
    const group = new THREE.Group();
    group.name = 'landmarks';
    this.cb.toMeshes(group, materials, { castShadow: true, receiveShadow: true });
    scene.add(group);
    // bulbs
    if (this.bulbs.length) {
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), m.bulb, this.bulbs.length);
      const mtx = new THREE.Matrix4();
      this.bulbs.forEach((p, i) => inst.setMatrixAt(i, mtx.makeTranslation(p[0], p[1], p[2])));
      inst.visible = false;
      inst.frustumCulled = false;
      scene.add(inst);
      this.bulbMesh = inst;
    }
    return group;
  }
}
