# Verification

Date: 2026-11-03

## Production build and assets

**PASS.** `pnpm build` completed `tsc --noEmit`, the production Vite build, asset restoration, sharing metadata installation and JavaScript/font budget checks. The build contains the three local GLB spacecraft, game-specific favicon and Open Graph artwork. The budget report was 0.18 MB gzipped JavaScript, 1.00 MB fonts and 4.66 MB total transfer. Vite retained relative Manus font URLs at runtime; the font files are included under `dist/fonts/`.

## Unit tests

**PASS.** `pnpm test`: 16 files and 102 tests passed, including staging, settings/persistence, Keplerian elements, orbital prediction, SAS vectors and bounded time-warp presets.

## Production browser smoke and layout

**PASS.** `pnpm smoke` ran the production build in Playwright Chromium. It verified all eight camera states (`0`, `1A`, `1B`, `1C`, `2`, `3`, `4`, `5`), all three spacecraft previews and showroom drag rotation; Home Settings and Pause background isolation (hidden and inert), including Settings-over-Pause restoration; live graphics/input/unit settings; ascent fuel/mass/thrust telemetry; booster and lower-stage separation; animated split-fairing hinges, jettison and deployment interlock; Moon payload routing; NASA/offline hazard vectors and radar; all four SAS modes; all five time-warp rates; and Keplerian elements, orbit path and apsis readouts.

The collision/layout checks passed at desktop 1440×900, 16:9 1920×1080, ultrawide 2532×1080, landscape phone 844×390, compact landscape 667×375, and portrait phone 390×844. Portrait showed the landscape-required rotation prompt. No interactive-control overlaps or viewport/layout assertions failed. Fresh browser evidence is in `shots/`.

## Capacitor Android sync

**PASS.** `pnpm cap:sync` rebuilt the web app and synchronized it into `android/`. Capacitor copied the production web assets and configuration, and detected the Screen Orientation plugin. The native manifest sets `sensorLandscape`.

## Native debug APK

**PASS.** The sandbox is ARM64, while the installed Android SDK's AAPT2 binaries are x86-64 and cannot execute here. The project's `Build Android debug APK` GitHub Actions workflow therefore built on Ubuntu x86-64. Workflow run [#41622439221](https://github.com/ezrakidanu/ethio-nasa-orbital-defense/actions/runs/41622439221) completed successfully at source SHA `4e9eeb07ae118a955461c0dc0b979b0226be6ba4`; Gradle assembly, APK verification and artifact upload all passed.

The downloaded APK is `ethio-nasa-orbital-defense-debug.apk`, 13,836,612 bytes. SHA-256: `0e4c4acb1c556ea07a08074ac2e9c91a6d3fd8f8c3dcdd5395dfe45479a6c7df`. The APK is a valid Android package and passes ZIP integrity testing.

## Public repository and standalone archive

The public repository is [github.com/ezrakidanu/ethio-nasa-orbital-defense](https://github.com/ezrakidanu/ethio-nasa-orbital-defense). Its updated `main` contains the AAA rebuild and the three registered spacecraft models, favicon and OG artwork.

`ethio-nasa-orbital-defense.zip` contains the standalone source, lockfile, registered 3D assets and sharing artwork, production `dist/`, synced Capacitor Android project, tests, build scripts, smoke screenshots, and the compiled debug APK at the archive root. The ZIP integrity check and embedded APK checksum are verified.
