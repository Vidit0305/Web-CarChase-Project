// Endless Car Chase — main game logic.
import * as THREE from 'three';
import { CARS, COPS, TUNING, STAT_MAX } from './data.js';
import { buildVehicle, buildPickup, sirenRed, sirenBlue } from './models.js';
import { Particles } from './particles.js';
import { World } from './world.js';
import { GameAudio } from './audio.js';
import { Leaderboard, cleanName } from './leaderboard.js';

// ======================= Save data =======================
const SAVE_KEY = 'endless-car-chase-v1';
const DEFAULT_SAVE = { cash: 0, best: 0, owned: ['rusty'], selected: 'rusty', sfx: true, music: true, name: '', pid: '' };
const save = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && Array.isArray(s.owned)) return { ...DEFAULT_SAVE, ...s };
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_SAVE };
})();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
if (!save.pid) {
  save.pid = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36);
  persist();
}
const leaderboard = new Leaderboard(save.pid);

// ======================= Three.js setup =======================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const BG = 0x80766f;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 75, 150);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5d524c, 1.5));
const sun = new THREE.DirectionalLight(0xfff3e0, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 140 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const world = new World(scene);
const particles = new Particles(scene);
const audio = new GameAudio();
audio.sfxOn = save.sfx;
audio.musicOn = save.music;

// ======================= DOM helpers =======================
const $ = (id) => document.getElementById(id);
const screens = ['menu', 'garage', 'hud', 'pause', 'over', 'nameScreen', 'board'];
function show(...ids) { for (const s of screens) $(s).classList.toggle('hidden', !ids.includes(s)); }
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

// ======================= Vehicles =======================
const hbGeo = new THREE.PlaneGeometry(1, 1);
const hbBgMat = new THREE.MeshBasicMaterial({ color: 0xd62d20, depthTest: false });
const hbFgMat = new THREE.MeshBasicMaterial({ color: 0x4cd964, depthTest: false });

class Vehicle {
  constructor(spec, model, color, accent, isCop) {
    const { group, body } = buildVehicle(model, color, accent);
    this.mesh = group;
    this.body = body;
    scene.add(group);
    this.spec = spec;
    this.model = model;
    this.isCop = isCop;
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0;
    this.hp = this.maxHp = spec.hp;
    this.mass = spec.mass;
    this.radius = model === 'tank' || model === 'swat' ? 2.0 : model === 'monster' ? 1.85 : 1.5;
    this.steer = 0;
    this.slip = 0;
    this.fs = 0;
    this.dead = false;
    this.crashCd = 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.aimJitter = (Math.random() - 0.5) * 0.6;
    if (isCop) {
      this.hb = new THREE.Group();
      const bg = new THREE.Mesh(hbGeo, hbBgMat); bg.scale.set(1.6, 0.18, 1);
      const fg = new THREE.Mesh(hbGeo, hbFgMat); fg.scale.set(1.6, 0.18, 1); fg.position.z = 0.01;
      bg.renderOrder = fg.renderOrder = 10;
      this.hb.add(bg, fg);
      this.hbFg = fg;
      this.hb.visible = false;
      scene.add(this.hb);
    }
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  remove() {
    scene.remove(this.mesh);
    if (this.hb) scene.remove(this.hb);
  }
  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.h;
    // body lean for a bouncy arcade feel
    this.body.rotation.z = THREE.MathUtils.clamp(-this.slip * 0.012, -0.12, 0.12);
    if (this.hb) {
      const r = Math.max(0, this.hp / this.maxHp);
      this.hb.visible = r < 1;
      this.hbFg.scale.x = 1.6 * r;
      this.hbFg.position.x = -0.8 * (1 - r);
      this.hb.position.set(this.x, this.model === 'swat' || this.model === 'tank' ? 3.6 : 2.6, this.z);
      this.hb.quaternion.copy(camera.quaternion);
    }
  }
}

/** Arcade car physics. steer: -1..1 (positive = turn left), throttle: -1..1 */
function drive(v, dt, throttle, maxSpeed, accel) {
  v.steer += (v.targetSteer - v.steer) * Math.min(1, dt * 10);
  const sf = THREE.MathUtils.clamp(v.fs / 7, -1, 1);
  v.h += v.steer * v.spec.turn * sf * dt;

  const fx = Math.sin(v.h), fz = Math.cos(v.h);
  const lx = fz, lz = -fx;
  let fs = v.vx * fx + v.vz * fz;
  let ls = v.vx * lx + v.vz * lz;

  if (throttle > 0) {
    if (fs < maxSpeed) fs = Math.min(maxSpeed, fs + accel * throttle * dt);
    else fs += (maxSpeed - fs) * Math.min(1, 1.5 * dt);
  } else if (throttle < 0) {
    fs = Math.max(-maxSpeed * 0.45, fs + accel * throttle * 1.4 * dt);
  } else {
    fs *= 1 - Math.min(1, 1.2 * dt);
  }
  ls *= Math.exp(-v.spec.grip * dt);

  v.vx = fx * fs + lx * ls;
  v.vz = fz * fs + lz * ls;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  v.fs = fs;
  v.slip = ls;
}

// ======================= Game state =======================
const G = {
  state: 'menu',
  player: null,
  cops: [],
  pickups: [],
  pending: [],        // delayed barrel explosions
  time: 0,
  bonus: 0,
  kills: 0,
  runCash: 0,
  level: 1,
  spawnT: 0,
  nitro: 100,
  nitroOn: false,
  bustT: 0,
  shake: 0,
  dyingT: 0,
  reason: '',
  garageIdx: Math.max(0, CARS.findIndex((c) => c.id === save.selected)),
  menuT: 0,
  sirenFlip: 0,
};

const input = { left: false, right: false, nitro: false, brake: false };

function carById(id) { return CARS.find((c) => c.id === id) || CARS[0]; }

function makePlayer(car) {
  if (G.player) G.player.remove();
  G.player = new Vehicle(car, car.model, car.color, car.accent, false);
  G.player.targetSteer = 0;
}

// ======================= Cops =======================
function pickCopType() {
  const pool = Object.entries(COPS).filter(([, c]) => c.minLevel <= G.level);
  const total = pool.reduce((a, [, c]) => a + c.weight, 0);
  let r = Math.random() * total;
  for (const [k, c] of pool) { r -= c.weight; if (r <= 0) return k; }
  return 'patrol';
}

function spawnCop() {
  const p = G.player;
  const type = pickCopType();
  const spec = COPS[type];
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = 52 + Math.random() * 14;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (!spotFree(x, z, 3.5)) continue;
    const c = new Vehicle(spec, spec.model, 0, 0, true);
    c.x = x; c.z = z;
    c.h = Math.atan2(p.x - x, p.z - z);
    c.targetSteer = 0;
    const lvlBoost = 1 + 0.035 * (G.level - 1);
    c.maxSpeed = spec.speed * lvlBoost;
    c.vx = Math.sin(c.h) * c.maxSpeed * 0.6;
    c.vz = Math.cos(c.h) * c.maxSpeed * 0.6;
    c.sync();
    G.cops.push(c);
    return;
  }
}

