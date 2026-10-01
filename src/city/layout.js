// The analytic map of our Amsterdam.
//
// The real canal ring (grachtengordel) is a horseshoe of concentric canals
// opening north towards the IJ and Centraal Station. We model it in polar
// coordinates around the Dam: theta = 0 points south (+z), +90deg east (+x),
// 180deg north (-z). Everything (rendering, physics, AI, minimap) queries the
// same functions in this file, so what you see is exactly what you ride on.

import { DEG, clamp } from '../util/math.js';

export const WATER_Y = -1.9;
export const THETA_MAX = 115 * DEG; // half-angle of the canal-ring sector
export const R_PLAZA = 55; // the Dam
export const R_IJ = 320; // waterfront north of Prins Hendrikkade
export const R_EDGE = 735; // outer edge of the playable city
export const APPROACH = 4; // ramp length of bridges beyond the water edge
export const AMSTEL_TH = 40.25 * DEG;
export const AMSTEL_HW = 25;

// Centraal Station sits on its own island in the IJ, like the real one.
export const STATION_ISLAND = { x0: -140, x1: 140, z0: -412, z1: -349 };
export const STATION_BUILDING = { x0: -125, x1: 125, z0: -406, z1: -373 };
// Museumplein behind the Rijksmuseum.
export const MUSEUMPLEIN = { r0: 760, r1: 880, th0: -22 * DEG, th1: -1 * DEG };
export const RIJKS = { r0: 690, r1: 760, th0: -19 * DEG, th1: -4 * DEG, passageHalf: 5 };

export const toPolar = (x, z) => ({ r: Math.hypot(x, z), th: Math.atan2(x, z) });
export const polarX = (r, th) => r * Math.sin(th);
export const polarZ = (r, th) => r * Math.cos(th);

// ---------------------------------------------------------------------------
// Cross sections. Each is a list of strips from low lateral coordinate to high.
// kind: road | bike | side (sidewalk) | strip (trees + parking) | edge (quay stone)
// ---------------------------------------------------------------------------
const S = (w, kind, mat) => ({ w, kind, mat });
export const XS = {
  radialNormal: [S(2, 'side', 'tiles'), S(6, 'road', 'klinker'), S(2, 'side', 'tiles')],
  radialMain: [S(2.5, 'side', 'tiles'), S(2, 'bike', 'bike'), S(5, 'road', 'asphalt'), S(2, 'bike', 'bike'), S(2.5, 'side', 'tiles')],
  radialMajor: [S(3, 'side', 'tiles'), S(2.5, 'bike', 'bike'), S(13, 'road', 'asphalt'), S(2.5, 'bike', 'bike'), S(3, 'side', 'tiles')],
  damrak: [S(4, 'side', 'tiles'), S(2.5, 'bike', 'bike'), S(17, 'road', 'asphalt'), S(2.5, 'bike', 'bike'), S(4, 'side', 'tiles')],
  rokin: [S(3, 'side', 'tiles'), S(2, 'bike', 'bike'), S(6, 'road', 'asphalt'), S(2, 'bike', 'bike'), S(3, 'side', 'tiles')],
  boundary: [S(2.5, 'side', 'tiles'), S(9, 'road', 'klinker'), S(2.5, 'side', 'tiles')],
  quayWaterHigh: [S(2.5, 'side', 'tiles'), S(5.5, 'road', 'klinker'), S(2.5, 'strip', 'strip'), S(0.5, 'edge', 'granite')],
  quayWaterLow: [S(0.5, 'edge', 'granite'), S(2.5, 'strip', 'strip'), S(5.5, 'road', 'klinker'), S(2.5, 'side', 'tiles')],
  kerkstraat: [S(2, 'side', 'tiles'), S(6, 'road', 'klinker'), S(2, 'side', 'tiles')],
  stadhouderskade: [S(3, 'side', 'tiles'), S(2.4, 'bike', 'bike'), S(10, 'road', 'asphalt'), S(2.4, 'bike', 'bike'), S(3.7, 'strip', 'strip'), S(0.5, 'edge', 'granite')],
  prinsHendrikkade: [S(2.5, 'side', 'tiles'), S(2, 'bike', 'bike'), S(4.5, 'road', 'asphalt'), S(1.5, 'strip', 'strip'), S(0.5, 'edge', 'granite')],
  passage: [S(2, 'side', 'tiles'), S(6, 'bike', 'bike'), S(2, 'side', 'tiles')],
};

