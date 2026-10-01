// Geometry accumulation helpers. The whole city is merged into a few large
// meshes per material (split into spatial chunks for frustum culling).
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

export class MeshBuilder {
  constructor(withColor = false) {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = withColor ? [] : null;
    this.idx = [];
    this.color = [1, 1, 1];
  }
  get vertexCount() {
    return this.pos.length / 3;
  }
  setColor(c) {
    if (typeof c === 'number' || typeof c === 'string') {
      _c.set(c);
      this.color = [_c.r, _c.g, _c.b];
    } else this.color = c;
    return this;
  }
  vertex(x, y, z, nx, ny, nz, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    if (this.col) this.col.push(this.color[0], this.color[1], this.color[2]);
    return this.pos.length / 3 - 1;
  }
  /** Quad a-b-c-d counter-clockwise when seen from the front. Points are [x,y,z]. */
  quad(a, b, c, d, uv = [0, 0, 1, 0, 1, 1, 0, 1], normal = null) {
    let nx, ny, nz;
    if (normal) [nx, ny, nz] = normal;
    else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      _n.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx).normalize();
      nx = _n.x; ny = _n.y; nz = _n.z;
    }
    const i0 = this.vertex(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1]);
    const i1 = this.vertex(b[0], b[1], b[2], nx, ny, nz, uv[2], uv[3]);
    const i2 = this.vertex(c[0], c[1], c[2], nx, ny, nz, uv[4], uv[5]);
    const i3 = this.vertex(d[0], d[1], d[2], nx, ny, nz, uv[6], uv[7]);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }
  tri(a, b, c, uv = [0, 0, 1, 0, 0.5, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    _n.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx).normalize();
    const i0 = this.vertex(a[0], a[1], a[2], _n.x, _n.y, _n.z, uv[0], uv[1]);
    const i1 = this.vertex(b[0], b[1], b[2], _n.x, _n.y, _n.z, uv[2], uv[3]);
    const i2 = this.vertex(c[0], c[1], c[2], _n.x, _n.y, _n.z, uv[4], uv[5]);
    this.idx.push(i0, i1, i2);
  }
  /** Grid strip: rows of points (arrays of [x,y,z]) with matching uv rows. */
  grid(rows, uvRows, smoothNormalUp = true) {
    const base = this.vertexCount;
    const nr = rows.length, nc = rows[0].length;
    for (let i = 0; i < nr; i++)
      for (let j = 0; j < nc; j++) {
        const p = rows[i][j];
        const t = uvRows[i][j];
        this.vertex(p[0], p[1], p[2], 0, 1, 0, t[0], t[1]);
      }
    for (let i = 0; i + 1 < nr; i++)
      for (let j = 0; j + 1 < nc; j++) {
        const a = base + i * nc + j, b = a + 1, c = a + nc + 1, d = a + nc;
        this.idx.push(a, d, c, a, c, b);
      }
    if (!smoothNormalUp) this._recomputeRange = true;
  }
  /** Merge a THREE.BufferGeometry transformed by matrix. */
  addGeometry(geo, matrix, color = null) {
    const base = this.vertexCount;
    const p = geo.attributes.position, n = geo.attributes.normal, t = geo.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const col = color ? (_c.set(color), [_c.r, _c.g, _c.b]) : this.color;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) {
        _n.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      } else this.nor.push(0, 1, 0);
      if (t) this.uv.push(t.getX(i), t.getY(i));
      else this.uv.push(0, 0);
      if (this.col) this.col.push(col[0], col[1], col[2]);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const big = this.vertexCount > 65535;
    g.setIndex(big ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (this._recomputeRange) g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Builders keyed by material name and spatial chunk. */
export class ChunkedBuilders {
  constructor(chunkSize = 220) {
    this.size = chunkSize;
    this.map = new Map();
  }
  get(mat, x, z, withColor = false) {
    const key = `${mat}|${Math.floor(x / this.size)}|${Math.floor(z / this.size)}`;
    let b = this.map.get(key);
    if (!b) {
      b = new MeshBuilder(withColor);
      b.mat = mat;
      this.map.set(key, b);
    }
    return b;
  }
  /** Create meshes and add them to parent. materials: { name: Material } */
  toMeshes(parent, materials, { castShadow = false, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [key, b] of this.map) {
      if (b.idx.length === 0) continue;
      const mesh = new THREE.Mesh(b.build(), materials[b.mat]);
      const [, ix, iz] = key.split('|');
      mesh.userData.chunk = { x: (+ix + 0.5) * this.size, z: (+iz + 0.5) * this.size, size: this.size, mat: b.mat };
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}
