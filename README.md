# ETHIO-NASA: Orbital Defense

A mobile-first, full-screen Three.js/WebGL spaceflight and orbital-defense game. Pilot an SLS-class launch vehicle, manage ascent and max-Q, separate the solid boosters, deploy a satellite, scan NEO hazards, and review mission telemetry. The same project builds as a static web app and is configured for Capacitor Android (and iOS).

## Requirements

- Node.js 20.19+ (or 22.12+) and pnpm 10+
- Android Studio + Android SDK for APK/AAB builds
- Xcode + CocoaPods for iOS builds (macOS only)

## Run locally

```bash
pnpm install
pnpm dev
```

The game fills the viewport; there is no document scrolling. `pnpm build` runs TypeScript diagnostics, bundles the app into `dist/`, and checks the starter's JavaScript/font/size budgets. `pnpm test` runs unit tests and `pnpm smoke` serves the production build in headless Chromium and checks all six scene states at desktop and mobile viewport sizes.

## Controls
- Before launch, select ETRSS-1, ET-SMART-RSS or ETHIO-DEEP-SPACE 1 and choose LEO, Moon Gateway, Mars insertion, or a nearby-Earth-object rendezvous. The selected target is shown in flight telemetry and the orbital spacecraft routes toward it.

- **Touch:** left virtual joystick controls pitch and yaw; the adjacent buttons control roll. The right-side slider sets throttle from 0–100%. Tap Stage Separation, Deploy Payload, Radar Scan, or Camera.
- **Keyboard:** W/S pitch, A/D yaw, Q/E roll, Up/Down throttle, Space ignition, X stage separation, B deploy payload, R radar scan, C camera state, Escape debrief.
- **Desktop pointer:** use the same controls; menus and action buttons are clickable.

## Flight model and NASA data

`physics/FlightPhysics.js` applies exponential atmospheric density (`ρ₀=1.225 kg/m³`, `H=8500 m`), thrust, aerodynamic drag, altitude-varying gravity, fuel/mass loss and dynamic pressure (`Q=½ρv²`). Crossing the configured 38 kPa structural threshold shakes the camera and raises the exact Max-Q warning. `physics/OrbitalMechanics.js` integrates orbital inertia and models solar-array charging, battery capacity and storm/shield drain.

`api/NASADataPipeline.js` requests NASA DONKI solar flares and NeoWs asteroid data with a 2.5-second timeout and CORS/network handling. NASA's public `DEMO_KEY` is used by default; replace it locally with a NASA API key if higher quota is needed. Offline fallback flares and NEO vectors are always bundled, so the simulation runs without network access.

## Project map

```text
index.html                 Full-screen WebGL canvas and HUD mount
css/style.css              Fixed viewport, responsive glass HUD, touch controls
js/main.js                 Runtime orchestration, input actions and smoke-test hook
engine/EngineCore.js       WebGL renderer and animation loop
engine/SceneManager.js     Scene lights, launch complex and space environment
engine/CameraController.js Six smooth camera states and Max-Q camera shake
physics/FlightPhysics.js   Atmospheric ascent, thrust, drag, gravity, fuel and Q
physics/OrbitalMechanics.js Orbital inertia, battery, solar charge and shields
builders/AssetBuilder.js  Procedural launch complex, fleet, Earth, hazards and particles
builders/ShaderBuilder.js Custom atmosphere shader, flag and decal textures
api/NASADataPipeline.js   NASA DONKI/NeoWs live feeds and offline fallbacks
ui/UIManager.js           Mission selection, HUD, telemetry, alerts and debrief
ui/TouchControls.js       Mobile joystick/throttle and keyboard controls
assets/models/             Generated GLB SLS, ETRSS-1 and deep-space probe models
capacitor.config.ts        Capacitor package identity and webDir=dist
src/main.ts                Vite boot shim; preserves Manus Preview Tweak bridge
```

Spacecraft, launch structures, Ethiopian flag, decals, Earth texture, asteroids, solar panels, atmosphere and visual effects also have procedural Three.js implementations; the generated GLBs add close-up models. No external model or texture CDN is required for the standalone archive.

## Capacitor Android

The app uses ID `com.ethionasa.orbitaldefense`, and the production web assets are in `dist/`.

```bash
pnpm install
pnpm build
pnpm exec cap add android     # run once if the android/ platform folder is not present
pnpm exec cap sync android
pnpm exec cap open android
```

Then build an APK or AAB in Android Studio. For an iterative update, run `pnpm build && pnpm exec cap sync android`. `pnpm cap:sync` performs those two steps; `pnpm cap:android` opens Android Studio.

## Capacitor iOS (optional)

On macOS with Xcode and CocoaPods:

```bash
pnpm exec cap add ios        # run once if ios/ is not present
pnpm exec cap sync ios
pnpm exec cap open ios
```

## GitHub

```bash
git init
git add .
# Include the runtime media intentionally excluded by the Manus Storage-oriented .gitignore:
git add -f assets/models/*.glb assets/share/favicon.png assets/share/og.png
git commit -m "Initial commit: ETHIO-NASA Orbital Defense"
# Create a repository named ethio-nasa-orbital-defense, then:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ethio-nasa-orbital-defense.git
git push -u origin main
```

The downloaded ZIP contains all three generated GLB models, the game favicon and the 16:9 OG cover. Force-add those paths as shown above when creating a standalone GitHub repository; they remain excluded from the managed-game Git workflow to avoid duplicating registered Storage assets.

## Verification

See [`VERIFICATION.md`](VERIFICATION.md) for exact build/test results and the six-scene, desktop/mobile smoke-check coverage. The associated screenshots are in `shots/`.

## NASA API key and privacy

The bundled client uses NASA's public `DEMO_KEY`, which has shared request limits. For production use, edit `api/NASADataPipeline.js` to use your own NASA key; a browser-embedded key is public, so proxying through a server is preferable when protecting a key. This project does not include a server, account login, or private credentials.
