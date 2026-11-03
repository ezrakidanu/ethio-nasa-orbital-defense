import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLIGHT_CONSTANTS, FlightPhysics } from '../physics/FlightPhysics.js'
import { OrbitalMechanics } from '../physics/OrbitalMechanics.js'
import { CAMERA_STATES, CameraController } from '../engine/CameraController.js'
import { NASADataPipeline } from '../api/NASADataPipeline.js'
import * as THREE from 'three'

afterEach(() => vi.restoreAllMocks())

describe('SFS2-style ascent physics', () => {
  it('uses the specified exponential density, variable gravity and dynamic-pressure equations', () => {
    expect(FlightPhysics.density(0)).toBeCloseTo(1.225, 6)
    expect(FlightPhysics.density(8500)).toBeCloseTo(1.225 / Math.E, 5)
    expect(FlightPhysics.gravity(0)).toBeCloseTo(9.80665, 5)
    expect(FlightPhysics.gravity(100_000)).toBeLessThan(FlightPhysics.gravity(0))
    expect(FlightPhysics.dynamicPressure(0, 300)).toBeCloseTo(0.5 * 1.225 * 90_000, 3)
  })

  it('integrates a throttled launch, burns fuel and honors a queued structural limit', () => {
    const flight = new FlightPhysics()
    flight.launch()
    const fuelStart = flight.fuel
    for (let i = 0; i < 20; i++) flight.update(0.05, { throttle: 1 }, { thrustN: 41_000_000 })
    expect(flight.position.y).toBeGreaterThan(0)
    expect(flight.velocity.length()).toBeGreaterThan(0)
    expect(flight.fuel).toBeLessThan(fuelStart)
    flight.position.set(0, 0, 0)
    flight.velocity.set(0, 300, 0)
    const maxQ = flight.update(0.01, { throttle: 0 }, { maxQPa: 50_000 })
    expect(maxQ.qPa).toBeGreaterThan(maxQ.maxQLimitPa)
    expect(maxQ.maxQLimitPa).toBe(50_000)
    expect(FLIGHT_CONSTANTS.maxQ).toBe(38_000)
    expect(flight.consumeMaxQCrossing()).toBe(true)
    expect(flight.consumeMaxQCrossing()).toBe(false)
  })
})

describe('orbital power and scene system', () => {
  it('recharges solar arrays and drains the bus and shields when power loads are applied', () => {
    const orbital = new OrbitalMechanics('ETRSS-1')
    const initial = orbital.batteryWh
    for (let i = 0; i < 20; i++) orbital.update(0.05, {})
    expect(orbital.solarInputW).toBeGreaterThan(0)
    expect(orbital.batteryWh).toBeGreaterThan(initial)
    const charged = orbital.batteryWh
    for (let i = 0; i < 20; i++) orbital.update(0.05, { yaw: 1 }, 3, { solarEfficiency: 0, thrusterDrainW: 80, baseLoadW: 70 })
    expect(orbital.batteryWh).toBeLessThan(charged)
    expect(orbital.shields).toBeLessThan(50)
  })

  it('maps the six original and two added camera states to finite smoothed positions', () => {
    const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 2000)
    const controller = new CameraController(camera)
    expect(CAMERA_STATES.map(s => s.id)).toEqual(['0', '1A', '1B', '1C', '2', '3', '4', '5'])
    for (const state of CAMERA_STATES) {
      controller.setState(state.id)
      controller.update(0.05, { rocket: new THREE.Vector3(0, 10, 0), payload: new THREE.Vector3(0, 35, 0), orbit: new THREE.Vector3(38, -28, 0), velocity: new THREE.Vector3(0, 0, 1), time: 1 })
      expect(controller.stateId).toBe(state.id)
      expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
    }
    controller.setState('0')
    controller.update(0.05, { cameraTuning: { fov: 77, distance: 7, follow: 12 } })
    expect(camera.fov).toBe(77)
  })
})

describe('NASA data offline operation', () => {
  it('retains complete local DONKI and NeoWs mock arrays when both requests fail', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new TypeError('offline test') }
    try {
      const pipeline = new NASADataPipeline()
      const data = await pipeline.load()
      expect(data.source).toBe('NASA + OFFLINE FALLBACK')
      expect(data.flares.length).toBeGreaterThan(0)
      expect(data.asteroids.length).toBeGreaterThan(0)
      expect(data.radiationMultiplier).toBe(1)
      expect(data.error).toContain('offline test')
    } finally { globalThis.fetch = originalFetch }
  })
})
