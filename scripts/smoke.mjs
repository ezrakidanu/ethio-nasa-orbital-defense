// Bounded preview smoke check for the complete ETHIO-NASA mission flow.
// Builds must already exist in dist/ (`pnpm build`). Captures are evidence, not release inputs.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const errors = []
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
function listen(page) {
  page.on('console', message => {
    const text = message.text()
    // Browser omits the failed URL from this generic message; URL-aware response/request
    // handlers below still fail local assets while the NASA pipeline may use its fallback.
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
async function openGame(context) {
  const page = await context.newPage(); listen(page)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__game?.engine?.renderer?.info?.render?.calls > 0, null, { timeout: 30_000 })
  await page.waitForSelector('#mission-panel:not(.is-hidden)', { timeout: 10_000 })
  const ready = await page.evaluate(async () => await window.__game.ready)
  if (ready?.[0]?.status !== 'fulfilled' || ready[0].value !== 3) throw new Error(`the three generated spacecraft models did not load: ${JSON.stringify(ready?.[0])}`)
  if (ready?.[1]?.status !== 'fulfilled' || !(ready[1].value.asteroids?.length > 0)) throw new Error('NASA feeds and offline fallback did not provide asteroid vectors')
  return page
}
async function verifyLayout(page, label) {
  const report = await page.evaluate(() => {
    const width = innerWidth, height = innerHeight
    const canvas = document.getElementById('game').getBoundingClientRect()
    const controls = [...document.querySelectorAll('#ui-overlay button, #ui-overlay input, #ui-overlay select')]
      .filter(element => getComputedStyle(element).display !== 'none' && element.getClientRects().length)
      .map(element => { const r = element.getBoundingClientRect(); return { name: element.getAttribute('aria-label') || element.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) || element.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
    const regions = [...document.querySelectorAll('.throttle-wrap label, .throttle-wrap > small, .stick-wrap > small, .roll-buttons small')]
      .filter(element => getComputedStyle(element).display !== 'none' && element.getClientRects().length)
      .map(element => { const r = element.getBoundingClientRect(); return { name: element.textContent.trim() || element.className, left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
    return { width, height, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height, right: canvas.right, bottom: canvas.bottom }, controls, regions }
  })
  if (report.scrollWidth > report.width + 1 || report.scrollHeight > report.height + 1) throw new Error(`${label}: document overflow ${report.scrollWidth}×${report.scrollHeight} at ${report.width}×${report.height}`)
  if (Math.abs(report.canvas.width - report.width) > 1 || Math.abs(report.canvas.height - report.height) > 1 || Math.abs(report.canvas.left) > 1 || Math.abs(report.canvas.top) > 1) throw new Error(`${label}: canvas is not fullscreen (${JSON.stringify(report.canvas)})`)
  const outside = report.controls.filter(control => control.left < -1 || control.top < -1 || control.right > report.width + 1 || control.bottom > report.height + 1)
  if (outside.length) throw new Error(`${label}: HUD controls outside viewport: ${JSON.stringify(outside)}`)
  const overlaps = []
  for (let i = 0; i < report.controls.length; i += 1) for (let j = i + 1; j < report.controls.length; j += 1) {
    const a = report.controls[i], b = report.controls[j]
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) overlaps.push([a.name, b.name])
  }
  if (overlaps.length) throw new Error(`${label}: interactive HUD controls overlap: ${JSON.stringify(overlaps)}`)
  const regionOverlaps = []
  for (const a of report.regions) for (const b of report.controls) {
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) regionOverlaps.push([a.name, b.name])
  }
  if (regionOverlaps.length) throw new Error(`${label}: HUD labels overlap interactive controls: ${JSON.stringify(regionOverlaps)}`)
  return report
}

try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ args: ['--ignore-gpu-blocklist'], channel: 'chrome' }))
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const page = await openGame(desktop)
  await page.waitForTimeout(200)
  await verifyLayout(page, 'desktop hangar')
  await page.screenshot({ path: `${out}/01-hangar.png` })
  let boot = await page.evaluate(() => ({ models: (window.__game.assets.generatedRocket ? 1 : 0) + (window.__game.assets.generatedPreviews?.length || 0), renderCalls: window.__game.engine.renderer.info.render.calls, scene: window.__game.sceneState }))
  if (boot.scene !== '0' || boot.renderCalls < 1 || boot.models !== 3) throw new Error(`hangar/model boot incomplete: ${JSON.stringify(boot)}`)

  await page.click('[data-action="start-mission"]')
  await page.waitForFunction(() => window.__game.sceneState === '1A')
  await page.waitForFunction(() => window.__game.assets.generatedPreviews.filter(preview => preview.root.visible).length === 1)
  await verifyLayout(page, 'payload inspection')
  await page.screenshot({ path: `${out}/02-payload-inspection.png` })
  await page.click('[data-action="launch"]')
  await page.waitForFunction(() => window.__game.sceneState === '1B')
  const fuelBefore = await page.evaluate(() => window.__game.getSnapshot().flight.fuelPercent)
  await page.waitForTimeout(1200)
  const ascent = await page.evaluate(() => window.__game.getSnapshot().flight)
  if (!(ascent.altitudeM > 0 && ascent.speedMps > 0 && ascent.fuelPercent < fuelBefore)) throw new Error(`ascent did not integrate thrust/fuel: ${JSON.stringify({ fuelBefore, altitude: ascent.altitudeM, speed: ascent.speedMps, fuel: ascent.fuelPercent })}`)
  await verifyLayout(page, 'tower launch')
  await page.screenshot({ path: `${out}/03-tower-launch.png` })
  await page.click('[data-action="stage"]')
  const staged = await page.evaluate(() => window.__game.getSnapshot().flight.staged)
  if (!staged) throw new Error('booster stage separation did not update flight state')
  await page.click('[data-action="scan"]')
  if (!(await page.locator('#radar-tag').evaluate(element => element.classList.contains('is-visible')))) throw new Error('radar scan did not show its active HUD pulse')

  const scenes = [
    ['1C', 'aerial pad'], ['2', 'orbital evasion'], ['3', 'telemetry debrief'],
    ['0', 'hangar'], ['1A', 'payload inspection'], ['1B', 'tower launch'],
  ]
  for (const [state, label] of scenes) {
    await page.evaluate(scene => window.__game.setSceneState(scene), state)
    await page.waitForFunction(expected => window.__game.sceneState === expected, state)
    await page.waitForTimeout(80)
    await verifyLayout(page, `desktop ${label}`)
    if (state === '3' && !(await page.locator('#debrief-panel').isVisible())) throw new Error('telemetry debrief panel did not appear in scene 3')
    await page.screenshot({ path: `${out}/scene-${state.replace(/[^a-z0-9]/gi, '-')}.png` })
  }
  const status = await page.evaluate(() => {
    const data = window.__game.getSnapshot()
    return { models: (window.__game.assets.generatedRocket ? 1 : 0) + (window.__game.assets.generatedPreviews?.length || 0), hazards: data.hazards, asteroids: data.nasa?.asteroids?.length || 0, renderCalls: window.__game.engine.renderer.info.render.calls }
  })
  if (status.models !== 3 || status.hazards < 1 || status.asteroids < 1 || status.renderCalls < 10) throw new Error(`3D mission world or NASA/offline data incomplete: ${JSON.stringify(status)}`)
  await desktop.close()

  for (const size of [{ width: 390, height: 844, name: 'phone portrait' }, { width: 844, height: 390, name: 'phone landscape' }]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
    const mobilePage = await openGame(context)
    await verifyLayout(mobilePage, `${size.name} hangar`)
    if (size.name === 'phone landscape') await mobilePage.selectOption('#destination-select', 'MOON')
    await mobilePage.tap('[data-action="start-mission"]')
    await mobilePage.tap('[data-action="launch"]')
    await mobilePage.waitForTimeout(180)
    if (size.name === 'phone landscape') {
      await mobilePage.tap('[data-action="deploy"]')
      await mobilePage.waitForFunction(() => window.__game.getSnapshot().orbitActive)
      const journey = await mobilePage.evaluate(() => ({ destination: window.__game.getSnapshot().destination, distance: window.__game.assets.orbitCraft.position.distanceTo(window.__game.assets.destinationTarget), hud: document.getElementById('destination-state').textContent }))
      if (journey.destination !== 'MOON' || journey.hud !== 'MOON' || journey.distance >= 234.2) throw new Error(`selected Moon Gateway did not route the payload: ${JSON.stringify(journey)}`)
    } else await mobilePage.tap('[data-action="scan"]')
    await mobilePage.evaluate(() => window.__game.setSceneState('2'))
    await verifyLayout(mobilePage, `${size.name} orbital HUD`)
    await mobilePage.screenshot({ path: `${out}/${size.name.replace(' ', '-')}-hud.png` })
    await context.close()
  }
  if (errors.length) throw new Error(`local browser errors:\n  ${errors.join('\n  ')}`)
  await browser.close(); cleanup()
  console.log(`smoke: OK — ascent, staging, radar, six camera states, ${status.models} GLBs, ${status.asteroids} NASA/offline NEOs and full-screen layout at desktop and 2 phone sizes; evidence in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