function copAI(c, dt) {
  const p = G.player;
  const dx = p.x - c.x, dz = p.z - c.z;
  const dist = Math.hypot(dx, dz);
  const lead = Math.min(dist / 25, 1.1);
  const tx = p.x + p.vx * lead * 0.7, tz = p.z + p.vz * lead * 0.7;
  const want = Math.atan2(tx - c.x, tz - c.z) + c.aimJitter * Math.min(1, dist / 30);
  let diff = want - c.h;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));

  let throttle = 1;
  if (c.reverseT > 0) {
    c.reverseT -= dt;
    throttle = -1;
    c.targetSteer = -Math.sign(diff);
  } else {
    c.targetSteer = THREE.MathUtils.clamp(diff * 2.2, -1, 1);
    if (Math.abs(c.fs) < 2.5) c.stuckT += dt; else c.stuckT = 0;
    if (c.stuckT > 1.2) { c.reverseT = 0.9; c.stuckT = 0; }
  }
  if (!G.player.dead && G.state === 'playing') drive(c, dt, throttle, c.maxSpeed, c.spec.accel);
  else drive(c, dt, 0.3, c.maxSpeed * 0.4, c.spec.accel);
}

// ======================= Pickups =======================
const PICKUP_TARGET = { cash: 12, nitro: 2, repair: 1 };

function spotFree(x, z, r) {
  for (const o of world.obstacles) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
  return true;
}

function addPickup(kind, x, z, value = 1) {
  const mesh = buildPickup(kind);
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  G.pickups.push({ kind, x, z, mesh, value, t: Math.random() * 6, vx: 0, vz: 0, life: kind === 'drop' ? 12 : Infinity });
}

function maintainPickups() {
  const p = G.player;
  const counts = { cash: 0, nitro: 0, repair: 0 };
  for (const k of G.pickups) if (counts[k.kind] !== undefined && !k.dropped) counts[k.kind]++;
  for (const kind of Object.keys(PICKUP_TARGET)) {
    let want = PICKUP_TARGET[kind];
    if (kind === 'repair' && p.hp / p.maxHp < 0.5) want = 2;
    if (counts[kind] < want) {
      const a = Math.random() * Math.PI * 2;
      const d = 22 + Math.random() * 45;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (spotFree(x, z, 1.5)) addPickup(kind, x, z, kind === 'cash' ? 5 : 1);
    }
  }
}

