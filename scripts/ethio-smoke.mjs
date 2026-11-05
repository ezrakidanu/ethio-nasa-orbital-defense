import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = process.env.BASE_URL ?? `http://127.0.0.1:${port}/`
const preview = process.env.BASE_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
const args = ['--no-sandbox', '--ignore-gpu-blocklist']
let browser
const errors = []
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

async function launchBrowser() {
  const options = [
    ...(process.env.CHROMIUM_PATH ? [{ executablePath: process.env.CHROMIUM_PATH, args }] : []),
    { executablePath: '/usr/bin/chromium', args },
    {},
    { channel: 'chrome', args },
  ]
  let lastError
  for (const option of options) {
    try { return await chromium.launch(option) } catch (error) { lastError = error }
  }
  throw lastError
}

async function waitForPreview() {
  for (let i = 0; i < 80; i += 1) {
    if (preview?.exitCode !== null && preview?.exitCode !== undefined) throw new Error(`Vite preview exited with ${preview.exitCode}`)
    try { if ((await fetch(url)).ok) return } catch {}
    await wait(250)
  }
  throw new Error(`Preview did not respond at ${url}`)
}

async function attachErrors(page) {
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`) })
}

try {
  await waitForPreview()
  browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const page = await context.newPage()
  await attachErrors(page)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__game), { timeout: 30_000 })
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 10_000 })
  assert((await page.title()).includes('ETHIO-NASA'), 'document title is not branded')

  await page.click('[data-action="vab"]')
  await page.waitForSelector('[data-screen="vab"].is-active')
  assert(await page.locator('[data-action="launch"]').isEnabled(), 'default VAB build should pass readiness checks')
  await page.click('[data-filter="propulsion"]')
  assert(await page.locator('.part-card:not([hidden])').count() > 0, 'propulsion filter returned no parts')
  await page.click('[data-filter="all"]')
  await page.click('[data-action="save-build"]')
  await page.click('[data-action="load-build"]')
  await page.click('[data-action="launch"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  assert(await page.evaluate(() => window.__game.game.telemetry().mode === 'flight'), 'launch did not enter flight mode')
  await page.locator('[data-range="throttle"]').fill('65')
  await wait(900)
  await page.click('[data-action="map"]')
  assert(await page.locator('[data-ui="map-label"]').evaluate(node => node.classList.contains('is-visible')), 'map mode did not open')
  await page.click('[data-action="map"]')
  await page.click('[data-action="cockpit"]')
  assert(await page.evaluate(() => window.__game.game.telemetry().mode === 'cockpit'), 'cockpit mode did not activate')
  await page.click('[data-action="cockpit"]')
  await page.click('[data-action="eva"]')
  assert(await page.evaluate(() => window.__game.game.telemetry().mode === 'eva'), 'EVA mode did not activate')
  await page.click('[data-action="return-capsule"]')
  assert(await page.evaluate(() => window.__game.game.telemetry().mode === 'flight'), 'astronaut could not re-enter capsule')
  await page.click('[data-action="pause"]')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.click('[data-action="resume"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.click('[data-action="pause"]')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.locator('.pause-screen .button-secondary').click()
  await page.waitForSelector('[data-screen="title"].is-active')

  await page.click('[data-action="surface-mission"]')
  await page.waitForFunction(() => window.__game.game.telemetry().mode === 'rover', { timeout: 30_000 })
  await page.waitForSelector('[data-screen="rover"].is-active')
  await page.keyboard.down('KeyW')
  await wait(700)
  await page.keyboard.up('KeyW')
  const speed = await page.evaluate(() => Math.abs(window.__game.game.telemetry().roverSpeed))
  assert(speed > 0.15, `rover did not move (speed ${speed})`)
  await page.click('[data-action="exit-rover"]')
  assert(await page.evaluate(() => window.__game.game.telemetry().mode === 'eva'), 'rover exit should enter surface EVA')
  await page.click('[data-action="rover"]')
  assert(await page.evaluate(() => window.__game.game.telemetry().mode === 'rover'), 'astronaut could not re-board rover')
  await context.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const phonePage = await phone.newPage()
  await attachErrors(phonePage)
  await phonePage.goto(url, { waitUntil: 'domcontentloaded' })
  await phonePage.waitForSelector('[data-screen="title"].is-active', { timeout: 15_000 })
  await phonePage.click('[data-action="vab"]')
  await phonePage.waitForSelector('[data-screen="vab"].is-active')
  assert(await phonePage.locator('[data-action="launch"]').isEnabled(), 'mobile VAB launch is not ready')
  await phone.close()

  assert(errors.length === 0, `browser errors:\n${errors.join('\n')}`)
  console.log('ETHIO-NASA browser smoke: PASS — VAB, launch, map, cockpit, EVA/re-entry, pause, rover drive and mobile layout')
} finally {
  await browser?.close()
  preview?.kill('SIGTERM')
}
