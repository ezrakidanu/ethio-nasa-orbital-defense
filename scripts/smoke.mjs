// Bounded integration smoke for the landscape-locked ETHIO-NASA flight console.
// Build first (`pnpm build`); captures under shots/ are verification evidence only.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const errors = []
const guard = setTimeout(() => fail('timed out'), 180_000)

function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
function listen(page) {
  page.on('console', message => {
    const text = message.text()
    if (message.type() === 'error' && /Failed to load resource:/.test(text)) return
    if (message.type() === 'error' && !/api\.nasa\.gov|ERR_ABORTED|AbortError/i.test(text)) errors.push(text)
  })
  page.on('pageerror', error => errors.push(String(error)))
  page.on('requestfailed', request => {
    const uri = request.url(), reason = request.failure()?.errorText || 'failed'
    if (/api\.nasa\.gov|ERR_ABORTED|AbortError/i.test(`${uri} ${reason}`)) return
    errors.push(`Network ${reason} ${uri}`)
  })
  page.on('response', response => {
    if (response.status() >= 400 && !/api\.nasa\.gov/.test(response.url())) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
}
function expectedViewport(width, height) {
  const ratio = width / height, minAspect = 16 / 9, maxAspect = 19 / 9
  let w = width, h = height, left = 0, top = 0
  if (ratio < minAspect) { h = width / minAspect; top = (height - h) / 2 }
  else if (ratio > maxAspect) { w = height * maxAspect; left = (width - w) / 2 }
  return { left, top, width: w, height: h }
}
async function verifyLayout(page, label, { orientationBlocked = false } = {}) {
  const report = await page.evaluate(() => {
    const width = innerWidth, height = innerHeight
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
    const canvas = rect(document.getElementById('game'))
    const visiblyPresent = element => {
      let node = element
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.02 || node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false
        node = node.parentElement
      }
      return true
    }
    const controls = [...document.querySelectorAll('#ui-overlay button, #ui-overlay input, #ui-overlay select')]
      .filter(element => visiblyPresent(element) && element.getClientRects().length)
      .map(element => ({ name: element.getAttribute('aria-label') || element.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) || element.id, ...rect(element) }))
    const labels = [...document.querySelectorAll('.throttle-wrap label, .throttle-wrap > small, .stick-wrap > small, .roll-buttons small')]
      .filter(element => visiblyPresent(element) && element.getClientRects().length)
      .map(element => ({ name: element.textContent.trim() || element.className, ...rect(element) }))
    const groups = Object.fromEntries(['.flight-aux-controls', '#orbit-map-panel', '#maxq-alert', '.flight-actions']
      .map(selector => { const element = document.querySelector(selector); const visible = element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length; return [selector, visible ? rect(element) : null] }))
    const blocked = getComputedStyle(document.querySelector('.orientation-block')).display !== 'none'
    return { width, height, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, canvas, controls, labels, groups, blocked }
  })
  if (report.scrollWidth > report.width + 1 || report.scrollHeight > report.height + 1) throw new Error(`${label}: document overflow ${report.scrollWidth}×${report.scrollHeight} at ${report.width}×${report.height}`)
  const expected = expectedViewport(report.width, report.height)
  for (const key of ['left', 'top', 'width', 'height']) if (Math.abs(report.canvas[key] - expected[key]) > 1.5) throw new Error(`${label}: adaptive canvas ${key} mismatch (${JSON.stringify({ actual: report.canvas, expected })})`)
  if (report.blocked !== orientationBlocked) throw new Error(`${label}: landscape rotation prompt ${report.blocked ? 'unexpectedly blocks' : 'failed to block'} orientation`)
  const outside = report.controls.filter(control => control.left < -1 || control.top < -1 || control.right > report.width + 1 || control.bottom > report.height + 1)
  if (outside.length) throw new Error(`${label}: controls outside display bounds: ${JSON.stringify(outside)}`)
  const overlaps = []
  for (let i = 0; i < report.controls.length; i += 1) for (let j = i + 1; j < report.controls.length; j += 1) {
    const a = report.controls[i], b = report.controls[j]
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) overlaps.push({ controls: [a.name, b.name], rectangles: [a, b] })
  }
  if (overlaps.length) throw new Error(`${label}: interactive controls overlap: ${JSON.stringify(overlaps)}`)
  const groupOverlaps = []
  const pairs = [['.flight-aux-controls','#orbit-map-panel'],['.flight-aux-controls','#maxq-alert'],['#orbit-map-panel','.flight-actions'],['#maxq-alert','.flight-actions']]
  for (const [left, right] of pairs) {
    const a = report.groups[left], b = report.groups[right]
    if (a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) groupOverlaps.push({ groups: [left, right], rectangles: [a, b] })
  }
  if (groupOverlaps.length) throw new Error(`${label}: HUD panels or alerts overlap: ${JSON.stringify(groupOverlaps)}`)
  const labelOverlaps = []
  for (const a of report.labels) for (const b of report.controls) {
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) labelOverlaps.push([a.name, b.name])
  }
  if (labelOverlaps.length) throw new Error(`${label}: touch labels overlap interactive controls: ${JSON.stringify(labelOverlaps)}`)
  return report
}
async function openGame(context) {
  const page = await context.newPage(); listen(page)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__game?.engine?.renderer?.info?.render?.calls > 0, null, { timeout: 30_000 })
  await page.waitForSelector('#mission-panel:not(.is-hidden)', { timeout: 10_000 })
  const ready = await page.evaluate(async () => await window.__game.ready)
  if (ready?.[0]?.status !== 'fulfilled' || ready[0].value !== 3) throw new Error(`the three generated spacecraft GLBs did not load: ${JSON.stringify(ready?.[0])}`)
  if (ready?.[1]?.status !== 'fulfilled' || !(ready[1].value.asteroids?.length > 0)) throw new Error('NASA live/offline path did not provide asteroid vectors')
  return page
}
async function waitForStage(page, target, label) {
  try { await page.waitForFunction(index => window.__game.assets.ascentStage === index, target, { timeout: 5000 }) }
  catch {
    const state = await page.evaluate(() => ({ index: window.__game.assets.ascentStage, launched: window.__game.getSnapshot().flight.launched, paused: window.__game.ui.paused, camera: window.__game.sceneState, stageButton: document.getElementById('stage-button')?.textContent, stageDisabled: document.getElementById('stage-button')?.disabled, opening: window.__game.assets.fairingOpening, progress: window.__game.assets.fairingProgress }))
    throw new Error(`${label} did not complete: ${JSON.stringify(state)}`)
  }
}
async function assertModalIsolation(page, label, modalId) {
  const state = await page.evaluate(id => {
    const modal = document.getElementById(id)
    const background = [...document.querySelectorAll('.command-bar, #mission-panel, #telemetry-hud, #launch-prompt, #debrief-panel, .bottom-telemetry')]
    const exposedControls = background.flatMap(panel => [...panel.querySelectorAll('button, input, select')]).filter(control => control.getClientRects().length)
    return { open: Boolean(modal && !modal.classList.contains('is-hidden')), ariaModal: modal?.getAttribute('aria-modal'), backgroundHiddenAndInert: background.every(panel => panel.classList.contains('is-hidden') && panel.inert && panel.getAttribute('aria-hidden') === 'true'), exposedControls: exposedControls.map(control => control.getAttribute('aria-label') || control.textContent.trim()) }
  }, modalId)
  if (!state.open || state.ariaModal !== 'true' || !state.backgroundHiddenAndInert || state.exposedControls.length) throw new Error(`${label}: modal did not isolate background controls: ${JSON.stringify(state)}`)
}

