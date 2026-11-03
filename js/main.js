import '../css/style.css'
import * as THREE from 'three'
import { EngineCore } from '../engine/EngineCore.js'
import { SceneManager } from '../engine/SceneManager.js'
import { CameraController } from '../engine/CameraController.js'
import { FlightPhysics } from '../physics/FlightPhysics.js'
import { OrbitalMechanics } from '../physics/OrbitalMechanics.js'
import { AssetBuilder } from '../builders/AssetBuilder.js'
import { NASADataPipeline } from '../api/NASADataPipeline.js'
import { UIManager } from '../ui/UIManager.js'
import { TouchControls } from '../ui/TouchControls.js'

const canvas = document.getElementById('game')
const overlay = document.getElementById('ui-overlay')
if (!canvas || !overlay) throw new Error('Game canvas or HUD layer is missing')
document.documentElement.lang = 'en'

const core = new EngineCore(canvas)
const world = new SceneManager()
const assets = new AssetBuilder(world).build()
const camera = new CameraController(core.camera)
const flightModel = new FlightPhysics()
let selectedSatellite = 'ETRSS-1'
let orbitalModel = new OrbitalMechanics(selectedSatellite)
const nasaPipeline = new NASADataPipeline()
let nasa = nasaPipeline.snapshot()
let orbitActive = false
let ackMaxQ = false
let lastMaxQToast = 0
let radarUntil = 0
let destination = 'LEO'
let missionStarted = false
let elapsed = 0
let latestFlight = flightModel.snapshot()
let latestOrbit = orbitalModel.snapshot()

let touch
let ui
const setCameraState = (id) => {
  const state = camera.setState(id)
  world.setState(state.id)
  ui?.setScene(state.id)
  if (state.id === '2' && !orbitActive) enterOrbit()
  if (state.id === '3') ui?.showDebrief(snapshot())
  return state
}

function enterOrbit() {
  if (orbitActive) return
  if (!flightModel.launched) flightModel.launch()
  flightModel.throttle = 0
  flightModel.position.y = Math.max(flightModel.position.y, 110_000)
  if (flightModel.velocity.length() < 500) flightModel.velocity.set(0, 0, 7_660)
  flightModel.staged = true
  assets.stageSeparation()
  orbitalModel.configure(selectedSatellite)
  assets.setMissionDestination(destination)
  assets.releasePayload()
  orbitActive = true
  camera.setState('2')
  world.setState('2')
  ui?.setOrbitActive(true)
  ui?.setLaunchActive(true)
  ui?.setScene('2')
  ui?.toast(`${selectedSatellite} INSERTED INTO ${destination} TRAJECTORY`, 2800)
}

function startMission() {
  window.__ethioTuning?.activate?.('run')
  missionStarted = true
  destination = document.getElementById('destination-select')?.value || 'LEO'
  ui.setDestination(destination)
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
  if (!flightModel.launched || flightModel.staged) { ui.toast(flightModel.staged ? 'CORE STAGE ACTIVE' : 'IGNITION SEQUENCE REQUIRED'); return }
  flightModel.separateStage()
  assets.stageSeparation()
  ui.setStageEnabled(false)
  ui.toast('SOLID BOOSTERS SEPARATED', 2100)
}

function setOrbitState() { enterOrbit() }
function scan() {
  assets.pulseRadar()
  radarUntil = performance.now() + 2400
  ui.setRadar(true)
  const count = assets.hazards.length
  ui.toast(`RADAR PULSE — ${count} ORBITAL OBJECTS TRACKED`, 2300)
}

function snapshot() {
  const flight = flightModel.snapshot()
  const orbit = orbitalModel.snapshot()
  const displayFlight = orbitActive ? { ...flight, altitudeM: orbit.altitudeM, speedMps: orbit.speedMps, mach: orbit.speedMps / 330 } : flight
  return { flight: displayFlight, orbit, orbitActive, nasa, destination, selectedSatellite, ackMaxQ, hazards: assets.hazards.length }
}

