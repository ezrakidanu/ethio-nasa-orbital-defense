import '../css/style.css'
import * as THREE from 'three'
import { EngineCore } from '../engine/EngineCore.js'
import { SceneManager } from '../engine/SceneManager.js'
import { CameraController } from '../engine/CameraController.js'
import { FlightPhysics } from '../physics/FlightPhysics.js'
import { OrbitalMechanics } from '../physics/OrbitalMechanics.js'
import { SASController, TimeWarpController } from '../physics/FlightControlSystem.js'
import { stateToElements, apsisAltitudes, sampleOrbit } from '../physics/KeplerOrbit.js'
import { AssetBuilder } from '../builders/AssetBuilder.js'
import { NASADataPipeline } from '../api/NASADataPipeline.js'
import { UIManager } from '../ui/UIManager.js'
import { TouchControls } from '../ui/TouchControls.js'
import { GameSettings } from '../ui/GameSettings.js'

const canvas = document.getElementById('game')
const overlay = document.getElementById('ui-overlay')
if (!canvas || !overlay) throw new Error('Game canvas or HUD layer is missing')
document.documentElement.lang = 'en'

const settings = new GameSettings()
const core = new EngineCore(canvas)
const world = new SceneManager()
const assets = new AssetBuilder(world).build()
const camera = new CameraController(core.camera)
const flightModel = new FlightPhysics()
const flightControl = new SASController()
const timeWarp = new TimeWarpController({ maxStepSeconds: 0.05, maxSubsteps: 1200 })
let selectedSatellite = 'ETRSS-1'
let orbitalModel = new OrbitalMechanics(selectedSatellite)
const nasaPipeline = new NASADataPipeline()
let nasa = nasaPipeline.snapshot()
let orbitActive = false
let ackMaxQ = false
let radarUntil = 0
let destination = 'LEO'
let missionStarted = false
let elapsed = 0
let latestFlight = flightModel.snapshot()
let latestOrbit = orbitalModel.snapshot()
let orbitElements = null
let orbitApsides = null
let orbitSamples = []
let lastOrbitBuild = 0
let paused = false

let touch
let ui

function applyGraphicsSettings() {
  const preset = settings.getGraphicsSettings()
  core.setGraphicsSettings(preset)
  assets.setGraphicsSettings?.({ ...preset, atmosphereBloom: preset.atmosphereBloom ? 1 : 0 })
  world.keyLight.castShadow = Boolean(preset.shadowsEnabled)
  world.keyLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize)
  if (world.keyLight.shadow.map) { world.keyLight.shadow.map.dispose(); world.keyLight.shadow.map = null }
}

const setCameraState = id => {
  if ((String(id) === '2' || String(id) === '5') && missionStarted && !orbitActive) {
    if (!enterOrbit(String(id))) {
      if (assets.fairingOpening) ui?.toast('FAIRING HINGES OPENING — ORBITAL VIEW LOCKED', 1500)
      return camera.setState(camera.stateId)
    }
  }
  const state = camera.setState(id)
  world.setState(state.id)
  ui?.setScene(state.id)
  if (state.id === '3') ui?.showDebrief(snapshot())
  return state
}

function updateOrbitPrediction(force = false) {
  if (!orbitActive) return
  const now = performance.now()
  if (!force && now - lastOrbitBuild < 400) return
  lastOrbitBuild = now
  try {
    orbitElements = stateToElements(orbitalModel.position, orbitalModel.velocity)
    orbitApsides = apsisAltitudes(orbitElements)
    orbitSamples = sampleOrbit(orbitElements, 128)
    assets.setOrbitPrediction?.(orbitSamples, orbitElements)
  } catch (error) {
    orbitElements = null
    orbitApsides = null
    orbitSamples = []
    console.debug('Keplerian prediction unavailable for current orbital state.', error)
  }
}

function applySeparatedMass(result) {
  if (!result?.massKey) return
  flightModel.separateStage(result.massKey)
}

function separateAscentStack() {
  if (typeof assets.completeAscentSeparation === 'function') {
    const separated = assets.completeAscentSeparation()
    const steps = Array.isArray(separated) ? separated : (separated?.steps || [])
    steps.forEach(item => flightModel.separateStage(typeof item === 'string' ? item : item.massKey))
    return Array.isArray(separated) ? { ok: true, steps } : separated
  }
  const completed = []
  for (let step = 0; step < 3; step += 1) {
    const result = assets.stageSeparation?.()
    if (!result?.ok || !['boosters', 'lower-stage', 'fairing'].includes(String(result.id).toLowerCase())) break
    applySeparatedMass(result)
    completed.push(result.id)
  }
  return { ok: true, steps: completed }
}

