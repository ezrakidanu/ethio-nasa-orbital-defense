import * as THREE from 'three'

export const FLIGHT_CONSTANTS = Object.freeze({
  rho0: 1.225, scaleHeight: 8500, g0: 9.80665, earthRadius: 6_371_000,
  maxQ: 38_000, thrust: 39_100_000, dryMass: 1_510_000, fuelMass: 1_090_000,
  burnSeconds: 122, dragCoefficient: 0.45, referenceArea: 80,
})

export class FlightPhysics {
  constructor() { this.reset() }

  reset() {
    this.position = new THREE.Vector3(0, 0, 0)
    this.velocity = new THREE.Vector3(0, 0, 0)
    this.acceleration = new THREE.Vector3(0, 0, 0)
    this.fuel = FLIGHT_CONSTANTS.fuelMass
    this.dryMassKg = FLIGHT_CONSTANTS.dryMass
    this.separatedStages = new Set()
    this.elapsed = 0
    this.throttle = 0
    this.pitch = 0
    this.yaw = 0
    this.roll = 0
    this.dynamicPressure = 0
    this.maxQReached = false
    this.maxQCrossed = false
    this.launched = false
    this.staged = false
    this.burnedOut = false
  }

  static density(altitudeM) {
    return FLIGHT_CONSTANTS.rho0 * Math.exp(-Math.max(0, altitudeM) / FLIGHT_CONSTANTS.scaleHeight)
  }

  static gravity(altitudeM) {
    const { g0, earthRadius } = FLIGHT_CONSTANTS
    return g0 * (earthRadius / (earthRadius + Math.max(0, altitudeM))) ** 2
  }

  static dynamicPressure(altitudeM, speedMps) {
    return 0.5 * FlightPhysics.density(altitudeM) * speedMps * speedMps
  }

  update(dt, controls = {}, tuning = {}) {
    if (!this.launched) return this.snapshot()
    const step = Math.min(Math.max(dt, 0), 0.05)
    const throttle = THREE.MathUtils.clamp(controls.throttle ?? this.throttle, 0, 1)
    this.throttle = throttle
    this.pitch = THREE.MathUtils.clamp(this.pitch + (controls.pitch || 0) * 0.58 * step, -0.16, 1.18)
    this.yaw += (controls.yaw || 0) * 0.58 * step
    this.roll = THREE.MathUtils.clamp(this.roll + (controls.roll || 0) * 1.15 * step, -Math.PI * 3, Math.PI * 3)
    this.elapsed += step

    const h = Math.max(0, this.position.y)
    const speed = this.velocity.length()
    const rho = FlightPhysics.density(h)
    const q = 0.5 * rho * speed * speed
    this.dynamicPressure = q
    const maxQLimitPa = tuning.maxQPa ?? FLIGHT_CONSTANTS.maxQ
    this.activeMaxQLimitPa = maxQLimitPa
    if (q >= maxQLimitPa && !this.maxQReached) {
      this.maxQReached = true
      this.maxQCrossed = true
    }

    const fuelRate = FLIGHT_CONSTANTS.fuelMass / FLIGHT_CONSTANTS.burnSeconds
    const fuelUsed = Math.min(this.fuel, fuelRate * step * throttle)
    this.fuel = Math.max(0, this.fuel - fuelUsed)
    const mass = this.dryMassKg + this.fuel
    if (this.fuel <= 0) this.burnedOut = true
    const thrust = (this.burnedOut ? 0 : (tuning.thrustN ?? FLIGHT_CONSTANTS.thrust) * throttle)
    const direction = new THREE.Vector3(
      Math.sin(this.yaw) * Math.sin(this.pitch),
      Math.cos(this.pitch),
      Math.cos(this.yaw) * Math.sin(this.pitch),
    ).normalize()
    const dragForce = q * (tuning.dragCoefficient ?? FLIGHT_CONSTANTS.dragCoefficient) * FLIGHT_CONSTANTS.referenceArea
    const drag = speed > 1e-5 ? this.velocity.clone().normalize().multiplyScalar(-dragForce) : new THREE.Vector3()
    const force = direction.multiplyScalar(thrust).add(drag)
    force.y -= mass * FlightPhysics.gravity(h)
    this.acceleration.copy(force).divideScalar(Math.max(mass, 1))
    this.velocity.addScaledVector(this.acceleration, step)
    this.position.addScaledVector(this.velocity, step)
    if (this.position.y < 0) {
      this.position.y = 0
      if (this.velocity.y < 0) this.velocity.y = 0
    }
    return this.snapshot()
  }

  launch() {
    if (!this.launched) {
      this.launched = true
      this.throttle = 1
    }
  }

  separateStage(stage = 'boosters') {
    const stageMass = { boosters: 480_000, 'lower-stage': 840_000, 'upper-stage': 110_000 }
    if (!(stage in stageMass) || this.separatedStages.has(stage)) return false
    this.separatedStages.add(stage)
    this.dryMassKg = Math.max(30_000, this.dryMassKg - stageMass[stage])
    if (stage === 'lower-stage') this.fuel = Math.min(this.fuel, FLIGHT_CONSTANTS.fuelMass * 0.16)
    if (stage === 'upper-stage') this.fuel = 0
    this.staged = this.separatedStages.has('boosters')
    return true
  }
  consumeMaxQCrossing() { const crossed = this.maxQCrossed; this.maxQCrossed = false; return crossed }

  snapshot() {
    const speed = this.velocity.length()
    return {
      altitudeM: Math.max(0, this.position.y), speedMps: speed, mach: speed / 330,
      qPa: this.dynamicPressure, qKpa: this.dynamicPressure / 1000, maxQLimitPa: this.activeMaxQLimitPa ?? FLIGHT_CONSTANTS.maxQ,
      rho: FlightPhysics.density(this.position.y), gravity: FlightPhysics.gravity(this.position.y),
      fuelKg: this.fuel, fuelPercent: this.fuel / FLIGHT_CONSTANTS.fuelMass * 100,
      massKg: this.dryMassKg + this.fuel, dryMassKg: this.dryMassKg,
      twr: (this.burnedOut ? 0 : FLIGHT_CONSTANTS.thrust * this.throttle) / Math.max(1, (this.dryMassKg + this.fuel) * FlightPhysics.gravity(this.position.y)),
      throttle: this.throttle * 100,
      pitch: this.pitch, yaw: this.yaw, roll: this.roll, elapsed: this.elapsed,
      maxQReached: this.maxQReached, staged: this.staged, burnedOut: this.burnedOut,
      position: this.position.clone(), velocity: this.velocity.clone(), acceleration: this.acceleration.clone(),
    }
  }
}
