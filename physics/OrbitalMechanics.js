import * as THREE from 'three'

const EARTH_MU = 3.986004418e14
const EARTH_RADIUS = 6_371_000
const SATELLITE_SPECS = Object.freeze({
  'ETRSS-1': { dryMass: 420, batteryWh: 1000, thrustN: 16, solarW: 260, shields: 50 },
  'ET-SMART-RSS': { dryMass: 75, batteryWh: 650, thrustN: 7, solarW: 95, shields: 35 },
  'ETHIO-DEEP-SPACE 1': { dryMass: 860, batteryWh: 2200, thrustN: 30, solarW: 180, shields: 95 },
})

export class OrbitalMechanics {
  constructor(className = 'ETRSS-1') { this.configure(className) }

  configure(className) {
    this.className = SATELLITE_SPECS[className] ? className : 'ETRSS-1'
    this.spec = SATELLITE_SPECS[this.className]
    this.reset()
  }

  reset() {
    this.position = new THREE.Vector3(EARTH_RADIUS + 408_000, 0, 0)
    this.velocity = new THREE.Vector3(0, 0, Math.sqrt(EARTH_MU / this.position.length()))
    this.batteryWh = this.spec.batteryWh * 0.94
    this.shields = this.spec.shields
    this.elapsed = 0
    this.thrusterDrainW = 0
    this.solarInputW = 0
  }

  update(dt, controls = {}, stormIntensity = 0, tuning = {}) {
    const step = Math.min(Math.max(dt, 0), 0.05)
    const radial = this.position.clone().normalize()
    const gravity = radial.multiplyScalar(-EARTH_MU / (this.position.length() ** 2))
    const thrustInput = new THREE.Vector3(controls.yaw || 0, controls.roll || 0, controls.pitch || 0)
    const thrusting = thrustInput.lengthSq() > 0.0025
    const thrustAcc = thrustInput.lengthSq() ? thrustInput.normalize().multiplyScalar(this.spec.thrustN / this.spec.dryMass) : new THREE.Vector3()
    this.velocity.addScaledVector(gravity.add(thrustAcc), step)
    this.position.addScaledVector(this.velocity, step)
    this.elapsed += step

    const sun = new THREE.Vector3(1, 0.18, 0.1).normalize()
    const panelNormal = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), (controls.roll || 0) * 0.22).normalize()
    this.solarInputW = this.spec.solarW * (tuning.solarEfficiency ?? 1) * Math.max(0, panelNormal.dot(sun))
    this.thrusterDrainW = thrusting ? (tuning.thrusterDrainW ?? 34) + 26 * Math.min(1, thrustInput.length()) : 0
    const shieldDrain = Math.max(0, stormIntensity) * 0.55
    const drainWh = (this.thrusterDrainW + (tuning.baseLoadW ?? 18) + shieldDrain) * step / 3600
    const chargeWh = this.solarInputW * step / 3600
    this.batteryWh = THREE.MathUtils.clamp(this.batteryWh + chargeWh - drainWh, 0, this.spec.batteryWh)
    if (stormIntensity > 0) this.shields = Math.max(0, this.shields - stormIntensity * step * 0.012)
    return this.snapshot()
  }

  snapshot() {
    return {
      className: this.className, position: this.position.clone(), velocity: this.velocity.clone(),
      speedMps: this.velocity.length(), altitudeM: this.position.length() - EARTH_RADIUS,
      batteryWh: this.batteryWh, batteryCapacityWh: this.spec.batteryWh,
      batteryPercent: 100 * this.batteryWh / this.spec.batteryWh, solarInputW: this.solarInputW,
      shields: this.shields, thrusterDrainW: this.thrusterDrainW, elapsed: this.elapsed,
    }
  }
}