function updatePickups(dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    k.t += dt;
    if (k.vx || k.vz) {
      k.x += k.vx * dt; k.z += k.vz * dt;
      k.vx *= 1 - Math.min(1, 3 * dt); k.vz *= 1 - Math.min(1, 3 * dt);
      if (Math.abs(k.vx) + Math.abs(k.vz) < 0.05) k.vx = k.vz = 0;
    }
    const dx = p.x - k.x, dz = p.z - k.z;
    const d = Math.hypot(dx, dz);
    if (k.kind === 'cash' && d < 6 && !p.dead) { // magnet
      k.x += (dx / d) * 18 * dt; k.z += (dz / d) * 18 * dt;
    }
    k.mesh.position.set(k.x, 0.8 + Math.sin(k.t * 3) * 0.2, k.z);
    k.mesh.rotation.y = k.t * 2;
    if (k.dropped) { k.life -= dt; if (k.life < 2) k.mesh.visible = Math.floor(k.t * 10) % 2 === 0; }
    let remove = d > 100 || (k.dropped && k.life <= 0);
    if (!p.dead && G.state === 'playing' && d < p.radius + 0.9) {
      collect(k);
      remove = true;
    }
    if (remove) { scene.remove(k.mesh); G.pickups.splice(i, 1); }
  }
}

function collect(k) {
  const p = G.player;
  if (k.kind === 'cash') {
    save.cash += k.value; G.runCash += k.value;
    audio.cash();
    particles.cashBurst(k.x, k.z);
    popText(`+$${k.value}`, k.x, k.z, 'cash');
  } else if (k.kind === 'nitro') {
    G.nitro = Math.min(100, G.nitro + 50);
    audio.powerup();
    popText('NITRO!', k.x, k.z, 'nitro');
  } else if (k.kind === 'repair') {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    audio.powerup();
    popText('REPAIR!', k.x, k.z, 'repair');
  }
}

function dropCash(x, z, n) {
  for (let i = 0; i < n; i++) {
    addPickup('cash', x, z, 5);
    const k = G.pickups[G.pickups.length - 1];
    k.dropped = true;
    k.life = 12;
    const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 6;
    k.vx = Math.cos(a) * s; k.vz = Math.sin(a) * s;
  }
}

// ======================= Damage & explosions =======================
function damage(v, amount) {
  if (v.dead || amount <= 0) return;
  v.hp -= amount;
  if (v.hp <= 0) {
    v.hp = 0;
    if (v.isCop) killCop(v);
    else if (G.state === 'playing') wreckPlayer('WRECKED!');
  }
}

function killCop(c) {
  c.dead = true;
  G.kills++;
  G.bonus += c.spec.score;
  popText(`+${c.spec.score}`, c.x, c.z, 'score');
  dropCash(c.x, c.z, c.spec.cash);
  explode(c.x, c.z, c.model === 'tank' ? 1.6 : 1, c);
}

function explode(x, z, power = 1, source = null) {
  particles.explosion(x, z, power);
  const p = G.player;
  const dist = Math.hypot(p.x - x, p.z - z);
  audio.explosion(Math.max(0.15, 1 - dist / 70));
  G.shake = Math.max(G.shake, Math.max(0, 1.2 - dist / 40) * power);
  const R = TUNING.explosionRadius * power;
  for (const v of [p, ...G.cops]) {
    if (v === source || v.dead) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < R) {
      const k = 1 - d / R;
      const nx = (v.x - x) / (d || 1), nz = (v.z - z) / (d || 1);
      v.vx += nx * 14 * k / v.mass; v.vz += nz * 14 * k / v.mass;
      damage(v, TUNING.explosionDamage * k * power * (v.isCop ? 1 : 0.45));
    }
  }
  // chain-react barrels
  for (const o of world.obstacles) {
    if (o.kind === 'barrel' && !o.dead && !o.armed && Math.hypot(o.x - x, o.z - z) < R + 1) {
      o.armed = true;
      G.pending.push({ o, t: 0.18 });
    }
  }
}

function wreckPlayer(reason) {
  const p = G.player;
  p.dead = true;
  G.reason = reason;
  G.state = 'dying';
  G.dyingT = 1.8;
  if (reason === 'WRECKED!') {
    explode(p.x, p.z, 1.3, p);
    p.mesh.visible = false;
  } else {
    audio.busted();
  }
}

