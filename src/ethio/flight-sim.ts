import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Renderer } from '../engine/renderer'
import type { Assets } from '../engine/assets'
import { EARTH, atmosphericDensity, dynamicPressure, orbitalElements, predictTrajectory, rk4Step, sphereOfInfluence, thermalFlux, type FlightState, type OrbitOptions } from './physics/orbit'
import { addPart, computeStats, PARTS, removePart, setStage, starterBuild, validateBuild, type BuildPlan, type VehicleStats } from './vab/parts'
import { GAME_ASSETS } from './asset-urls'
import { CONFIG } from '../game/config'

export type FlightMode = 'showroom' | 'vab' | 'flight' | 'map' | 'cockpit' | 'eva' | 'rover'
export type SasMode = 'prograde' | 'retrograde' | null
export type MissionKind = 'orbital-defense' | 'lunar-survey'
export type FlightControls = { moveX: number; moveY: number; lookX: number; lookY: number; warp: number }
export type Telemetry = {
  mode: FlightMode; mission: string; missionKind: MissionKind; altitudeKm: number; speedKmS: number
  apoapsisKm: number | null; periapsisKm: number; inclinationDeg: number; dynamicPressureKPa: number
  heatMWM2: number; fuelKg: number; massKg: number; throttle: number; batteryPct: number
  twr: number; powerW: number; science: number; funds: number; stage: number; sas: SasMode
  objective: string; notice: string; soi: string; evaDistanceM: number; roverSpeed: number
}

const UNIT_TO_METERS = 1_000_000
const MOON_RADIUS_M = 1_737_400
const MOON_MU = 4.9048695e12
const EARTH_MASS_KG = 5.9722e24
const MOON_MASS_KG = 7.342e22
const MOON_POSITION = new THREE.Vector3(30, 0.5, -3)
const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, -1)
const LOCALE_EN = 'en'
const clamp = THREE.MathUtils.clamp

function makeInitialBuild(): BuildPlan {
  let plan = starterBuild()
  const capsule = plan.parts.find((part) => part.typeId === 'command_capsule')!
  const lightTank = plan.parts.find((part) => part.typeId === 'tank_light')!
  const largeTank = addPart(plan, 'tank_large', lightTank.uid)
  plan = setStage(largeTank, largeTank.parts.at(-1)!.uid, 2)
  const booster = addPart(plan, 'engine_high_thrust', largeTank.parts.at(-1)!.uid)
  plan = setStage(booster, booster.parts.at(-1)!.uid, 2)
  plan = addPart(plan, 'solar_array', capsule.uid)
  plan = addPart(plan, 'solar_array', capsule.uid)
  const fairing = addPart(plan, 'fairing', capsule.uid)
  plan = setStage(fairing, fairing.parts.at(-1)!.uid, 2)
  return plan
}

function material(color: THREE.ColorRepresentation, roughness = 0.68, metalness = 0.25): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) mat.dispose()
  })
}

function scaleToHeight(object: THREE.Object3D, height: number): void {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  if (size.y > 0) object.scale.multiplyScalar(height / size.y)
  const updated = new THREE.Box3().setFromObject(object)
  object.position.y -= updated.min.y
}