// ---------------------------------------------------------------------------
// Canals (ring shaped water). `full` canals go all the way round the old
// centre; the others are only in the horseshoe and flow into the IJ.
// ---------------------------------------------------------------------------
export const CANALS = [
  { id: 'voorburgwal', name: 'Oudezijds Voorburgwal', r: 150, hw: 8, full: true, bridgeH: 1.0 },
  { id: 'singel', name: 'Singel', r: 255, hw: 12, full: true, bridgeH: 1.25 },
  { id: 'heren', name: 'Herengracht', r: 355, hw: 12.5, full: false, bridgeH: 1.3 },
  { id: 'keizers', name: 'Keizersgracht', r: 460, hw: 13, full: false, bridgeH: 1.3 },
  { id: 'prinsen', name: 'Prinsengracht', r: 560, hw: 12, full: false, bridgeH: 1.25 },
  { id: 'singelgracht', name: 'Singelgracht', r: 660, hw: 16, full: false, bridgeH: 1.1 },
];
const CANAL_EXTRA = 6 * DEG; // partial canals run a little into the IJ

export function canalExistsAt(c, th) {
  return c.full || Math.abs(th) <= THETA_MAX + CANAL_EXTRA;
}

// ---------------------------------------------------------------------------
// Ring bands. sector: all | ring (|th|<=115deg) | wedge (|th|>115deg, north).
// ---------------------------------------------------------------------------
let bandId = 0;
const band = (r0, r1, type, sector, extra = {}) => ({ id: bandId++, r0, r1, type, sector, ...extra });

export const BANDS = [
  band(0, R_PLAZA, 'plaza', 'all', { name: 'Dam' }),
  band(55, 131, 'block', 'all'),
  band(131, 142, 'quay', 'all', { xs: XS.quayWaterHigh, name: 'Nieuwezijds Voorburgwal' }),
  band(142, 158, 'canal', 'all', { canal: 'voorburgwal' }),
  band(158, 169, 'quay', 'all', { xs: XS.quayWaterLow, name: 'Oudezijds Voorburgwal' }),
  band(169, 232, 'block', 'all'),
  band(232, 243, 'quay', 'all', { xs: XS.quayWaterHigh, name: 'Singel' }),
  band(243, 267, 'canal', 'all', { canal: 'singel' }),
  band(267, 278, 'quay', 'all', { xs: XS.quayWaterLow, name: 'Singel', amstelBridge: 'Muntbrug' }),
  // --- horseshoe
  band(278, 331.5, 'block', 'ring'),
  band(331.5, 342.5, 'quay', 'ring', { xs: XS.quayWaterHigh, name: 'Herengracht', amstelBridge: 'Blauwbrug' }),
  band(342.5, 367.5, 'canal', 'ring', { canal: 'heren' }),
  band(367.5, 378.5, 'quay', 'ring', { xs: XS.quayWaterLow, name: 'Herengracht' }),
  band(378.5, 436, 'block', 'ring'),
  band(436, 447, 'quay', 'ring', { xs: XS.quayWaterHigh, name: 'Keizersgracht' }),
  band(447, 473, 'canal', 'ring', { canal: 'keizers' }),
  band(473, 484, 'quay', 'ring', { xs: XS.quayWaterLow, name: 'Keizersgracht' }),
  band(484, 505, 'block', 'ring'),
  band(505, 515, 'street', 'ring', { xs: XS.kerkstraat, name: 'Kerkstraat', amstelBridge: 'Magere Brug' }),
  band(515, 537, 'block', 'ring'),
  band(537, 548, 'quay', 'ring', { xs: XS.quayWaterHigh, name: 'Prinsengracht' }),
  band(548, 572, 'canal', 'ring', { canal: 'prinsen' }),
  band(572, 583, 'quay', 'ring', { xs: XS.quayWaterLow, name: 'Prinsengracht', amstelBridge: 'Amstelsluizen' }),
  band(583, 622, 'block', 'ring'),
  band(622, 644, 'street', 'ring', { xs: XS.stadhouderskade, name: 'Stadhouderskade', amstelBridge: 'Hogesluis', tram: [630.4, 634.8] }),
  band(644, 676, 'canal', 'ring', { canal: 'singelgracht' }),
  band(676, 687, 'quay', 'ring', { xs: XS.quayWaterLow, name: 'Nassaukade' }),
  band(687, R_EDGE, 'block', 'ring', { edge: true }),
  // --- north wedge (old centre towards the IJ)
  band(278, 309, 'block', 'wedge'),
  band(309, 320, 'street', 'wedge', { xs: XS.prinsHendrikkade, name: 'Prins Hendrikkade' }),
];
for (const b of BANDS) if (b.canal) b.canalRef = CANALS.find((c) => c.id === b.canal);