// ======================= Collisions =======================
function collide(dt) {
  const vs = [G.player, ...G.cops].filter((v) => !v.dead);
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    a.crashCd -= dt;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, nz = dz / d;
      const overlap = rr - d;
      const tm = a.mass + b.mass;
      a.x -= nx * overlap * (b.mass / tm); a.z -= nz * overlap * (b.mass / tm);
      b.x += nx * overlap * (a.mass / tm); b.z += nz * overlap * (a.mass / tm);
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel >= 0) continue;
      const e = 0.35;
      const jImp = (-(1 + e) * vrel) / (1 / a.mass + 1 / b.mass);
      a.vx -= (jImp / a.mass) * nx; a.vz -= (jImp / a.mass) * nz;
      b.vx += (jImp / b.mass) * nx; b.vz += (jImp / b.mass) * nz;
      const impact = -vrel;
      if (impact > 4) {
        const base = (impact - 4) * 1.8;
        damage(a, base * Math.sqrt(b.mass / a.mass) * (a.isCop ? 1 : 0.5));
        damage(b, base * Math.sqrt(a.mass / b.mass) * (b.isCop ? 1 : 0.5));
        const cx = a.x + nx * a.radius, cz = a.z + nz * a.radius;
        particles.sparks(cx, cz, Math.min(14, Math.floor(impact / 2)));
        if (a.crashCd <= 0) {
          const dist = Math.hypot(G.player.x - cx, G.player.z - cz);
          audio.crash(Math.max(0, 1 - dist / 60) * Math.min(1, impact / 15));
          a.crashCd = 0.25;
        }
        if (!a.isCop || !b.isCop) G.shake = Math.max(G.shake, Math.min(0.6, impact / 30));
      }
    }
    // static obstacles
    for (const o of world.obstacles) {
      if (o.dead) continue;
      const dx = a.x - o.x, dz = a.z - o.z;
      const rr = a.radius + o.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, nz = dz / d;
      if (o.kind === 'barrel') {
        if (!o.armed) { o.armed = true; G.pending.push({ o, t: 0 }); }
        continue;
      }
      a.x = o.x + nx * rr; a.z = o.z + nz * rr;
      const vn = a.vx * nx + a.vz * nz;
      if (vn < 0) {
        a.vx -= 1.3 * vn * nx; a.vz -= 1.3 * vn * nz;
        const impact = -vn;
        if (impact > 3) {
          damage(a, (impact - 3) * (a.isCop ? 3.4 : 1.3));
          particles.sparks(a.x - nx * a.radius, a.z - nz * a.radius, 6);
          if (a.crashCd <= 0) {
            const dist = Math.hypot(G.player.x - a.x, G.player.z - a.z);
            audio.crash(Math.max(0, 1 - dist / 60) * Math.min(1, impact / 15));
            a.crashCd = 0.25;
          }
          if (!a.isCop) G.shake = Math.max(G.shake, Math.min(0.7, impact / 25));
        }
      }
    }
  }
}

// ======================= Floating text & indicators =======================
const popLayer = $('pops');
const tmpV = new THREE.Vector3();
function popText(text, x, z, cls) {
  tmpV.set(x, 2, z).project(camera);
  if (Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) return;
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${(tmpV.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-tmpV.y * 0.5 + 0.5) * innerHeight}px`;
  popLayer.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

const arrows = [];
const arrowLayer = $('arrows');
function updateArrows() {
  let n = 0;
  if (G.state === 'playing') {
    for (const c of G.cops) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - G.player.x, c.z - G.player.z);
      if (d > 75) continue;
      tmpV.set(c.x, 0.5, c.z).project(camera);
      if (tmpV.z < 1 && Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1) continue;
      let sx = tmpV.x, sy = tmpV.y;
      if (tmpV.z > 1) { sx = -sx; sy = -sy; }
      const m = Math.max(Math.abs(sx), Math.abs(sy)) || 1;
      sx /= m; sy /= m;
      if (!arrows[n]) { const el = document.createElement('div'); el.className = 'arrow'; arrowLayer.appendChild(el); arrows[n] = el; }
      const el = arrows[n++];
      const px = (sx * 0.5 + 0.5) * innerWidth, py = (-sy * 0.5 + 0.5) * innerHeight;
      const cx = THREE.MathUtils.clamp(px, 26, innerWidth - 26), cy = THREE.MathUtils.clamp(py, 90, innerHeight - 26);
      const ang = Math.atan2(-sy, sx);
      el.style.display = 'block';
      el.style.opacity = (1 - d / 75) * 0.8 + 0.2;
      el.style.transform = `translate(${cx}px, ${cy}px) rotate(${ang}rad)`;
    }
  }
  for (let i = n; i < arrows.length; i++) arrows[i].style.display = 'none';
}

// ======================= Run lifecycle =======================
function clearRun() {
  for (const c of G.cops) c.remove();
  G.cops = [];
  for (const k of G.pickups) scene.remove(k.mesh);
  G.pickups = [];
  G.pending = [];
  particles.clear();
}

function startRun() {
  audio.init();
  clearRun();
  world.reset(0, 0);
  makePlayer(carById(save.selected));
  const p = G.player;
  p.x = 0; p.z = 0; p.h = Math.PI; p.vx = 0; p.vz = -6;
  Object.assign(G, { time: 0, bonus: 0, kills: 0, runCash: 0, level: 1, spawnT: 2.5, nitro: 100, bustT: 0, shake: 0, state: 'playing' });
  world.update(p.x, p.z);
  for (let i = 0; i < 10; i++) maintainPickups();
  G.snapCam = true;
  show('hud');
  $('levelFlash').classList.remove('show');
  updateHud(true);
}

function endRun() {
  G.state = 'over';
  const score = Math.floor(G.time) + G.bonus;
  const newBest = score > save.best;
  if (newBest) save.best = score;
  persist();
  $('overTitle').textContent = G.reason;
  $('overTitle').classList.toggle('busted', G.reason === 'BUSTED!');
  $('overScore').textContent = score;
  $('overBest').textContent = save.best;
  $('newBest').classList.toggle('hidden', !newBest);
  $('overTime').textContent = formatTime(G.time);
  $('overKills').textContent = G.kills;
  $('overCash').textContent = `$${G.runCash}`;
  $('overRank').textContent = 'Saving to leaderboard…';
  show('over');
  const entry = {
    name: save.name || 'Driver',
    time: Math.round(G.time * 10) / 10,
    score,
    kills: G.kills,
    car: carById(save.selected).name,
    date: new Date().toISOString(),
  };
  leaderboard.submit(entry).then(({ rank, local }) => {
    if (G.state !== 'over') return;
    $('overRank').textContent = rank ? `🏆 ${local ? 'YOUR' : 'LEADERBOARD'} RANK #${rank}` : '';
  }).catch(() => { $('overRank').textContent = ''; });
}

function preciseTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// ======================= Name entry =======================
function openName(returnTo = 'menu') {
  G.nameReturn = returnTo;
  G.state = 'name';
  $('nameInput').value = save.name || '';
  $('nameError').textContent = '';
  show('menu', 'nameScreen');
  setTimeout(() => $('nameInput').focus(), 50);
}

$('nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  audio.init();
  const name = cleanName($('nameInput').value);
  if (name.length < 2) { $('nameError').textContent = 'Please enter at least 2 letters.'; return; }
  const changed = save.name && save.name !== name;
  save.name = name;
  persist();
  if (changed) leaderboard.rename(name);
  audio.click();
  $('nameInput').blur();
  if (G.nameReturn === 'play') startRun();
  else { G.state = 'menu'; refreshMenu(); show('menu'); }
});

// ======================= Leaderboard screen =======================
function openBoard(returnTo) {
  G.boardReturn = returnTo;
  if (returnTo === 'menu') G.state = 'board';
  show(returnTo === 'over' ? 'over' : 'menu', 'board');
  setBoardTab(G.boardTab || 'global');
}

function closeBoard() {
  if (G.boardReturn === 'over') show('over');
  else { G.state = 'menu'; refreshMenu(); show('menu'); }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function rowHtml(e, rank) {
  const medal = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
  const rankTxt = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank;
  return `<div class="board-row ${medal} ${e.me ? 'me' : ''}">
    <span class="rank">${rankTxt}</span>
    <span class="name">${esc(e.name || 'Driver')}${e.me ? ' (you)' : ''}<small>${esc(e.car || '')}</small></span>
    <span class="time">${preciseTime(Number(e.time) || 0)}</span>
    <span>${Number(e.score) || 0}</span>
    <span class="hide-sm">${Number(e.kills) || 0}</span>
  </div>`;
}

async function setBoardTab(tab) {
  G.boardTab = tab;
  $('tabGlobal').classList.toggle('active', tab === 'global');
  $('tabMine').classList.toggle('active', tab === 'mine');
  const list = $('boardList');
  const token = (G.boardToken = (G.boardToken || 0) + 1);

  if (tab === 'mine') {
    const runs = leaderboard.localRuns().map((r) => ({ ...r, me: false }));
    $('boardMode').textContent = 'Your best runs on this device';
    list.innerHTML = runs.length
      ? runs.slice(0, 30).map((r, i) => rowHtml(r, i + 1)).join('')
      : '<div class="board-empty">No runs yet.<br>Play a game to set your first time!</div>';
    return;
  }

  $('boardMode').textContent = 'Loading…';
  list.innerHTML = '<div class="board-empty">Loading leaderboard…</div>';
  try {
    await leaderboard.ready;
    if (token !== G.boardToken) return;
    if (leaderboard.mode === 'local') {
      const runs = leaderboard.localRuns().map((r) => ({ ...r, me: false }));
      $('boardMode').textContent = 'Online leaderboard not connected — showing this device';
      list.innerHTML = runs.length ? runs.slice(0, 30).map((r, i) => rowHtml(r, i + 1)).join('')
        : '<div class="board-empty">No times yet.<br>Be the first on the board!</div>';
      return;
    }
    const { entries, you } = await leaderboard.fetchGlobal();
    if (token !== G.boardToken) return;
    $('boardMode').textContent = `${leaderboard.label} · ranked by time survived`;
    let html = entries.map((e, i) => rowHtml(e, i + 1)).join('');
    if (you) html += `<div class="board-row gap">• • •</div>${rowHtml(you, you.rank)}`;
    list.innerHTML = html || '<div class="board-empty">No times yet.<br>Be the first on the board!</div>';
  } catch (e) {
    if (token !== G.boardToken) return;
    $('boardMode').textContent = 'Could not reach the leaderboard';
    list.innerHTML = '<div class="board-empty">Leaderboard is offline right now.<br>Check MY RUNS for your times.</div>';
  }
}

function goMenu() {
  clearRun();
  world.reset(0, 0);
  G.state = 'menu';
  makePlayer(carById(save.selected));
  G.player.h = 0.6;
  G.player.sync();
  refreshMenu();
  show('menu');
}

function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ======================= HUD =======================
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHud(force) {
  if (force) for (const k in hudCache) delete hudCache[k];
  const p = G.player;
  setText('score', String(Math.floor(G.time) + G.bonus));
  setText('cash', `$${save.cash}`);
  setText('kills', String(G.kills));
  setText('time', formatTime(G.time));
  $('hpFill').style.width = `${(p.hp / p.maxHp) * 100}%`;
  $('hpFill').classList.toggle('low', p.hp / p.maxHp < 0.3);
  $('nitroFill').style.width = `${G.nitro}%`;
  const stars = '★'.repeat(G.level) + '☆'.repeat(TUNING.maxLevel - G.level);
  setText('stars', stars);
  const bust = Math.min(1, G.bustT / TUNING.bustTime);
  $('bust').style.opacity = bust > 0.05 ? 1 : 0;
  $('bustFill').style.width = `${bust * 100}%`;
}

function refreshMenu() {
  $('driverName').textContent = save.name || 'Set your name';
  $('menuBest').textContent = save.best;
  $('menuCash').textContent = `$${save.cash}`;
  $('btnSfx').classList.toggle('off', !save.sfx);
  $('btnMusic').classList.toggle('off', !save.music);
}

// ======================= Garage =======================
function openGarage() {
  G.state = 'garage';
  G.garageIdx = Math.max(0, CARS.findIndex((c) => c.id === save.selected));
  clearRun();
  renderGarage();
  show('garage');
}

function renderGarage() {
  const car = CARS[G.garageIdx];
  makePlayer(car);
  G.player.sync();
  $('gName').textContent = car.name;
  $('gCash').textContent = `$${save.cash}`;
  $('gIndex').textContent = `${G.garageIdx + 1} / ${CARS.length}`;
  const stats = [
    ['Top speed', car.speed / STAT_MAX.speed],
    ['Acceleration', car.accel / STAT_MAX.accel],
    ['Handling', car.turn / STAT_MAX.turn],
    ['Armor', car.hp / STAT_MAX.hp],
  ];
  $('gStats').innerHTML = stats.map(([n, v]) =>
    `<div class="stat"><span>${n}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`).join('');
  const owned = save.owned.includes(car.id);
  const btn = $('gAction');
  btn.classList.remove('locked', 'selected');
  if (owned && save.selected === car.id) { btn.textContent = 'SELECTED ✓'; btn.classList.add('selected'); }
  else if (owned) btn.textContent = 'SELECT';
  else {
    btn.textContent = `BUY $${car.price}`;
    if (save.cash < car.price) btn.classList.add('locked');
  }
}

function garageAction() {
  const car = CARS[G.garageIdx];
  if (save.owned.includes(car.id)) {
    save.selected = car.id;
    audio.click();
  } else if (save.cash >= car.price) {
    save.cash -= car.price;
    save.owned.push(car.id);
    save.selected = car.id;
    audio.levelUp();
  } else {
    $('gAction').classList.add('shake');
    setTimeout(() => $('gAction').classList.remove('shake'), 400);
    return;
  }
  persist();
  renderGarage();
}

// ======================= Main update =======================
function updatePlaying(dt) {
  const p = G.player;
  G.time += dt;

  // wanted level
  const lvl = Math.min(TUNING.maxLevel, 1 + Math.floor(G.time / TUNING.levelEvery));
  if (lvl !== G.level) {
    G.level = lvl;
    const names = { 2: 'INTERCEPTORS INCOMING', 3: 'SWAT DEPLOYED', 5: 'THE ARMY IS HERE', 6: 'MAXIMUM HEAT' };
    $('levelFlash').innerHTML = `WANTED LEVEL ${lvl}<small>${names[lvl] || 'MORE COPS!'}</small>`;
    const lf = $('levelFlash');
    lf.classList.remove('show'); void lf.offsetWidth; lf.classList.add('show');
    audio.levelUp();
  }

  // player controls
  p.targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const wantsNitro = input.nitro && G.nitro > 1;
  if (wantsNitro && !G.nitroOn) audio.nitro();
  G.nitroOn = wantsNitro;
  if (G.nitroOn) G.nitro = Math.max(0, G.nitro - TUNING.nitroDrain * dt);
  else G.nitro = Math.min(100, G.nitro + TUNING.nitroRegen * dt);
  const maxS = p.spec.speed * (G.nitroOn ? TUNING.nitroBoost : 1);
  const acc = p.spec.accel * (G.nitroOn ? 2 : 1);
  drive(p, dt, input.brake ? -1 : 1, maxS, acc);

  // cops
  G.spawnT -= dt;
  const maxCops = Math.min(12, 2 + Math.floor(G.level * 1.6));
  if (G.spawnT <= 0 && G.cops.length < maxCops) {
    spawnCop();
    G.spawnT = Math.max(0.7, 3.4 - G.level * 0.45);
  }
  for (const c of G.cops) copAI(c, dt);

  collide(dt);
  postUpdate(dt);

  // busted check: slow and touching a cop
  if (G.state === 'playing') {
    const boxed = p.speed < 3.5 && G.cops.some((c) => !c.dead && Math.hypot(c.x - p.x, c.z - p.z) < c.radius + p.radius + 1.3);
    G.bustT = boxed ? G.bustT + dt : Math.max(0, G.bustT - dt * 2);
    if (G.bustT >= TUNING.bustTime) wreckPlayer('BUSTED!');
  }

  maintainPickups();
  updatePickups(dt);
  updateHud();
}

/** shared post-physics work: dead cop cleanup, effects, barrels */
function postUpdate(dt) {
  const p = G.player;
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const c = G.cops[i];
    if (c.dead || Math.hypot(c.x - p.x, c.z - p.z) > 130) { c.remove(); G.cops.splice(i, 1); }
  }
  for (let i = G.pending.length - 1; i >= 0; i--) {
    const b = G.pending[i];
    b.t -= dt;
    if (b.t <= 0) {
      G.pending.splice(i, 1);
      if (!b.o.dead) { world.removeObstacle(b.o); explode(b.o.x, b.o.z, 1.2); }
    }
  }
  // visual effects
  const vs = p.dead ? G.cops : [p, ...G.cops];
  for (const v of vs) {
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const back = v.radius * 1.1;
    if (Math.abs(v.slip) > 3.2 && Math.abs(v.fs) > 6 && Math.random() < 0.9) {
      for (const s of [-1, 1]) particles.smoke(v.x - fx * back + fz * 0.8 * s, v.z - fz * back - fx * 0.8 * s, v.isCop ? 0.9 : 1);
    }
    if (v.hp / v.maxHp < 0.35 && Math.random() < 0.25) particles.darkSmoke(v.x + fx, 1.2, v.z + fz);
    v.sync();
  }
  if (G.nitroOn && !p.dead) {
    const fx = Math.sin(p.h), fz = Math.cos(p.h);
    for (const s of [-0.45, 0.45]) particles.nitroFlame(p.x - fx * 2.1 + fz * s, p.z - fz * 2.1 - fx * s, p.vx * 0.5 - fx * 6, p.vz * 0.5 - fz * 6);
  }
}