export class FlightSimulator {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.005, 500)
  mode: FlightMode = 'showroom'
  missionKind: MissionKind = 'orbital-defense'
  mission = 'ORBITAL DEFENSE / MISSION 01'
  build: BuildPlan = makeInitialBuild()
  stats: VehicleStats = computeStats(this.build)
  state: FlightState = { position: new THREE.Vector3(EARTH.radius / UNIT_TO_METERS + 0.01, 0, 0), velocity: new THREE.Vector3(), massKg: this.stats.wetMassKg, propellantKg: this.stats.fuelKg, heatFlux: 0, ablatorKg: 36 }
  throttle = 0.18
  timeWarp = 1
  sas: SasMode = null
  notice = 'VEHICLE ASSEMBLY READY'
  objective = 'Assemble a launch vehicle and place the sensor payload in target orbit.'
  batteryPct = 0.82
  funds = 100_000
  science = 0
  missionComplete = false
  missionProgress = 0
  activeStage = 2
  readonly assets: Assets
  readonly renderer: Renderer
  readonly canvas: HTMLCanvasElement
  readonly mixerClock = new THREE.Clock()

  private readonly light = new THREE.HemisphereLight(0x8eb9d7, 0x132331, 1.15)
  private readonly keyLight = new THREE.DirectionalLight(0xffe4b8, 3.2)
  private readonly earth = new THREE.Group()
  private readonly moon = new THREE.Group()
  private readonly surface = new THREE.Group()
  private readonly vessel = new THREE.Group()
  private readonly defenseSatellite = new THREE.Group()
  private readonly vesselVisuals = new THREE.Group()
  private readonly cockpit = new THREE.Group()
  private readonly mapLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x8be6ff, transparent: true, opacity: 0.9 }))
  private readonly jettisoned = new THREE.Group()
  private readonly roverRoot = new THREE.Group()
  private readonly roverBody = new THREE.Group()
  private readonly wheelMeshes: THREE.Mesh[] = []
  private readonly flame: THREE.Mesh
  private readonly flameLight = new THREE.PointLight(0xff7d3d, 0, 3)
  private readonly astronautRoot = new THREE.Group()
  private astronautModel?: THREE.Object3D
  private proceduralAstronaut?: THREE.Group
  private astronautMixer?: THREE.AnimationMixer
  private astronautActions: THREE.AnimationAction[] = []
  private activeAnimation = -1
  private capsuleModel?: THREE.Object3D
  private roverModel?: THREE.Object3D
  private proceduralRover?: THREE.Group
  private stars?: THREE.Points
  private earthClouds?: THREE.Mesh
  private surfaceRocks: THREE.Mesh[] = []
  private currentStage = 2
  private currentTime = 0
  private lookYaw = 0
  private lookPitch = 0.25
  private storeMessage = 'ASSETS LOADING'
  private allModelsLoaded = false
  private roverReady = false
  private orbitalLoad?: Promise<void>
  private roverLoad?: Promise<boolean>
  private lastTrajectoryAt = -1000
  private batteryEnergyWh = 860
  private roverSpeed = 0
  private roverHeading = 0
  private roverPosition = new THREE.Vector3(-8, 0, 0)
  private readonly surveyStation = new THREE.Vector3(-8, 0, 26)
  private roverOnSurface = false
  private evaPosition = new THREE.Vector3()
  private evaVelocity = new THREE.Vector3()
  private lunarSoi = false
  private cooldown = 0
  private maxQSeen = false
  private damage = 0
  private heatMax = 0
  private energyWarning = false
  private readonly resourceUrls = GAME_ASSETS

  constructor(renderer: Renderer, assets: Assets, canvas: HTMLCanvasElement) {
    this.renderer = renderer
    this.assets = assets
    this.canvas = canvas
    this.currentStage = Math.max(0, ...this.build.parts.map((part) => part.stage))
    this.scene.background = new THREE.Color('#020a13')
    this.scene.fog = new THREE.FogExp2('#020a13', 0.0016)
    this.camera.up.set(0, 1, 0)
    this.keyLight.position.set(-12, 18, 9)
    this.scene.add(this.light, this.keyLight, this.earth, this.moon, this.surface, this.vessel, this.defenseSatellite, this.jettisoned, this.roverRoot, this.astronautRoot, this.mapLine)
    this.vessel.add(this.vesselVisuals, this.cockpit)
    this.vessel.add(this.flameLight)
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.78, 20), new THREE.MeshBasicMaterial({ color: 0xff7837, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }))
    this.flame.rotation.x = Math.PI
    this.flame.position.y = -0.85
    this.vessel.add(this.flame)
    this.buildCelestialBodies()
    this.buildLunarSurface()
    this.buildDefenseSatellite()
    this.buildCockpitInterior()
    this.buildRoverWheels()
    this.rebuildVehicle()
    this.camera.position.set(12, 7, 19)
    this.camera.lookAt(0, 0, 0)
    this.loadModels()
  }

  get assetsReady(): boolean { return this.allModelsLoaded }
  get assetStatus(): string { return this.storeMessage }

  private buildCelestialBodies(): void {
    const earthRadius = EARTH.radius / UNIT_TO_METERS
    const ocean = new THREE.Mesh(new THREE.SphereGeometry(earthRadius, 96, 64), new THREE.MeshPhysicalMaterial({ color: 0x1f5b89, roughness: 0.76, metalness: 0.02, clearcoat: 0.12 }))
    this.earth.add(ocean)
    const landColors = [0x527a52, 0x76824e, 0x8b875c]
    let seed = 812739
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < 38; i += 1) {
      const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize()
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.28 + random() * 0.42, 12, 8), material(landColors[i % landColors.length], 0.96, 0.02))
      patch.scale.set(1.4 + random(), 0.15, 0.72 + random() * 0.55)
      patch.position.copy(direction.multiplyScalar(earthRadius * 1.001))
      patch.quaternion.setFromUnitVectors(UP, direction.clone().normalize())
      this.earth.add(patch)
    }
    this.earthClouds = new THREE.Mesh(new THREE.SphereGeometry(earthRadius * 1.009, 80, 56), new THREE.MeshBasicMaterial({ color: 0x9fd6e9, transparent: true, opacity: 0.12, wireframe: true }))
    this.earth.add(this.earthClouds)
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(earthRadius * 1.035, 72, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vView=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vNormal; varying vec3 vView; void main(){ float rim=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),3.2); gl_FragColor=vec4(0.12,0.52,0.96,0.33*rim); }',
    }))
    this.earth.add(atmosphere)
    const meridians = new THREE.Group()
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: THREE.Vector3[] = []
      for (let lon = 0; lon <= 360; lon += 4) {
        const a = THREE.MathUtils.degToRad(lon), b = THREE.MathUtils.degToRad(lat)
        points.push(new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)).multiplyScalar(earthRadius * 1.001))
      }
      meridians.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x66a6ca, transparent: true, opacity: 0.2 })))
    }
    this.earth.add(meridians)
    const moonRadius = MOON_RADIUS_M / UNIT_TO_METERS
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(moonRadius, 80, 64), new THREE.MeshStandardMaterial({ color: 0x9b9a93, roughness: 0.98, metalness: 0 }))
    this.moon.add(moonMesh)
    this.moon.position.copy(MOON_POSITION)
    this.moon.rotation.z = 0.42
    for (let i = 0; i < 34; i += 1) {
      const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize()
      const crater = new THREE.Mesh(new THREE.CircleGeometry(0.08 + random() * 0.14, 18), new THREE.MeshStandardMaterial({ color: 0x6f706f, transparent: true, opacity: 0.28, side: THREE.DoubleSide }))
      crater.position.copy(direction.multiplyScalar(moonRadius * 1.001))
      crater.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
      this.moon.add(crater)
    }
    this.scene.add(this.moon)
    const starGeometry = new THREE.BufferGeometry()
    const positions = new Float32Array(1800 * 3)
    for (let i = 0; i < 1800; i += 1) {
      positions[i * 3] = (random() - 0.5) * 520
      positions[i * 3 + 1] = (random() - 0.5) * 360
      positions[i * 3 + 2] = (random() - 0.5) * 520
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xb9d7e8, size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.78 }))
    this.scene.add(this.stars)
  }

  private buildDefenseSatellite(): void {
    const structure = new THREE.MeshStandardMaterial({ color: 0xb2b6b2, metalness: 0.72, roughness: 0.31 })
    const gold = new THREE.MeshStandardMaterial({ color: 0xc89d56, metalness: 0.62, roughness: 0.34 })
    const panel = new THREE.MeshStandardMaterial({ color: 0x245684, metalness: 0.37, roughness: 0.28, emissive: 0x0a1a31 })
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), structure)
    this.defenseSatellite.add(core)
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.32), gold)
    band.position.y = -0.05
    this.defenseSatellite.add(band)
    for (const side of [-1, 1]) {
      const boom = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.04), gold)
      boom.position.x = side * 0.41
      this.defenseSatellite.add(boom)
      const solar = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.035, 0.46), panel)
      solar.position.x = side * 0.94
      this.defenseSatellite.add(solar)
      for (let i = -1; i <= 1; i += 1) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.042, 0.43), structure)
        line.position.set(side * 0.94 + i * 0.15, 0, 0)
        this.defenseSatellite.add(line)
      }
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.36, 8), gold)
    mast.position.y = 0.31
    this.defenseSatellite.add(mast)
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), structure)
    dish.position.set(0.03, 0.45, -0.12)
    dish.rotation.x = Math.PI
    this.defenseSatellite.add(dish)
    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5de0d1 }))
    sensor.position.set(0, 0, -0.19)
    this.defenseSatellite.add(sensor)
    this.defenseSatellite.scale.setScalar(0.56)
  }

  private buildLunarSurface(): void {
    const geometry = new THREE.PlaneGeometry(240, 240, 128, 128)
    const positions = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i), y = positions.getY(i)
      const broad = Math.sin(x * 0.08) * Math.cos(y * 0.055) * 0.9
      const detail = Math.sin(x * 0.31 + y * 0.11) * Math.cos(y * 0.27) * 0.24
      positions.setZ(i, broad + detail)
    }
    geometry.computeVertexNormals()
    const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x625f59, roughness: 1, metalness: 0, flatShading: true }))
    terrain.rotation.x = -Math.PI / 2
    terrain.position.y = -0.6
    terrain.receiveShadow = true
    this.surface.add(terrain)
    this.surveyStation.y = this.terrainHeight(this.surveyStation.x, this.surveyStation.z)
    const station = new THREE.Group()
    station.position.copy(this.surveyStation)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 8), material(0xc8d0c5, 0.58, 0.55))
    pole.position.y = 0.95
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: 0xe5b75e }))
    marker.position.y = 2.05
    const beacon = new THREE.PointLight(0xe5b75e, 1.1, 8)
    beacon.position.y = 2.1
    station.add(pole, marker, beacon)
    this.surface.add(station)
    let seed = 91573
    const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < 68; i += 1) {
      const radius = 0.18 + random() * 0.62
      const x = (random() - 0.5) * 100, z = (random() - 0.5) * 100
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x77736a : 0x4a4946, roughness: 1, flatShading: true }))
      rock.scale.y = 0.35 + random() * 0.7
      rock.position.set(x, this.terrainHeight(x, z) + radius * rock.scale.y * 0.72, z)
      rock.rotation.set(random() * 3, random() * 3, random() * 3)
      this.surface.add(rock)
      this.surfaceRocks.push(rock)
    }
    const ridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 1, flatShading: true })
    for (let i = 0; i < 10; i += 1) {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(9 + i % 3 * 2, 11 + (i % 4) * 2, 5), ridgeMaterial)
      peak.position.set((i - 5) * 24, 3.4, -80 - (i % 4) * 15)
      this.surface.add(peak)
    }
    this.surface.visible = false
  }

  private terrainHeight(x: number, z: number): number {
    const broad = Math.sin(x * 0.08) * Math.cos(z * 0.055) * 0.9
    const detail = Math.sin(x * 0.31 - z * 0.11) * Math.cos(z * 0.27) * 0.24
    return -0.6 + broad + detail
  }

  private buildCockpitInterior(): void {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.72, 1.15, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a9aa7, metalness: 0.63, roughness: 0.34, side: THREE.DoubleSide, transparent: true, opacity: 0.28 }))
    shell.position.y = 0.3
    this.cockpit.add(shell)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.5), material(0x344d5a, 0.6, 0.4))
    seat.position.set(0, -0.08, 0.14)
    this.cockpit.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.6, 0.12), material(0x263943, 0.72, 0.38))
    back.position.set(0, 0.21, 0.35)
    this.cockpit.add(back)
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.23, 0.25), new THREE.MeshStandardMaterial({ color: 0x182d3a, metalness: 0.32, roughness: 0.45, emissive: 0x062034 }))
    console.position.set(0, -0.34, -0.28)
    this.cockpit.add(console)
    for (let i = -1; i <= 1; i += 1) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x46d7ba : 0x43a9de, side: THREE.DoubleSide }))
      screen.position.set(i * 0.28, -0.33, -0.145)
      screen.rotation.x = -0.4
      this.cockpit.add(screen)
    }
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.08, 24), material(0x455764, 0.8, 0.32))
    floor.position.y = -0.52
    this.cockpit.add(floor)
    this.cockpit.visible = false
  }

  private buildRoverWheels(): void {
    this.roverRoot.add(this.roverBody)
    const axleColor = material(0x757b79, 0.7, 0.55)
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x202426, roughness: 0.95, metalness: 0.02 })
    for (const side of [-1, 1]) {
      for (const x of [-0.95, 0, 0.95]) {
        const wheelGroup = new THREE.Group()
        wheelGroup.position.set(side * 0.74, 0.2, x)
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 18), tireMaterial)
        tire.rotation.z = Math.PI / 2
        wheelGroup.add(tire)
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.235, 16), axleColor)
        hub.rotation.z = Math.PI / 2
        wheelGroup.add(hub)
        this.roverRoot.add(wheelGroup)
        this.wheelMeshes.push(tire)
      }
    }
    this.roverRoot.visible = false
  }

  private buildProceduralAstronaut(): void {
    if (this.proceduralAstronaut) return
    const fallback = new THREE.Group()
    this.proceduralAstronaut = fallback
    const suit = material(0xc5d4d2, 0.72, 0.16)
    const dark = material(0x243941, 0.68, 0.35)
    const gold = material(0xd2a753, 0.42, 0.46)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.078, 18, 14), new THREE.MeshStandardMaterial({ color: 0xa9c8ca, metalness: 0.5, roughness: 0.2, emissive: 0x132c36 }))
    helmet.position.y = 0.205
    fallback.add(helmet)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.16, 5, 12), suit)
    torso.position.y = 0.02
    fallback.add(torso)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.19, 0.075), dark)
    pack.position.set(0, 0.035, 0.11)
    fallback.add(pack)
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.16, 4, 8), suit)
      arm.position.set(side * 0.116, 0.035, 0)
      arm.rotation.z = side * -0.13
      fallback.add(arm)
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.125, 4, 8), suit)
      leg.position.set(side * 0.045, -0.17, 0.01)
      fallback.add(leg)
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.045, 0.11), dark)
      boot.position.set(side * 0.045, -0.28, -0.018)
      fallback.add(boot)
    }
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), gold)
    patch.position.set(0, 0.07, -0.084)
    patch.rotation.y = Math.PI
    fallback.add(patch)
    this.astronautRoot.add(fallback)
  }

  private buildProceduralRover(): void {
    if (this.proceduralRover) return
    const fallback = new THREE.Group()
    this.proceduralRover = fallback
    const frame = new THREE.MeshStandardMaterial({ color: 0xc27c38, metalness: 0.56, roughness: 0.39 })
    const dark = material(0x34434a, 0.68, 0.42)
    const glass = new THREE.MeshStandardMaterial({ color: 0x4b8991, metalness: 0.36, roughness: 0.18, emissive: 0x09232a })
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 1.58), frame)
    chassis.position.y = 0.52
    fallback.add(chassis)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.62), dark)
    cabin.position.set(0, 0.88, -0.24)
    fallback.add(cabin)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.27, 0.04), glass)
    canopy.position.set(0, 0.91, -0.574)
    fallback.add(canopy)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.035, 0.78), new THREE.MeshStandardMaterial({ color: 0x244a68, metalness: 0.32, roughness: 0.3 }))
    deck.position.set(0, 1.14, 0.16)
    fallback.add(deck)
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 1.72), frame)
      rail.position.set(side * 0.55, 0.48, 0)
      fallback.add(rail)
    }
    this.roverBody.add(fallback)
  }

  private async loadModels(): Promise<void> {
    if (this.orbitalLoad) return this.orbitalLoad
    this.orbitalLoad = (async () => {
      const [capsule, astronaut] = await Promise.allSettled([this.assets.gltf(this.resourceUrls.commandCapsule), this.assets.gltf(this.resourceUrls.astronaut)])
    if (capsule.status === 'fulfilled') {
      this.capsuleModel = capsule.value.scene
      this.rebuildVehicle()
    }
    if (astronaut.status === 'fulfilled' && !this.astronautModel) {
      if (this.proceduralAstronaut) {
        this.astronautRoot.remove(this.proceduralAstronaut)
        disposeObject(this.proceduralAstronaut)
        this.proceduralAstronaut = undefined
      }
      this.astronautModel = astronaut.value.scene
      const clone = cloneSkinned(this.astronautModel)
      scaleToHeight(clone, 0.47)
      this.astronautRoot.add(clone)
      this.astronautMixer = new THREE.AnimationMixer(clone)
      this.astronautActions = astronaut.value.animations.map((clip) => this.astronautMixer!.clipAction(clip))
      this.playAnimation('standing')
      this.cockpit.add(this.astronautRoot)
      this.astronautRoot.position.set(0, -0.3, 0.13)
      this.astronautRoot.rotation.y = Math.PI
    } else if (astronaut.status === 'rejected') {
      this.buildProceduralAstronaut()
    }
      const failed = [capsule, astronaut].filter((result) => result.status === 'rejected').length
      this.allModelsLoaded = failed === 0
      this.storeMessage = failed ? `${failed} ORBITAL ASSET(S) OFFLINE — PROCEDURAL CREW FALLBACK / RETRY AVAILABLE` : 'CAPSULE AND EVA CREW READY / ROVER LOADS ON SURFACE ENTRY'
      this.rebuildVehicle()
    })().finally(() => { this.orbitalLoad = undefined })
    return this.orbitalLoad
  }

  async retryAssets(): Promise<boolean> {
    if (!this.allModelsLoaded) await this.loadModels()
    if (this.mode === 'rover' && !this.roverReady) await this.ensureRoverLoaded()
    return this.allModelsLoaded && (this.mode !== 'rover' || this.roverReady)
  }

  private async ensureRoverLoaded(): Promise<boolean> {
    if (this.roverReady) return true
    if (this.roverLoad) return this.roverLoad
    this.storeMessage = 'LOADING LUNAR ROVER / SURFACE ASSET'
    this.roverLoad = this.assets.gltf(this.resourceUrls.rover).then((gltf) => {
      if (this.proceduralRover) {
        this.roverBody.remove(this.proceduralRover)
        disposeObject(this.proceduralRover)
        this.proceduralRover = undefined
      }
      this.roverModel = gltf.scene
      const clone = cloneSkinned(this.roverModel)
      scaleToHeight(clone, 1.25)
      this.roverBody.add(clone)
      this.roverReady = true
      this.storeMessage = 'SIX-WHEEL LUNAR ROVER READY'
      return true
    }).catch(() => {
      this.buildProceduralRover()
      this.roverReady = false
      this.storeMessage = 'ROVER MODEL OFFLINE — PROCEDURAL SIX-WHEEL FALLBACK ACTIVE'
      return true
    }).finally(() => { this.roverLoad = undefined })
    return this.roverLoad
  }

  private playAnimation(kind: 'standing' | 'walk'): void {
    if (!this.astronautActions.length) return
    const wanted = this.astronautActions.findIndex((action) => {
      const name = action.getClip().name.toLowerCase()
      return kind === 'walk' ? name.includes('walk') : name.includes('standing') || name.includes('idle')
    })
    const index = wanted >= 0 ? wanted : 0
    if (this.activeAnimation === index && this.astronautActions[index]!.isRunning()) return
    for (const action of this.astronautActions) action.fadeOut(0.16)
    const action = this.astronautActions[index]!
    action.reset().fadeIn(0.16).setLoop(THREE.LoopRepeat, Infinity).play()
    this.activeAnimation = index
  }

  private rebuildVehicle(): void {
    for (const child of [...this.vesselVisuals.children]) {
      this.vesselVisuals.remove(child)
      if (child !== this.cockpit && !child.userData.externalAsset) disposeObject(child)
    }
    const stack = this.build.parts.filter((part) => part.attachment === 'stack')
    let y = 0.85
    const heightOf = (type: string) => type === 'command_capsule' ? 0.65 : type.startsWith('tank_') ? 0.68 : type.startsWith('engine_') ? 0.4 : type === 'fairing' ? 0.52 : 0.22
    for (const part of stack) {
      const def = PARTS[part.typeId]!
      const h = heightOf(part.typeId)
      let mesh: THREE.Object3D
      if (part.typeId === 'command_capsule' && this.capsuleModel) {
        mesh = cloneSkinned(this.capsuleModel)
        scaleToHeight(mesh, h)
        mesh.userData.externalAsset = true
      } else if (def.category === 'tank') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, h, 24), new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.48, roughness: 0.38 }))
      } else if (def.category === 'engine') {
        const g = new THREE.Group()
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, h * 0.54, 22), new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.62, roughness: 0.3 }))
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, h * 0.46, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0x3c454a, metalness: 0.76, roughness: 0.24, side: THREE.DoubleSide }))
        body.position.y = h * 0.2
        nozzle.position.y = -h * 0.3
        g.add(body, nozzle)
        mesh = g
      } else if (def.category === 'decoupler') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, h * 0.28, 24), new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.67, roughness: 0.36 }))
      } else if (def.category === 'fairing') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(0.45, h, 32), new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.32, roughness: 0.36, transparent: true, opacity: 0.86 }))
      } else if (def.category === 'capsule') {
        mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.32, 8, 20), new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.52, roughness: 0.32 }))
      } else {
        const geometry = def.category === 'power' ? new THREE.BoxGeometry(1.05, 0.04, 0.55) : new THREE.BoxGeometry(0.44, 0.35, 0.34)
        mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.42, roughness: 0.36 }))
      }
      mesh.position.y = y
      this.vesselVisuals.add(mesh)
      if (def.category === 'power') {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, 0.58), new THREE.MeshStandardMaterial({ color: 0x235082, metalness: 0.34, roughness: 0.28, emissive: 0x0c2440 }))
        panel.position.set(def.attachMode === 'radial' ? 0.75 : 0, y + 0.05, 0.05)
        panel.rotation.y = Math.PI / 2
        this.vesselVisuals.add(panel)
      } else if (def.category === 'science' || def.category === 'payload') {
        mesh.position.x = 0.4
      }
      y -= h * 0.75
    }
    this.vesselVisuals.add(this.cockpit)
    this.cockpit.visible = this.mode === 'cockpit'
    this.flame.position.y = y + 0.1
  }

  setBuild(plan: BuildPlan): void {
    this.build = { ...plan, parts: [...plan.parts] }
    this.stats = computeStats(this.build)
    this.funds = Math.max(0, 100_000 - this.stats.totalCost)
    this.currentStage = Math.max(0, ...this.build.parts.map((part) => part.stage))
    this.rebuildVehicle()
  }

  addBuildPart(typeId: string): void {
    const parent = this.build.parts.at(-1)
    const updated = addPart(this.build, typeId, parent?.uid)
    const added = updated.parts.at(-1)!
    this.setBuild(setStage(updated, added.uid, Math.max(0, ...updated.parts.map((part) => part.stage))))
  }

  removeBuildPart(uid: string): void { this.setBuild(removePart(this.build, uid)) }
  setPartStage(uid: string, stage: number): void { this.setBuild(setStage(this.build, uid, stage)) }

  launch(): string[] {
    const problems = validateBuild(this.build)
    if (problems.length) return problems
    this.mode = 'flight'
    this.missionKind = 'orbital-defense'
    this.mission = 'ORBITAL DEFENSE / MISSION 01'
    this.objective = 'Raise apoapsis above 120 km, circularize, and keep the Asteria sensor powered.'
    this.notice = 'LIFTOFF — ENGINE VECTOR ACTIVE'
    this.state = { position: new THREE.Vector3(EARTH.radius / UNIT_TO_METERS + 0.002, 0, 0), velocity: new THREE.Vector3(0, 0, 0), massKg: this.stats.wetMassKg, propellantKg: this.stats.fuelKg, heatFlux: 0, ablatorKg: 36 }
    this.currentStage = Math.max(0, ...this.build.parts.map((part) => part.stage))
    this.sas = null
    this.throttle = 0.18
    this.timeWarp = 1
    this.lunarSoi = false
    this.maxQSeen = false
    this.damage = 0
    this.heatMax = 0
    this.energyWarning = false
    this.vessel.visible = true
    this.vessel.position.copy(this.state.position)
    this.cockpit.visible = false
    this.surface.visible = false
    this.roverRoot.visible = false
    this.astronautRoot.visible = false
    this.attitude.setFromUnitVectors(UP, this.state.position.clone().normalize())
    this.missionComplete = false
    return []
  }

  private attitude = new THREE.Quaternion()
  private showMapFrom: FlightMode = 'flight'
  toggleMap(): void {
    if (this.mode === 'map') this.mode = this.showMapFrom
    else if (['flight', 'cockpit'].includes(this.mode)) { this.showMapFrom = this.mode; this.mode = 'map' }
  }

  setSas(mode: SasMode): void { this.sas = this.sas === mode ? null : mode }
  setThrottle(value: number): void { this.throttle = clamp(Number.isFinite(value) ? value : 0, 0, 1) }
  setWarp(value: number): void { this.timeWarp = [1, 5, 20, 100].includes(value) ? Math.min(value, CONFIG.flight.maxWarp) : 1 }

  goToShowroom(): void {
    this.mode = 'showroom'
    this.vessel.visible = true
    this.roverRoot.visible = false
    this.astronautRoot.visible = false
    this.surface.visible = false
    this.cockpit.visible = false
    this.mapLine.visible = false
  }

  stageSeparation(): void {
    const stage = this.currentStage
    if (stage <= 0) { this.notice = 'NO SEPARABLE STAGE REMAINS'; return }
    const detached = this.build.parts.filter((part) => part.stage === stage)
    if (!detached.length) { this.currentStage = Math.max(0, stage - 1); return }
    const detachedIds = new Set(detached.map((part) => part.uid))
    const remaining = this.build.parts.filter((part) => !detachedIds.has(part.uid))
    const orphaned = remaining.filter((part) => part.parentUid && detachedIds.has(part.parentUid))
    for (const part of orphaned) detachedIds.add(part.uid)
    const validRemaining = this.build.parts.filter((part) => !detachedIds.has(part.uid))
    const debris = new THREE.Group()
    for (let i = 0; i < detached.length; i += 1) {
      const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.42, 14), new THREE.MeshStandardMaterial({ color: PARTS[detached[i]!.typeId]?.color ?? 0x8796a1, metalness: 0.46, roughness: 0.42 }))
      obj.position.set((i - detached.length / 2) * 0.18, i * -0.3, 0)
      debris.add(obj)
    }
    debris.position.copy(this.vessel.position).add(new THREE.Vector3(0.2, -0.3, 0))
    debris.userData.velocity = new THREE.Vector3(-0.0004, 0.00025, 0.0001)
    this.jettisoned.add(debris)
    const removedDry = detached.reduce((sum, part) => sum + (PARTS[part.typeId]?.dryMassKg ?? 0), 0)
    const removedFuel = detached.reduce((sum, part) => sum + (PARTS[part.typeId]?.propellantCapacityKg ?? 0), 0)
    const removed = removedDry + removedFuel
    this.state.massKg = Math.max(1, this.state.massKg - removed)
    this.state.propellantKg = Math.max(0, this.state.propellantKg - removedFuel)
    this.setBuild({ ...this.build, parts: validRemaining })
    this.currentStage = Math.max(0, ...validRemaining.map((part) => part.stage))
    this.notice = `STAGE ${stage} SEPARATED — MASS ${Math.round(removed).toLocaleString(LOCALE_EN)} KG JETTISONED`
    this.throttle = this.state.propellantKg > 0 ? Math.min(this.throttle, 0.65) : 0
  }

  enterCockpit(): void {
    if (this.mode === 'flight') { this.mode = 'cockpit'; this.cockpit.visible = true; this.notice = 'COCKPIT CUTAWAY — PILOTING ACTIVE' }
    else if (this.mode === 'cockpit') { this.mode = 'flight'; this.cockpit.visible = false }
  }

  enterEVA(): void {
    if (this.mode !== 'flight' && this.mode !== 'cockpit') return
    const radial = this.state.position.clone().normalize()
    const side = new THREE.Vector3().crossVectors(radial, FORWARD).normalize()
    this.evaPosition.copy(this.vessel.position).addScaledVector(radial, 0.22).addScaledVector(side, 0.5)
    this.evaVelocity.set(0, 0, 0)
    this.astronautRoot.removeFromParent()
    this.scene.add(this.astronautRoot)
    this.astronautRoot.position.copy(this.evaPosition)
    this.astronautRoot.scale.setScalar(1)
    this.astronautRoot.visible = true
    this.mode = 'eva'
    this.cockpit.visible = false
    this.playAnimation('walk')
    this.notice = 'EVA ACTIVE — RCS JETPACK ONLINE'
  }

  reenterCapsule(): boolean {
    if (this.mode !== 'eva') return false
    const distance = this.evaPosition.distanceTo(this.vessel.position)
    if (distance > 1.25) { this.notice = `TOO FAR TO REENTER — RANGE ${distance.toFixed(2)} M`; return false }
    this.astronautRoot.removeFromParent()
    this.cockpit.add(this.astronautRoot)
    this.astronautRoot.scale.setScalar(1)
    this.astronautRoot.position.set(0, -0.3, 0.13)
    this.astronautRoot.rotation.y = Math.PI
    this.astronautRoot.visible = false
    this.mode = 'flight'
    this.playAnimation('standing')
    this.notice = 'ASTRONAUT SECURED IN COMMAND MODULE'
    return true
  }

  async startSurfaceMission(): Promise<boolean> {
    if (!await this.ensureRoverLoaded()) {
      this.notice = 'ROVER MODEL FAILED TO LOAD — CHECK CONNECTION AND RETRY'
      return false
    }
    this.mode = 'rover'
    this.missionKind = 'lunar-survey'
    this.mission = 'LUNAR SURVEY / MISSION 02'
    this.objective = 'Drive the six-wheel rover to the flagged science station and collect a surface reading.'
    this.notice = 'LUNAR SURFACE OPS — TERRAIN MOBILITY READY'
    this.surface.visible = true
    this.roverRoot.visible = true
    this.roverPosition.y = this.terrainHeight(this.roverPosition.x, this.roverPosition.z) + 0.12
    this.roverRoot.position.set(this.roverPosition.x, this.roverPosition.y, this.roverPosition.z)
    this.vessel.visible = false
    this.astronautRoot.visible = false
    this.roverOnSurface = true
    this.science = Math.max(this.science, 0)
    this.missionComplete = false
    return true
  }

  jetpackUp(): void {
    if (this.mode === 'eva') this.evaVelocity.addScaledVector(this.state.position.clone().normalize(), 0.48)
  }

  boostEVA(): void {
    if (this.mode !== 'eva') return
    this.evaVelocity.addScaledVector(FORWARD.clone().applyQuaternion(this.attitude), 1.1)
    this.notice = 'EVA MANEUVERING UNIT — BOOST PULSE'
  }

  exitRover(): void {
    if (this.mode !== 'rover') return
    this.mode = 'eva'
    this.astronautRoot.removeFromParent()
    this.scene.add(this.astronautRoot)
    this.evaPosition.set(this.roverRoot.position.x, this.roverRoot.position.y + 1.2, this.roverRoot.position.z + 0.4)
    this.astronautRoot.position.copy(this.evaPosition)
    this.astronautRoot.scale.setScalar(1)
    this.astronautRoot.visible = true
    this.playAnimation('standing')
    this.notice = 'SURFACE EVA ACTIVE — RETURN TO ROVER'
  }

  enterRover(): void {
    if (this.mode !== 'eva' || !this.roverOnSurface) return
    if (this.evaPosition.distanceTo(this.roverRoot.position) > 4) { this.notice = 'MOVE CLOSER TO BOARD THE ROVER'; return }
    this.mode = 'rover'
    this.astronautRoot.visible = false
    this.notice = 'ROVER DRIVE ENABLED — SIX-WHEEL TRACTION'
  }

  transferToMoon(): boolean {
    if (this.mode !== 'map' && this.mode !== 'flight') return false
    const elements = orbitalElements(this.state.position.clone().multiplyScalar(UNIT_TO_METERS), this.state.velocity.clone().multiplyScalar(UNIT_TO_METERS))
    if ((elements.apoapsisAltitude ?? -Infinity) < 120_000 || this.state.propellantKg <= 0) {
      this.notice = 'TRANSFER HOLD — ESTABLISH A 120 KM APOAPSIS AND KEEP RESERVE FUEL'
      return false
    }
    const radial = new THREE.Vector3(0.16, 1, 0.12).normalize()
    this.state.position.copy(MOON_POSITION).addScaledVector(radial, MOON_RADIUS_M / UNIT_TO_METERS + 0.18)
    this.state.velocity.set(0, 0, 0.00165)
    this.attitude.setFromUnitVectors(UP, new THREE.Vector3(0, 0, 1))
    this.lunarSoi = true
    this.notice = 'PATCHED-CONIC TRANSFER — LUNAR SPHERE OF INFLUENCE ACQUIRED'
    this.mission = 'ORBITAL DEFENSE / LUNAR TRANSFER'
    this.objective = 'Circularize in lunar orbit, then conduct a surface survey with the six-wheel rover.'
    this.mode = 'flight'
    return true
  }

  step(dt: number, controls: FlightControls): void {
    const step = Math.max(0, Math.min(dt, 0.1))
    this.currentTime += step
    this.cooldown = Math.max(0, this.cooldown - step)
    const angularSpeed = CONFIG.flight.turnRate
    if (this.mode === 'flight' || this.mode === 'map' || this.mode === 'cockpit') {
      if (this.sas) {
        const direction = this.state.velocity.clone().normalize().multiplyScalar(this.sas === 'retrograde' ? -1 : 1)
        if (direction.lengthSq() > 0) {
          const target = new THREE.Quaternion().setFromUnitVectors(UP, direction)
          this.attitude.slerp(target, 1 - Math.exp(-step * 1.7))
        }
      } else if (Math.abs(controls.moveX) + Math.abs(controls.moveY) > 0.002) {
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), controls.moveX * angularSpeed * step)
        const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -controls.moveY * angularSpeed * step)
        this.attitude.premultiply(yaw).premultiply(pitch).normalize()
      }
      this.lookYaw += controls.lookX
      this.lookPitch = clamp(this.lookPitch + controls.lookY, -0.8, 0.8)
      const warped = step * this.timeWarp
      const subSteps = Math.max(1, Math.ceil(warped / 0.2))
      for (let i = 0; i < subSteps; i += 1) this.integrateFlight(warped / subSteps)
      const alt = this.altitudeMeters()
      const speed = this.state.velocity.length() * UNIT_TO_METERS
      const q = dynamicPressure(atmosphericDensity(alt), speed)
      if (q > CONFIG.flight.maxQWarningKPa * 1000 && !this.maxQSeen) { this.maxQSeen = true; this.notice = 'MAX-Q — DYNAMIC PRESSURE PEAK, STRUCTURAL LOADS HIGH' }
      const heat = thermalFlux(alt, speed)
      this.heatMax = Math.max(this.heatMax, heat)
      if (heat > 900_000 && this.state.ablatorKg > 0) this.notice = 'REENTRY HEATING — ABLATOR CONSUMPTION ACTIVE'
      if (this.state.propellantKg <= 0 && this.throttle > 0) { this.throttle = 0; this.notice = 'PROPELLANT DEPLETED — ENGINE SHUTDOWN' }
      const elements = this.elements()
      if (!this.missionComplete && elements.apoapsisAltitude !== null && elements.apoapsisAltitude > 120_000 && elements.periapsisAltitude > 100_000 && this.stats.scienceScore > 0) {
        this.missionComplete = true
        this.science += this.stats.scienceScore
        this.funds = Math.min(100_000, this.funds + 12_500)
        this.notice = 'ORBIT INSERTION CONFIRMED — SCIENCE DATA DOWNLINKED'
        this.objective = 'Optional: execute the lunar transfer or return to the VAB.'
      }
      if (this.batteryEnergyWh > 0) {
        const balanceW = this.stats.generatedPowerW - this.stats.consumedPowerW
        this.batteryEnergyWh = clamp(this.batteryEnergyWh + balanceW * warped / 3600, 0, 860)
      }
      if (this.batteryEnergyWh <= 0 && !this.energyWarning) { this.energyWarning = true; this.notice = 'POWER LOW — INSTRUMENTS PAUSED UNTIL SOLAR TRACKING' }
      this.vessel.position.copy(this.state.position)
      this.vessel.quaternion.copy(this.attitude)
      this.flame.scale.setScalar(0.7 + this.throttle * 0.65)
      ;(this.flame.material as THREE.MeshBasicMaterial).opacity = this.throttle > 0 && this.state.propellantKg > 0 ? 0.28 + this.throttle * 0.66 : 0
      this.flameLight.intensity = this.throttle * 3
      this.flameLight.position.copy(this.flame.position)
      this.vessel.visible = true
      this.updateJettisoned(warped)
      if (this.currentTime - this.lastTrajectoryAt > 1.2) this.updateTrajectory()
    } else if (this.mode === 'eva') {
      const thrust = 0.32
      const up = this.state.position.clone().normalize()
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.attitude)
      const right = new THREE.Vector3().crossVectors(forward, up).normalize()
      this.evaVelocity.addScaledVector(right, controls.moveX * thrust * step)
      this.evaVelocity.addScaledVector(forward, controls.moveY * thrust * step)
      this.evaVelocity.multiplyScalar(Math.exp(-step * 0.12))
      this.evaPosition.addScaledVector(this.evaVelocity, step)
      this.astronautRoot.position.copy(this.evaPosition)
      this.astronautRoot.rotation.y = Math.atan2(this.evaVelocity.x, this.evaVelocity.z)
      this.astronautRoot.visible = true
      this.playAnimation(this.evaVelocity.length() > 0.05 ? 'walk' : 'standing')
    } else if (this.mode === 'rover') {
      const accel = controls.moveY * 2.6
      this.roverSpeed = clamp(this.roverSpeed + accel * step, -CONFIG.rover.maxSpeed, CONFIG.rover.maxSpeed)
      this.roverSpeed *= Math.exp(-step * (Math.abs(controls.moveY) > 0.03 ? 0.08 : 0.72))
      this.roverHeading -= controls.moveX * Math.max(0.18, Math.abs(this.roverSpeed) * 0.14) * step * Math.sign(this.roverSpeed || 1)
      const direction = new THREE.Vector3(Math.sin(this.roverHeading), 0, Math.cos(this.roverHeading))
      const nextX = this.roverPosition.x + direction.x * this.roverSpeed * step
      const nextZ = this.roverPosition.z + direction.z * this.roverSpeed * step
      const hitRock = this.surfaceRocks.some((rock) => {
        const clearance = 0.55 + 0.45 * Math.max(rock.scale.x, rock.scale.z)
        return Math.hypot(nextX - rock.position.x, nextZ - rock.position.z) < clearance
      })
      if (hitRock) {
        this.roverSpeed *= -0.12
        this.notice = 'TERRAIN OBSTACLE — STEER AROUND THE ROCK'
      } else {
        this.roverPosition.x = nextX
        this.roverPosition.z = nextZ
      }
      this.roverPosition.y = this.terrainHeight(this.roverPosition.x, this.roverPosition.z) + 0.12
      this.roverRoot.position.copy(this.roverPosition)
      this.roverRoot.rotation.y = this.roverHeading
      for (const wheel of this.wheelMeshes) wheel.rotation.x += this.roverSpeed * step / 0.32
      this.playAnimation('standing')
      if (this.roverPosition.distanceTo(this.surveyStation) < 2.5 && this.missionProgress < 1) {
        this.missionProgress = 1
        this.science += 48
        this.funds = Math.min(100_000, this.funds + 8_500)
        this.missionComplete = true
        this.notice = 'SURFACE SCIENCE STATION REACHED — SAMPLE LOGGED'
        this.objective = 'Survey complete. Return to the rover, or launch the next orbital mission.'
      }
    }
    this.astronautMixer?.update(step)
  }

  private integrateFlight(dt: number): void {
    const earthRadiusUnits = EARTH.radius / UNIT_TO_METERS
    const moonSoi = sphereOfInfluence(30_000_000, MOON_MASS_KG, EARTH_MASS_KG) / UNIT_TO_METERS
    const lunarDistance = this.state.position.distanceTo(MOON_POSITION)
    this.lunarSoi = lunarDistance < moonSoi && this.state.position.length() > earthRadiusUnits + 0.3
    const engineParts = this.build.parts.filter((part) => part.stage === this.currentStage).map((part) => PARTS[part.typeId]).filter((part) => part?.category === 'engine')
    const maxThrustN = engineParts.reduce((sum, part) => sum + part.thrustN, 0)
    const massFlowKgS = engineParts.reduce((sum, part) => sum + part.flowKgPerSecond, 0)
    const thrustDirection = UP.clone().applyQuaternion(this.attitude).normalize()
    const effectiveThrottle = this.state.propellantKg > 0 ? this.throttle : 0
    const options: OrbitOptions = {
      mu: this.lunarSoi ? MOON_MU : EARTH.mu,
      bodyRadius: this.lunarSoi ? MOON_RADIUS_M : EARTH.radius,
      j2: this.lunarSoi ? 0 : EARTH.j2,
      areaM2: 12,
      dragCoefficient: CONFIG.physics.dragCoefficient,
      maxThrustN,
      massFlowKgS,
      throttle: effectiveThrottle,
      scale: UNIT_TO_METERS,
      ablatorKg: this.state.ablatorKg,
      thrustDirection,
    }
    if (this.lunarSoi) {
      const local = { ...this.state, position: this.state.position.clone().sub(MOON_POSITION) }
      const advanced = rk4Step(local, dt, options)
      advanced.position.add(MOON_POSITION)
      this.state = advanced
    } else this.state = rk4Step(this.state, dt, options)
    const r = this.state.position.length()
    if (r < EARTH.radius / UNIT_TO_METERS) {
      this.damage = Math.min(1, this.damage + dt * 0.1)
      this.state.position.setLength(EARTH.radius / UNIT_TO_METERS + 0.001)
      this.state.velocity.multiplyScalar(0.55)
      this.notice = 'ATMOSPHERIC IMPACT — VEHICLE DAMAGE ACCUMULATING'
    }
  }

  private updateJettisoned(dt: number): void {
    for (const debris of this.jettisoned.children) {
      const velocity = debris.userData.velocity as THREE.Vector3 | undefined
      if (velocity) debris.position.addScaledVector(velocity, dt)
      debris.rotation.x += dt * 0.2
      debris.rotation.z += dt * 0.14
    }
    while (this.jettisoned.children.length > 12) this.jettisoned.remove(this.jettisoned.children[0]!)
  }

  private updateTrajectory(): void {
    this.lastTrajectoryAt = this.currentTime
    const elements = this.elements()
    if (!Number.isFinite(elements.semiMajorAxis) && elements.apoapsisAltitude === null) return
    const samples = predictTrajectory(this.state, 140, 30, { scale: UNIT_TO_METERS, mu: this.lunarSoi ? MOON_MU : EARTH.mu, bodyRadius: this.lunarSoi ? MOON_RADIUS_M : EARTH.radius, j2: this.lunarSoi ? 0 : EARTH.j2, dragCoefficient: 0.08, areaM2: 4, throttle: 0 })
    const positions = samples.filter((_, i) => i % 2 === 0 || i === samples.length - 1)
    this.mapLine.geometry.dispose()
    this.mapLine.geometry = new THREE.BufferGeometry().setFromPoints(positions)
    this.mapLine.visible = this.mode === 'map'
  }

  private elements() {
    const center = this.lunarSoi ? this.state.position.clone().sub(MOON_POSITION) : this.state.position
    return orbitalElements(center.clone().multiplyScalar(UNIT_TO_METERS), this.state.velocity.clone().multiplyScalar(UNIT_TO_METERS), this.lunarSoi ? MOON_MU : EARTH.mu, this.lunarSoi ? MOON_RADIUS_M : EARTH.radius)
  }

  private altitudeMeters(): number {
    const radius = this.lunarSoi ? this.state.position.distanceTo(MOON_POSITION) * UNIT_TO_METERS : this.state.position.length() * UNIT_TO_METERS
    return radius - (this.lunarSoi ? MOON_RADIUS_M : EARTH.radius)
  }

  telemetry(): Telemetry {
    const elements = this.elements()
    const altitude = this.altitudeMeters()
    const speed = this.state.velocity.length() * UNIT_TO_METERS
    const q = dynamicPressure(atmosphericDensity(altitude), speed)
    const heat = thermalFlux(altitude, speed)
    const evaDistanceM = this.mode === 'eva' ? this.evaPosition.distanceTo(this.vessel.position) * (1.7 / 0.47) : 0
    return {
      mode: this.mode, mission: this.mission, missionKind: this.missionKind,
      altitudeKm: Math.max(0, altitude / 1000), speedKmS: speed / 1000,
      apoapsisKm: elements.apoapsisAltitude === null ? null : elements.apoapsisAltitude / 1000,
      periapsisKm: elements.periapsisAltitude / 1000,
      inclinationDeg: THREE.MathUtils.radToDeg(elements.inclination),
      dynamicPressureKPa: q / 1000, heatMWM2: heat / 1_000_000,
      fuelKg: this.state.propellantKg, massKg: this.state.massKg, throttle: this.throttle,
      batteryPct: clamp(this.batteryEnergyWh / 860, 0, 1), twr: this.stats.twr,
      powerW: this.stats.netPowerW, science: this.science, funds: this.funds,
      stage: this.currentStage, sas: this.sas, objective: this.objective,
      notice: this.notice, soi: this.lunarSoi ? 'MOON' : 'EARTH', evaDistanceM,
      roverSpeed: this.roverSpeed,
    }
  }

  render(frameSeconds: number): void {
    this.currentTime += Math.max(0, Math.min(frameSeconds, 0.1)) * 0.1
    if (this.earthClouds) this.earthClouds.rotation.y += frameSeconds * 0.006
    if (this.stars) this.stars.rotation.y += frameSeconds * 0.00012
    const orbitalAngle = this.currentTime * 0.035
    const satelliteRadius = EARTH.radius / UNIT_TO_METERS + 0.17
    this.defenseSatellite.position.set(Math.cos(orbitalAngle) * satelliteRadius, Math.sin(orbitalAngle * 0.6) * 0.3, Math.sin(orbitalAngle) * satelliteRadius)
    this.defenseSatellite.lookAt(0, 0, 0)
    this.updateCamera(frameSeconds)
    this.renderer.render(this.scene, this.camera)
  }

  private updateCamera(dt: number): void {
    const sphere = this.state.position
    if (this.mode === 'showroom') {
      const angle = this.currentTime * 0.035
      this.vessel.position.set(9.6 + Math.sin(angle) * 0.3, 1.8 + Math.sin(angle * 1.6) * 0.12, -1.2)
      this.vessel.quaternion.setFromEuler(new THREE.Euler(0.08, -angle, 0.12))
      this.camera.position.set(13.4 + Math.sin(angle) * 0.4, 6.3, 16.5)
      this.camera.lookAt(4.2, 0.5, 0)
      this.surface.visible = false
      this.vessel.visible = true
      this.mapLine.visible = false
    } else if (this.mode === 'vab') {
      this.vessel.position.set(0, 0, 0)
      this.vessel.quaternion.identity()
      this.camera.position.set(0.5, 3.3, 8.2)
      this.camera.lookAt(0, -0.1, 0)
      this.surface.visible = false
      this.vessel.visible = true
      this.mapLine.visible = false
    } else if (this.mode === 'map') {
      const focus = this.lunarSoi ? MOON_POSITION : new THREE.Vector3()
      this.camera.position.copy(focus).add(new THREE.Vector3(0, 26, 0.01))
      this.camera.up.set(0, 0, -1)
      this.camera.lookAt(focus)
      this.mapLine.visible = true
      this.surface.visible = false
      this.vessel.visible = true
    } else if (this.mode === 'cockpit') {
      this.vessel.position.copy(sphere)
      this.vessel.quaternion.copy(this.attitude)
      const eye = new THREE.Vector3(0.02, 0.42, -0.15).applyQuaternion(this.attitude).add(sphere)
      const look = UP.clone().applyQuaternion(this.attitude).addScaledVector(sphere, 0).add(eye)
      this.camera.position.lerp(eye, 1 - Math.exp(-dt * CONFIG.camera.followSpeed))
      this.camera.up.set(0, 1, 0)
      this.camera.lookAt(look)
      this.cockpit.visible = true
      this.surface.visible = false
      this.mapLine.visible = false
    } else if (this.mode === 'eva') {
      this.vessel.position.copy(sphere)
      this.vessel.quaternion.copy(this.attitude)
      const up = new THREE.Vector3(0, 1, 0)
      const desired = this.evaPosition.clone().add(new THREE.Vector3(0.8, 0.55, 2.2))
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * CONFIG.camera.followSpeed))
      this.camera.up.copy(up)
      this.camera.lookAt(this.evaPosition)
      this.cockpit.visible = false
      this.mapLine.visible = false
    } else if (this.mode === 'rover') {
      this.camera.up.set(0, 1, 0)
      const behind = new THREE.Vector3(Math.sin(this.roverHeading) * -7, 3.5, Math.cos(this.roverHeading) * -7)
      this.camera.position.lerp(this.roverRoot.position.clone().add(behind), 1 - Math.exp(-dt * CONFIG.camera.followSpeed))
      this.camera.lookAt(this.roverRoot.position.clone().add(new THREE.Vector3(0, 0.8, 0)))
      this.surface.visible = true
      this.roverRoot.visible = true
      this.vessel.visible = false
      this.mapLine.visible = false
    } else {
      this.vessel.position.copy(sphere)
      this.vessel.quaternion.copy(this.attitude)
      const radial = sphere.clone().normalize()
      const right = new THREE.Vector3().crossVectors(radial, FORWARD).normalize()
      const back = radial.clone().multiplyScalar(-2.2).add(right.multiplyScalar(0.7 + this.lookYaw))
      const desired = sphere.clone().add(back).add(radial.multiplyScalar(0.8 + this.lookPitch))
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * CONFIG.camera.followSpeed))
      this.camera.up.copy(radial)
      this.camera.lookAt(sphere.clone().add(UP.clone().applyQuaternion(this.attitude).multiplyScalar(0.55)))
      this.cockpit.visible = false
      this.surface.visible = false
      this.vessel.visible = true
      this.mapLine.visible = false
    }
  }

  dispose(): void {
    this.mixerClock.stop()
    this.astronautMixer?.stopAllAction()
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) mat.dispose()
      }
    })
  }
}
