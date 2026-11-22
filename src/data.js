// Game data: player cars (garage), police units and tuning constants.

export const CARS = [
  { id: 'rusty',   name: 'Rusty Coupe',   price: 0,    model: 'coupe',  color: 0xe8572a, accent: 0x6fa8ff, speed: 22,   accel: 20, turn: 3.1, hp: 100, mass: 1.0,  grip: 6.0 },
  { id: 'taxi',    name: 'City Taxi',     price: 150,  model: 'taxi',   color: 0xffc928, accent: 0x6fa8ff, speed: 23,   accel: 21, turn: 3.2, hp: 115, mass: 1.05, grip: 6.5 },
  { id: 'pickup',  name: 'Farm Pickup',   price: 400,  model: 'pickup', color: 0x3d9b62, accent: 0x9fd3ff, speed: 21.5, accel: 19, turn: 2.95, hp: 170, mass: 1.5, grip: 5.5 },
  { id: 'viper',   name: 'Viper GT',      price: 800,  model: 'sport',  color: 0x2f6bff, accent: 0xffffff, speed: 26,   accel: 26, turn: 3.45, hp: 90,  mass: 0.95, grip: 7.0 },
  { id: 'muscle',  name: 'Muscle 69',     price: 1400, model: 'muscle', color: 0x1c1c1c, accent: 0xffd400, speed: 25,   accel: 24, turn: 3.2, hp: 145, mass: 1.3,  grip: 5.0 },
  { id: 'monster', name: 'Monster Truck', price: 2200, model: 'monster',color: 0x8e44ad, accent: 0x9fd3ff, speed: 22.5, accel: 21, turn: 2.85, hp: 280, mass: 2.6, grip: 6.0 },
  { id: 'hyper',   name: 'Hyper X',       price: 3500, model: 'super',  color: 0xf2f2f2, accent: 0xff2d55, speed: 29,   accel: 31, turn: 3.75, hp: 125, mass: 1.1, grip: 8.0 },
];

export const COPS = {
  patrol:      { name: 'Patrol',      model: 'patrol',      speed: 21,   accel: 20, turn: 2.5, hp: 60,  mass: 1.0, grip: 5.0, minLevel: 1, score: 5,  cash: 2,  weight: 10 },
  interceptor: { name: 'Interceptor', model: 'interceptor', speed: 25,   accel: 25, turn: 2.8, hp: 45,  mass: 0.9, grip: 6.0, minLevel: 2, score: 8,  cash: 3,  weight: 6 },
  swat:        { name: 'SWAT Van',    model: 'swat',        speed: 19.5, accel: 16, turn: 2.2, hp: 150, mass: 2.2, grip: 5.0, minLevel: 3, score: 15, cash: 5,  weight: 4 },
  tank:        { name: 'Army Tank',   model: 'tank',        speed: 14,   accel: 9,  turn: 1.5, hp: 450, mass: 6.0, grip: 9.0, minLevel: 5, score: 40, cash: 12, weight: 1.5 },
};

export const TUNING = {
  levelEvery: 25,        // seconds per wanted-level increase
  maxLevel: 6,
  nitroDrain: 38,        // per second
  nitroRegen: 5,
  nitroBoost: 1.45,      // max speed multiplier
  bustTime: 2.5,         // seconds boxed in before BUSTED
  explosionRadius: 7,
  explosionDamage: 45,
};

// Max values used to draw the garage stat bars
export const STAT_MAX = { speed: 30, accel: 32, turn: 3.8, hp: 300 };
