# ETHIO-NASA: Orbital Defense

A mobile-first, full-screen Three.js/WebGL spaceflight and orbital-defense simulation. Fly an SLS-class launch through staged ascent, deploy an Ethiopian satellite, then navigate a predictive Keplerian orbit and scan NASA-informed hazards. The same project builds as a static web game and a Capacitor Android app.

## Features

- **Landscape-first mobile mission control:** Android uses a sensor-landscape activity lock; browsers display a portrait rotation prompt. The WebGL view adapts to widescreen 16:9–19:9 devices, clamps pixel ratio to 2×, and keeps the HUD inside safe areas without page scrolling.
- **Interactive 3D showroom:** Select ETRSS-1, ET-SMART-RSS, or ETHIO-DEEP-SPACE 1 and rotate its live preview by dragging.
- **Configurable controls:** Sensitivity and joystick-deadzone sliders, independent pitch/yaw/roll inversion, Low/Medium/Ultra renderer presets, and Metric/Imperial/Mach telemetry units persist on the device. Flight includes dual-axis pitch/yaw touch input, separate roll buttons, vertical 0–100% throttle with tap increments, SAS holds, and time warp.
- **Modular staging:** Sequential booster and lower-stage jettison, hinged split fairings, payload-deployment interlock, simulated separation impulses, debris tracking, and smoke effects.
- **Orbital prediction:** Patched-conic Kepler elements, predicted 3D trajectory, orbit map, live apoapsis/periapsis markers and altitude readouts.
- **SFS2-style flight and orbital systems:** Exponential atmosphere, aerodynamic drag, altitude-varying gravity, thrust/mass/fuel integration, dynamic pressure/Max-Q alerts and vibration, orbital inertia, solar charging and battery drain.
- **NASA-informed hazards:** DONKI solar-flare and NeoWs asteroid queries use a 2.5-second timeout, with bundled offline flare and asteroid-vector fallbacks and radar highlighting.
- **Eight camera states:** Home/showroom (`0`), payload inspection (`1A`), tower launch (`1B`), aerial pad (`1C`), orbital evasion (`2`), telemetry debrief (`3`), cinematic flight (`4`), and orbital map (`5`).

## Requirements and local development

- Node.js 20.19+ (or 22.12+) and pnpm 10+
- Android Studio/SDK for a local Android build; Xcode/CocoaPods for iOS (macOS only)

```bash
pnpm install
pnpm dev
```

The game fills the viewport; the document does not scroll. `pnpm build` runs TypeScript diagnostics, restores managed runtime assets, bundles into `dist/`, installs sharing metadata, and checks the JavaScript/font budgets. `pnpm test` runs the unit suite. `pnpm smoke` serves the production build in headless Chromium and checks mission progression, screen states, modal isolation, layout boundaries, safe zones and collisions across desktop and mobile landscape viewports.

## Controls

- **Touch:** drag the left joystick for pitch/yaw; use adjacent buttons for roll. Adjust the vertical throttle slider or its increment buttons. Tap Stage, Deploy, Radar, or Camera as needed.
- **Flight modes:** select SAS Off, Prograde, Retrograde, Normal, or Target; select 1×, 5×, 10×, 50×, or 1000× time warp.
- **Keyboard:** W/S pitch, A/D yaw, Q/E roll, Up/Down throttle, Space ignition, X staging, B payload deployment, R radar scan, C camera state, Escape debrief.
- **Desktop pointer:** drag the showroom spacecraft and use the on-screen controls.

## Flight model and data

`physics/FlightPhysics.js` applies exponential atmospheric density (`ρ₀=1.225 kg/m³`, `H=8500 m`), thrust, aerodynamic drag, altitude-varying gravity, fuel/mass loss and dynamic pressure (`Q=½ρv²`). Crossing the configured 38 kPa structural threshold shakes the camera and raises `WARNING: MAX-Q STRESS LIMIT REACHED`. `physics/OrbitalMechanics.js` models orbital inertia, solar-array charging, battery capacity and storm/shield drain. `physics/KeplerOrbit.js` predicts orbital elements and apsides; `physics/FlightControlSystem.js` implements SAS modes and bounded time warp.

`api/NASADataPipeline.js` requests NASA DONKI solar flares and NeoWs asteroid data with a 2.5-second timeout and CORS/network handling. NASA's public `DEMO_KEY` is used by default; replace it locally for higher quota. Browser-embedded keys are public, so use a server proxy if a production key must be protected. Offline flare and NEO data is bundled for play without network access.

## Project map

```text
index.html                       Full-screen WebGL canvas and HUD mount
css/style.css                    Fixed landscape viewport and responsive glass HUD
js/main.js                       Runtime orchestration, input actions and smoke-test hook
engine/EngineCore.js              WebGL renderer, animation loop and graphics presets
engine/SceneManager.js            Launch complex and deep-space environment
engine/CameraController.js        Eight camera states and Max-Q camera shake
physics/FlightPhysics.js          Atmospheric ascent, thrust, drag, gravity, fuel and Q
physics/OrbitalMechanics.js       Orbital inertia, solar charge, battery and shields
physics/KeplerOrbit.js             Elements, apsides and orbital prediction
physics/FlightControlSystem.js    SAS modes and time-warp integration
builders/AssetBuilder.js          Rocket assembly, stages, showroom, hazards and effects
builders/ShaderBuilder.js          Rayleigh/Mie atmosphere, flag and decal textures
api/NASADataPipeline.js            NASA DONKI/NeoWs feeds and offline fallbacks
ui/UIManager.js                    Mission, HUD, isolated Settings/Pause modals and debrief
ui/GameSettings.js                 Persisted input, graphics and units settings
ui/TouchControls.js                Joystick, throttle, roll and keyboard controls
assets/models/                    SLS, ETRSS-1 and deep-space probe GLBs
capacitor.config.ts                Capacitor identity and webDir=dist
android/                           Capacitor Android wrapper and landscape manifest
scripts/smoke.mjs                  Production Playwright and layout-collision checks
```

Procedural Three.js assets complement the three local spacecraft GLBs. No runtime model/texture CDN is required by the standalone archive.

## Capacitor Android

The application ID is `com.ethionasa.orbitaldefense`; web assets are built into `dist/`. The Android manifest requests sensor landscape, while the web bootstrap locks orientation where supported and shows a portrait fallback prompt.

```bash
pnpm install
pnpm cap:sync
cd android
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. This repository also includes the **Build Android debug APK** GitHub Actions workflow (`.github/workflows/build-android-apk.yml`), which builds on Ubuntu x86-64 and uploads an artifact named `ethio-nasa-orbital-defense-debug-apk`. It is useful when a local host cannot run Android's x86-only AAPT2 binary. For Android Studio, run `pnpm exec cap open android` after syncing.

On macOS with Xcode/CocoaPods, add and sync iOS with `pnpm exec cap add ios` and `pnpm exec cap sync ios`.

## GitHub and standalone package

Public repository: [github.com/ezrakidanu/ethio-nasa-orbital-defense](https://github.com/ezrakidanu/ethio-nasa-orbital-defense).

The standalone `ethio-nasa-orbital-defense.zip` contains the full source, lockfile, three GLB spacecraft models, project-sharing artwork, production web output, synced Android wrapper, tests, build scripts, and smoke evidence. Registered model and artwork files are present in the archive and tracked in the public repository for an independently reproducible build.

## Verification

See [`VERIFICATION.md`](VERIFICATION.md) for dated build, test, smoke, Capacitor sync, APK, and archive results. Browser captures are in `shots/`.
