# ETHIO-NASA: Orbital Defense

An offline-first, single-player landscape Android orbital-mission game by MG Studio / Ezra Kidanu. The deliverable is an installable APK: Three.js is bundled inside a native Capacitor shell, and local development preview is not published as a hosted game. The app, fonts and spacecraft/astronaut models are packaged for offline operation.

## Build and run

Use Node.js 22 and pnpm 10 for the JavaScript project. Local Android builds need Java 21, Android SDK platform 35 and matching build tools; set `ANDROID_HOME` or `ANDROID_SDK_ROOT`. GitHub Actions prepares the Android toolchain and builds the same APK.

```bash
pnpm install
pnpm dev             # local development preview only
pnpm typecheck       # TypeScript
pnpm test            # unit and domain tests
pnpm build           # production bundle + offline asset checks
pnpm smoke           # desktop mission completion + touch-first phone playthrough
pnpm android:apk     # Capacitor sync + Gradle debug APK
```

A successful Android build writes `android/app/build/outputs/apk/debug/app-debug.apk`. The debug APK is intended for testing/sideloading; Google Play distribution requires a separately signed release build. On a push to `main`, the repository workflow builds only the APK and uploads it as an Actions artifact for 30 days. It no longer deploys a GitHub Pages web game. A manual workflow run may optionally publish a public GitHub Release; that is not the default.

## How to play

1. From the title screen tap **Plan Your Mission**, choose a profile, and continue to the VAB. Check that the starter stack is valid, then tap **Begin Orbital Mission**.
2. The mission starts in a 300 km insertion orbit (it does not begin with a surface liftoff). In flight, drag the throttle slider to add a short prograde burn. The active mission card shows the target apoapsis and live progress; engine thrust automatically cuts when the target orbit is reached.
3. Tap **Deploy Payload** to finish the objective. Use the flight panel's scroll area on short landscape screens to reach staging, time warp, EVA, rover and map actions.

## Included gameplay

The app begins with a three-second MG Studio-branded introduction and enters an aerospace mission console. Players choose mission profiles, configure a staged vehicle with a snap-based parts catalog, and inspect live mission cost, wet/dry mass, propellant, thrust-to-weight, center of mass, power generation and instrument load. Flight includes a 120 Hz RK4 physics worker, Earth inverse-square gravity and J2, atmospheric drag and density, dynamic-pressure/Max-Q indication, an approximate Sutton–Graves heating calculation, a mission target with live orbit progress, prograde throttle burn, automatic target cutoff and payload deployment, dry-mass-preserving propellant cutoff, two-axis RCS control, prograde/retrograde SAS indicators, time warp, stage separation, fairing jettison, live flight telemetry, predicted Keplerian orbit and map view. Lightweight cockpit/EVA and rover interaction modes are present.

## Scope and limitations

The two generated runtime GLB models are about 2.2 MB total; the measured debug APK is 18,603,879 bytes (18.6 MB), and the production `dist` bundle is about 15 MB. This is **not** a 1 GB asset build or a near-complete Spaceflight Simulator 2 reproduction. Many components and interactions remain prototype-level; cockpit/EVA/rover modes are lightweight, and orbital-atmosphere/thermal calculations are educational approximations, not validated flight dynamics. The game is not for real mission planning. No placeholder bytes are included.

## Project structure

- `src/physics/` — SI orbit state, RK4 propagation, Earth gravity/J2, atmosphere/drag/heating functions and worker.
- `src/vab/` — part catalog, stack/snap validation, vehicle statistics, stages and fairings.
- `src/engine/` — Three.js renderer and reusable runtime utilities.
- `src/orbital-app.ts`, `src/ui/` and `src/styles/` — mission menu, VAB, flight/map and touch-first panels.
- `public/assets/` — the checked-in offline APK copies of generated models and game icon.
- `assets.lock.json` and `scripts/manus-game-assets/` — managed provenance/recovery workflow; `scripts/prepare-sharing-inputs.mjs` keeps clean builds independent of private storage.
- `android/` — native Capacitor project; `AndroidManifest.xml` locks the activity to `sensorLandscape`.

## Credits

Generated launch-vehicle, astronaut and cover assets were created for this project. Bundled ManusCC0 fonts are CC0 1.0; the license notice is in `public/fonts/ManusCC0-LICENSE.txt`. Three.js uses the MIT license. See package metadata for dependency licenses.