function enterOrbit(cameraAfter = '2') {
  if (orbitActive) return true
  if (!flightModel.launched) { flightModel.launch(); assets.launch() }
  const separation = separateAscentStack()
  if (!separation?.ok) {
    if (!separation?.pending) ui?.toast(separation?.message || 'STAGING SEQUENCE NOT COMPLETE')
    return false
  }
  flightModel.throttle = 0
  flightModel.position.y = Math.max(flightModel.position.y, 110_000)
  flightModel.staged = true
  orbitalModel.configure(selectedSatellite)
  assets.setMissionDestination(destination)
  assets.releasePayload()
  orbitActive = true
  updateOrbitPrediction(true)
  camera.setState(cameraAfter)
  world.setState(cameraAfter)
  ui?.setOrbitActive(true)
  ui?.setLaunchActive(true)
  ui?.setStageLabel('STAGE: UPPER CORE', true)
  ui?.setStageState('FAIRINGS SEPARATED · PAYLOAD DEPLOYED')
  ui?.setScene(cameraAfter)
  ui?.toast(`${selectedSatellite} INSERTED INTO ${destination} TRAJECTORY`, 2800)
  return true
}

function startMission() {
  window.__ethioTuning?.activate?.('run')
  missionStarted = true
  destination = document.getElementById('destination-select')?.value || 'LEO'
  ui.setDestination(destination)
  assets.setMissionDestination(destination)
  ui.startMission()
  setCameraState('1A')
}

function launch() {
  if (!missionStarted) startMission()
  if (orbitActive) { ui.toast('ORBITAL INSERTION COMPLETE'); return }
  flightModel.launch()
  touch.setThrottle(1)
  assets.launch()
  ui.setStageEnabled(true)
  ui.setLaunchActive(true)
  setCameraState('1B')
  ui.toast('SLS IGNITION — ASCENT GUIDANCE ACTIVE', 2600)
}

function stage() {
  if (!flightModel.launched) { ui.toast('IGNITION SEQUENCE REQUIRED'); return }
  if (!assets.stageSeparation) { ui.toast('STAGING SYSTEMS UNAVAILABLE'); return }
  const result = assets.stageSeparation()
  if (result?.pending) {
    ui.setStageState('FAIRING HINGES OPENING')
    ui.setStageLabel(result.nextLabel || 'FAIRINGS OPENING', false)
    ui.toast(result.message || 'FAIRING HINGES OPENING — STAND BY', 1600)
    return
  }
  if (!result?.ok) { ui.toast(result?.message || 'NO SEPARABLE STAGE IS AVAILABLE'); return }
  if (result.id === 'upper-stage' && !orbitActive) { ui.toast('DEPLOY PAYLOAD BEFORE UPPER-CORE SEPARATION'); return }
  applySeparatedMass(result)
  ui.setStageState(result.message || result.label)
  ui.setStageLabel(result.nextLabel || (result.complete ? 'STAGING COMPLETE' : `STAGE: ${result.label || 'SEPARATION'}`), !result.complete)
  ui.toast(result.message || `${String(result.id || 'STAGE').replace('-', ' ').toUpperCase()} SEPARATED`, 2100)
}

function scan() {
  assets.pulseRadar()
  radarUntil = performance.now() + 2400
  ui.setRadar(true)
  ui.toast(`RADAR PULSE — ${assets.hazards.length} ORBITAL OBJECTS TRACKED`, 2300)
}

function snapshot() {
  const flight = flightModel.snapshot()
  const orbit = orbitalModel.snapshot()
  const displayFlight = orbitActive ? { ...flight, altitudeM: orbit.altitudeM, speedMps: orbit.speedMps, mach: orbit.speedMps / 343, qPa: 0, qKpa: 0, maxQReached: false, throttle: 0, twr: 0 } : flight
  return {
    flight: displayFlight, orbit, orbitActive, nasa, destination, selectedSatellite, ackMaxQ,
    hazards: assets.hazards.length, elapsed, apsides: orbitApsides, elements: orbitElements,
    orbitSamples, sasMode: flightControl.mode, timeWarp: timeWarp.rate,
    stageLabel: assets.nextStageLabel || '', settings: settings.getAll(),
  }
}

