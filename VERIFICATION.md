# Verification

Date: 2026-11-02

## Production build

**PASS.** `pnpm build` completed TypeScript checking (`tsc --noEmit`), the Vite production build, and the existing JavaScript/font budget check. The production site includes all three spacecraft GLBs, the game-specific favicon, the generated 2560×1440 Open Graph cover, and verified OG/Twitter title, description, and image tags. The Open Graph PNG is 5,261,287 bytes (under the 8 MiB sharing limit).

## Unit tests

**PASS.** `pnpm test`: 12 test files, 80 tests passed. The orbital suite specifically checks the exponential atmosphere, variable gravity, dynamic-pressure equation, fuel/mass and thrust integration, configurable Max-Q crossing, orbital solar recharge/bus drain/shields, all six finite camera-state paths, and the DONKI/NeoWs offline fallback.

## Browser smoke and layout

**PASS.** `pnpm smoke` ran against the production build in Playwright Chromium. It exercised launch/ascent, booster staging, radar scan, a destination-bound orbital insertion, and camera states `0`, `1A`, `1B`, `1C`, `2`, and `3`. All three generated GLBs loaded; NASA feed/offline-fallback asteroid vectors populated the tracking/radar path.

Viewport checks passed at desktop 1440×900 CSS pixels, portrait phone 390×844, and landscape phone 844×390. The checks verified a full-viewport WebGL canvas, no document overflow, visible controls within the viewport, no overlapping interactive controls, and no throttle/roll/joystick labels colliding with interactive controls. Smoke screenshots are in `shots/`.

The browser run displayed `NASA + OFFLINE FALLBACK`; live feed availability depends on NASA's public `DEMO_KEY` service and quota. Offline data is bundled and its behavior is covered by the unit test.

## Preview and Capacitor

**PASS.** The resident Vite development server returned HTTP 200. Capacitor successfully added the Android platform and `pnpm exec cap sync android` copied the production web assets and configuration into `android/`.

No APK/AAB was built in this environment; open the included Android project in Android Studio with the Android SDK to build one. iOS dependencies and setup instructions are included, but an iOS build requires macOS, Xcode, and CocoaPods.

## Standalone archive

The ZIP includes the complete source, lockfile, three generated GLB model files, project-sharing artwork, built `dist/` output, the synced Android wrapper, tests, scripts, and smoke evidence. The repository is not pushed to GitHub; the README documents initializing a repository and force-adding the included registered media when making a standalone GitHub copy.
