// Infinite procedural world: tiled ground + obstacles generated in chunks around the player.
import * as THREE from 'three';
import { buildRock, buildTree, buildBarrel } from './models.js';

const TILE = 44;          // ground texture tile size (world units)
const CHUNK = 40;         // obstacle chunk size
const RADIUS = 2;         // chunks loaded in each direction

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7b716a';
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 32; row++) {
    const y = row * 16;
    let x = -rnd() * 60;
    while (x < 512) {
      const w = 20 + rnd() * 70;
      if (rnd() < 0.42) {
        const light = rnd() < 0.6;
        g.fillStyle = light ? `rgba(235,225,215,${0.10 + rnd() * 0.14})` : `rgba(40,32,30,${0.07 + rnd() * 0.09})`;
        g.fillRect(x, y + 3, w, 9 + rnd() * 3);
        // wrap horizontally so the tile is seamless
        if (x + w > 512) g.fillRect(x - 512, y + 3, w, 9);
      }
      x += w + 8 + rnd() * 40;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hash(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) | 0;
    h ^= h >>> 16;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    const size = 420;
    const tex = makeGroundTexture();
    tex.repeat.set(size / TILE, size / TILE);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    this.chunks = new Map();   // key -> { objects: [] }
    this.obstacles = [];       // flat list of active obstacles for collision
    this.safe = { x: 0, z: 0, r: 0 }; // area kept clear (spawn point)
  }

  reset(safeX = 0, safeZ = 0) {
    for (const [, ch] of this.chunks) for (const o of ch.objects) this.scene.remove(o.mesh);
    this.chunks.clear();
    this.obstacles = [];
    this.safe = { x: safeX, z: safeZ, r: 16 };
  }

  update(px, pz) {
    // Ground follows the player, snapped to tile size so the texture never slides.
    this.ground.position.x = Math.round(px / TILE) * TILE;
    this.ground.position.z = Math.round(pz / TILE) * TILE;

    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const needed = new Set();
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        needed.add(key);
        if (!this.chunks.has(key)) this._build(cx + dx, cz + dz, key);
      }
    }
    let changed = false;
    for (const [key, ch] of this.chunks) {
      if (!needed.has(key)) {
        for (const o of ch.objects) this.scene.remove(o.mesh);
        this.chunks.delete(key);
        changed = true;
      }
    }
    if (changed || this._dirty) {
      this.obstacles = [];
      for (const [, ch] of this.chunks) for (const o of ch.objects) if (!o.dead) this.obstacles.push(o);
      this._dirty = false;
    }
  }

  _build(cx, cz, key) {
    const rnd = hash(cx, cz);
    const objects = [];
    const count = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      const x = cx * CHUNK + rnd() * CHUNK;
      const z = cz * CHUNK + rnd() * CHUNK;
      if (Math.hypot(x - this.safe.x, z - this.safe.z) < this.safe.r) continue;
      if (objects.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 5)) continue;
      const roll = rnd();
      let mesh, r, kind;
      if (roll < 0.5) { r = 1.2 + rnd() * 1.8; mesh = buildRock(r); kind = 'rock'; r *= 0.95; }
      else if (roll < 0.8) { r = 0.9 + rnd() * 0.5; mesh = buildTree(r); kind = 'tree'; r *= 0.7; }
      else { r = 0.7; mesh = buildBarrel(); kind = 'barrel'; }
      mesh.position.x = x;
      mesh.position.z = z;
      this.scene.add(mesh);
      objects.push({ x, z, r, kind, mesh, dead: false });
    }
    this.chunks.set(key, { objects });
    this._dirty = true;
  }

  removeObstacle(o) {
    o.dead = true;
    this.scene.remove(o.mesh);
    this._dirty = true;
  }
}