function sasTargetVector() {
  if (!orbitActive) return flightModel.position.clone().add(new THREE.Vector3(0, 0, 100_000))
  const target = assets.destinationTarget
  if (!target) return orbitalModel.position.clone().add(new THREE.Vector3(0, 0, 10_000_000))
  const earthCenter = assets.earthGroup?.position || new THREE.Vector3(0, -33, 0)
  return target.clone().sub(earthCenter).multiplyScalar(6_371_000 / 33)
}

function action(name, value, extraValue) {
  switch (name) {
    case 'start-mission': startMission(); break
    case 'launch': launch(); break
    case 'stage': stage(); break
    case 'deploy': if (!flightModel.launched) ui.toast('IGNITION SEQUENCE REQUIRED'); else if (!enterOrbit()) ui.toast(assets.fairingOpening ? 'FAIRING HINGES OPENING — PAYLOAD DEPLOYMENT INTERLOCKED' : 'SEPARATE BOOSTERS, CORE AND FAIRINGS BEFORE DEPLOYMENT'); break
    case 'scan': scan(); break
    case 'camera': {
      const next = camera.next(); setCameraState(next.id)
      if (next.id === '2') ui.toast('ORBITAL EVASION CAMERA LOCK')
      break
    }
    case 'camera-state': {
      setCameraState(value)
      if (value === '5') ui.toast('KEPLERIAN ORBIT MAP · APOAPSIS / PERIAPSIS TRACKING')
      break
    }
    case 'debrief': setCameraState('3'); break
    case 'pause':
      if (!missionStarted) { ui.showSettings(); break }
      paused = !paused; ui.setPaused(paused); break
    case 'resume-flight': paused = false; ui.setPaused(false); break
    case 'return-home': window.location.reload(); break
    case 'close-settings': ui.closeSettings(); break
    case 'settings': ui.showSettings(); break
    case 'restart': window.location.reload(); break
    case 'select-satellite':
      if (assets.selectSatellite(value)) {
        selectedSatellite = value
        orbitalModel.configure(value)
        assets.setShowroomSatellite?.(value)
        ui.setSatellite(value)
      }
      break
    case 'destination':
      destination = String(value || 'LEO')
      ui.setDestination(destination)
      assets.setMissionDestination(destination)
      break
    case 'throttle': touch.setThrottle(Number(value)); break
    case 'throttle-step': touch.setThrottle(Math.max(0, Math.min(1, touch.throttle + Number(value) / 100))); break
    case 'sas':
      if (flightControl.setMode(value)) { ui.setSAS(value); ui.toast(`SAS ${value.toUpperCase()} HOLD`) }
      break
    case 'time-warp':
      if (timeWarp.setRate(Number(value))) { ui.setTimeWarp(timeWarp.rate); ui.toast(`SIMULATION TIME WARP ${timeWarp.rate}×`) }
      break
    case 'setting': {
      if (!settings.set(value, extraValue)) { ui.toast('INVALID SETTING VALUE'); break }
      ui.refreshSettings()
      if (value === 'graphics') applyGraphicsSettings()
      break
    }
    case 'roll-left': case 'roll-right': break
    default: break
  }
}

ui = new UIManager(overlay, action, settings)
touch = new TouchControls(overlay, action, settings)
ui.setNASA(nasa)
assets.setShowroomSatellite?.(selectedSatellite)
applyGraphicsSettings()
world.setState('0')

let showroomPointer = null
canvas.addEventListener('pointerdown', event => {
  if (camera.stateId !== '0' || event.button > 0) return
  showroomPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', event => {
  if (!showroomPointer || event.pointerId !== showroomPointer.id) return
  const dx = event.clientX - showroomPointer.x
  const dy = event.clientY - showroomPointer.y
  showroomPointer.x = event.clientX; showroomPointer.y = event.clientY
  assets.rotateShowroom?.(dx, dy)
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (event.pointerId === showroomPointer?.id) showroomPointer = null })

const assetsReady = assets.loadGeneratedModels().then(count => {
  assets.setShowroomSatellite?.(selectedSatellite)
  if (count) ui.toast(`${count} GENERATED SPACECRAFT MODELS LOADED`, 1800)
  return count
}).catch(() => 0)
const nasaReady = nasaPipeline.load().then(data => {
  nasa = data
  assets.addAsteroids(data.asteroids)
  world.setStorm(data.flareLevel)
  ui.setNASA(data)
  return data
})

