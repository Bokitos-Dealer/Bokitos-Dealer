// Static obstacles (trees, posts, parked cars ...) in a uniform grid.
export class StaticColliders {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.count = 0;
  }
  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }
  insert(c, x0, z0, x1, z1) {
    const s = this.cell;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++)
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this.key(ix, iz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(c);
      }
    this.count++;
  }
  addCircle(x, z, r, tag) {
    const c = { type: 'c', x, z, r, tag };
    this.insert(c, x - r, z - r, x + r, z + r);
    return c;
  }
  /** Oriented box: half extents hx (along angle) and hz (perpendicular). */
  addBox(x, z, hx, hz, angle, tag) {
    const c = { type: 'b', x, z, hx, hz, ca: Math.cos(angle), sa: Math.sin(angle), tag };
    const r = Math.hypot(hx, hz);
    this.insert(c, x - r, z - r, x + r, z + r);
    return c;
  }
  /**
   * Deepest penetration of a circle (x,z,rad) with static obstacles.
   * Returns null or { nx, nz, depth, tag }.
   */
  collide(x, z, rad) {
    const s = this.cell;
    let best = null;
    const seen = new Set();
    for (let ix = Math.floor((x - rad) / s); ix <= Math.floor((x + rad) / s); ix++)
      for (let iz = Math.floor((z - rad) / s); iz <= Math.floor((z + rad) / s); iz++) {
        const a = this.grid.get(this.key(ix, iz));
        if (!a) continue;
        for (const c of a) {
          if (seen.has(c)) continue;
          seen.add(c);
          let hit = null;
          if (c.type === 'c') {
            const dx = x - c.x, dz = z - c.z;
            const d = Math.hypot(dx, dz);
            const pen = c.r + rad - d;
            if (pen > 0) hit = { nx: d > 1e-6 ? dx / d : 1, nz: d > 1e-6 ? dz / d : 0, depth: pen, tag: c.tag };
          } else {
            // local coords
            const dx = x - c.x, dz = z - c.z;
            const lx = dx * c.ca + dz * c.sa, lz = -dx * c.sa + dz * c.ca;
            const cx = Math.max(-c.hx, Math.min(c.hx, lx)), cz = Math.max(-c.hz, Math.min(c.hz, lz));
            const ex = lx - cx, ez = lz - cz;
            const d = Math.hypot(ex, ez);
            if (d < rad) {
              let nlx, nlz, pen;
              if (d > 1e-6) {
                nlx = ex / d; nlz = ez / d; pen = rad - d;
              } else {
                // centre inside the box: push out along the smallest axis
                const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
                if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + rad; }
                else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz + rad; }
              }
              hit = { nx: nlx * c.ca - nlz * c.sa, nz: nlx * c.sa + nlz * c.ca, depth: pen, tag: c.tag };
            }
          }
          if (hit && (!best || hit.depth > best.depth)) best = hit;
        }
      }
    return best;
  }
}
