// Low-poly models built from primitives (no external assets needed).
import * as THREE from 'three';

const matCache = new Map();
export function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }
  return matCache.get(color);
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
wheelGeo.rotateZ(Math.PI / 2);

// Shared flashing light materials for every police vehicle
export const sirenRed = new THREE.MeshBasicMaterial({ color: 0xff2030 });
export const sirenBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });

const GLASS = 0x1d2b3a;
const TIRE = 0x1a1a1a;
const RIM = 0xbfc5cc;
const HEAD = 0xfff4b0;
const TAIL = 0xff3b30;

function box(parent, w, h, d, color, x, y, z, material) {
  const m = new THREE.Mesh(boxGeo, material || mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function wheels(g, x, y, zf, zb, r = 0.38, w = 0.32) {
  for (const sx of [-1, 1]) {
    for (const z of [zf, zb]) {
      const t = new THREE.Mesh(wheelGeo, mat(TIRE));
      t.scale.set(w, r, r);
      t.position.set(sx * x, y, z);
      t.castShadow = true;
      g.add(t);
      const rim = new THREE.Mesh(wheelGeo, mat(RIM));
      rim.scale.set(w + 0.02, r * 0.5, r * 0.5);
      rim.position.set(sx * x, y, z);
      g.add(rim);
    }
  }
}

function lights(g, w, y, zFront, zBack) {
  for (const sx of [-1, 1]) {
    box(g, 0.32, 0.16, 0.06, HEAD, sx * (w / 2 - 0.25), y, zFront);
    box(g, 0.32, 0.14, 0.06, TAIL, sx * (w / 2 - 0.25), y, zBack);
  }
}

function lightbar(g, y, z = 0, w = 1.0) {
  box(g, w + 0.1, 0.08, 0.32, 0x222222, 0, y, z);
  box(g, w / 2, 0.16, 0.26, 0, -w / 4, y + 0.1, z, sirenRed);
  box(g, w / 2, 0.16, 0.26, 0, w / 4, y + 0.1, z, sirenBlue);
}

// Every model faces +Z (front) and sits on y = 0.
const builders = {
  coupe(g, c, a) {
    box(g, 1.8, 0.55, 3.6, c, 0, 0.58, 0);
    box(g, 1.5, 0.45, 1.7, GLASS, 0, 1.05, -0.25);
    box(g, 1.54, 0.1, 1.5, c, 0, 1.3, -0.3);
    box(g, 1.82, 0.12, 0.5, a, 0, 0.9, 1.2); // hood stripe
    lights(g, 1.8, 0.62, 1.81, -1.81);
    wheels(g, 0.86, 0.38, 1.15, -1.15);
  },
  taxi(g, c) {
    box(g, 1.85, 0.55, 3.8, c, 0, 0.58, 0);
    box(g, 1.6, 0.5, 2.0, GLASS, 0, 1.1, -0.2);
    box(g, 1.64, 0.1, 1.9, c, 0, 1.38, -0.2);
    box(g, 0.7, 0.28, 0.35, 0x111111, 0, 1.55, -0.2);
    box(g, 0.66, 0.2, 0.37, 0xfff3a0, 0, 1.57, -0.2);
    box(g, 1.87, 0.12, 2.6, 0x111111, 0, 0.62, 0); // checker strip
    lights(g, 1.85, 0.62, 1.91, -1.91);
    wheels(g, 0.88, 0.38, 1.25, -1.25);
  },
  pickup(g, c) {
    box(g, 1.9, 0.6, 4.1, c, 0, 0.65, 0);
    box(g, 1.7, 0.6, 1.4, GLASS, 0, 1.2, 0.35);
    box(g, 1.74, 0.12, 1.3, c, 0, 1.55, 0.35);
    box(g, 1.9, 0.4, 0.12, c, 0, 1.15, -2.0);
    box(g, 0.12, 0.4, 2.0, c, -0.89, 1.15, -1.0);
    box(g, 0.12, 0.4, 2.0, c, 0.89, 1.15, -1.0);
    box(g, 0.5, 0.3, 0.5, 0x8b5a2b, 0.3, 1.1, -1.2); // hay bale
    lights(g, 1.9, 0.7, 2.06, -2.06);
    wheels(g, 0.9, 0.44, 1.35, -1.35, 0.44, 0.36);
  },
  sport(g, c, a) {
    box(g, 1.9, 0.45, 3.9, c, 0, 0.48, 0);
    box(g, 1.5, 0.38, 1.5, GLASS, 0, 0.86, -0.4);
    box(g, 1.52, 0.08, 1.3, c, 0, 1.06, -0.45);
    box(g, 0.25, 0.47, 3.92, a, -0.35, 0.49, 0);
    box(g, 0.25, 0.47, 3.92, a, 0.35, 0.49, 0);
    box(g, 1.9, 0.08, 0.4, 0x111111, 0, 1.05, -1.8); // spoiler
    box(g, 0.1, 0.3, 0.2, 0x111111, -0.7, 0.85, -1.8);
    box(g, 0.1, 0.3, 0.2, 0x111111, 0.7, 0.85, -1.8);
    lights(g, 1.9, 0.5, 1.96, -1.96);
    wheels(g, 0.9, 0.36, 1.25, -1.25, 0.36, 0.34);
  },
  muscle(g, c, a) {
    box(g, 1.9, 0.6, 4.0, c, 0, 0.6, 0);
    box(g, 1.55, 0.42, 1.6, GLASS, 0, 1.1, -0.45);
    box(g, 1.58, 0.1, 1.45, c, 0, 1.33, -0.45);
    box(g, 0.6, 0.18, 0.9, 0x333333, 0, 1.0, 1.1); // scoop
    box(g, 0.22, 0.62, 4.02, a, -0.3, 0.61, 0);
    box(g, 0.22, 0.62, 4.02, a, 0.3, 0.61, 0);
    box(g, 0.22, 0.12, 1.47, a, -0.3, 1.34, -0.45);
    box(g, 0.22, 0.12, 1.47, a, 0.3, 1.34, -0.45);
    lights(g, 1.9, 0.65, 2.01, -2.01);
    wheels(g, 0.9, 0.42, 1.3, -1.3, 0.42, 0.4);
  },
  monster(g, c) {
    box(g, 2.0, 0.6, 3.8, c, 0, 1.45, 0);
    box(g, 1.7, 0.55, 1.6, GLASS, 0, 2.0, -0.1);
    box(g, 1.74, 0.12, 1.5, c, 0, 2.32, -0.1);
    box(g, 1.2, 0.3, 3.2, 0x333333, 0, 0.95, 0); // frame
    for (const sx of [-0.5, -0.17, 0.17, 0.5]) box(g, 0.14, 0.14, 0.1, 0xffffaa, sx, 2.45, 0.6);
    lights(g, 2.0, 1.5, 1.91, -1.91);
    wheels(g, 1.15, 0.8, 1.25, -1.25, 0.8, 0.6);
  },
  super(g, c, a) {
    box(g, 2.0, 0.4, 4.2, c, 0, 0.42, 0);
    box(g, 1.7, 0.3, 1.0, c, 0, 0.7, 1.2);
    box(g, 1.4, 0.36, 1.4, GLASS, 0, 0.8, -0.3);
    box(g, 1.6, 0.36, 1.2, c, 0, 0.78, -1.3);
    box(g, 2.0, 0.1, 0.12, a, 0, 0.64, 2.05);
    box(g, 0.12, 0.42, 4.22, a, -0.95, 0.43, 0);
    box(g, 0.12, 0.42, 4.22, a, 0.95, 0.43, 0);
    box(g, 2.1, 0.08, 0.45, 0x111111, 0, 1.25, -1.95);
    box(g, 0.12, 0.35, 0.2, 0x111111, -0.8, 1.05, -1.95);
    box(g, 0.12, 0.35, 0.2, 0x111111, 0.8, 1.05, -1.95);
    lights(g, 2.0, 0.45, 2.11, -2.11);
    wheels(g, 0.95, 0.38, 1.35, -1.3, 0.38, 0.36);
  },
  patrol(g) {
    box(g, 1.85, 0.55, 3.8, 0x16181d, 0, 0.58, 0);
    box(g, 1.87, 0.5, 1.6, 0xf4f4f4, 0, 0.6, 0); // white doors
    box(g, 1.6, 0.48, 2.0, GLASS, 0, 1.1, -0.2);
    box(g, 1.64, 0.1, 1.9, 0xf4f4f4, 0, 1.38, -0.2);
    lightbar(g, 1.48, -0.1);
    box(g, 1.6, 0.25, 0.12, 0x333333, 0, 0.5, 1.92); // push bar
    lights(g, 1.85, 0.62, 1.91, -1.91);
    wheels(g, 0.88, 0.38, 1.25, -1.25);
  },
  interceptor(g) {
    box(g, 1.9, 0.48, 3.9, 0x0e1a3a, 0, 0.5, 0);
    box(g, 1.92, 0.12, 3.92, 0xffffff, 0, 0.55, 0);
    box(g, 1.5, 0.38, 1.5, GLASS, 0, 0.9, -0.35);
    box(g, 1.52, 0.08, 1.3, 0x0e1a3a, 0, 1.1, -0.4);
    lightbar(g, 1.18, -0.4, 0.8);
    lights(g, 1.9, 0.52, 1.96, -1.96);
    wheels(g, 0.9, 0.36, 1.25, -1.25, 0.36, 0.34);
  },
  swat(g) {
    box(g, 2.15, 1.7, 4.4, 0x1b2233, 0, 1.25, 0);
    box(g, 2.17, 0.5, 1.0, GLASS, 0, 1.6, 1.5);
    box(g, 2.2, 0.25, 4.0, 0x2c3650, 0, 0.55, 0);
    box(g, 1.9, 0.35, 0.2, 0x444444, 0, 0.6, 2.25); // ram
    lightbar(g, 2.15, 1.2, 1.2);
    lights(g, 2.15, 0.75, 2.21, -2.21);
    wheels(g, 1.0, 0.45, 1.5, -1.5, 0.45, 0.4);
  },
  tank(g) {
    box(g, 2.6, 0.85, 4.4, 0x56653a, 0, 0.9, 0);
    box(g, 0.6, 0.7, 4.6, 0x262626, -1.35, 0.45, 0);
    box(g, 0.6, 0.7, 4.6, 0x262626, 1.35, 0.45, 0);
    box(g, 1.7, 0.6, 1.9, 0x4a5832, 0, 1.6, -0.3);
    const barrel = new THREE.Mesh(wheelGeo, mat(0x3b4526));
    barrel.scale.set(2.4, 0.14, 0.14);
    barrel.rotation.y = Math.PI / 2;
    barrel.position.set(0, 1.65, 1.6);
    g.add(barrel);
    lightbar(g, 1.95, -0.6, 0.8);
  },
};

/** Build a vehicle group. Returns { group, body } where body is the tilting part. */
export function buildVehicle(model, color = 0xff0000, accent = 0xffffff) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  (builders[model] || builders.coupe)(body, color, accent);
  // blob shadow helps readability on low-end devices
  return { group, body };
}

// ---------- Obstacles ----------
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const coneGeo = new THREE.ConeGeometry(1, 1, 7);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);

