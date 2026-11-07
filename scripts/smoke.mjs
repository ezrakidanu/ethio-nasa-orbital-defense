// Production-build smoke test for ETHIO-NASA: Orbital Defense.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const port = 4300 + Math.floor(Math.random() * 300)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? '/tmp/ethioorb-smoke'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const cleanup = () => { try { server.kill('SIGTERM') } catch {} }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) { ready = true; break } } catch {} await sleep(250) }
  if (!ready) throw new Error('Production preview server did not start')
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', e => errors.push(`page: ${String(e)}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`) })
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForSelector('.boot', { state: 'attached' })
  await page.waitForTimeout(3150)
  await page.waitForSelector('.hero h1')
  if (!(await page.title()).includes('ETHIO-NASA')) throw new Error(`Unexpected page title: ${await page.title()}`)
  await page.screenshot({ path: `${out}/01-menu.png` })
  await page.locator('[data-action="mission"]').click()
  await page.waitForSelector('#mission-select')
  await page.locator('[data-action="mission-go"]').click()
  await page.waitForSelector('.build-stats')
  if (!(await page.locator('.vab-toolbar').innerText()).includes('STRUCTURE VALID')) throw new Error('Starter vehicle stack is not valid')
  if (await page.locator('[data-action="launch"]').isDisabled()) throw new Error('Starter vehicle launch should be enabled')
  await page.screenshot({ path: `${out}/02-vab.png` })
  await page.locator('[data-action="launch"]').click()
  await page.waitForSelector('.flight-shell')
  await page.waitForTimeout(350)
  if (!(await page.locator('.flight-top h2').innerText()).includes('FLIGHT')) throw new Error('Flight HUD did not open')
  await page.screenshot({ path: `${out}/03-flight.png` })
  await page.locator('[data-action="map"]').first().click()
  await page.waitForSelector('.orbit-elements')
  await page.screenshot({ path: `${out}/04-map.png` })
  await page.locator('[data-action="flight"]').click()
  await page.locator('[data-action="eva"]').click()
  if (!(await page.locator('.mobility').count())) throw new Error('EVA motion controls are missing')
  await page.locator('[data-action="rover"]').click()
  if (!(await page.locator('.mobility').count())) throw new Error('Rover control surface is missing')
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)
  console.log(`smoke: OK — menu, mission selection, VAB, launch HUD, map, EVA and rover; screenshots in ${out}`)
  await browser.close(); cleanup()
} catch (error) {
  console.error(`smoke: FAIL — ${error?.stack ?? error}`)
  await browser?.close().catch(() => {}); cleanup(); process.exitCode = 1
}