export const inWedge = (th) => Math.abs(th) > THETA_MAX;
const sectorOk = (b, th) => b.sector === 'all' || (b.sector === 'ring') === !inWedge(th);

export function bandAt(r, th) {
  for (const b of BANDS) if (r >= b.r0 && r < b.r1 && sectorOk(b, th)) return b;
  return null;
}

// ---------------------------------------------------------------------------
// Radial dividers: straight streets (or water) parallel to a ray through the
// Dam, optionally offset sideways (the Amstel quays).
// ---------------------------------------------------------------------------
let divId = 0;
const div = (deg, start, end, w, xs, extra = {}) => ({
  id: divId++, th: deg * DEG, off: 0, start, end, w, hw: w / 2, xs, kind: 'street', ...extra,
});

const D = [];
D.push(div(180, 55, 352, 30, XS.damrak, { name: 'Damrak', tram: [-2.5, 2.5], major: true }));
D.push(div(0, 55, 687, 24, XS.radialMajor, { name: 'Vijzelstraat', tram: [-2.2, 2.2], major: true }));
D.push(div(-92, 55, 687, 14, XS.radialMain, { name: 'Raadhuisstraat', major: true }));
D.push(div(92, 55, 687, 14, XS.radialMain, { name: 'Utrechtsestraat', major: true }));
D.push(div(-115, 131, R_EDGE, 14, XS.boundary, { name: 'Haarlemmerstraat', boundary: true }));
D.push(div(115, 131, R_EDGE, 14, XS.boundary, { name: 'Kattenburgerstraat', boundary: true }));
D.push(div(-147.5, 131, R_IJ, 10, XS.radialNormal, { name: 'Nieuwendijk' }));
D.push(div(147.5, 131, R_IJ, 10, XS.radialNormal, { name: 'Zeedijk' }));
D.push(div(-57.5, 131, 687, 10, XS.radialNormal, { name: 'Huidenstraat' }));
D.push(div(57.5, 131, 687, 10, XS.radialNormal, { name: 'Reguliersbreestraat' }));
D.push(div(-23, 131, 687, 10, XS.radialNormal, { name: 'Leidsegracht' }));
D.push(div(23, 131, 687, 10, XS.radialNormal, { name: 'Reguliersdwarsstraat' }));
// Amstel: Rokin in the centre (the filled-in river), then real water.
D.push(div(40.25, 131, 243, 16, XS.rokin, { name: 'Rokin', major: true }));
D.push(div(40.25, 243, 820, 50, null, { kind: 'water', name: 'Amstel' }));
D.push(div(40.25, 232, 687, 11, XS.quayWaterHigh, { off: -30.5, name: 'Amstel' }));
D.push(div(40.25, 232, 687, 11, XS.quayWaterLow, { off: 30.5, name: 'Amstel' }));
// Streets that start at the Singel.
const singelStreets = {
  '-103.5': 'Brouwersgracht', '-80.5': 'Reestraat', '-69': 'Berenstraat', '-46': 'Runstraat',
  '-34.5': 'Leidsestraat', '-11.5': 'Spiegelstraat', '11.5': 'Vijzelgracht', '69': 'Amstelstraat',
  '80.5': 'Weesperstraat', '103.5': 'Nieuwe Herengracht',
};
for (const [deg, name] of Object.entries(singelStreets)) {
  const d = +deg;
  if (d === -11.5) D.push(div(d, 232, 880, 10, XS.radialNormal, { name, passage: true }));
  else if (d === -34.5) D.push(div(d, 232, 687, 14, XS.radialMain, { name, major: true }));
  else D.push(div(d, 232, 687, 10, XS.radialNormal, { name }));
}
export const DIVIDERS = D;
export const STREET_DIVIDERS = D.filter((d) => d.kind === 'street');
export const AMSTEL = D.find((d) => d.kind === 'water');