const camPos = new THREE.Vector3(0, 40, 25);
const camLook = new THREE.Vector3();
function updateCamera(dt, t) {
  const p = G.player;
  if (G.state === 'menu' || G.state === 'garage' || G.state === 'name' || G.state === 'board') {
    const a = t * 0.25;
    const r = G.state === 'garage' ? 8.5 : 13;
    const tx = p.x + Math.sin(a) * r, tz = p.z + Math.cos(a) * r;
    camPos.lerp(new THREE.Vector3(tx, G.state === 'garage' ? 4.2 : 6, tz), Math.min(1, dt * 3));
    camLook.lerp(new THREE.Vector3(p.x, G.state === 'garage' ? -0.6 : 3.9, p.z), Math.min(1, dt * 4));
  } else {
    const portrait = camera.aspect < 1;
    const speed01 = Math.min(1, p.speed / 30);
    const h = (portrait ? 58 : 40) + speed01 * 8;
    const back = (portrait ? 26 : 22) + speed01 * 4;
    const look = new THREE.Vector3(p.x + p.vx * 0.3, 0, p.z + p.vz * 0.3);
    const k = G.snapCam ? 1 : Math.min(1, dt * 5);
    G.snapCam = false;
    camLook.lerp(look, k);
    camPos.lerp(new THREE.Vector3(camLook.x, h, camLook.z + back), k);
  }
  camera.position.copy(camPos);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake * 1.5;
    camera.position.z += (Math.random() - 0.5) * G.shake * 1.5;
    G.shake = Math.max(0, G.shake - dt * 2.5);
  }
  camera.lookAt(camLook);
  sun.position.set(p.x + 20, 45, p.z + 15);
  sun.target.position.set(p.x, 0, p.z);
}

