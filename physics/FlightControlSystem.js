import * as THREE from 'three'

export const SAS_MODES = Object.freeze(['Off', 'Prograde', 'Retrograde', 'Normal', 'Target'])
export const TIME_WARP_RATES = Object.freeze([1, 5, 10, 50, 1000])

const DEFAULT_AXIS = new THREE.Vector3(0, 1, 0)
const EPSILON = 1e-10
const finiteVector = value => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
const usableVector = value => finiteVector(value) && value.lengthSq() > EPSILON
const unitOr = (value, fallback = DEFAULT_AXIS) => usableVector(value) ? value.clone().normalize() : fallback.clone()
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle))

function perpendicularTo(direction) {
  // Choose the least-aligned cardinal axis to avoid an unstable near-zero cross product.
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
  axes.sort((a, b) => Math.abs(a.dot(direction)) - Math.abs(b.dot(direction)))
  return new THREE.Vector3().crossVectors(direction, axes[0]).normalize()
}

/**
 * Small attitude-hold controller. All angles are radians. Vehicle forward uses the
 * project's FlightPhysics convention: +Y at zero pitch/yaw; yaw rotates toward +X.
 * `update({ position, velocity, target, pitch, yaw, roll })` returns normalized
 * bounded actuator commands `{ pitch, yaw, roll }`, desired inertial unit direction,
 * and validity metadata. `gains` map angular error (rad) to command magnitude.
 */
export class SASController {
  constructor({ mode = 'Off', gains = {}, deadband = 0.01, maxCommand = 1 } = {}) {
    this.mode = SAS_MODES.includes(mode) ? mode : 'Off'
    this.gains = { pitch: 2, yaw: 2, roll: 2, ...gains }
    this.deadband = Number.isFinite(deadband) && deadband >= 0 ? deadband : 0.01
    this.maxCommand = Number.isFinite(maxCommand) && maxCommand >= 0 ? Math.min(maxCommand, 1) : 1
  }

  setMode(mode) {
    if (!SAS_MODES.includes(mode)) return false
    this.mode = mode
    return true
  }

  /** Update one frame. Missing/non-finite angles safely default to zero. */
  update({ position, velocity, target, pitch = 0, yaw = 0, roll = 0 } = {}) {
    const attitude = {
      pitch: Number.isFinite(pitch) ? pitch : 0,
      yaw: Number.isFinite(yaw) ? yaw : 0,
      roll: Number.isFinite(roll) ? roll : 0,
    }
    const result = { pitch: 0, yaw: 0, roll: 0, desiredDirection: null, mode: this.mode, active: false, targetValid: false }
    if (this.mode === 'Off') return result

    const r = finiteVector(position) ? position.clone() : null
    const v = finiteVector(velocity) ? velocity.clone() : null
    let desired
    if (this.mode === 'Prograde' || this.mode === 'Retrograde') {
      if (usableVector(v)) desired = v.clone().normalize().multiplyScalar(this.mode === 'Retrograde' ? -1 : 1)
    } else if (this.mode === 'Normal') {
      if (r && v) {
        const cross = new THREE.Vector3().crossVectors(r, v)
        if (usableVector(cross)) desired = cross.normalize()
        else if (usableVector(v)) desired = perpendicularTo(v.clone().normalize())
        else if (usableVector(r)) desired = perpendicularTo(r.clone().normalize())
        else desired = perpendicularTo(DEFAULT_AXIS)
      } else if (usableVector(v)) desired = perpendicularTo(v.clone().normalize())
      else if (usableVector(r)) desired = perpendicularTo(r.clone().normalize())
    } else if (this.mode === 'Target') {
      if (finiteVector(position) && usableVector(target)) {
        const toTarget = target.clone().sub(position)
        if (usableVector(toTarget)) desired = toTarget.normalize()
      }
    }
    if (!desired || !usableVector(desired)) return result

    // Inverse of FlightPhysics's forward vector mapping.
    const horizontal = Math.hypot(desired.x, desired.z)
    const desiredPitch = Math.atan2(horizontal, desired.y)
    const desiredYaw = horizontal > EPSILON ? Math.atan2(desired.x, desired.z) : attitude.yaw
    const pitchError = wrapAngle(desiredPitch - attitude.pitch)
    const yawError = wrapAngle(desiredYaw - attitude.yaw)
    const rollError = wrapAngle(-attitude.roll) // Direction hold has no roll reference; hold wings level.
    for (const [axis, error] of Object.entries({ pitch: pitchError, yaw: yawError, roll: rollError })) {
      const gain = Number.isFinite(this.gains[axis]) ? this.gains[axis] : 0
      const outsideDeadband = Math.abs(error) <= this.deadband ? 0 : error
      result[axis] = THREE.MathUtils.clamp(outsideDeadband * gain, -this.maxCommand, this.maxCommand)
    }
    result.desiredDirection = desired
    result.active = true
    result.targetValid = true
    return result
  }
}

/**
 * Exact-preset time warp planner. `plan(realDt)` returns fixed steps no larger than
 * maxStepSeconds, capped at maxSubsteps. `consumedTime` is the simulation time in
 * returned steps; `unconsumedTime` is explicitly reported for caller-side backlog
 * handling rather than discarded. Values are seconds.
 */
export class TimeWarpController {
  constructor({ rate = 1, maxStepSeconds = 0.05, maxSubsteps = 200 } = {}) {
    this.rate = TIME_WARP_RATES.includes(rate) ? rate : 1
    this.maxStepSeconds = Number.isFinite(maxStepSeconds) && maxStepSeconds > 0 ? maxStepSeconds : 0.05
    this.maxSubsteps = Number.isInteger(maxSubsteps) && maxSubsteps > 0 ? maxSubsteps : 200
  }

  setRate(rate) {
    if (!TIME_WARP_RATES.includes(rate)) return false
    this.rate = rate
    return true
  }

  selectRate(index) {
    if (!Number.isInteger(index) || index < 0 || index >= TIME_WARP_RATES.length) return false
    return this.setRate(TIME_WARP_RATES[index])
  }

  plan(realDt) {
    const safeRealDt = Number.isFinite(realDt) && realDt > 0 ? realDt : 0
    const requestedTime = safeRealDt * this.rate
    const count = Math.min(Math.ceil(requestedTime / this.maxStepSeconds), this.maxSubsteps)
    const consumedTime = Math.min(requestedTime, count * this.maxStepSeconds)
    const steps = []
    let left = consumedTime
    for (let i = 0; i < count && left > 0; i++) {
      const step = Math.min(this.maxStepSeconds, left)
      steps.push(step)
      left -= step
    }
    const actualConsumed = steps.reduce((sum, step) => sum + step, 0)
    return {
      rate: this.rate,
      requestedTime,
      steps,
      stepCount: steps.length,
      simulatedTime: actualConsumed,
      consumedTime: actualConsumed,
      unconsumedTime: Math.max(0, requestedTime - actualConsumed),
      realTimeConsumed: actualConsumed / this.rate,
    }
  }
}

// Short alias for consumers that prefer a system-level name.
export const FlightControlSystem = SASController
