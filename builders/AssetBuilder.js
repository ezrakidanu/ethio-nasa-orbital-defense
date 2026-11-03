import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createAtmosphereShader, createDecalTexture, createFlagMaterial } from './ShaderBuilder.js'

const mat = (color, metalness = 0.15, roughness = 0.62, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra })
const metal = mat('#9eaebc', 0.72, 0.3)
const gold = mat('#c69b48', 0.72, 0.35)
const white = mat('#e7edf1', 0.18, 0.42)
const orange = mat('#e8752a', 0.32, 0.48)
const cyan = new THREE.Color('#38bdf8')

function addBox(parent, size, color, position, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), options.material || mat(color, options.metalness ?? 0.12, options.roughness ?? 0.7, options.materialOptions || {}))
  mesh.position.set(...position)
  mesh.castShadow = options.castShadow !== false
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}
function addCylinder(parent, top, bottom, height, color, position, segments = 16, options = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), options.material || mat(color, options.metalness ?? 0.25, options.roughness ?? 0.55))
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}
function makeTextDecal(title, subtitle) {
  return new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.2), new THREE.MeshBasicMaterial({ map: createDecalTexture(title, subtitle), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
}
function makeEarthTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512
  const ctx = canvas.getContext('2d')
  const sea = ctx.createLinearGradient(0, 0, 0, 512); sea.addColorStop(0, '#144d8a'); sea.addColorStop(0.5, '#0b3972'); sea.addColorStop(1, '#071c45')
  ctx.fillStyle = sea; ctx.fillRect(0, 0, 1024, 512)
  const land = ['#477b51', '#678c4f', '#806f48', '#a08c59']
  const shapes = [
    [[105,105],[195,78],[275,112],[286,175],[245,215],[212,280],[170,252],[142,190],[93,166]],
    [[268,270],[327,254],[362,292],[346,371],[313,432],[283,380],[270,325]],
    [[476,112],[551,89],[614,109],[625,153],[581,177],[552,213],[512,181],[479,157]],
    [[524,201],[576,193],[617,230],[605,304],[581,362],[547,334],[524,275]],
    [[636,123],[721,99],[805,118],[849,162],[822,204],[771,193],[741,237],[698,198],[661,172]],
    [[766,294],[838,276],[886,315],[865,365],[813,378],[783,344]],
  ]
  shapes.forEach((points, i) => { ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = land[i % land.length]; ctx.fill(); ctx.globalAlpha = 0.3; ctx.strokeStyle = '#c4a86b'; ctx.lineWidth = 8; ctx.stroke(); ctx.globalAlpha = 1 })
  for (let i = 0; i < 80; i++) { const x = (i * 137) % 1024; const y = (i * 67) % 512; ctx.fillStyle = i % 2 ? 'rgba(210,230,255,.07)' : 'rgba(0,0,0,.08)'; ctx.fillRect(x, y, 30 + i % 60, 2 + i % 4) }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture
}
function makeRibbon(points, width, material) {
  const vertices = [], indices = []
  for (let i = 0; i < points.length; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)]
    const tangent = new THREE.Vector3(after[0] - before[0], 0, after[2] - before[2]).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2)
    vertices.push(points[i][0] + side.x, points[i][1], points[i][2] + side.z, points[i][0] - side.x, points[i][1], points[i][2] - side.z)
    if (i < points.length - 1) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

export class AssetBuilder {
  constructor(sceneManager) {
    this.manager = sceneManager
    this.scene = sceneManager.scene
    this.launchComplex = sceneManager.launchComplex
    this.space = sceneManager.spaceEnvironment
    this.radarRings = []
    this.hazards = []
    this.flagParts = []
    this.elapsed = 0
    this.selectedSatellite = 'ETRSS-1'
    this.satelliteFleet = new Map()
    this.boosters = new THREE.Group()
    this.rocket = new THREE.Group()
    this.rocketDecals = new THREE.Group()
    this.payload = new THREE.Group()
    this.orbitCraft = new THREE.Group()
    this.generatedPreviews = []
    this.missionDestination = 'LEO'
    this.destinationTarget = null
    this.pitchAxis = new THREE.Vector3(1, 0, 0)
    this.rollAxis = new THREE.Vector3(0, 1, 0)
    this.yawAxis = new THREE.Vector3(0, 1, 0)
    this.pitchQuaternion = new THREE.Quaternion()
    this.rollQuaternion = new THREE.Quaternion()
    this.yawQuaternion = new THREE.Quaternion()
    this.exhaust = null
    this.atmosphere = null
    this.earth = null
    this.radarOrigin = new THREE.Vector3(37, -32, 0)
  }

