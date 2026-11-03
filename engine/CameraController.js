import * as THREE from 'three'

export const CAMERA_STATES = Object.freeze([
  { id: '0', label: 'HANGAR VIEW' },
  { id: '1A', label: 'PAYLOAD INSPECTION' },
  { id: '1B', label: 'SLS TOWER MOUNT' },
  { id: '1C', label: 'SATURN V PAD AERIAL' },
  { id: '2', label: 'ORBITAL EVASION' },
  { id: '3', label: 'TELEMETRY DEBRIEF' },
])

export class CameraController {
  constructor(camera) {
    this.camera = camera
    this.stateIndex = 0
    this.position = new THREE.Vector3(40, 18, 42)
    this.target = new THREE.Vector3(0, 14, 0)
    this.desiredPosition = this.position.clone()
    this.desiredTarget = this.target.clone()
    this.shake = 0
    this.orbitAngle = 0
  }

  get state() { return CAMERA_STATES[this.stateIndex] }
  get stateId() { return this.state.id }
  setState(id) {
    const index = CAMERA_STATES.findIndex(state => state.id === String(id))
    if (index >= 0) this.stateIndex = index
    return this.state
  }
  next() { this.stateIndex = (this.stateIndex + 1) % CAMERA_STATES.length; return this.state }
  triggerShake(amount = 0.7) { this.shake = Math.max(this.shake, amount) }

  update(dt, targets = {}) {
    const rocket = targets.rocket || new THREE.Vector3(0, 14, 0)
    const payload = targets.payload || rocket.clone().add(new THREE.Vector3(0, 16, 0))
    const orbit = targets.orbit || new THREE.Vector3(38, -28, 0)
    const velocity = targets.velocity || new THREE.Vector3(0, 0, 1)
    const time = targets.time || 0
    const tuning = targets.cameraTuning || {}
    const fov = tuning.fov ?? this.camera.fov
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }
    const distance = tuning.distance ?? 6.4
    const follow = tuning.follow ?? 10
    const s = this.stateId
    if (s !== '1C') this.camera.up.set(0, 1, 0)
    if (s === '0') {
      this.orbitAngle += dt * 0.13
      this.desiredTarget.copy(rocket).add(new THREE.Vector3(0, 12, 0))
      this.desiredPosition.copy(this.desiredTarget).add(new THREE.Vector3(Math.sin(this.orbitAngle) * distance * 6.56, distance * 2.81, Math.cos(this.orbitAngle) * distance * 6.56))
    } else if (s === '1A') {
      this.orbitAngle += dt * 0.38
      this.desiredTarget.copy(payload)
      this.desiredPosition.copy(payload).add(new THREE.Vector3(Math.sin(this.orbitAngle) * distance * 1.875, distance * 0.625, Math.cos(this.orbitAngle) * distance * 1.875))
    } else if (s === '1B') {
      this.desiredTarget.copy(rocket).add(new THREE.Vector3(0, 20, 0))
      this.desiredPosition.copy(rocket).add(new THREE.Vector3(-distance * 5, distance * 1.1, distance * 2.5))
    } else if (s === '1C') {
      this.desiredTarget.copy(rocket)
      this.desiredPosition.copy(rocket).add(new THREE.Vector3(0, distance * 11.56, 0.05))
      this.camera.up.set(0, 0, -1)
    } else if (s === '2') {
      const followDir = velocity.clone().normalize()
      if (followDir.lengthSq() < 0.1) followDir.set(0, 0, 1)
      this.desiredTarget.copy(orbit)
      this.desiredPosition.copy(orbit).addScaledVector(followDir, -distance * 3.75).add(new THREE.Vector3(0, distance * 1.4, 0))
      this.camera.up.set(0, 1, 0)
    } else {
      this.desiredTarget.copy(orbit).lerp(rocket, 0.45)
      this.desiredPosition.copy(this.desiredTarget).add(new THREE.Vector3(55, 36, 58))
    }
    const blend = 1 - Math.exp(-Math.max(0.01, dt) * follow * (s === '1A' ? 0.52 : 0.27))
    this.position.lerp(this.desiredPosition, blend)
    this.target.lerp(this.desiredTarget, blend)
    if (this.shake > 0.002) {
      const amp = this.shake * this.shake * (0.055 + Math.sin(time * 78) * 0.045)
      this.camera.position.copy(this.position).add(new THREE.Vector3(Math.sin(time * 137) * amp, Math.cos(time * 111) * amp, Math.sin(time * 101) * amp))
      this.shake = Math.max(0, this.shake - dt * 1.3)
    } else this.camera.position.copy(this.position)
    this.camera.lookAt(this.target)
    this.camera.updateMatrixWorld()
  }
}