/** Signed distance from the divider's ray-line (positive = towards larger theta). */
export function perpDist(dv, x, z) {
  return x * Math.cos(dv.th) - z * Math.sin(dv.th);
}
/** Distance along the divider's ray. */
export function alongDist(dv, x, z) {
  return x * Math.sin(dv.th) + z * Math.cos(dv.th);
}
/** World position of a point on a divider given along distance s and perp offset d. */
export function dividerPoint(dv, s, d) {
  const c = Math.cos(dv.th), sn = Math.sin(dv.th);
  return { x: s * sn + d * c, z: s * c - d * sn };
}
/** Angle (theta) where the line perp = e crosses radius r. */
export function lineThetaAt(dv, e, r) {
  return dv.th + Math.asin(clamp(e / r, -1, 1));
}
export function dividerCovers(dv, r0, r1) {
  return dv.start <= r0 + 1e-6 && dv.end >= r1 - 1e-6;
}
/** Is (x,z) inside the divider's strip? Returns lateral coordinate or null. */
export function inDivider(dv, x, z) {
  const d = perpDist(dv, x, z) - dv.off;
  if (Math.abs(d) > dv.hw) return null;
  const s = alongDist(dv, x, z);
  // start/end are radii; convert to along-distance for offset strips
  const off2 = dv.off * dv.off;
  const s0 = Math.sqrt(Math.max(0, dv.start * dv.start - off2));
  const s1 = Math.sqrt(Math.max(0, dv.end * dv.end - off2));
  if (s < s0 || s > s1) return null;
  return d;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
export function inRect(rc, x, z, m = 0) {
  return x >= rc.x0 - m && x <= rc.x1 + m && z >= rc.z0 - m && z <= rc.z1 + m;
}

export function amstelWater(x, z) {
  const d = perpDist(AMSTEL, x, z);
  if (Math.abs(d) >= AMSTEL_HW) return false;
  const s = alongDist(AMSTEL, x, z);
  return s >= 243 && s <= 820;
}

/** Water beneath (ignores bridges). */
export function isWaterBase(x, z) {
  if (inRect(STATION_ISLAND, x, z)) return false;
  if (amstelWater(x, z)) return true;
  const r = Math.hypot(x, z);
  const th = Math.atan2(x, z);
  for (const c of CANALS) if (Math.abs(r - c.r) < c.hw && canalExistsAt(c, th)) return true;
  if (inWedge(th) && r > R_IJ) {
    for (const dv of STREET_DIVIDERS) if (dv.boundary && inDivider(dv, x, z) !== null) return false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Bridges & height
// ---------------------------------------------------------------------------
const bump = (t) => (t >= 1 ? 0 : (1 - t * t) * (1 - t * t));

/** Height contribution of a radial street crossing canals at (x,z). */
function radialBridgeHeight(dv, r, th) {
  let h = 0;
  const flat = dv.major ? 0.65 : 1;
  for (const c of CANALS) {
    if (!canalExistsAt(c, th)) continue;
    const L = c.hw + APPROACH;
    const u = Math.abs(r - c.r);
    if (u < L) h = Math.max(h, c.bridgeH * flat * bump(u / L));
  }
  if (dv.name === 'Damrak') {
    // flat crossing of the IJ to the station island
    const a = R_IJ - APPROACH, b = 349 + APPROACH;
    if (r > a && r < b) {
      const mid = (a + b) / 2, half = (b - a) / 2;
      h = Math.max(h, 0.55 * bump(Math.abs(r - mid) / half) + 0.0);
    }
  }
  return h;
}

export function amstelBridgeHeight(b, x, z) {
  if (!b.amstelBridge) return 0;
  const d = perpDist(AMSTEL, x, z);
  const L = AMSTEL_HW + APPROACH;
  if (Math.abs(d) >= L) return 0;
  const H = b.amstelBridge === 'Magere Brug' ? 0.9 : 1.5;
  return H * bump(Math.abs(d) / L);
}

/** Ground height of the walkable/rideable surface at (x,z) (bridges included). */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(x, z);
  let h = 0;
  for (const dv of STREET_DIVIDERS) {
    if (inDivider(dv, x, z) !== null) h = Math.max(h, radialBridgeHeight(dv, r, th));
  }
  const b = bandAt(r, th);
  if (b && (b.type === 'quay' || b.type === 'street')) h = Math.max(h, amstelBridgeHeight(b, x, z));
  return h;
}

// ---------------------------------------------------------------------------
// Surface query used by physics, AI and rules.
// ---------------------------------------------------------------------------
function stripAt(xs, lateral, total) {
  let acc = -total / 2;
  for (const s of xs) {
    if (lateral < acc + s.w) return s;
    acc += s.w;
  }
  return xs[xs.length - 1];
}
function stripAtRing(xs, r, r0) {
  let acc = r0;
  for (const s of xs) {
    if (r < acc + s.w) return s;
    acc += s.w;
  }
  return xs[xs.length - 1];
}

/**
 * What is at (x,z)?
 * kind: road | bike | side | strip | edge | plaza | grass | water | building | out
 */
export function surfaceAt(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(x, z);
  // Station island
  if (inRect(STATION_ISLAND, x, z)) {
    if (inRect(STATION_BUILDING, x, z)) return { kind: 'building', mat: 'brick', h: 0, name: 'Centraal Station' };
    return { kind: 'plaza', mat: 'plaza', h: 0, name: 'Stationsplein' };
  }
  // Radial streets (highest priority, they carry the bridges)
  let best = null;
  for (const dv of STREET_DIVIDERS) {
    const d = inDivider(dv, x, z);
    if (d === null) continue;
    const strip = stripAt(dv.xs, d, dv.w);
    const h = radialBridgeHeight(dv, r, th);
    if (!best || h > best.h) {
      best = { kind: strip.kind, mat: strip.mat, h, name: dv.name, divider: dv, lateral: d, bridge: isWaterBase(x, z) };
    }
  }
  if (best) {
    if (best.divider.passage && r > R_EDGE && r < RIJKS.r1) best.name = 'Rijksmuseum passage';
    return best;
  }
  if (r > R_EDGE) {
    if (r < MUSEUMPLEIN.r1 && th > MUSEUMPLEIN.th0 && th < MUSEUMPLEIN.th1) {
      if (r < RIJKS.r1 && th > RIJKS.th0 && th < RIJKS.th1) return { kind: 'building', mat: 'brick', h: 0, name: 'Rijksmuseum' };
      if (r > MUSEUMPLEIN.r0) return { kind: 'grass', mat: 'grass', h: 0, name: 'Museumplein' };
    }
    if (amstelWater(x, z)) return { kind: 'water', h: WATER_Y, name: 'Amstel' };
    return { kind: 'out', h: 0 };
  }
  const b = bandAt(r, th);
  if (b && (b.type === 'quay' || b.type === 'street')) {
    if (amstelWater(x, z)) {
      if (b.amstelBridge) {
        const strip = stripAtRing(b.xs, r, b.r0);
        return { kind: strip.kind, mat: strip.mat, h: amstelBridgeHeight(b, x, z), name: b.amstelBridge, band: b, bridge: true };
      }
      return { kind: 'water', h: WATER_Y, name: 'Amstel' };
    }
    const strip = stripAtRing(b.xs, r, b.r0);
    return { kind: strip.kind, mat: strip.mat, h: amstelBridgeHeight(b, x, z), name: b.name, band: b };
  }
  if (isWaterBase(x, z)) {
    let name = 'IJ';
    if (amstelWater(x, z)) name = 'Amstel';
    else for (const c of CANALS) if (Math.abs(r - c.r) < c.hw) name = c.name;
    return { kind: 'water', h: WATER_Y, name };
  }
  if (!b) return { kind: 'out', h: 0 };
  if (b.type === 'plaza') return { kind: 'plaza', mat: 'plaza', h: 0, name: 'Dam' };
  if (b.type === 'block') return { kind: 'building', mat: 'brick', h: 0, band: b };
  return { kind: 'out', h: 0 };
}

export const RIDEABLE = new Set(['road', 'bike', 'side', 'strip', 'edge', 'plaza', 'grass']);

// ---------------------------------------------------------------------------
// Blocks (where the canal houses stand)
// ---------------------------------------------------------------------------
export function activeDividers(b) {
  return DIVIDERS.filter((dv) => dividerCovers(dv, b.r0, b.r1)).filter((dv) => {
    if (b.sector === 'ring') return Math.abs(dv.th) <= THETA_MAX + 1e-6;
    if (b.sector === 'wedge') return Math.abs(dv.th) >= THETA_MAX - 1e-6;
    return true;
  });
}

/**
 * Each block: { band, r0, r1, A, eA, B, eB } where the block lies between the
 * line perp(A) = eA and perp(B) = eB (theta increasing from A to B).
 */
export function computeBlocks() {
  const blocks = [];
  for (const b of BANDS) {
    if (b.type !== 'block') continue;
    const rm = (b.r0 + b.r1) / 2;
    const dvs = activeDividers(b)
      .map((dv) => ({ dv, a: lineThetaAt(dv, dv.off, rm) }))
      .sort((p, q) => p.a - q.a);
    if (dvs.length === 0) continue;
    const pairs = [];
    if (b.sector === 'ring') {
      for (let i = 0; i + 1 < dvs.length; i++) pairs.push([dvs[i], dvs[i + 1]]);
    } else if (b.sector === 'wedge') {
      // order: +115 .. 180 .. -115 (wrapping)
      const pos = dvs.filter((p) => p.a > 0).sort((p, q) => p.a - q.a);
      const neg = dvs.filter((p) => p.a <= 0).sort((p, q) => p.a - q.a);
      const seq = [...pos, ...neg];
      for (let i = 0; i + 1 < seq.length; i++) pairs.push([seq[i], seq[i + 1]]);
    } else {
      for (let i = 0; i < dvs.length; i++) pairs.push([dvs[i], dvs[(i + 1) % dvs.length]]);
    }
    for (const [pa, pb] of pairs) {
      const A = pa.dv, B = pb.dv;
      const eA = A.off + A.hw;
      const eB = B.off - B.hw;
      const blk = { band: b, r0: b.r0, r1: b.r1, A, eA, B, eB };
      // reject blocks that are water (e.g. between the Amstel quays) or empty
      const t0 = blockThetaRange(blk, rm);
      let span = t0[1] - t0[0];
      if (span < 0) span += Math.PI * 2;
      if (span * rm < 8 || span > Math.PI * 1.5) continue;
      const mid = t0[0] + span / 2;
      if (isWaterBase(polarX(rm, mid), polarZ(rm, mid))) continue;
      blk.id = blocks.length;
      blocks.push(blk);
    }
  }
  return blocks;
}

/** [thetaStart, thetaEnd] of a block at radius r (end may be < start when wrapping). */
export function blockThetaRange(blk, r) {
  let a = lineThetaAt(blk.A, blk.eA, r);
  let b = lineThetaAt(blk.B, blk.eB, r);
  if (b < a) b += Math.PI * 2;
  return [a, b];
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------
export function placeName(x, z) {
  const s = surfaceAt(x, z);
  return s.name || '';
}
