import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
afterEach(() => { tuning.apply(defaults); tuning.activate('run') })

describe('ETHIO-NASA Preview tuning', () => {
  it('validates each patch before mutating the active flight configuration', () => {
    const before = tuning.read()
    for (const patch of [{ 'flight.thrustN': 90_000_000 }, { 'flight.maxQPa': 38_500 },
      { 'orbit.solarEfficiency': Infinity }, { 'camera.fov': 101 }, { unknown: 4 }]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    expect(CONFIG.flight.thrustN).toBe(DEFAULT_CONFIG.flight.thrustN)
  })

  it('queues launch tuning until a new mission and applies camera changes live', () => {
    tuning.apply({ 'flight.thrustN': 41_000_000, 'flight.maxQPa': 42_000 })
    expect(CONFIG.flight.thrustN).toBe(DEFAULT_CONFIG.flight.thrustN)
    expect(tuning.read().requested['flight.thrustN']).toBe(41_000_000)
    tuning.activate('run')
    expect(CONFIG.flight.thrustN).toBe(41_000_000)
    expect(CONFIG.flight.maxQPa).toBe(42_000)
    tuning.apply({ 'camera.fov': 78, 'camera.distance': 8 })
    expect(CONFIG.camera.fov).toBe(78)
    expect(CONFIG.camera.distance).toBe(8)
  })

  it('keeps camera-only edits cosmetic and marks altered flight values as unranked', () => {
    tuning.activate('run')
    tuning.apply({ 'camera.fov': 90 })
    expect(tuning.unranked).toBe(false)
    tuning.apply({ 'flight.dragCoefficient': 0.6 })
    expect(tuning.unranked).toBe(false)
    tuning.activate('run')
    expect(tuning.unranked).toBe(true)
    tuning.apply(defaults)
    expect(tuning.unranked).toBe(true)
    tuning.activate('run')
    expect(tuning.unranked).toBe(false)
  })
})
