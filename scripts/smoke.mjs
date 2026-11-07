// Production smoke test: desktop mission completion plus touch-first landscape navigation.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 300)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? '/tmp/ethioorb-smoke'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const errors = []
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const watch = page => {
  page.on('pageerror', error => errors.push(`page: ${String(error)}`))
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`) })
}
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) { ready = true; break } } catch {} await sleep(250) }
  if (!ready) throw new Error('Production preview server did not start')
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })

  const desktop = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 })
  watch(desktop)
  await desktop.goto(url, { waitUntil: 'load', timeout: 30_000 })
  await desktop.waitForSelector('.boot', { state: 'attached' })
  await desktop.waitForTimeout(3150)
  await desktop.waitForSelector('.hero h1')
  if (!(await desktop.title()).includes('ETHIO-NASA')) throw new Error(`Unexpected page title: ${await desktop.title()}`)
  await desktop.screenshot({ path: `${out}/01-menu.png` })
  await desktop.locator('[data-action="mission"]').click()
  await desktop.waitForSelector('#mission-select')
  await desktop.locator('[data-action="mission-go"]').click()
  await desktop.waitForSelector('.build-stats')
  if (!(await desktop.locator('.vab-toolbar').innerText()).includes('STRUCTURE VALID')) throw new Error('Starter vehicle stack is not valid')
  if (await desktop.locator('[data-action="launch"]').isDisabled()) throw new Error('Starter vehicle launch should be enabled')
  await desktop.screenshot({ path: `${out}/02-vab.png` })
  await desktop.locator('[data-action="launch"]').click()
  await desktop.waitForSelector('.flight-shell')
  await desktop.waitForSelector('.mission-guide')
  await desktop.waitForTimeout(250)
  if (!(await desktop.locator('[data-mission-state]').innerText()).includes('APOAPSIS')) throw new Error('Mission objective did not initialize')
  const idleMass = await desktop.evaluate(() => window.__game.state.mass)
  await desktop.waitForTimeout(350)
  const zeroThrottleMass = await desktop.evaluate(() => window.__game.state.mass)
  if (Math.abs(idleMass - zeroThrottleMass) > 0.5) throw new Error('Engines consumed propellant at 0% throttle')
  await desktop.screenshot({ path: `${out}/03-flight.png` })
  await desktop.locator('[data-action="throttle"]').fill('100')
  await desktop.waitForFunction(() => !document.querySelector('[data-action="deploy"]')?.disabled, { timeout: 15_000 })
  const elapsed = await desktop.locator('.flight-footer b').first().innerText()
  if (!(Number.parseFloat(elapsed) > 0)) throw new Error(`Flight clock did not advance: ${elapsed}`)
  if (!(await desktop.locator('[data-mission-state]').innerText()).includes('TARGET ORBIT REACHED')) throw new Error('The objective did not complete orbital insertion')
  if (!(await desktop.evaluate(() => window.__game.state.mass)) || await desktop.evaluate(() => window.__game.state.mass) >= idleMass) throw new Error('Throttle input did not consume propellant')
  await desktop.locator('[data-action="deploy"]').click()
  if (!(await desktop.locator('[data-mission-state]').innerText()).includes('MISSION COMPLETE')) throw new Error('Payload deployment did not complete the mission')
  await desktop.locator('[data-action="map"]').first().click()
  await desktop.waitForSelector('.orbit-elements')
  await desktop.screenshot({ path: `${out}/04-map.png` })
  await desktop.locator('[data-action="flight"]').click()
  await desktop.locator('[data-action="eva"]').click()
  if (!(await desktop.locator('.mobility').count())) throw new Error('EVA motion controls are missing')
  await desktop.locator('[data-action="rover"]').click()
  if (!(await desktop.locator('.mobility').count())) throw new Error('Rover control surface is missing')

  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  watch(mobile)
  await mobile.goto(url, { waitUntil: 'load', timeout: 30_000 })
  await mobile.waitForTimeout(3150)
  await mobile.locator('[data-action="mission"]').tap()
  await mobile.waitForSelector('#mission-select')
  await mobile.locator('[data-action="mission-go"]').tap()
  await mobile.waitForSelector('.build-stats')
  await mobile.locator('[data-action="launch"]').tap()
  await mobile.waitForSelector('.mission-guide')
  const scroll = await mobile.locator('.flight-side').evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
  if (scroll.scrollHeight <= scroll.clientHeight) throw new Error('Short-screen flight panel does not expose scrollable mission actions')
  await mobile.locator('.flight-side').evaluate(el => { el.scrollTop = el.scrollHeight })
  await mobile.locator('[data-action="rover"]').scrollIntoViewIfNeeded()
  if (!(await mobile.locator('[data-action="rover"]').isVisible())) throw new Error('Rover control is unreachable on a touch-sized landscape screen')
  await mobile.screenshot({ path: `${out}/05-mobile-flight.png` })

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
  console.log(`smoke: OK — mission selection, VAB, live orbital burn, objective cutoff, payload deployment, map, EVA, rover, and touch-screen scrolling; screenshots in ${out}`)
  await browser.close()
  server.kill('SIGTERM')
} catch (error) {
  console.error(`smoke: FAIL — ${error?.stack ?? error}`)
  await browser?.close().catch(() => {})
  server.kill('SIGTERM')
  process.exitCode = 1
}
