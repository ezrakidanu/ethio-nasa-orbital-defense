import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { SASController, SAS_MODES, TIME_WARP_RATES, TimeWarpController } from '../physics/FlightControlSystem.js'

const vec = (x, y, z) => new THREE.Vector3(x, y, z)

describe('SASController', () => {
  it('supports only Off and the four requested hold modes', () => {
    const sas = new SASController()
    expect(SAS_MODES).toEqual(['Off', 'Prograde', 'Retrograde', 'Normal', 'Target'])
    for (const mode of SAS_MODES) expect(sas.setMode(mode)).toBe(true)
    expect(sas.setMode('Stability')).toBe(false)
  })

  it('resolves prograde and retrograde from inertial velocity', () => {
    const sas = new SASController({ mode: 'Prograde' })
    const inputs = { position: vec(4, 0, 0), velocity: vec(0, 0, 8) }
    expect(sas.update(inputs).desiredDirection.toArray()).toEqual([0, 0, 1])
    sas.setMode('Retrograde')
    const retrograde = sas.update(inputs).desiredDirection
    expect(retrograde.x).toBeCloseTo(0)
    expect(retrograde.y).toBeCloseTo(0)
    expect(retrograde.z).toBeCloseTo(-1)
  })

  it('resolves orbit normal and stable fallbacks for parallel or zero vectors', () => {
    const sas = new SASController({ mode: 'Normal' })
    expect(sas.update({ position: vec(1, 0, 0), velocity: vec(0, 0, 1) }).desiredDirection.toArray()).toEqual([0, -1, 0])
    const parallel = sas.update({ position: vec(1, 0, 0), velocity: vec(2, 0, 0) }).desiredDirection
    expect(parallel.length()).toBeCloseTo(1)
    expect(Math.abs(parallel.dot(vec(1, 0, 0)))).toBeCloseTo(0)
    const zeroVelocity = sas.update({ position: vec(0, 0, 0), velocity: vec(0, 0, 0) }).desiredDirection
    expect(zeroVelocity.length()).toBeCloseTo(1)
    expect(zeroVelocity.toArray().every(Number.isFinite)).toBe(true)
  })

  it('aims at a target, bounds corrections, and applies a deadband', () => {
    const sas = new SASController({ mode: 'Target', gains: { pitch: 4, yaw: 3, roll: 2 }, deadband: 0.05, maxCommand: 0.7 })
    const out = sas.update({ position: vec(2, 0, 0), target: vec(2, 0, -5), velocity: vec(0, 1, 0), pitch: 0, yaw: 0, roll: 1 })
    expect(out.desiredDirection.toArray()).toEqual([0, 0, -1])
    expect(out.pitch).toBe(0.7)
    expect(out.yaw).toBe(0.7)
    expect(out.roll).toBe(-0.7)
    expect([out.pitch, out.yaw, out.roll].every(x => Math.abs(x) <= 0.7)).toBe(true)
    const settled = sas.update({ position: vec(0, 0, 0), target: vec(0, 1, 0), pitch: 0.01, yaw: 0, roll: 0 })
    expect(settled.pitch).toBe(0)
    expect(settled.yaw).toBe(0)
    expect(settled.roll).toBe(0)
  })

  it('returns zero commands while off and safely idles for missing targets or invalid vectors', () => {
    const sas = new SASController()
    expect(sas.update({ velocity: vec(1, 0, 0) })).toMatchObject({ pitch: 0, yaw: 0, roll: 0, active: false })
    sas.setMode('Target')
    expect(sas.update({ position: vec(0, 0, 0) })).toMatchObject({ pitch: 0, yaw: 0, roll: 0, active: false, targetValid: false })
    sas.setMode('Prograde')
    expect(sas.update({ velocity: { x: NaN, y: 1, z: 0 } })).toMatchObject({ pitch: 0, yaw: 0, roll: 0, active: false })
  })
})

describe('TimeWarpController', () => {
  it('accepts only exact warp presets and supports index selection', () => {
    const warp = new TimeWarpController()
    expect(TIME_WARP_RATES).toEqual([1, 5, 10, 50, 1000])
    expect(warp.rate).toBe(1)
    for (const rate of TIME_WARP_RATES) expect(warp.setRate(rate)).toBe(true)
    expect(warp.setRate(2)).toBe(false)
    expect(warp.rate).toBe(1000)
    expect(warp.selectRate(2)).toBe(true)
    expect(warp.rate).toBe(10)
    expect(warp.selectRate(-1)).toBe(false)
  })

  it('splits warped time into bounded steps and accounts for all consumed time', () => {
    const warp = new TimeWarpController({ rate: 5 })
    const plan = warp.plan(0.11)
    expect(plan.requestedTime).toBeCloseTo(0.55)
    expect(plan.steps.length).toBe(11)
    expect(plan.steps.every(step => step > 0 && step <= 0.05)).toBe(true)
    expect(plan.simulatedTime).toBeCloseTo(0.55)
    expect(plan.consumedTime).toBeCloseTo(plan.steps.reduce((sum, x) => sum + x, 0))
    expect(plan.unconsumedTime).toBeCloseTo(0)
    expect(plan.realTimeConsumed).toBeCloseTo(0.11)
  })

  it('caps substeps and explicitly reports the remaining simulation time', () => {
    const warp = new TimeWarpController({ rate: 1000, maxStepSeconds: 0.05, maxSubsteps: 3 })
    const plan = warp.plan(1)
    expect(plan.stepCount).toBe(3)
    expect(plan.steps).toEqual([0.05, 0.05, 0.05])
    expect(plan.simulatedTime).toBeCloseTo(0.15)
    expect(plan.consumedTime).toBeCloseTo(0.15)
    expect(plan.unconsumedTime).toBeCloseTo(999.85)
    expect(plan.requestedTime).toBe(1000)
  })
})