export function buildRock(r) {
  const m = new THREE.Mesh(rockGeo, mat(0xd8cfa6));
  m.scale.set(r, r * 0.8, r * 1.05);
  m.position.y = r * 0.45;
  m.rotation.set(Math.random(), Math.random() * 6, Math.random());
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildTree(r) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(cylGeo, mat(0x7a5232));
  trunk.scale.set(r * 0.3, 1.2, r * 0.3);
  trunk.position.y = 0.6;
  trunk.castShadow = true;
  g.add(trunk);
  const greens = [0x3f8f4a, 0x4fa357, 0x357a3f];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(coneGeo, mat(greens[i]));
    const s = r * (1.6 - i * 0.4);
    c.scale.set(s, 1.6, s);
    c.position.y = 1.6 + i * 1.0;
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

export function buildBarrel() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(cylGeo, mat(0xd62d20));
  b.scale.set(0.55, 1.1, 0.55);
  b.position.y = 0.55;
  b.castShadow = true;
  g.add(b);
  const band = new THREE.Mesh(cylGeo, mat(0xffd400));
  band.scale.set(0.57, 0.18, 0.57);
  band.position.y = 0.6;
  g.add(band);
  return g;
}

export function buildPickup(kind) {
  const g = new THREE.Group();
  if (kind === 'cash') {
    box(g, 0.9, 0.3, 0.5, 0x7ed957, 0, 0, 0);
    box(g, 0.25, 0.32, 0.52, 0xffffff, 0, 0, 0);
  } else if (kind === 'nitro') {
    const c = new THREE.Mesh(cylGeo, mat(0x1ec8ff));
    c.scale.set(0.35, 1.0, 0.35);
    g.add(c);
    box(g, 0.2, 0.25, 0.2, 0xdddddd, 0, 0.6, 0);
  } else if (kind === 'repair') {
    box(g, 0.9, 0.9, 0.9, 0xffffff, 0, 0, 0);
    box(g, 0.92, 0.2, 0.55, 0xff3b30, 0, 0, 0);
    box(g, 0.2, 0.92, 0.55, 0xff3b30, 0, 0, 0);
  }
  return g;
}