// ======================= Loop =======================
let last = performance.now();
let elapsed = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  // siren light flashing
  G.sirenFlip += dt;
  if (G.sirenFlip > 0.14) {
    G.sirenFlip = 0;
    const on = sirenRed.color.getHex() !== 0xff2030;
    sirenRed.color.setHex(on ? 0xff2030 : 0x4a0008);
    sirenBlue.color.setHex(on ? 0x08104a : 0x2060ff);
  }

  const p = G.player;
  if (G.state === 'playing') {
    updatePlaying(dt);
  } else if (G.state === 'dying') {
    const sdt = dt * 0.4; // slow motion
    G.dyingT -= dt;
    for (const c of G.cops) copAI(c, sdt);
    if (!p.dead || G.reason === 'BUSTED!') drive(p, sdt, 0, 0, 10);
    collide(sdt);
    postUpdate(sdt);
    particles.update(sdt);
    updatePickups(sdt);
    if (G.dyingT <= 0) endRun();
  } else if (G.state === 'menu' || G.state === 'garage' || G.state === 'name' || G.state === 'board') {
    p.sync();
  } else if (G.state === 'over') {
    for (const c of G.cops) { drive(c, dt, 0, 0, 10); c.sync(); }
  }

  if (G.state !== 'paused') {
    if (G.state !== 'dying') particles.update(dt);
    world.update(p.x, p.z);
    updateCamera(dt, elapsed);
  }
  updateArrows();

  // audio
  let nearest = 999;
  for (const c of G.cops) if (!c.dead) nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.z - p.z));
  audio.update(Math.min(1, Math.abs(p.fs) / 30), G.nitroOn && G.state === 'playing', Math.max(0, 1 - nearest / 60), G.state === 'playing');

  renderer.render(scene, camera);
}