  build() {
    this.buildPadAndLandscape()
    this.buildTowerAndFlag()
    this.buildRocket()
    this.buildSatelliteFleet()
    this.buildPlanetsAndSpace()
    this.buildExhaust()
    return this
  }

  buildPadAndLandscape() {
    const pad = addBox(this.launchComplex, [120, 2, 120], '#343d47', [0, -1, 0], { roughness: 0.86, metalness: 0.1 })
    pad.receiveShadow = true
    const lineMat = mat('#e8b943', 0.08, 0.6, { emissive: '#392b0b', emissiveIntensity: 0.14 })
    for (let x = -46; x <= 46; x += 23) addBox(this.launchComplex, [0.45, 0.04, 80], '#fed100', [x, 0.025, 0], { material: lineMat, castShadow: false })
    addBox(this.launchComplex, [44, 0.08, 0.8], '#fed100', [0, 0.035, 42], { material: lineMat, castShadow: false })
    addBox(this.launchComplex, [44, 0.08, 0.8], '#fed100', [0, 0.035, -42], { material: lineMat, castShadow: false })
    const road = addBox(this.launchComplex, [18, 0.12, 90], '#252d38', [-28, 0.035, 0], { roughness: 0.9, castShadow: false })
    road.receiveShadow = true
    const riverMaterial = new THREE.MeshStandardMaterial({ color: '#0f4c81', roughness: 0.1, metalness: 0.4, side: THREE.DoubleSide, emissive: '#04192c', emissiveIntensity: 0.18 })
    const river = makeRibbon([[-76, -1.25, -60],[-58, -1.2, -35],[-69, -1.2, -10],[-53, -1.2, 14],[-64, -1.2, 37],[-42, -1.2, 64]], 14, riverMaterial)
    this.launchComplex.add(river)
    for (const z of [-10, 10]) {
      const trench = addBox(this.launchComplex, [15, 0.3, 7], '#171d25', [0, 0.06, z], { roughness: 0.94 })
      trench.userData.trench = true
    }
    const building = new THREE.Group(); building.position.set(-15, 0, -28); this.launchComplex.add(building)
    addBox(building, [18, 8, 14], '#526272', [0, 4, 0], { metalness: 0.22 })
    addBox(building, [20, 0.8, 16], '#8595a3', [0, 8.1, 0], { metalness: 0.42 })
    for (let i = -2; i <= 2; i++) addBox(building, [1.2, 2.8, 0.12], '#6ac6e8', [i * 3, 5, 7.08], { material: new THREE.MeshStandardMaterial({ color: '#6ac6e8', emissive: '#14658b', emissiveIntensity: 0.65, metalness: 0.32, roughness: 0.25 }) })
    const stationLogo = makeTextDecal('ETHIO-NASA', 'COMMAND HQ'); stationLogo.position.set(0, 3.4, 7.16); stationLogo.scale.set(1.4, 0.42, 1); building.add(stationLogo)
  }

