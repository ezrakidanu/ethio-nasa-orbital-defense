import * as THREE from 'three'

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#020610')
    this.scene.fog = new THREE.FogExp2('#061322', 0.0018)
    this.ambient = new THREE.HemisphereLight('#b9e9ff', '#121a2a', 1.25)
    this.keyLight = new THREE.DirectionalLight('#fff3d1', 3.1)
    this.keyLight.position.set(-35, 60, 22)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(1536, 1536)
    this.keyLight.shadow.camera.left = -100
    this.keyLight.shadow.camera.right = 100
    this.keyLight.shadow.camera.top = 100
    this.keyLight.shadow.camera.bottom = -100
    this.scene.add(this.ambient, this.keyLight, this.keyLight.target)
    this.sceneState = '0'
    this.altitudeM = 0
    this.stormIntensity = 0
    this.launchComplex = new THREE.Group()
    this.spaceEnvironment = new THREE.Group()
    this.showroomWorld = new THREE.Group()
    this.showroomAnchor = new THREE.Vector3(27, 18, -8)
    this.showroomWorld.position.copy(this.showroomAnchor)
    this.scene.add(this.launchComplex, this.spaceEnvironment, this.showroomWorld)
    const starPositions = new Float32Array(1400 * 3)
    let seed = 49157
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    for (let index = 0; index < 1400; index += 1) {
      const radius = 90 + random() * 220
      const angle = random() * Math.PI * 2
      const y = random() * 2 - 1
      const planar = Math.sqrt(1 - y * y)
      starPositions[index * 3] = radius * planar * Math.cos(angle)
      starPositions[index * 3 + 1] = radius * y
      starPositions[index * 3 + 2] = radius * planar * Math.sin(angle)
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    this.showroomStars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#d7ecff', size: 0.8, sizeAttenuation: true, transparent: true, opacity: 0.82 }))
    this.showroomWorld.add(this.showroomStars)
  }

  setState(id) {
    this.sceneState = String(id)
    const home = this.sceneState === '0'
    const orbital = this.sceneState === '2' || this.sceneState === '5'
    this.launchComplex.visible = !home && !orbital
    this.spaceEnvironment.visible = !home
    this.showroomWorld.visible = home
    this.ambient.intensity = orbital ? 0.3 : 1.25
    this.scene.fog = orbital ? null : new THREE.FogExp2('#071425', 0.0018)
  }

  setAltitude(altitudeM) { this.altitudeM = Math.max(0, altitudeM) }
  setStorm(intensity) { this.stormIntensity = Math.max(0, Math.min(1, intensity || 0)) }

  update(dt, focus = new THREE.Vector3()) {
    this.keyLight.position.copy(focus).add(new THREE.Vector3(-35, 60, 22))
    this.keyLight.target.position.copy(focus)
    this.keyLight.intensity = this.sceneState === '2' ? 2.1 : 3.1
  }
}