// ======================= Input =======================
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'nitro', KeyW: 'nitro', Space: 'nitro', ShiftLeft: 'nitro', ShiftRight: 'nitro',
  ArrowDown: 'brake', KeyS: 'brake',
};
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (G.state === 'name') return;
  if (e.code === 'Escape' && G.state === 'board') { closeBoard(); return; }
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if ((e.code === 'Enter' || e.code === 'Space') && (G.state === 'menu' || G.state === 'over') && !e.repeat && $('board').classList.contains('hidden')) {
    e.preventDefault();
    if (save.name) startRun(); else openName("play");
  }
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) input[k] = false; });
addEventListener('blur', () => { for (const k in input) input[k] = false; if (G.state === 'playing') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') togglePause(); });

function holdButton(id, key) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); input[key] = true; el.classList.add('down'); };
  const off = (e) => { e.preventDefault(); input[key] = false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
holdButton('tLeft', 'left');
holdButton('tRight', 'right');
holdButton('tNitro', 'nitro');

function togglePause() {
  if (G.state === 'playing') { G.state = 'paused'; show('hud', 'pause'); }
  else if (G.state === 'paused') { G.state = 'playing'; last = performance.now(); show('hud'); }
}

const click = (id, fn) => $(id).addEventListener('click', () => { audio.init(); audio.click(); fn(); });
click('btnPlay', () => (save.name ? startRun() : openName('play')));
click('btnBoard', () => openBoard('menu'));
click('btnOverBoard', () => openBoard('over'));
click('boardBack', closeBoard);
click('tabGlobal', () => setBoardTab('global'));
click('tabMine', () => setBoardTab('mine'));
click('btnDriver', () => openName('menu'));
click('btnGarage', openGarage);
click('btnSfx', () => { save.sfx = !save.sfx; audio.setSfx(save.sfx); persist(); refreshMenu(); });
click('btnMusic', () => { save.music = !save.music; audio.setMusic(save.music); persist(); refreshMenu(); });
click('gPrev', () => { G.garageIdx = (G.garageIdx + CARS.length - 1) % CARS.length; renderGarage(); });
click('gNext', () => { G.garageIdx = (G.garageIdx + 1) % CARS.length; renderGarage(); });
$('gAction').addEventListener('click', () => { audio.init(); garageAction(); });
click('gBack', goMenu);
click('btnPause', togglePause);
click('btnResume', togglePause);
click('btnRestart', startRun);
click('btnQuit', goMenu);
click('btnRetry', startRun);
click('btnOverGarage', openGarage);
click('btnOverMenu', goMenu);

// ======================= Resize & boot =======================
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

goMenu();
if (!save.name) openName('menu');
requestAnimationFrame((t) => { last = t; frame(t); });

// expose for debugging in the console
window.__game = { G, save, input, startRun };
