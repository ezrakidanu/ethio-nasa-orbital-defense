# ETHIO-NASA: Orbital Defense — implementation plan

## Product and delivery

Deliver an offline-first Android game as an installable APK, not as a hosted browser game. Preserve the approved Three.js/Vite game engine and package its local build in a Capacitor Android shell. The browser-based development preview remains a development aid; the player-facing Android build must bundle its JavaScript, shaders, UI, and game data locally and must not require a network connection to play. Add landscape configuration to Capacitor and `AndroidManifest.xml`; portrait play is prohibited. Build an installable debug APK if the available Android SDK/Gradle toolchain allows it. Do not claim a release signature or a 1 GB asset footprint without evidence.

## Implementation approach

Replace the inherited Sky Cores game layer while keeping the initialized Three.js starter's engine, renderer, input, local save system, game-tuning bridge, and development utilities where they remain useful. Create a branded MG Studio boot/splash and an orbital showroom/menu, then build a playable core loop across VAB construction, launch, orbital flight/map mode, mission scoring and return. Implement deterministic orbital math and integration in `src/physics/`, with a dedicated worker running bounded 120 Hz fixed substeps and messages back to the render loop. Use the Three.js engine for procedural planetary/vehicle visualization and an HTML/CSS touch HUD layered without intercepting 3D view gestures. Use local bundled fonts/media and procedural effects where this is the safest real-time fallback; do not bulk-pad assets to create an apparent 1 GB installation.

The mission loop tracks budget, vehicle and payload mass, propulsion, instrument selection, power production/consumption, and target orbit constraints. The VAB uses a part catalog and snap/node attachment data, with live dry/wet mass, thrust-to-weight, center-of-mass, power and cost readouts. A staging array separates decouplers, burns remaining fuel and jettisons fairings. Flight exposes throttle, RCS, SAS prograde/retrograde, time warp, lander legs, map view, cockpit cutaway and EVA. Model gravity (including Earth J2), atmospheric density/drag, dynamic pressure and a Sutton-Graves heating/ablation estimate; orbit tools expose classical elements and Ap/Pe.

## Project structure

- `src/physics/`: vector/state types, RK4 integrator, gravity/J2, atmosphere/aerodynamics, thermal model, orbit elements and trajectory prediction, and the dedicated physics worker.
- `src/engine/`: retained renderer, fixed/render loop, asset loading, audio (procedural only unless a licensed sound is supplied), platform detection, and Android-friendly input.
- `src/vab/`: part definitions, attachment graph/snap rules, vehicle mass/power/cost/TWR calculations, and sequential staging.
- `src/ui/`: title/splash, showroom, mission planning, VAB panels, flight/map HUD, cockpit/EVA/rover interfaces, and landscape-only interaction.
- `src/assets/`: game-specific source assets and lightweight generated/runtime models; avoid committing binaries beyond repository and APK delivery constraints.
- `android/`: Capacitor Android project, manifest orientation lock, application metadata and build instructions.
- `public/`: application entry and necessary locally bundled static files.

## Design direction

Use the specification's dark-slate backdrop, metallic silver/gold MG Studio branding, and glassmorphic flight HUD as the visual foundation. The experience should read as a precise aerospace engineering console with a cinematic orbital showroom, clear telemetry hierarchy and restrained status colors. Avoid inherited Sky Cores art and controls; keep every screen legible at common landscape phone aspect ratios. Motion should prioritize readable camera and telemetry response, not decorative overload.

## Dependencies and constraints

Add Capacitor only to the existing Three.js project, keeping its Vite build and pnpm-managed dependency policy. Android packaging needs Java, the configured Android SDK platform/build-tools and Gradle. Java 21 and Gradle are installed, but the local Android SDK build stopped because platform/build-tools licenses were not accepted. Use the APK-only GitHub Actions workflow (supported setup action accepts licenses as part of that user-owned build) and do not report an APK until the matching run uploads it. The requested approximately 1 GB footprint is a target, not permission to add dummy data or commit impractical binaries; report the real APK and asset sizes. GitHub's repository file limits may prevent publishing the APK as a source-tree file, so keep the source repo clean and deliver a built APK separately if feasible. Never overwrite remote main history; integrate its latest tip and preserve its contents before pushing.

## Build and serving

The standard project build is `npm run build`/`pnpm build`, producing `dist/` for the native wrapper's bundled web assets. The Android build should consume that local `dist/` tree and produce an APK under the conventional Gradle output directory. Preview is only for development; the APK is the requested deliverable. No backend, account, online service, cloud saves or network-dependent gameplay are needed.