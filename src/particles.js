// Pooled particle system: tyre smoke, fire, debris, sparks, nitro flames.
import * as THREE from 'three';

const sphereGeo = new THREE.IcosahedronGeometry(1, 0);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

const MATS = {
  smoke: new THREE.MeshLambertMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.35, depthWrite: false }),
  dark: new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.6, depthWrite: false }),
  fire1: new THREE.MeshBasicMaterial({ color: 0xffb21e }),
  fire2: new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
  fire3: new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  debris: new THREE.MeshLambertMaterial({ color: 0x1b1b1b }),
  spark: new THREE.MeshBasicMaterial({ color: 0xfff2a8 }),
  nitro: new THREE.MeshBasicMaterial({ color: 0x48d8ff }),
  cash: new THREE.MeshBasicMaterial({ color: 0x7ed957 }),
};

export class Particles {
  constructor(scene, size = 600) {
    this.items = [];
    this.free = [];
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(sphereGeo, MATS.smoke);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      const p = { mesh: m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 0, g: 0, spin: 0, alive: false };
      this.items.push(p);
      this.free.push(p);
    }
  }

  spawn(type, x, y, z, vx, vy, vz, life, s0, s1, g = 0, cube = false) {
    const p = this.free.pop();
    if (!p) return;
    p.alive = true;
    p.mesh.visible = true;
    p.mesh.material = MATS[type];
    p.mesh.geometry = cube ? cubeGeo : sphereGeo;
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = 0; p.max = life; p.s0 = s0; p.s1 = s1; p.g = g;
    p.bell = type === 'smoke' || type === 'dark';
    p.spin = cube ? (Math.random() - 0.5) * 12 : 0;
    p.mesh.scale.setScalar(s0);
  }

  smoke(x, z, scale = 1) {
    this.spawn('smoke', x + (Math.random() - 0.5) * 0.4, 0.3, z + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.4, 0.35 * scale, 0.9 * scale);
  }

  darkSmoke(x, y, z) {
    this.spawn('dark', x, y, z, (Math.random() - 0.5), 2 + Math.random(), (Math.random() - 0.5), 1.2, 0.3, 1.0);
  }

  nitroFlame(x, z, vx, vz) {
    this.spawn(Math.random() < 0.5 ? 'nitro' : 'fire3', x, 0.55, z, vx, 0.2, vz, 0.22, 0.32, 0.05);
  }

  sparks(x, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 8;
      this.spawn('spark', x, 0.7, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 0.35, 0.12, 0.02, -20, true);
    }
  }

  explosion(x, z, big = 1) {
    const fires = ['fire1', 'fire2', 'fire3'];
    for (let i = 0; i < 26 * big; i++) {
      const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 7) * big;
      this.spawn(fires[i % 3], x, 0.8 + Math.random(), z, Math.cos(a) * s, 1 + Math.random() * 5, Math.sin(a) * s,
        0.5 + Math.random() * 0.5, (0.6 + Math.random() * 0.6) * big, 0.05, -2);
    }
    for (let i = 0; i < 18 * big; i++) {
      const a = Math.random() * Math.PI * 2, s = 5 + Math.random() * 10;
      this.spawn('debris', x, 1, z, Math.cos(a) * s, 5 + Math.random() * 8, Math.sin(a) * s,
        1.2 + Math.random(), 0.15 + Math.random() * 0.25, 0.1, -25, true);
    }
    for (let i = 0; i < 10 * big; i++) this.darkSmoke(x + (Math.random() - 0.5) * 2, 1, z + (Math.random() - 0.5) * 2);
  }

  cashBurst(x, z) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn('cash', x, 0.8, z, Math.cos(a) * 3, 4, Math.sin(a) * 3, 0.5, 0.2, 0.02, -12, true);
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.alive = false;
        p.mesh.visible = false;
        this.free.push(p);
        continue;
      }
      p.vy += p.g * dt;
      const m = p.mesh;
      m.position.x += p.vx * dt;
      m.position.y += p.vy * dt;
      m.position.z += p.vz * dt;
      if (m.position.y < 0.05) { m.position.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.vx *= 0.97; p.vz *= 0.97;
      if (p.spin) { m.rotation.x += p.spin * dt; m.rotation.z += p.spin * dt; }
      const t = p.life / p.max;
      m.scale.setScalar(p.bell ? Math.max(0.01, (p.s0 + (p.s1 - p.s0) * t) * (1 - t * t)) : p.s0 + (p.s1 - p.s0) * t);
    }
  }

  clear() {
    for (const p of this.items) {
      if (p.alive) { p.alive = false; p.mesh.visible = false; this.free.push(p); }
    }
  }
}