try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ args: ['--ignore-gpu-blocklist'], channel: 'chrome' }))

  const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'))
  const nativeManifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
  const nativeBootstrap = readFileSync('src/main.ts', 'utf8')
  if (manifest.orientation !== 'landscape' || !/android:screenOrientation="sensorLandscape"/.test(nativeManifest) || !/ScreenOrientation\.lock\(\{ orientation: 'landscape' \}\)/.test(nativeBootstrap)) throw new Error('landscape-only web/native orientation configuration is incomplete')

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const page = await openGame(desktop)
  await page.waitForTimeout(180)
  await verifyLayout(page, 'desktop Home showroom')
  const boot = await page.evaluate(() => ({ models: (window.__game.assets.generatedRocket ? 1 : 0) + (window.__game.assets.generatedPreviews?.length || 0), renderCalls: window.__game.engine.renderer.info.render.calls, scene: window.__game.sceneState }))
  if (boot.scene !== '0' || boot.renderCalls < 1 || boot.models !== 3) throw new Error(`Home/model boot incomplete: ${JSON.stringify(boot)}`)
  const rotationBeforeDrag = await page.evaluate(() => window.__game.assets.showroomModel.rotation.y)
  await page.mouse.move(980, 430); await page.mouse.down(); await page.mouse.move(1012, 448, { steps: 4 }); await page.mouse.up()
  const rotationAfterDrag = await page.evaluate(() => window.__game.assets.showroomModel.rotation.y)
  if (Math.abs(rotationAfterDrag - rotationBeforeDrag) < 0.12) throw new Error('dragging the Home showcase did not rotate the selected spacecraft')
  await page.screenshot({ path: `${out}/01-landscape-showroom.png` })

  // Verify saved options are live, validated and reflected in renderer/input configuration.
  await page.click('[data-action="settings"]')
  await page.waitForSelector('#settings-panel:not(.is-hidden)')
  await assertModalIsolation(page, 'desktop Home Settings', 'settings-panel')
  await page.locator('[data-setting="sensitivity"]').fill('1.35')
  await page.locator('[data-setting="deadzone"]').fill('0.12')
  await page.locator('[data-setting="invertPitch"]').check()
  await page.locator('[data-setting="invertYaw"]').check()
  await page.locator('[data-setting="invertRoll"]').check()
  await page.locator('[data-setting="graphics"]').selectOption('low')
  await page.locator('[data-setting="units"]').selectOption('mach')
  const lowSettings = await page.evaluate(() => ({ settings: window.__game.settings.getAll(), dpr: window.__game.engine.renderer.getPixelRatio(), particles: window.__game.assets.exhaust.geometry.attributes.position.count }))
  if (lowSettings.settings.sensitivity !== 1.35 || lowSettings.settings.deadzone !== 0.12 || !lowSettings.settings.invertPitch || !lowSettings.settings.invertYaw || !lowSettings.settings.invertRoll || lowSettings.settings.graphics !== 'low' || lowSettings.settings.units !== 'mach' || lowSettings.dpr > 1.01 || lowSettings.particles !== 350) throw new Error(`options did not apply live: ${JSON.stringify(lowSettings)}`)
  await page.locator('[data-setting="graphics"]').selectOption('ultra')
  const ultra = await page.evaluate(() => ({ graphics: window.__game.settings.get('graphics'), dpr: window.__game.engine.renderer.getPixelRatio(), particles: window.__game.assets.exhaust.geometry.attributes.position.count, shadow: window.__game.sceneManager.keyLight.shadow.mapSize.x }))
  if (ultra.graphics !== 'ultra' || ultra.dpr > 2.01 || ultra.particles !== 1800 || ultra.shadow !== 2048) throw new Error(`ultra graphics preset did not reach renderer/particle/shadow systems: ${JSON.stringify(ultra)}`)
  await verifyLayout(page, 'desktop control options')
  await page.screenshot({ path: `${out}/02-control-options.png` })
  await page.click('[data-action="close-settings"]')
  await page.click('[data-action="settings"]')
  await page.locator('[data-setting="graphics"]').selectOption('medium')
  await page.locator('[data-setting="units"]').selectOption('metric')
  await page.click('[data-action="close-settings"]')

  await page.click('[data-satellite="ET-SMART-RSS"]')
  if (!(await page.evaluate(() => window.__game.assets.showroomModel?.name.includes('ET-SMART-RSS')))) throw new Error('Home satellite selection did not change the rotating showroom payload')
  await page.click('[data-satellite="ETRSS-1"]')
  await page.selectOption('#destination-select', 'LEO')
  await page.click('[data-action="start-mission"]')
  await page.waitForFunction(() => window.__game.sceneState === '1A')
  await page.waitForFunction(() => window.__game.assets.generatedPreviews.filter(preview => preview.root.visible).length === 1)
  await verifyLayout(page, 'desktop payload inspection')
  await page.screenshot({ path: `${out}/03-payload-inspection.png` })

  await page.click('[data-action="launch"]')
  await page.waitForFunction(() => window.__game.sceneState === '1B')
  const fuelBefore = await page.evaluate(() => window.__game.getSnapshot().flight.fuelPercent)
  await page.waitForTimeout(1200)
  const ascent = await page.evaluate(() => window.__game.getSnapshot().flight)
  if (!(ascent.altitudeM > 0 && ascent.speedMps > 0 && ascent.fuelPercent < fuelBefore && ascent.twr > 0)) throw new Error(`launch/ascent mass flow did not integrate: ${JSON.stringify({ fuelBefore, ascent })}`)
  await page.click('#pause-button')
  await page.waitForSelector('#pause-panel:not(.is-hidden)')
  await assertModalIsolation(page, 'desktop Pause', 'pause-panel')
  await page.click('#pause-panel [data-action="settings"]')
  await page.waitForSelector('#settings-panel:not(.is-hidden)')
  await assertModalIsolation(page, 'Settings over Pause', 'settings-panel')
  await page.click('#settings-panel [data-action="close-settings"]')
  await page.waitForSelector('#pause-panel:not(.is-hidden)')
  await assertModalIsolation(page, 'Pause restored from Settings', 'pause-panel')
  await page.click('#pause-panel [data-action="resume-flight"]')
  await page.waitForFunction(() => !window.__game.ui.paused)
  await page.waitForFunction(() => {
    const hud = document.getElementById('telemetry-hud'), stage = document.getElementById('stage-button')
    return hud && !hud.classList.contains('is-hidden') && !hud.inert && stage?.getClientRects().length > 0 && !stage.closest('[inert]')
  }, null, { timeout: 5000 }).catch(async () => {
    const state = await page.evaluate(() => { const hud = document.getElementById('telemetry-hud'), stage = document.getElementById('stage-button'); return { scene: window.__game.sceneState, paused: window.__game.ui.paused, hudClass: hud?.className, hudInert: hud?.inert, stageRects: stage?.getClientRects().length, stageInert: Boolean(stage?.closest('[inert]')) } })
    throw new Error(`flight controls did not restore after Resume: ${JSON.stringify(state)}`)
  })
  await verifyLayout(page, 'desktop tower launch')
  await page.screenshot({ path: `${out}/04-tower-launch.png` })
  const massBeforeStage = ascent.massKg
  for (const expectedId of ['boosters', 'lower-stage']) {
    await page.click('[data-action="stage"]')
    await page.waitForTimeout(180)
    const stageState = await page.evaluate(() => ({ index: window.__game.assets.ascentStage, mass: window.__game.getSnapshot().flight.massKg, debris: window.__game.assets.detachedParts.length }))
    if (stageState.index < 1 || stageState.debris < 1) throw new Error(`${expectedId} separation did not create an independently simulated part: ${JSON.stringify(stageState)}`)
  }
  const fairingRotationBefore = await page.evaluate(() => window.__game.assets.fairingHalves.map(half => half.rotation.z))
  await page.click('[data-action="stage"]')
  await page.waitForFunction(() => window.__game.assets.fairingOpening)
  await page.waitForTimeout(320)
  const fairingMidSequence = await page.evaluate(() => ({ progress: window.__game.assets.fairingProgress, rotations: window.__game.assets.fairingHalves.map(half => half.rotation.z), orbitActive: window.__game.getSnapshot().orbitActive }))
  if (!(fairingMidSequence.progress > 0.2 && fairingMidSequence.rotations.some(value => Math.abs(value) > 0.15) && !fairingMidSequence.orbitActive)) throw new Error(`fairing hinge animation did not play before release: ${JSON.stringify({ fairingRotationBefore, fairingMidSequence })}`)
  await page.click('[data-action="deploy"]')
  if (await page.evaluate(() => window.__game.getSnapshot().orbitActive)) throw new Error('payload deployment bypassed the fairing-open interlock')
  await page.waitForFunction(() => window.__game.assets.fairingsOpened && !window.__game.assets.fairingOpening, null, { timeout: 3000 })
  const staged = await page.evaluate(() => ({ index: window.__game.assets.ascentStage, dryMass: window.__game.getSnapshot().flight.dryMassKg, mass: window.__game.getSnapshot().flight.massKg, debris: window.__game.assets.detachedParts.length, attachedFairings: window.__game.assets.fairingHalves.filter(half => half.parent === window.__game.assets.upperStage).length, stageState: document.getElementById('stage-state').textContent }))
  if (staged.index !== 3 || staged.mass >= massBeforeStage || staged.debris < 5 || staged.attachedFairings !== 0 || !/FAIRINGS JETTISONED/.test(staged.stageState)) throw new Error(`boosters/lower stage/animated split fairings did not clear correctly: ${JSON.stringify({ massBeforeStage, staged })}`)
  await page.click('[data-action="scan"]')
  if (!(await page.locator('#radar-tag').evaluate(element => element.classList.contains('is-visible')))) throw new Error('radar scan did not show its active pulse HUD')
  for (const mode of ['Prograde', 'Retrograde', 'Normal', 'Target']) {
    await page.selectOption('#sas-select', mode)
    const active = await page.evaluate(() => window.__game.flightControl.mode)
    if (active !== mode) throw new Error(`SAS ${mode} mode did not engage; active=${active}`)
  }
  for (const rate of [1, 5, 10, 50, 1000]) {
    await page.selectOption('#warp-select', String(rate))
    const active = await page.evaluate(() => window.__game.timeWarp.rate)
    if (active !== rate) throw new Error(`time-warp ${rate}× did not engage; active=${active}`)
  }
  const systems = await page.evaluate(() => ({ sas: window.__game.flightControl.mode, warp: window.__game.timeWarp.rate }))
  if (systems.sas !== 'Target' || systems.warp !== 1000) throw new Error(`SAS/time-warp controls did not apply: ${JSON.stringify(systems)}`)

  // Enter the orbital map by action; this exercises automatic fairing-aware ascent staging.
  await page.click('[data-action="camera-state"][data-value="5"]')
  await page.waitForFunction(() => window.__game.sceneState === '5' && window.__game.getSnapshot().orbitActive)
  await page.waitForFunction(() => window.__game.getSnapshot().elements?.semiMajorAxis > 0 && document.getElementById('orbit-map-path').getAttribute('d').length > 20)
  const map = await page.evaluate(() => {
    const state = window.__game.getSnapshot()
    return { a: state.elements.semiMajorAxis, e: state.elements.eccentricity, i: state.elements.inclination, ap: state.apsides.apoapsisAltitude, pe: state.apsides.periapsisAltitude, path: document.getElementById('orbit-map-path').getAttribute('d'), stage: window.__game.assets.ascentStage }
  })
  if (!(map.a > 6_371_000 && map.e >= 0 && map.e < 1 && Number.isFinite(map.i) && map.stage === 3 && map.path.length > 20)) throw new Error(`Keplerian elements or live orbit line missing: ${JSON.stringify(map)}`)
  const timeBeforeWarp = await page.evaluate(() => window.__game.getSnapshot().elapsed)
  await page.waitForTimeout(600)
  const timeAfterWarp = await page.evaluate(() => window.__game.getSnapshot().elapsed)
  if (!(timeAfterWarp - timeBeforeWarp > 100)) throw new Error(`1000× time warp did not advance bounded orbital simulation: ${timeBeforeWarp} → ${timeAfterWarp}`)
  await verifyLayout(page, 'desktop Kepler orbit map')
  await page.screenshot({ path: `${out}/05-kepler-orbit-map.png` })

  const scenes = [['1C','aerial pad'],['2','orbital evasion'],['4','cinematic flight'],['3','telemetry debrief'],['1A','payload inspection'],['1B','tower launch'],['0','Home showroom'],['5','Kepler orbit map']]
  for (const [state, label] of scenes) {
    await page.evaluate(scene => window.__game.setSceneState(scene), state)
    await page.waitForFunction(expected => window.__game.sceneState === expected, state)
    await page.waitForTimeout(70)
    await verifyLayout(page, `desktop ${label}`)
    if (state === '3' && !(await page.locator('#debrief-panel').isVisible())) throw new Error('telemetry debrief did not appear in scene 3')
    await page.screenshot({ path: `${out}/scene-${state.replace(/[^a-z0-9]/gi, '-')}.png` })
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.waitForTimeout(120)
  await verifyLayout(page, '16:9 landscape canvas')
  await page.setViewportSize({ width: 2532, height: 1080 })
  await page.waitForTimeout(120)
  await verifyLayout(page, '19:9-clamped ultrawide canvas')
  const status = await page.evaluate(() => {
    const data = window.__game.getSnapshot()
    return { models: (window.__game.assets.generatedRocket ? 1 : 0) + (window.__game.assets.generatedPreviews?.length || 0), hazards: data.hazards, asteroids: data.nasa?.asteroids?.length || 0, renderCalls: window.__game.engine.renderer.info.render.calls, prediction: window.__game.assets.orbitPrediction?.group?.children?.length || 0 }
  })
  if (status.models !== 3 || status.hazards < 1 || status.asteroids < 1 || status.renderCalls < 12 || status.prediction < 2) throw new Error(`3D world/NASA/orbit path incomplete: ${JSON.stringify(status)}`)
  await desktop.close()

  // Portrait is blocked by an explicit rotate-device screen; landscape handheld play remains full-viewport.
  const portrait = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const portraitPage = await openGame(portrait)
  await verifyLayout(portraitPage, 'portrait lock screen', { orientationBlocked: true })
  if (!(await portraitPage.getByText('LANDSCAPE REQUIRED').isVisible())) throw new Error('portrait users are not blocked by the rotation prompt')
  await portraitPage.screenshot({ path: `${out}/phone-portrait-landscape-lock.png` })
  await portrait.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const phonePage = await openGame(phone)
  await verifyLayout(phonePage, 'phone landscape Home')
  await phonePage.selectOption('#destination-select', 'MOON')
  await phonePage.tap('[data-action="start-mission"]')
  await phonePage.tap('[data-action="launch"]')
  await phonePage.waitForTimeout(250)
  await phonePage.tap('[data-action="stage"]')
  await waitForStage(phonePage, 1, 'phone booster separation')
  await phonePage.tap('[data-action="stage"]')
  await waitForStage(phonePage, 2, 'phone lower-stage separation')
  await phonePage.tap('[data-action="stage"]')
  await phonePage.waitForFunction(() => window.__game.assets.fairingOpening, null, { timeout: 5000 }).catch(async () => {
    const state = await phonePage.evaluate(() => ({ index: window.__game.assets.ascentStage, launched: window.__game.getSnapshot().flight.launched, stageButton: document.getElementById('stage-button')?.textContent, disabled: document.getElementById('stage-button')?.disabled }))
    throw new Error(`phone fairing tap did not start: ${JSON.stringify(state)}`)
  })
  await phonePage.waitForFunction(() => window.__game.assets.fairingsOpened, null, { timeout: 3000 }).catch(async () => {
    const debug = await phonePage.evaluate(() => ({ scene: window.__game.sceneState, launched: window.__game.getSnapshot().flight.launched, paused: window.__game.ui.paused, stage: window.__game.assets.ascentStage, opening: window.__game.assets.fairingOpening, progress: window.__game.assets.fairingProgress, opened: window.__game.assets.fairingsOpened, button: document.getElementById('stage-button').textContent, disabled: document.getElementById('stage-button').disabled }))
    throw new Error(`phone staging did not complete the fairing hinge sequence: ${JSON.stringify(debug)}`)
  })
  await phonePage.tap('[data-action="deploy"]')
  await phonePage.waitForFunction(() => window.__game.getSnapshot().orbitActive)
  const journey = await phonePage.evaluate(() => ({ destination: window.__game.getSnapshot().destination, hud: document.getElementById('destination-state').textContent, distance: window.__game.assets.orbitCraft.position.distanceTo(window.__game.assets.destinationTarget) }))
  if (journey.destination !== 'MOON' || journey.hud !== 'MOON' || journey.distance >= 246) throw new Error(`mobile Moon destination did not route the payload: ${JSON.stringify(journey)}`)
  await phonePage.selectOption('#sas-select', 'Normal')
  await phonePage.selectOption('#warp-select', '50')
  await phonePage.evaluate(() => window.__game.setSceneState('5'))
  await verifyLayout(phonePage, 'phone landscape Kepler HUD')
  await phonePage.screenshot({ path: `${out}/phone-landscape-kepler-hud.png` })
  await phone.close()

  const compact = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const compactPage = await openGame(compact)
  await verifyLayout(compactPage, 'compact 667px landscape Home')
  await compactPage.tap('[data-action="start-mission"]')
  await compactPage.tap('[data-action="launch"]')
  await compactPage.waitForTimeout(220)
  await compactPage.tap('[data-action="stage"]')
  await waitForStage(compactPage, 1, 'compact phone booster separation')
  await compactPage.tap('[data-action="stage"]')
  await waitForStage(compactPage, 2, 'compact phone lower-stage separation')
  await compactPage.tap('[data-action="stage"]')
  await compactPage.waitForFunction(() => window.__game.assets.fairingOpening)
  await compactPage.waitForFunction(() => window.__game.assets.fairingsOpened, null, { timeout: 3000 }).catch(async () => {
    const state = await compactPage.evaluate(() => ({ stage: window.__game.assets.ascentStage, opening: window.__game.assets.fairingOpening, progress: window.__game.assets.fairingProgress, opened: window.__game.assets.fairingsOpened }))
    throw new Error(`compact phone fairing animation did not finish: ${JSON.stringify(state)}`)
  })
  await compactPage.evaluate(() => window.__game.setSceneState('5'))
  await compactPage.waitForFunction(() => window.__game.sceneState === '5' && window.__game.getSnapshot().orbitActive, null, { timeout: 5000 }).catch(async () => {
    const state = await compactPage.evaluate(() => ({ scene: window.__game.sceneState, orbitActive: window.__game.getSnapshot().orbitActive, stage: window.__game.assets.ascentStage, opened: window.__game.assets.fairingsOpened }))
    throw new Error(`compact phone orbital-map transition did not complete: ${JSON.stringify(state)}`)
  })
  await verifyLayout(compactPage, 'compact 667px landscape orbit map')
  await compactPage.screenshot({ path: `${out}/phone-compact-kepler-hud.png` })
  await compact.close()

  if (errors.length) throw new Error(`local browser errors:\n  ${errors.join('\n  ')}`)
  await browser.close(); cleanup()
  console.log(`smoke: OK — SFS2 ascent, fuel/TWR, booster/lower/fairing jettison, settings/render presets, SAS, 1000× warp, Kepler elements/map, eight camera scenes, ${status.models} local GLBs, NASA/offline vectors, portrait lock prompt and landscape viewport/collision checks; evidence in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