function update(dt, time) {
  const tuning = window.__ethioConfig || {}
  const safeDt = Math.min(Math.max(dt, 0), 0.05)
  const controls = touch.update(safeDt)
  let physicsSteps = []
  if (!paused && missionStarted) {
    physicsSteps = orbitActive ? timeWarp.plan(safeDt).steps : [safeDt]
    for (const step of physicsSteps) {
      let stepControls = controls
      if (flightControl.mode !== 'Off') {
        const position = orbitActive ? orbitalModel.position : flightModel.position
        const velocity = orbitActive ? orbitalModel.velocity : flightModel.velocity
        const hold = flightControl.update({ position, velocity, target: sasTargetVector(), pitch: flightModel.pitch, yaw: flightModel.yaw, roll: flightModel.roll })
        if (hold.active) stepControls = { ...controls, ...hold }
      }
      if (!orbitActive) latestFlight = flightModel.update(step, stepControls, tuning.flight || {})
      else latestOrbit = orbitalModel.update(step, stepControls, nasa.flareLevel || 0, tuning.orbit || {})
    }
    elapsed += physicsSteps.reduce((sum, step) => sum + step, 0)
  }
  const simulationDt = physicsSteps.reduce((sum, step) => sum + step, 0)
  const visualDt = paused ? 0 : (missionStarted ? Math.min(simulationDt, 0.25) : safeDt)

  if (flightModel.consumeMaxQCrossing()) {
    camera.triggerShake(1.35)
    ackMaxQ = false
    ui.toast('WARNING: MAX-Q STRESS LIMIT REACHED', 5000)
  }
  if (!orbitActive && missionStarted && flightModel.launched && flightModel.position.y >= 100_000) enterOrbit()
  if (radarUntil && performance.now() > radarUntil) { radarUntil = 0; ui.setRadar(false) }

  const flight = flightModel.snapshot()
  const orbit = orbitalModel.snapshot()
  if (orbitActive) updateOrbitPrediction()
  const rocketTarget = assets.rocket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 12, 0))
  const payloadTarget = assets.rocket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 36, 0))
  const orbitTarget = assets.orbitCraft?.parent === world.spaceEnvironment ? assets.orbitCraft.position.clone() : new THREE.Vector3(38, -28, 0)
  const velocity = orbitActive ? orbit.velocity : flight.velocity
  const jettisonTarget = assets.getJettisonTarget?.()
  camera.update(safeDt, {
    rocket: rocketTarget, payload: payloadTarget, orbit: orbitTarget, velocity, time,
    showroom: assets.getShowroomTarget?.() || world.showroomAnchor,
    jettison: jettisonTarget, cameraTuning: tuning.camera || {},
  })
  assets.update(visualDt, flight, orbit, camera.stateId, nasa.flareLevel || 0)
  if (assets.fairingJustOpened) {
    assets.fairingJustOpened = false
    ui.setStageState('PAYLOAD FAIRINGS JETTISONED · BAY CLEAR')
    ui.setStageLabel('STAGE: UPPER CORE', true)
    ui.toast('PAYLOAD FAIRINGS CLEAR · DEPLOYMENT ENABLED', 1900)
  }
  world.setAltitude(orbitActive ? orbit.altitudeM : flight.altitudeM)
  world.update(visualDt, orbitActive ? orbitTarget : camera.stateId === '0' ? world.showroomAnchor : rocketTarget)
  ui.update({
    flight: orbitActive ? { ...flight, altitudeM: orbit.altitudeM, speedMps: orbit.speedMps, mach: orbit.speedMps / 343, qPa: 0, qKpa: 0, maxQReached: false, throttle: 0, twr: 0 } : flight,
    orbit, orbitActive, nasa, destination, selectedSatellite, ackMaxQ, elapsed,
    apsides: orbitApsides, elements: orbitElements, orbitSamples,
    sasMode: flightControl.mode, timeWarp: timeWarp.rate,
  })
  core.render(world.scene, camera.camera)
}

window.__game = {
  engine: core, sceneManager: world, assets, cameraController: camera, physics: flightModel,
  orbitalMechanics: orbitalModel, flightControl, timeWarp, settings, ui, touchControls: touch, nasaPipeline,
  ready: Promise.allSettled([assetsReady, nasaReady]),
  startMission, launch, stage, scan, enterOrbit, setSceneState: setCameraState,
  setThrottle: value => touch.setThrottle(value),
  getSnapshot: snapshot,
  get sceneState() { return camera.stateId },
  get layout() { return { width: innerWidth, height: innerHeight, docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, canvas: canvas.getBoundingClientRect().toJSON() } },
}

core.start(update)
window.addEventListener('pagehide', () => { core.dispose(); clearInterval(ui.clockTimer); clearTimeout(ui.loaderTimer) }, { once: true })