function action(name, value) {
  switch (name) {
    case 'start-mission': startMission(); break
    case 'launch': launch(); break
    case 'stage': stage(); break
    case 'deploy': if (!flightModel.launched) ui.toast('IGNITION SEQUENCE REQUIRED'); else enterOrbit(); break
    case 'scan': scan(); break
    case 'camera': {
      const next = camera.next(); setCameraState(next.id)
      if (next.id === '2') ui.toast('ORBITAL EVASION CAMERA LOCK')
      break
    }
    case 'debrief': setCameraState('3'); break
    case 'resume': setCameraState(orbitActive ? '2' : '1B'); break
    case 'restart': window.location.reload(); break
    case 'select-satellite':
      if (assets.selectSatellite(value)) {
        selectedSatellite = value; orbitalModel.configure(value); ui.setSatellite(value)
      }
      break
    case 'throttle': touch.setThrottle(value); break
    case 'roll-left': case 'roll-right': break
    default: break
  }
}

ui = new UIManager(overlay, action)
touch = new TouchControls(overlay, action)
ui.setNASA(nasa)
world.setState('0')

const assetsReady = assets.loadGeneratedModels().then(count => {
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
  elapsed += dt
  const controls = touch.update(dt)
  const tuning = window.__ethioConfig || {}
  if (!orbitActive) latestFlight = flightModel.update(dt, controls, tuning.flight || {})
  else latestOrbit = orbitalModel.update(dt, controls, nasa.flareLevel || 0, tuning.orbit || {})
  if (flightModel.consumeMaxQCrossing()) {
    camera.triggerShake(1.35)
    ackMaxQ = false
    lastMaxQToast = performance.now()
    ui.toast('WARNING: MAX-Q STRESS LIMIT REACHED', 5000)
  }
  if (!orbitActive && flightModel.launched && flightModel.position.y >= 100_000) enterOrbit()
  if (radarUntil && performance.now() > radarUntil) { radarUntil = 0; ui.setRadar(false) }
  const flight = flightModel.snapshot()
  const orbit = orbitalModel.snapshot()
  const rocketTarget = assets.rocket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 12, 0))
  const payloadTarget = assets.rocket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 36, 0))
  const orbitTarget = assets.orbitCraft?.parent === world.spaceEnvironment ? assets.orbitCraft.position.clone() : new THREE.Vector3(38, -28, 0)
  const velocity = orbitActive ? orbit.velocity : flight.velocity
  camera.update(dt, { rocket: rocketTarget, payload: payloadTarget, orbit: orbitTarget, velocity, time, cameraTuning: tuning.camera || {} })
  assets.update(dt, flight, orbit, camera.stateId, nasa.flareLevel || 0)
  world.setAltitude(orbitActive ? orbit.altitudeM : flight.altitudeM)
  world.update(dt, orbitActive ? orbitTarget : rocketTarget)
  ui.update({ flight: orbitActive ? { ...flight, altitudeM: orbit.altitudeM, speedMps: orbit.speedMps, mach: orbit.speedMps / 330 } : flight, orbit, orbitActive, nasa, destination, selectedSatellite, ackMaxQ, elapsed })
  core.render(world.scene, camera.camera)
}

window.__game = {
  engine: core, sceneManager: world, assets, cameraController: camera, physics: flightModel,
  orbitalMechanics: orbitalModel, ui, touchControls: touch, nasaPipeline,
  ready: Promise.allSettled([assetsReady, nasaReady]),
  startMission, launch, stage, scan, enterOrbit: setOrbitState, setSceneState: setCameraState,
  setThrottle: value => touch.setThrottle(value),
  getSnapshot: snapshot,
  get sceneState() { return camera.stateId },
  get layout() { return { width: innerWidth, height: innerHeight, docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, canvas: canvas.getBoundingClientRect().toJSON() } },
}

core.start(update)
window.addEventListener('pagehide', () => { core.dispose(); clearInterval(ui.clockTimer) }, { once: true })
