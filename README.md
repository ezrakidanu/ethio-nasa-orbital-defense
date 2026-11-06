# ETHIO-NASA: Orbital Defense

An original, browser-playable Three.js spacecraft assembly and flight simulator by MG Studio / Ezra Kidanu. The current build is a playable early vertical slice: assemble a modular launch vehicle, fly a simplified orbital mission, inspect a cockpit cutaway, perform an astronaut EVA, and drive a six-wheel rover across a procedural lunar survey site.

This project uses original game art and mechanics. It is not a Spaceflight Simulator 2 reproduction and does not claim similar content volume or fidelity. Orbital and surface behavior is an interactive game approximation, not validated flight software.

## Run locally

```bash
pnpm install
pnpm dev              # Vite on http://localhost:5173
pnpm typecheck
pnpm test             # unit tests, including orbit and VAB calculations
pnpm build            # production build, sharing metadata and size budgets
pnpm smoke            # run after build; opens a headless desktop and touch-browser playthrough
```

To use the smoke test against a running development server, set `BASE_URL=http://127.0.0.1:3000/`. Browser testing requires Chromium; set `CHROMIUM_PATH=/path/to/chromium` if it is not installed at `/usr/bin/chromium`.

## GitHub web build and Android APK

On pushes to `main`, GitHub Actions checks TypeScript and unit tests, builds and deploys the browser game to [GitHub Pages](https://ezrakidanu.github.io/ethio-nasa-orbital-defense/), and builds an Android **debug APK**. The APK is attached to the Actions run as `ethio-nasa-orbital-defense-debug-apk` for 30 days. A manually dispatched run can additionally publish a tagged GitHub Release with the APK as a public downloadable asset. It is a debug-signed build, not a Play Store release package, and may require Android's permission to install apps from unknown sources.

The hosted build skips private Manus Storage downloads; models load from their registered CDN URLs when available, while procedural fallbacks keep the game playable when they are not. No Manus credentials are needed in GitHub Actions.

## Current gameplay

- **Vehicle Assembly Building:** browse propulsion, science, power and payload parts; add or remove modules; assign stage numbers; review dry/wet mass, propellant, estimated thrust-to-weight, power, science value, costs and readiness; save/load a design in local storage.
- **Flight:** control throttle; stage and jettison vehicle modules; use SAS prograde/retrograde assistance; change time warp; inspect altitude, speed, fuel, apoapsis/periapsis, heating, dynamic pressure and Max-Q warnings; switch to map and cockpit views.
- **Crew:** enter a cockpit/interior cutaway, open the EVA mode, maneuver the astronaut with jetpack input, and return to the capsule. If the streamed model CDN is unavailable, the game provides a visibly simplified procedural astronaut fallback.
- **Lunar survey:** enter a surface mission, drive and steer the six-wheel rover across a generated terrain field, respond to rock obstacles, and navigate toward a visible science-station marker. EVA exit/re-entry is supported. A procedural rover fallback keeps the mode playable offline.
- **Mission flow:** the main menu exposes a VAB craft/launch route and a direct lunar survey route. Orbital transfer and mission objectives are implemented as game approximations; this is not yet a full campaign with a large progression tree.

### Controls

Use the on-screen controls or a landscape touch display. Keyboard: **WASD** for flight/EVA/rover directional input, **Space** to stage, **Q** for SAS prograde, **R** for SAS retrograde, **M** to open/close map, **C** for cockpit, **V** for EVA, **E** to board a rover from surface EVA, and **Esc** to pause. Flight throttle, time warp, touch joysticks, EVA boost and rover actions are available in the HUD. Landscape-first is a web layout choice; a browser page cannot promise a device-wide native orientation lock.

## Simulation notes

The code includes fourth-order Runge–Kutta state integration, an inverse-square gravity model with a J2 perturbation, an exponential atmospheric approximation, drag, dynamic pressure and Max-Q alerts, approximate heating/ablation, variable propellant mass flow, orbital-element/trajectory calculations, stage impulses and attitude-assist controls. These are deliberately bounded real-time gameplay approximations; no scientific validation or mission-critical precision is claimed.

The VAB uses a compact, touch-friendly part catalog and modular snap relationships rather than a fully featured CAD application. Mission coverage is currently an orbital flight and a lunar surface survey; additional launch sites, celestial bodies, a deeper defense campaign, advanced part families, detailed resource systems, and broader camera/interior features remain future work.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/ethio/physics/orbit.ts` | Orbit propagation, gravity, atmosphere, state integration and orbital elements |
| `src/ethio/vab/parts.ts` | Modular part catalog, build plan, constraints and vehicle statistics |
| `src/ethio/flight-sim.ts` | Three.js celestial scene, mission state, spacecraft, cockpit, EVA, rover and telemetry |
| `src/ethio/ui.ts` / `flight.css` | Assembly, flight, surface, menu and touch UI |
| `src/ethio/app.ts` | Startup, input routing, mission transitions, local design save/load and audio hooks |
| `src/game/config.ts` / `tuning.ts` | Shared gameplay parameter owner and development Preview Tweak bridge |
| `assets.lock.json` | Managed asset locations, hashes and purpose groups |
| `scripts/ethio-smoke.mjs` | Desktop and touch mission-flow smoke test |

## Assets, performance and limitations

Generated astronaut, command-capsule and six-wheel rover models are registered through the project's managed Three.js asset workflow, with an animated/rigged astronaut variant. New orbital satellite, cockpit, world and unavailable-model fallbacks are constructed from original Three.js geometry. Models load asynchronously; if a Storage URL is not available, a simplified procedural fallback is shown rather than blocking the entire game. The social preview artwork and icon are project-specific originals.

The requested 500 MB–1 GB installation footprint is an aspiration, not a target reached by this early build. The current project contains only a small registered asset set and a compact web bundle; it does not contain a 1 GB world, campaign or asset library. Large-volume files would increase network and storage costs and should only be added when they deliver useful playable content.

## Credits and licensing

This project uses Three.js (MIT), Rapier (Apache-2.0, retained in the initialized starter dependency set), and the bundled ManusCC0 font family under the included CC0 license. Game-specific code and assets are original or generated for this project. No third-party Spaceflight Simulator 2 models, textures, code or branding are included.