  buildTowerAndFlag() {
    const tower = new THREE.Group(); tower.position.set(8, 0, 0); this.launchComplex.add(tower); this.tower = tower
    const frame = mat('#798897', 0.6, 0.42)
    for (const x of [-4, 4]) for (const z of [-3, 3]) addCylinder(tower, 0.18, 0.26, 52, '#8293a1', [x, 26, z], 8, { material: frame })
    for (let y = 4; y < 50; y += 6) {
      for (const x of [-4, 4]) addBox(tower, [8.1, 0.22, 0.2], '#b2bdc5', [0, y, -3.08], { material: frame })
      for (const z of [-3, 3]) addBox(tower, [0.2, 0.22, 6.1], '#b2bdc5', [-4, y, 0], { material: frame })
      const diagonal = addCylinder(tower, 0.11, 0.11, 10.2, '#aab5bd', [0, y + 2.8, 0], 6, { material: frame })
      diagonal.rotation.z = Math.PI / 5
      const diagonalB = diagonal.clone(); diagonalB.rotation.z *= -1; tower.add(diagonalB)
    }
    for (let y = 12; y < 42; y += 10) {
      const arm = addBox(tower, [11, 0.8, 1.1], '#e7bc46', [-1.5, y, 0], { metalness: 0.35, roughness: 0.42 })
      arm.rotation.z = 0.02
      addBox(tower, [1.2, 5.5, 1.2], '#e7bc46', [-5.4, y - 2.1, 0], { metalness: 0.35 })
    }
    const beaconMaterial = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#dc2626', emissiveIntensity: 2.6 })
    for (const [x,z] of [[-4,-3],[4,-3],[-4,3],[4,3]]) { const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), beaconMaterial); beacon.position.set(x, 53, z); tower.add(beacon) }
    const pole = new THREE.Group(); pole.position.set(-4, 52, -3); tower.add(pole)
    addCylinder(pole, 0.11, 0.14, 15, '#bdc6cb', [0, 7.5, 0], 10, { metalness: 0.65, roughness: 0.28 })
    const geometry = new THREE.PlaneGeometry(6, 3.7, 24, 8)
    geometry.translate(3, 13.1, 0)
    const flag = new THREE.Mesh(geometry, createFlagMaterial()); flag.position.x = 0.05; pole.add(flag)
    this.flagParts.push({ mesh: flag, positions: geometry.attributes.position.array.slice() })
    const command = new THREE.PointLight('#38bdf8', 14, 50); command.position.set(-15, 9, -28); this.launchComplex.add(command)
  }

  buildRocket() {
    this.rocket.position.set(0, 0, 0); this.launchComplex.add(this.rocket)
    this.proceduralRocket = new THREE.Group(); this.rocket.add(this.proceduralRocket)
    addCylinder(this.proceduralRocket, 1.08, 1.42, 26, '#e8752a', [0, 15, 0], 24, { material: orange, metalness: 0.45, roughness: 0.42 })
    addCylinder(this.proceduralRocket, 0.88, 1.08, 8.2, '#293746', [0, 32.1, 0], 20, { material: mat('#273444', 0.75, 0.32) })
    const fairing = new THREE.Mesh(new THREE.ConeGeometry(0.91, 4.4, 20), white); fairing.position.set(0, 38.3, 0); fairing.castShadow = true; this.proceduralRocket.add(fairing)
    this.boosters.clear()
    for (const x of [-1.9, 1.9]) {
      addCylinder(this.boosters, 0.58, 0.8, 25, '#e2e8ec', [x, 14.8, 0], 18, { material: white })
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.59, 2.2, 16), white); nose.position.set(x, 28.4, 0); this.boosters.add(nose)
      addCylinder(this.boosters, 0.28, 0.72, 2.6, '#414d58', [x, 1.7, 0], 16, { material: metal })
    }
    this.proceduralRocket.add(this.boosters)
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.72, 2.6, 16), mat('#555e66', 0.8, 0.3, { side: THREE.DoubleSide }))
      nozzle.position.set(Math.cos(angle) * 0.77, 1.15, Math.sin(angle) * 0.77); nozzle.rotation.x = Math.PI; nozzle.castShadow = true; this.proceduralRocket.add(nozzle)
    }
    for (let y of [7, 24, 29]) {
      const band = addCylinder(this.proceduralRocket, 1.14, 1.46, 0.22, '#f5c266', [0, y, 0], 24, { metalness: 0.72, roughness: 0.27 })
      band.scale.set(1, 1, 1)
    }
    this.rocketDecals = new THREE.Group(); this.rocketDecals.position.set(0, 0, 0); this.rocket.add(this.rocketDecals)
    const insignia = makeTextDecal('ETHIO-NASA', 'ORBITAL DEFENSE'); insignia.position.set(0, 20, 1.44); insignia.scale.set(0.95, 0.44, 1); this.rocketDecals.add(insignia)
    const maker = makeTextDecal('MAKAVELI RECORDS', 'MISSION PARTNER'); maker.position.set(0, 25.3, 1.34); maker.scale.set(0.68, 0.23, 1); this.rocketDecals.add(maker)
    const payloadLabel = makeTextDecal('BASHA PACSON', 'FLIGHT SYSTEMS'); payloadLabel.position.set(1.34, 14, 0); payloadLabel.rotation.y = Math.PI / 2; payloadLabel.scale.set(0.62, 0.21, 1); this.rocketDecals.add(payloadLabel)
    this.payload.position.set(0, 35, 0); this.rocket.add(this.payload)
    this.buildPadHoldDowns()
  }

  buildPadHoldDowns() {
    for (const x of [-2.8, 2.8]) {
      addBox(this.launchComplex, [1.2, 2.3, 1.2], '#8c9aa6', [x, 1.1, 0], { metalness: 0.55 })
      addBox(this.launchComplex, [1.6, 0.5, 2.1], '#e3b943', [x, 2.4, 0], { metalness: 0.32 })
    }
  }

  buildSatelliteFleet() {
    this.satelliteFleet.set('ETRSS-1', this.makeEtrss())
    this.satelliteFleet.set('ET-SMART-RSS', this.makeSmart())
    this.satelliteFleet.set('ETHIO-DEEP-SPACE 1', this.makeProbe())
    for (const [name, group] of this.satelliteFleet) { group.visible = name === this.selectedSatellite; this.payload.add(group) }
    this.orbitCraft = new THREE.Group(); this.orbitCraft.visible = false; this.space.add(this.orbitCraft)
  }

  makeEtrss() {
    const root = new THREE.Group(); root.name = 'ETRSS-1'
    addBox(root, [4.8, 3.4, 3.8], '#c89a48', [0, 0, 0], { material: gold, metalness: 0.78, roughness: 0.28 })
    addBox(root, [3.3, 2.2, 0.12], '#263747', [0, 0, 1.98], { metalness: 0.55, roughness: 0.24 })
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, 2.2, 18), mat('#182c40', 0.6, 0.22)); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.4, 3.5); root.add(lens)
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.57, 24), new THREE.MeshPhysicalMaterial({ color: '#55c9ee', emissive: '#0b6689', emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.1 })); glass.position.set(0, 0.4, 4.62); root.add(glass)
    const wings = []
    for (const sign of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sign * 2.5, 0, 0); root.add(pivot); wings.push(pivot)
      for (let i = 0; i < 3; i++) {
        const panel = addBox(pivot, [3.1, 0.17, 2.9], '#134e79', [sign * (1.7 + i * 3.1), 0, 0], { metalness: 0.68, roughness: 0.25 })
        panel.material = new THREE.MeshStandardMaterial({ color: '#124d79', metalness: 0.62, roughness: 0.24, emissive: '#061b31', emissiveIntensity: 0.18 })
        for (let gx = -1; gx <= 1; gx++) addBox(pivot, [0.035, 0.19, 2.95], '#66b8dd', [sign * (1.7 + i * 3.1) + gx * 0.75, 0, 0], { material: mat('#66b8dd', 0.56, 0.28) })
        if (i === 1) {
          const marking = makeTextDecal(sign < 0 ? 'MAKAVELI RECORDS' : 'BASHA PACSON', 'ETHIO-NASA ARRAY')
          marking.position.set(sign * (1.7 + i * 3.1), 0.105, 0); marking.rotation.x = -Math.PI / 2; marking.scale.set(1.1, 0.34, 1); pivot.add(marking)
        }
      }
    }
    const crest = makeTextDecal('ETHIO-NASA', 'MAKAVELI RECORDS'); crest.position.set(0, -1.85, 2.06); crest.rotation.x = -0.25; crest.scale.set(0.65, 0.23, 1); root.add(crest)
    root.userData.panelPivots = wings
    return root
  }

  makeSmart() {
    const root = new THREE.Group(); root.name = 'ET-SMART-RSS'
    addBox(root, [3.3, 4.1, 3.1], '#8795a2', [0, 0, 0], { metalness: 0.64, roughness: 0.35 })
    for (let y = -1.7; y <= 1.7; y += 0.55) addBox(root, [3.45, 0.09, 3.25], '#d5a749', [0, y, 0], { metalness: 0.7, roughness: 0.31 })
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3
      addBox(root, [0.9, 0.72, 1.08], i % 2 ? '#b18a48' : '#c8a45a', [Math.cos(angle) * 2.45, Math.sin(angle) * 1.35, 0], { metalness: 0.72, roughness: 0.29 })
    }
    const antenna = addCylinder(root, 0.06, 0.06, 4.3, '#d9e3e9', [0, 4, -0.7], 8, { metalness: 0.6 }); antenna.rotation.z = -0.1
    const dish = new THREE.Mesh(new THREE.CircleGeometry(1.65, 32), new THREE.MeshStandardMaterial({ color: '#e1c27b', metalness: 0.86, roughness: 0.2, side: THREE.DoubleSide, emissive: '#4c3917', emissiveIntensity: 0.12 }))
    dish.position.set(0, 2.55, 1.25); dish.rotation.x = -0.24; root.add(dish)
    const feed = addCylinder(root, 0.07, 0.07, 1.25, '#d4e1e7', [0, 2.55, 1.85], 8, { metalness: 0.75 }); feed.rotation.x = Math.PI / 2
    for (const x of [-0.8, 0.8]) { const support = addCylinder(root, 0.035, 0.035, 1.5, '#b8c5cb', [x * 0.5, 1.8, 1.55], 6, { metalness: 0.7 }); support.rotation.x = -0.4 }
    const decal = makeTextDecal('BASHA PACSON', 'ET-SMART-RSS'); decal.position.set(0, -0.2, 1.62); decal.scale.set(0.56, 0.24, 1); root.add(decal)
    for (const [x,z] of [[-2.2,0],[2.2,0],[0,-2.1],[0,2.1]]) {
      const fin = addBox(root, [1.25, 0.16, 1.3], '#1c5683', [x, 0, z], { metalness: 0.55, roughness: 0.25 })
      const nozzle = addCylinder(root, 0.17, 0.25, 0.65, '#bd914a', [x * 0.82, -2.15, z * 0.82], 10, { metalness: 0.76 }); nozzle.rotation.x = Math.PI
      fin.userData.solarFin = true
    }
    return root
  }

  makeProbe() {
    const root = new THREE.Group(); root.name = 'ETHIO-DEEP-SPACE 1'
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 4.6, 8), mat('#788895', 0.77, 0.3)); bus.rotation.y = Math.PI / 8; bus.rotation.x = Math.PI / 2; root.add(bus)
    const foil = addCylinder(root, 2.25, 2.25, 0.65, '#c3974d', [0, 0, 0], 8, { material: new THREE.MeshStandardMaterial({ color: '#c3974d', metalness: 0.83, roughness: 0.22, emissive: '#4b3512', emissiveIntensity: 0.12 }) }); foil.rotation.x = Math.PI / 2
    const dish = new THREE.Mesh(new THREE.SphereGeometry(3.8, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ color: '#aebac1', metalness: 0.82, roughness: 0.2, side: THREE.DoubleSide })); dish.position.set(0, 0, 4.3); dish.rotation.x = Math.PI; root.add(dish)
    addCylinder(root, 0.3, 0.4, 6.5, '#999b98', [0, -5.6, -1.4], 12, { material: gold })
    for (const x of [-3.1, 3.1]) {
      addBox(root, [2.6, 0.3, 5.3], '#b18a45', [x, 0, -0.6], { metalness: 0.76, roughness: 0.28 })
      for (let rib = -2; rib <= 2; rib++) addBox(root, [2.64, 0.35, 0.09], '#e4c77e', [x, 0.12, rib - 0.6], { metalness: 0.82, roughness: 0.23 })
      const rcs = addCylinder(root, 0.18, 0.35, 1.4, '#c19a55', [x * 0.55, -2.4, 1.2], 10, { metalness: 0.7 }); rcs.rotation.x = Math.PI / 2
    }
    for (const x of [-2.1, 2.1]) addBox(root, [0.28, 2.4, 0.3], '#e6bd60', [x, 2.2, -2.1], { metalness: 0.65 })
    const decal = makeTextDecal('ETHIO-DEEP-SPACE 1', 'MAKAVELI RECORDS'); decal.position.set(0, -2.4, 2.1); decal.scale.set(0.6, 0.24, 1); root.add(decal)
    return root
  }

  buildPlanetsAndSpace() {
    const earthGroup = new THREE.Group(); earthGroup.position.set(0, -33, 0); this.space.add(earthGroup); this.earthGroup = earthGroup
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(33, 64, 40), new THREE.MeshStandardMaterial({ map: makeEarthTexture(), roughness: 0.88, metalness: 0.02, emissive: '#021125', emissiveIntensity: 0.22 }))
    this.earth.castShadow = true; this.earth.receiveShadow = true; earthGroup.add(this.earth)
    this.atmosphere = createAtmosphereShader(34.4); earthGroup.add(this.atmosphere)
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(33.45, 48, 32), new THREE.MeshStandardMaterial({ color: '#c5eaff', transparent: true, opacity: 0.09, wireframe: false, roughness: 0.9 })); clouds.scale.set(1, 0.99, 1); earthGroup.add(clouds); this.cloudLayer = clouds
    const ring = new THREE.Mesh(new THREE.TorusGeometry(38, 0.035, 4, 180), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.52 })); ring.rotation.x = Math.PI / 2; ring.position.y = -33; this.space.add(ring)
    const moon = new THREE.Group(); moon.position.set(172, 39, -190); this.space.add(moon)
    const moonMat = mat('#999da5', 0.02, 0.97)
    const moonSphere = new THREE.Mesh(new THREE.SphereGeometry(18, 36, 26), moonMat); moon.add(moonSphere)
    for (let i = 0; i < 22; i++) {
      const angle = i * 2.399; const y = ((i * 37) % 100) / 100 * 1.5 - 0.75; const r = Math.sqrt(1 - y * y)
      const crater = new THREE.Mesh(new THREE.CircleGeometry(0.55 + (i % 5) * 0.34, 10), new THREE.MeshStandardMaterial({ color: i % 2 ? '#747982' : '#b0b2b6', roughness: 1, side: THREE.DoubleSide }))
      crater.position.set(Math.cos(angle) * r * 18.05, y * 18.05, Math.sin(angle) * r * 18.05); crater.lookAt(moon.position); moon.add(crater)
    }
    const mars = new THREE.Mesh(new THREE.SphereGeometry(13, 32, 22), mat('#a54e38', 0.03, 0.95)); mars.position.set(-215, 62, -265); this.space.add(mars)
    const starPositions = new Float32Array(2200 * 3)
    let seed = 9904; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < 2200; i++) { const radius = 250 + rand() * 450; const theta = rand() * Math.PI * 2; const u = rand() * 2 - 1; const s = Math.sqrt(1 - u * u); starPositions[i*3] = radius * s * Math.cos(theta); starPositions[i*3+1] = radius * u; starPositions[i*3+2] = radius * s * Math.sin(theta) }
    const starsGeo = new THREE.BufferGeometry(); starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    this.stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: '#d2e6ff', size: 0.72, sizeAttenuation: true, transparent: true, opacity: 0.86 })); this.space.add(this.stars)
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), new THREE.MeshBasicMaterial({ color: '#ff9a38', transparent: true, opacity: 0.16, side: THREE.DoubleSide })); flare.position.set(-115, 78, -160); flare.rotation.y = 0.5; this.space.add(flare); this.solarGlare = flare
    const orbitCurve = new THREE.EllipseCurve(0, 0, 39, 39, 0, Math.PI * 2, false, 0)
    const points = orbitCurve.getPoints(180).map(p => new THREE.Vector3(p.x, -32.6, p.y))
    const orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#b8ef55', transparent: true, opacity: 0.6 })); this.space.add(orbitLine)
  }

  buildExhaust() {
    const count = 110, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) { positions[i*3] = (Math.random() - 0.5) * 1.2; positions[i*3+1] = -Math.random() * 7; positions[i*3+2] = (Math.random() - 0.5) * 1.2; colors[i*3] = 1; colors[i*3+1] = 0.26 + Math.random() * 0.45; colors[i*3+2] = 0.04 }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.exhaust = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.68, vertexColors: true, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false })); this.exhaust.position.set(0, 0, 0); this.exhaust.visible = false; this.rocket.add(this.exhaust)
    this.flameLight = new THREE.PointLight('#ff6a25', 0, 40); this.flameLight.position.set(0, -1, 0); this.rocket.add(this.flameLight)
    const smokeCount = 180, smokePositions = new Float32Array(smokeCount * 3)
    for (let i = 0; i < smokeCount; i++) { smokePositions[i*3] = 0; smokePositions[i*3+1] = 0; smokePositions[i*3+2] = 0 }
    const smokeGeometry = new THREE.BufferGeometry(); smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3))
    this.smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({ color: '#c6d0d5', size: 1.15, transparent: true, opacity: 0.23, depthWrite: false, sizeAttenuation: true }))
    this.smoke.visible = false; this.launchComplex.add(this.smoke)
  }

  async loadGeneratedModels() {
    const modules = import.meta.glob('../assets/models/*.glb', { eager: true, query: '?url', import: 'default' })
    const loader = new GLTFLoader()
    const outputs = await Promise.allSettled(Object.entries(modules).map(async ([path, url]) => {
      const gltf = await loader.loadAsync(url)
      const root = gltf.scene
      root.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(root)
      const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3())
      const target = path.includes('sls-launch') ? 38 : path.includes('etrrs') ? 11 : 9
      const scale = target / Math.max(size.x, size.y, size.z, 0.001)
      root.scale.setScalar(scale); root.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
      root.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; if (node.material) { node.material.metalness = Math.min(0.75, node.material.metalness ?? 0.1); node.material.needsUpdate = true } } })
      return { path, root }
    }))
    for (const result of outputs) {
      if (result.status !== 'fulfilled') continue
      const { path, root } = result.value
      if (path.includes('sls-launch')) { this.proceduralRocket.visible = false; root.position.y += 19; this.rocket.add(root); this.generatedRocket = root }
      else if (path.includes('etrrs')) this.addGeneratedInspectionModel('ETRSS-1', root, 'MAKAVELI RECORDS')
      else if (path.includes('deep-space')) this.addGeneratedInspectionModel('ETHIO-DEEP-SPACE 1', root, 'BASHA PACSON')
    }
    return outputs.filter(result => result.status === 'fulfilled').length
  }

  addGeneratedInspectionModel(name, root, brand) {
    const target = this.satelliteFleet.get(name)
    if (!target) return
    const procedural = target.children.slice()
    root.position.y += 0.25
    const decal = makeTextDecal(name, brand)
    decal.position.set(0, -1.5, 4.4); decal.scale.set(0.76, 0.26, 1); root.add(decal)
    root.visible = false
    target.add(root)
    this.generatedPreviews.push({ name, target, root, procedural })
  }

  selectSatellite(name) {
    if (!this.satelliteFleet.has(name)) return false
    this.selectedSatellite = name
    for (const [satellite, group] of this.satelliteFleet) group.visible = satellite === name
    return true
  }

  stageSeparation() {
    this.boosters.visible = false
    this.launchComplex.remove(this.boosters)
    this.rocket.userData.staged = true
  }

  launch() { this.exhaust.visible = true; this.flameLight.intensity = 24 }

  releasePayload(worldPosition = null) {
    const craft = this.satelliteFleet.get(this.selectedSatellite)
    if (!craft) return null
    this.payload.remove(craft)
    this.space.add(craft)
    craft.visible = true
    craft.position.copy(worldPosition || this.radarOrigin)
    craft.scale.setScalar(this.selectedSatellite === 'ETRSS-1' ? 0.64 : 0.8)
    this.orbitCraft = craft
    return craft
  }

  setMissionDestination(name = 'LEO') {
    this.missionDestination = String(name).toUpperCase()
    if (this.missionDestination === 'MOON') this.destinationTarget = new THREE.Vector3(154, 39, -190)
    else if (this.missionDestination === 'MARS') this.destinationTarget = new THREE.Vector3(-198, 62, -265)
    else if (this.missionDestination === 'NEO') {
      const lead = this.hazards[0]?.position
      this.destinationTarget = lead ? lead.clone().add(new THREE.Vector3(5, 4, -4)) : new THREE.Vector3(52, -17, 25)
    } else this.destinationTarget = null
  }

  addAsteroids(data = []) {
    for (const old of this.hazards) { this.space.remove(old); old.geometry.dispose(); if (old.material.dispose) old.material.dispose() }
    this.hazards.length = 0
    const list = data.slice(0, 12)
    list.forEach((item, index) => {
      const radius = THREE.MathUtils.clamp(0.45 + Math.sqrt(Math.max(0.002, item.estimatedDiameter || 0.02)) * 2.4, 0.5, 2.8)
      const geometry = new THREE.DodecahedronGeometry(radius, 0)
      const pos = geometry.attributes.position
      for (let i = 0; i < pos.count; i++) { const displacement = 0.78 + ((i * 19 + index * 7) % 17) / 40; pos.setXYZ(i, pos.getX(i) * displacement, pos.getY(i) * displacement, pos.getZ(i) * displacement) }
      geometry.computeVertexNormals()
      const hazard = new THREE.Mesh(geometry, mat(item.hazardous ? '#a36951' : '#68717c', 0.06, 0.96, { emissive: item.hazardous ? '#421b12' : '#151b22', emissiveIntensity: 0.25 }))
      const angle = index * 2.399; const orbitRadius = 43 + (index % 5) * 4
      hazard.position.set(Math.cos(angle) * orbitRadius, -31 + Math.sin(index * 1.4) * 11, Math.sin(angle) * orbitRadius)
      hazard.userData = { name: item.name, speed: item.relativeVelocityKps || 15, phase: angle, track: index, baseEmissive: hazard.material.emissive.getHex(), baseEmissiveIntensity: hazard.material.emissiveIntensity, radarUntil: 0 }
      hazard.castShadow = true; this.space.add(hazard); this.hazards.push(hazard)
    })
    if (this.missionDestination === 'NEO') this.setMissionDestination('NEO')
    return this.hazards.length
  }

  pulseRadar() {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 96), new THREE.MeshBasicMaterial({ color: '#6affb1', transparent: true, opacity: 0.95 }))
    ring.rotation.x = Math.PI / 2; ring.position.copy(this.orbitCraft?.position || this.radarOrigin); ring.userData.life = 0; this.space.add(ring); this.radarRings.push(ring)
    for (const hazard of this.hazards) { hazard.userData.radarUntil = this.elapsed + 2.4; hazard.material.emissive.set('#6affb1'); hazard.material.emissiveIntensity = 1.15 }
  }

  update(dt, flight, orbit, cameraState = '0', stormIntensity = 0) {
    this.elapsed += dt
    if (this.atmosphere) this.atmosphere.material.uniforms.uAltitude.value = flight?.altitudeM || 0
    if (this.earth) this.earth.rotation.y += dt * 0.012
    if (this.cloudLayer) this.cloudLayer.rotation.y -= dt * 0.018
    if (this.stars) this.stars.rotation.y += dt * 0.001
    for (const part of this.flagParts) {
      const attribute = part.mesh.geometry.attributes.position
      for (let i = 0; i < attribute.count; i++) { const x = part.positions[i*3], y = part.positions[i*3+1]; attribute.setZ(i, part.positions[i*3+2] + Math.sin(this.elapsed * 4.2 + x * 0.85) * 0.42 * (x / 6) + Math.sin(this.elapsed * 2.4 + y) * 0.12) }
      attribute.needsUpdate = true; part.mesh.geometry.computeVertexNormals()
    }
    const rocketY = Math.max(0, flight?.altitudeM || 0) / 4300
    this.rocket.position.set((flight?.position.x || 0) / 9000, rocketY, (flight?.position.z || 0) / 9000)
    this.yawQuaternion.setFromAxisAngle(this.yawAxis, flight?.yaw || 0)
    this.pitchQuaternion.setFromAxisAngle(this.pitchAxis, flight?.pitch || 0)
    this.rollQuaternion.setFromAxisAngle(this.rollAxis, flight?.roll || 0)
    this.rocket.quaternion.copy(this.yawQuaternion).multiply(this.pitchQuaternion).multiply(this.rollQuaternion)
    for (const preview of this.generatedPreviews) {
      const showModel = cameraState === '1A' && preview.name === this.selectedSatellite && preview.target.visible
      preview.root.visible = showModel
      for (const child of preview.procedural) child.visible = !showModel
    }
    this.exhaust.visible = Boolean(flight?.launched && !flight?.burnedOut && flight?.throttle > 0 && cameraState !== '2')
    this.smoke.visible = Boolean(flight?.launched && (flight?.altitudeM || 0) < 50_000 && cameraState !== '2')
    if (this.flameLight) this.flameLight.intensity = this.exhaust.visible ? 18 + Math.sin(this.elapsed * 25) * 4 : 0
    if (this.exhaust?.visible) {
      const p = this.exhaust.geometry.attributes.position
      for (let i = 0; i < p.count; i++) { const y = -((this.elapsed * (3 + i % 4) + i * 0.63) % 8); p.setY(i, y); p.setX(i, Math.sin(this.elapsed * 9 + i) * 0.45); p.setZ(i, Math.cos(this.elapsed * 7 + i * 0.3) * 0.45) }
      p.needsUpdate = true
    }
    if (this.smoke?.visible) {
      const p = this.smoke.geometry.attributes.position
      for (let i = 0; i < p.count; i++) {
        const phase = (this.elapsed * 0.19 + i * 0.071) % 1
        const angle = i * 2.399 + this.elapsed * 0.13
        const spread = 0.4 + phase * 10
        p.setXYZ(i, Math.cos(angle) * spread, 0.5 + phase * 15, Math.sin(angle) * spread)
      }
      p.needsUpdate = true
      this.smoke.material.opacity = Math.max(0.05, 0.23 * (1 - (flight?.altitudeM || 0) / 50_000))
    }
    const orbitPosition = orbit?.position
    if (this.orbitCraft && this.orbitCraft.parent === this.space && orbitPosition) {
      if (this.destinationTarget) this.orbitCraft.position.lerp(this.destinationTarget, 1 - Math.exp(-dt * 0.25))
      else {
        const earthRadiusUnits = 33 / 6_371_000
        const earthCenter = this.earthGroup.position
        this.orbitCraft.position.set(earthCenter.x + orbitPosition.x * earthRadiusUnits, earthCenter.y + orbitPosition.y * earthRadiusUnits, earthCenter.z + orbitPosition.z * earthRadiusUnits)
      }
      this.orbitCraft.rotation.y += dt * 0.15
      for (const panel of this.orbitCraft.userData.panelPivots || []) panel.rotation.y = Math.sin(this.elapsed * 0.18) * 0.18
    }
    for (const hazard of this.hazards) { const u = hazard.userData; u.phase += dt * 0.025; hazard.position.x += Math.cos(u.phase) * dt * 0.18; hazard.position.z += Math.sin(u.phase) * dt * 0.18; hazard.rotation.set(this.elapsed * 0.06 + u.track, this.elapsed * 0.08, this.elapsed * 0.04) }
    for (const hazard of this.hazards) {
      const data = hazard.userData
      if (data.radarUntil && this.elapsed >= data.radarUntil) {
        hazard.material.emissive.setHex(data.baseEmissive)
        hazard.material.emissiveIntensity = data.baseEmissiveIntensity
        data.radarUntil = 0
      }
    }
    for (const ring of [...this.radarRings]) {
      ring.userData.life += dt; const k = ring.userData.life / 2.4; ring.scale.setScalar(1 + k * 55); ring.material.opacity = Math.max(0, 0.95 * (1 - k))
      if (k >= 1) { this.space.remove(ring); ring.geometry.dispose(); ring.material.dispose(); this.radarRings.splice(this.radarRings.indexOf(ring), 1) }
    }
    if (this.solarGlare) { this.solarGlare.material.opacity = 0.1 + (stormIntensity || 0) * 0.2 + Math.sin(this.elapsed * 0.7) * 0.03 }
  }
}
