# 🚓 Endless Car Chase

A fast 3D cop-chase arcade game for the browser, built with Three.js. You drift, dodge and trick police cars, SWAT vans and army tanks into crashing into each other.

It's a pure static site: no build step and no backend. All sound is synthesized in code, so there are no audio files to host.

## Features
- **Top-down 3D chase** with arcade drift physics, tyre smoke and body lean
- **4 enemy types** that unlock as your wanted level rises (★1–★6): Patrol → Interceptor → SWAT Van → Army Tank
- **Crash the cops:** cop-vs-cop collisions, rocks and trees all do damage. Wrecked cops explode, damage nearby cars and drop cash
- **Explosive red barrels** that chain-react
- **Nitro boost** (meter + pickups), **repair kits** and a **cash magnet**
- **BUSTED mechanic:** if you get boxed in while stopped, you're arrested
- **Garage shop** with 7 unlockable cars, each with different speed, acceleration, handling and armor
- Off-screen cop indicators, floating score popups, screen shake and slow-mo on death
- **Player name + Leaderboard:** players enter a name on first open, and a Leaderboard screen ranks drivers by time survived (global top 50 + MY RUNS)
- Saved high score, cash and cars (localStorage)
- Synthesized engine, siren, explosions and chiptune music, with sound/music toggles
- **Mobile ready:** touch buttons, portrait and landscape layouts, safe-area aware

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Steer | ← → or A D | ◀ ▶ buttons |
| Nitro | ↑ / W / Space / Shift | 🔥 button |
| Brake / reverse | ↓ / S | — |
| Pause | P / Esc | ❚❚ button |
| Start / retry | Enter | GO! |

## Run locally
ES modules need a local server (opening `index.html` directly won't work):
```bash
npx serve .
# or
python3 -m http.server 8000
```
Then open http://localhost:8000 (or the port `serve` prints).

## Deploy to Vercel
1. Push this folder to a GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Endless Car Chase"
   git branch -M main
   git remote add origin https://github.com/<your-username>/endless-car-chase.git
   git push -u origin main
   ```
2. On vercel.com: **Add New → Project → Import** the repo.
3. Framework preset: **Other**. Leave the build command and output directory **empty**.
4. Click **Deploy**. Done. Every push to `main` redeploys automatically.

## Global leaderboard setup (2 minutes, free)
The game works without this, but scores are then only kept on each player's own device. To make the leaderboard **global** (everyone sees everyone):
1. In Vercel, open your project → **Storage** → **Create Database** → choose **Upstash for Redis** (free plan) → connect it to this project.
2. Vercel adds the env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) automatically.
3. **Redeploy** (Deployments → ⋯ → Redeploy).

The leaderboard screen will then say "Global — all players". The API lives in `api/leaderboard.js`. It keeps each player's best time and returns the top 50.

> Note: scores are submitted by the browser, so a determined player could fake one. Fine for a fun game; ask if you want anti-cheat later.

## Project structure
```
index.html        UI screens + import map
style.css         all styling
favicon.svg
vercel.json       caching headers
lib/three.module.min.js   Three.js r187 (bundled locally, no CDN needed)
src/main.js       game loop, physics, AI, collisions, UI logic
src/data.js       cars, cop types and tuning numbers  ← tweak balance here
src/models.js     low-poly vehicle / obstacle models
src/world.js      infinite procedural ground + obstacles
src/particles.js  smoke, fire, debris, sparks
src/audio.js      Web Audio sound effects + music
src/leaderboard.js  leaderboard client (Vercel API / local fallback)
api/leaderboard.js  Vercel serverless function (Upstash Redis)
```

## Tweaking
- Car prices and stats, cop stats: `src/data.js`
- Difficulty speed (seconds per wanted level), nitro and explosion power: `TUNING` in `src/data.js`
- Debug in the browser console: `__game.save.cash = 99999` gives you cash for testing the shop
