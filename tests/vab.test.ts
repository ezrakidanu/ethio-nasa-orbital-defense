import { describe, expect, it } from 'vitest'
import { addPart, calculateBuildStats, createBuild, jettisonFairings, PART_CATALOG, removePart, separateNextStage, validateConnections, type VehiclePart } from '../src/vab/model'

const part = (id: string, kind: VehiclePart['kind'], positionM: number, stage = 0, fuelFraction?: number): VehiclePart => ({ id, kind, positionM, stage, ...(fuelFraction === undefined ? {} : { fuelFraction }) })

describe('VAB vehicle domain model', () => {
  it('adds and removes parts immutably and rejects duplicate ids', () => {
    const empty = createBuild()
    const one = addPart(empty, part('tank', 'tank', 0))
    expect(empty.parts).toHaveLength(0)
    expect(one.parts).toHaveLength(1)
    expect(removePart(one, 'tank').parts).toHaveLength(0)
    expect(() => addPart(one, part('tank', 'tank', 1))).toThrow(/Duplicate/)
  })

  it('validates compatible nodes and catches a mismatched stack connection', () => {
    const stack = [part('tank', 'tank', 0), part('engine', 'engine', 1), part('capsule', 'capsule', 2)]
    expect(validateConnections(stack)).toEqual([])
    expect(validateConnections([part('sensor', 'optical-sensor', 0), part('tank', 'tank', 1)])).toHaveLength(1)
  })

  it('keeps side-mounted instruments and fairing shells separate from axial stack validation', () => {
    const parts: VehiclePart[] = [
      part('tank', 'tank', 0), part('engine', 'engine', 1), part('capsule', 'capsule', 2),
      { ...part('solar', 'solar-array', 2.5), mountMode: 'side' },
      { ...part('fairing', 'fairing', 3), mountMode: 'shell' },
    ]
    expect(validateConnections(parts)).toEqual([])
  })

  it('computes wet/dry mass, propellant, TWR, budget, power, and variable flow', () => {
    const build = createBuild([
      part('engine', 'engine', 0), part('tank', 'tank', 1, 0, 0.5),
      part('array', 'solar-array', 2), part('optics', 'optical-sensor', 3),
      part('radar', 'synthetic-radar', 4),
    ])
    const stats = calculateBuildStats(build, 2_000_000)
    expect(stats.propellantMassKg).toBe(12_000)
    expect(stats.wetMassKg - stats.dryMassKg).toBe(12_000)
    expect(stats.thrustToWeight).toBeGreaterThan(0)
    expect(stats.engines[0].burnTimeSeconds).toBeCloseTo(12_000 / PART_CATALOG.engine.propellantFlowKgPerSecond!)
    expect(stats.powerSurplusW).toBe(2400 - 360 - 1650)
    expect(stats.instrumentsPowered).toBe(true)
    expect(stats.cost).toBeGreaterThan(0)
    expect(stats.budgetRemaining).toBe(2_000_000 - stats.cost)
    expect(stats.centerOfMassM).toBeGreaterThan(0)
  })

  it('trades tank load for wet mass and reports power deficit when loads exceed generation', () => {
    const stack = [part('engine', 'engine', 0), part('tank', 'tank', 1, 0, 0.25), part('array', 'solar-array', 2), part('radar', 'synthetic-radar', 3)]
    const low = calculateBuildStats(createBuild(stack))
    const full = calculateBuildStats(createBuild(stack.map(p => p.id === 'tank' ? { ...p, fuelFraction: 1 } : p)))
    expect(full.wetMassKg - low.wetMassKg).toBe(18_000)
    expect(low.instrumentsPowered).toBe(true)
    expect(low.powerSurplusW).toBe(750)
  })

  it('separates stages sequentially, updating mass and returning impulse', () => {
    const build = createBuild([
      part('engine-1', 'engine', 0, 0), part('tank-1', 'tank', 1, 0, 0.2),
      part('engine-2', 'engine', 2, 1), part('tank-2', 'tank', 3, 1, 0.5),
      part('payload', 'satellite-payload', 4, 1),
    ], 900)
    const first = separateNextStage(build)!
    expect(first.separatedStage).toBe(0)
    expect(first.detachedParts.map(p => p.id)).toEqual(['engine-1', 'tank-1'])
    expect(first.impulseNs).toBe(900)
    expect(first.detachedMassKg).toBeGreaterThan(0)
    expect(first.remainingMassKg).toBeGreaterThan(0)
    expect(first.deltaVelocityMPerSecond).toBeCloseTo(900 / first.detachedMassKg)
    const second = separateNextStage(first.build)!
    expect(second.separatedStage).toBe(1)
    expect(second.complete).toBe(true)
    expect(second.remainingMassKg).toBe(0)
    expect(separateNextStage(second.build)).toBeNull()
  })

  it('jettisons fairings once and returns detached mass', () => {
    const build = createBuild([part('fairing', 'fairing', 1), part('payload', 'satellite-payload', 2)])
    const jettisoned = jettisonFairings(build)
    expect(jettisoned.detachedParts.map(p => p.id)).toEqual(['fairing'])
    expect(jettisoned.detachedMassKg).toBe(PART_CATALOG.fairing.dryMassKg)
    expect(jettisoned.build.parts.map(p => p.id)).toEqual(['payload'])
  })
})
