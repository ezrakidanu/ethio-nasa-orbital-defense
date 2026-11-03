import { describe, expect, it } from 'vitest'
import { EARTH_MU, EARTH_RADIUS, apsisAltitudes, propagateState, sampleOrbit, stateToElements } from '../physics/KeplerOrbit.js'

const circularRadius = EARTH_RADIUS + 408_000
const circularPosition = [circularRadius, 0, 0]
const circularVelocity = [0, 0, Math.sqrt(EARTH_MU / circularRadius)]
const energy = (r, v) => v.reduce((sum, x) => sum + x * x, 0) / 2 - EARTH_MU / Math.hypot(...r)

describe('KeplerOrbit', () => {
  it('converts a 408 km circular orbit with reasonable matching Ap/Pe and near-zero eccentricity', () => {
    const elements = stateToElements(circularPosition, circularVelocity)
    expect(elements.eccentricity).toBeLessThan(1e-10)
    const altitudes = apsisAltitudes(elements)
    expect(altitudes.apoapsisAltitude).toBeCloseTo(408_000, -1)
    expect(altitudes.periapsisAltitude).toBeCloseTo(408_000, -1)
    expect(elements.inclination).toBeCloseTo(Math.PI / 2, 10)
  })

  it('reports distinct apsis altitudes for an elliptical orbit', () => {
    const elements = stateToElements([circularRadius, 0, 0], [0, 0, Math.sqrt(EARTH_MU / circularRadius) * 0.92])
    const apsides = apsisAltitudes(elements)
    expect(apsides.apoapsisAltitude).toBeGreaterThan(apsides.periapsisAltitude)
    expect(elements.eccentricity).toBeGreaterThan(0.05)
  })

  it('samples finite ECI points and closes the path', () => {
    const points = sampleOrbit(stateToElements(circularPosition, circularVelocity), 64)
    expect(points).toHaveLength(65)
    expect(points.flat().every(Number.isFinite)).toBe(true)
    expect(points[0]).toEqual(points.at(-1))
    expect(points[0][0]).toBeCloseTo(circularRadius, 5)
    expect(points[0][2]).toBeCloseTo(0, 5)
  })

  it('propagates an ellipse while conserving bounded specific orbital energy', () => {
    const initialPosition = [circularRadius, 0, 0]
    const initialVelocity = [0, 0, Math.sqrt(EARTH_MU / circularRadius) * 0.92]
    const initialEnergy = energy(initialPosition, initialVelocity)
    let propagated = { position: initialPosition, velocity: initialVelocity }
    for (const dt of [600, 1800, 3600, -1200, 7200]) propagated = propagateState(initialPosition, initialVelocity, dt)
    expect(propagated.position.every(Number.isFinite)).toBe(true)
    expect(propagated.velocity.every(Number.isFinite)).toBe(true)
    expect(energy(propagated.position, propagated.velocity)).toBeCloseTo(initialEnergy, 5)
    expect(initialEnergy).toBeLessThan(0)
  })

  it('rejects invalid, degenerate, and unbound states with clear errors', () => {
    expect(() => stateToElements([0, 0, 0], [0, 0, 0])).toThrow(/radius/i)
    expect(() => stateToElements([1, 0, 0], [1, 0, 0])).toThrow(/degenerate/i)
    expect(() => stateToElements([circularRadius, 0, 0], [0, 0, 12_000])).toThrow(/bound elliptical/i)
    expect(() => stateToElements([1, NaN, 0], [0, 1, 0])).toThrow(/finite 3D vector/i)
    expect(() => propagateState(circularPosition, circularVelocity, Infinity)).toThrow(/time offset/i)
  })
})
