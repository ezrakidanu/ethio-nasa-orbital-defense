import { Audio } from '../engine/audio'
import { Assets } from '../engine/assets'
import { Input } from '../engine/input'
import { GameLoop } from '../engine/loop'
import { Renderer, suggestQuality } from '../engine/renderer'
import { SAVE_KEY, SaveStore, type Quality } from '../engine/save'
import { tuning } from '../game/tuning'
import { FlightSimulator } from './flight-sim'
import { validateBuild, type BuildPlan } from './vab/parts'
import { SimulatorUI } from './ui'
import './flight.css'

const BUILD_KEY = 'ethionasa.vab.build.v1'
const INTRO_MS = 3000

type GameWindow = Window & { __game?: unknown; __manusRegisterGameTuning?: unknown }

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')
  const root = document.querySelector<HTMLElement>('#ui')
  if (!canvas || !root) throw new Error('Simulator canvas or interface root is missing.')
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  if (firstRun) save.update({ quality: suggestQuality() })

  const input = new Input(canvas)
  const audio = new Audio()
  const renderer = new Renderer(canvas, save.data.quality)
  const assets = new Assets()
  const simulator = new FlightSimulator(renderer, assets, canvas)
  const ui = new SimulatorUI(root, input, (action, value) => dispatch(action, value))
  let pauseReturn: 'hud' | 'rover' = 'hud'
  let settingsReturn = 'title'
  let loop: GameLoop
  let missionStartedAt = performance.now()
  let soundActivated = false

  const applySettings = () => {
    input.sensitivity = save.data.sensitivity
    input.invertY = save.data.invertY
    audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
    renderer.applyQuality(save.data.quality)
  }
  applySettings()

  const startSoundAndMusic = () => {
    if (soundActivated) return
    soundActivated = true
    audio.unlock()
    audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, save.data.muted)
    audio.play('win')
    audio.startMusic()
  }
  root.addEventListener('pointerdown', startSoundAndMusic, { once: true })
  window.addEventListener('keydown', startSoundAndMusic, { once: true })

  if (import.meta.env.DEV) {
    const { registerGameTuning } = await import('../../scripts/manus-tuning/adapter.js')
    await registerGameTuning(tuning)
  }

  const openVab = () => {
    simulator.mode = 'vab'
    ui.renderBuild(simulator.build, simulator.stats)
    ui.show('vab')
    input.unlockPointer()
  }

  const launch = () => {
    const problems = simulator.launch()
    if (problems.length) {
      ui.setToast(problems.join(' '))
      audio.play('hurt')
      return
    }
    tuning.activate('run')
    missionStartedAt = performance.now()
    ui.show('hud')
    loop.resetAccumulator()
    audio.unlock()
    audio.startMusic()
  }

  const beginSurfaceMission = async () => {
    ui.setToast('LOADING SURFACE SYSTEMS — KEEP THIS PANEL OPEN')
    const ok = await simulator.startSurfaceMission()
    ui.setAssetStatus(simulator.assetStatus)
    if (!ok) { ui.setToast(simulator.notice); return }
    tuning.activate('run')
    missionStartedAt = performance.now()
    ui.show('rover')
    loop.resetAccumulator()
    audio.unlock()
    audio.startMusic()
  }

  const pauseMission = () => {
    if (ui.screen !== 'hud' && ui.screen !== 'rover') return
    pauseReturn = ui.screen
    ui.show('pause')
    input.unlockPointer()
    loop.paused = true
  }

  const resumeMission = () => {
    if (ui.screen !== 'pause') return
    ui.show(pauseReturn)
    loop.paused = false
    loop.resetAccumulator()
  }

  const quitToHangar = () => {
    simulator.goToShowroom()
    ui.show('title')
    loop.paused = false
    input.unlockPointer()
  }

  const setSetting = (field: string, value: string) => {
    if (field === 'quality' && (value === 'low' || value === 'medium' || value === 'high')) save.update({ quality: value as Quality })
    if (field === 'music' || field === 'sfx') {
      const volume = Math.max(0, Math.min(1, Number(value) / 100))
      if (field === 'music') save.update({ musicVolume: volume })
      else save.update({ sfxVolume: volume })
    }
    applySettings()
  }

  const saveBuild = () => {
    try {
      localStorage.setItem(BUILD_KEY, JSON.stringify({ version: 1, build: simulator.build }))
      ui.setToast('VEHICLE DESIGN SAVED TO THIS DEVICE')
      audio.play('ui')
    } catch {
      ui.setToast('LOCAL STORAGE IS UNAVAILABLE — DESIGN NOT SAVED')
    }
  }

  const loadBuild = () => {
    try {
      const raw = localStorage.getItem(BUILD_KEY)
      if (!raw) { ui.setToast('NO SAVED VEHICLE DESIGN FOUND'); return }
      const data = JSON.parse(raw) as { version?: number; build?: BuildPlan }
      if (data.version !== 1 || !data.build || !Array.isArray(data.build.parts) || typeof data.build.budget !== 'number') throw new Error('invalid build')
      const errors = validateBuild(data.build)
      simulator.setBuild(data.build)
      ui.renderBuild(simulator.build, simulator.stats)
      ui.setToast(errors.length ? `DESIGN LOADED — ${errors.join(' ')}` : 'VEHICLE DESIGN LOADED')
      audio.play('ui')
    } catch {
      ui.setToast('SAVED DESIGN IS INVALID OR UNREADABLE')
    }
  }

  const dispatch = (action: string, value?: string) => {
    switch (action) {
      case 'activate-sound': startSoundAndMusic(); break
      case 'title': quitToHangar(); break
      case 'vab': openVab(); break
      case 'surface-mission': void beginSurfaceMission(); break
      case 'continue': launch(); break
      case 'launch': launch(); break
      case 'pause': pauseMission(); break
      case 'resume': resumeMission(); break
      case 'settings': settingsReturn = ui.screen; ui.show('settings'); loop.paused = true; break
      case 'settings-close': ui.show(settingsReturn); loop.paused = settingsReturn === 'pause' || settingsReturn === 'settings'; break
      case 'setting': {
        const [field, next] = (value ?? '').split(':')
        if (field && next !== undefined) setSetting(field, next)
        break
      }
      case 'throttle': simulator.setThrottle(Number(value) / 100); break
      case 'sas-prograde': simulator.setSas('prograde'); break
      case 'sas-retrograde': simulator.setSas('retrograde'); break
      case 'stage': simulator.stageSeparation(); audio.play('dash'); break
      case 'cockpit': simulator.enterCockpit(); break
      case 'eva': simulator.enterEVA(); break
      case 'map': simulator.toggleMap(); break
      case 'transfer':
        if (simulator.transferToMoon()) ui.setToast('LUNAR TRANSFER EXECUTED — SPHERE OF INFLUENCE CHANGED')
        else ui.setToast(simulator.notice)
        break
      case 'warp':
        simulator.setWarp(Number(value))
        for (const button of root.querySelectorAll<HTMLElement>('[data-action="warp"]')) button.classList.toggle('is-selected', button.dataset.value === String(simulator.timeWarp))
        break
      case 'add-part':
        try { if (value) simulator.addBuildPart(value); ui.renderBuild(simulator.build, simulator.stats) }
        catch (error) { ui.setToast(error instanceof Error ? error.message : 'Unable to attach part.') }
        break
      case 'remove-part':
        if (value) simulator.removeBuildPart(value)
        ui.renderBuild(simulator.build, simulator.stats)
        break
      case 'cycle-part-stage': {
        const part = simulator.build.parts.find((candidate) => candidate.uid === value)
        if (part) simulator.setPartStage(part.uid, part.stage >= 3 ? 0 : part.stage + 1)
        ui.renderBuild(simulator.build, simulator.stats)
        break
      }
      case 'save-build': saveBuild(); break
      case 'load-build': loadBuild(); break
      case 'retry-assets':
        void simulator.retryAssets().then((ok) => {
          ui.setAssetStatus(simulator.assetStatus)
          ui.setToast(ok ? 'ORBITAL ASSETS READY' : simulator.assetStatus)
        })
        break
      case 'rover':
        simulator.enterRover()
        if (simulator.telemetry().mode === 'rover') ui.show('rover')
        break
      case 'return-capsule':
        if (!simulator.reenterCapsule()) ui.setToast(simulator.notice)
        break
      case 'exit-rover': simulator.exitRover(); ui.show('hud'); break
      default: break
    }
  }

  loop = new GameLoop({
    beforeFrame: (frameSeconds) => input.update(frameSeconds),
    step: (dt) => {
      if (input.consume('interact')) {
        if (simulator.mode === 'flight' || simulator.mode === 'map' || simulator.mode === 'cockpit') simulator.stageSeparation()
        else if (simulator.mode === 'eva') {
          if (simulator.missionKind === 'lunar-survey') simulator.enterRover()
          else if (!simulator.reenterCapsule()) ui.setToast(simulator.notice)
        } else if (simulator.mode === 'rover') { simulator.exitRover(); ui.show('hud') }
      }
      if (simulator.mode === 'eva' && input.held('jump')) simulator.jetpackUp()
      if (simulator.mode === 'eva' && input.consume('dash')) simulator.boostEVA()
      const look = input.takeLook()
      simulator.step(dt, { moveX: input.move.x, moveY: input.move.y, lookX: look.x, lookY: look.y, warp: simulator.timeWarp })
    },
    render: (_alpha, frameSeconds) => {
      if (input.consume('pause')) {
        if (ui.screen === 'pause') resumeMission()
        else if (ui.screen === 'hud' || ui.screen === 'rover') pauseMission()
      }
      loop.paused = ui.screen === 'pause' || ui.screen === 'settings'
      simulator.render(frameSeconds)
      ui.setAssetStatus(simulator.assetStatus)
      if (ui.screen === 'hud' || ui.screen === 'rover') ui.updateTelemetry(simulator.telemetry(), frameSeconds)
      input.endFrame()
    },
  })
  loop.start()

  const keyboard = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement | null)?.matches?.('input, select, textarea, button')) return
    const mission = ui.screen === 'hud' || ui.screen === 'rover'
    if (!mission) return
    if (event.code === 'KeyM') { simulator.toggleMap(); event.preventDefault() }
    else if (event.code === 'KeyC') { simulator.enterCockpit(); event.preventDefault() }
    else if (event.code === 'KeyV') { simulator.enterEVA(); event.preventDefault() }
    else if (event.code === 'KeyQ') { simulator.setSas('prograde'); event.preventDefault() }
    else if (event.code === 'KeyR') { simulator.setSas('retrograde'); event.preventDefault() }
    else if (event.code === 'KeyE' && simulator.mode === 'eva' && simulator.missionKind === 'lunar-survey') {
      simulator.enterRover()
      if (simulator.telemetry().mode === 'rover') ui.show('rover')
    }
  }
  window.addEventListener('keydown', keyboard)

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && (ui.screen === 'hud' || ui.screen === 'rover') && input.method === 'keyboard') pauseMission()
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMission() })
  canvas.addEventListener('click', () => {
    if (ui.screen === 'hud' || ui.screen === 'rover') input.lockPointer()
  })
  window.addEventListener('beforeunload', () => { loop.stop(); input.dispose(); audio.stopMusic() }, { once: true })

  ui.renderBuild(simulator.build, simulator.stats)
  ui.setAssetStatus(simulator.assetStatus)
  const started = performance.now()
  window.setTimeout(() => {
    if (ui.screen === 'splash') ui.show('title')
  }, Math.max(0, INTRO_MS - (performance.now() - started)))

  ;(window as GameWindow).__game = { game: simulator, ui, input, save, renderer, startedAt: missionStartedAt }
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

boot().catch((error) => {
  console.error(error)
  const root = document.getElementById('ui')
  if (root) root.innerHTML = `<div class="fatal-error"><b>FLIGHT SYSTEMS FAILED TO START</b><span>${String((error as Error)?.message ?? error).replace(/[<>&]/g, '')}</span><button onclick="location.reload()">RETRY INITIALIZATION</button></div>`
})
