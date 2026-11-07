export type PartKind =
  | 'capsule'
  | 'engine'
  | 'tank'
  | 'fairing'
  | 'solar-array'
  | 'optical-sensor'
  | 'synthetic-radar'
  | 'rtg'
  | 'satellite-payload'

export type NodeType = 'structural' | 'propellant' | 'payload' | 'electrical' | 'fairing'
export type FuelType = 'kerosene-oxygen' | 'methalox' | 'hypergolic' | 'solid'

export interface PartDefinition {
  kind: PartKind
  name: string
  dryMassKg: number
  cost: number
  topNode: NodeType | null
  bottomNode: NodeType | null
  fuelCapacityKg?: number
  fuelType?: FuelType
  thrustSeaLevelN?: number
  specificImpulseSeconds?: number
  propellantFlowKgPerSecond?: number
  electricGenerationW?: number
  electricConsumptionW?: number
  fairing?: boolean
}

export const STANDARD_SEA_LEVEL_G_M_S2 = 9.80665

export const PART_CATALOG: Readonly<Record<PartKind, PartDefinition>> = {
  capsule: { kind: 'capsule', name: 'Crew capsule', dryMassKg: 4200, cost: 1_200_000, topNode: 'payload', bottomNode: 'structural' },
  engine: { kind: 'engine', name: 'Sea-level engine', dryMassKg: 1800, cost: 680_000, topNode: 'structural', bottomNode: 'propellant', thrustSeaLevelN: 980_000, specificImpulseSeconds: 300, propellantFlowKgPerSecond: 333.22 },
  tank: { kind: 'tank', name: 'Propellant tank', dryMassKg: 1200, cost: 260_000, topNode: 'propellant', bottomNode: 'structural', fuelCapacityKg: 24_000, fuelType: 'kerosene-oxygen' },
  fairing: { kind: 'fairing', name: 'Payload fairing', dryMassKg: 900, cost: 180_000, topNode: 'fairing', bottomNode: 'structural', fairing: true },
  'solar-array': { kind: 'solar-array', name: 'Solar array', dryMassKg: 180, cost: 95_000, topNode: 'electrical', bottomNode: 'structural', electricGenerationW: 2400 },
  'optical-sensor': { kind: 'optical-sensor', name: 'Optical sensor', dryMassKg: 85, cost: 120_000, topNode: 'payload', bottomNode: 'structural', electricConsumptionW: 360 },
  'synthetic-radar': { kind: 'synthetic-radar', name: 'Synthetic aperture radar', dryMassKg: 320, cost: 340_000, topNode: 'payload', bottomNode: 'structural', electricConsumptionW: 1650 },
  rtg: { kind: 'rtg', name: 'Radioisotope generator', dryMassKg: 210, cost: 780_000, topNode: 'electrical', bottomNode: 'structural', electricGenerationW: 550 },
  'satellite-payload': { kind: 'satellite-payload', name: 'Satellite payload bus', dryMassKg: 750, cost: 430_000, topNode: 'payload', bottomNode: 'structural' },
}

export interface VehiclePart {
  id: string
  kind: PartKind
  /** Side-mounted payload hardware and aerodynamic shells do not interrupt the axial stack. */
  mountMode?: 'stack' | 'side' | 'shell'
  /** Vertical position in metres relative to the stack's bottom datum. */
  positionM: number
  /** Stage number, starting at 0 for the first/bottom stage. */
  stage: number
  /** Optional fraction of tank capacity initially loaded, from 0 to 1. */
  fuelFraction?: number
}

export interface VehicleBuild {
  parts: VehiclePart[]
  /** Requested separation impulse; applied to the detached stack, in N·s. */
  separationImpulseNs: number
}

export interface ConnectionResult {
  valid: boolean
  reason?: string
  lowerPartId?: string
  upperPartId?: string
}

export interface BuildStats {
  wetMassKg: number
  dryMassKg: number
  propellantMassKg: number
  centerOfMassM: number
  thrustN: number
  thrustToWeight: number
  cost: number
  budgetRemaining: number
  solarPowerAvailableW: number
  instrumentPowerDemandW: number
  powerSurplusW: number
  instrumentsPowered: boolean
  compatible: boolean
  connectionErrors: ConnectionResult[]
  engines: Array<{ partId: string; fuelType?: FuelType; flowKgPerSecond: number; burnTimeSeconds: number }>
}

export interface SeparationResult {
  build: VehicleBuild
  detachedParts: VehiclePart[]
  detachedMassKg: number
  remainingMassKg: number
  impulseNs: number
  /** Approximate velocity change of the detached stage in m/s. */
  deltaVelocityMPerSecond: number
  separatedStage: number
  complete: boolean
}

const definition = (part: VehiclePart): PartDefinition => PART_CATALOG[part.kind]
export const partMassKg = (part: VehiclePart): number => {
  const d = definition(part)
  return d.dryMassKg + (d.fuelCapacityKg ?? 0) * clamp(part.fuelFraction ?? 1, 0, 1)
}
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n))

export function createBuild(parts: VehiclePart[] = [], separationImpulseNs = 1200): VehicleBuild {
  return { parts: parts.map(p => ({ ...p })), separationImpulseNs: Math.max(0, separationImpulseNs) }
}

export function addPart(build: VehicleBuild, part: VehiclePart): VehicleBuild {
  if (build.parts.some(existing => existing.id === part.id)) throw new Error(`Duplicate part id: ${part.id}`)
  if (!Number.isFinite(part.positionM) || !Number.isInteger(part.stage) || part.stage < 0) throw new Error('Part position must be finite and stage must be a non-negative integer')
  if (part.fuelFraction !== undefined && (part.fuelFraction < 0 || part.fuelFraction > 1)) throw new Error('fuelFraction must be between 0 and 1')
  return { ...build, parts: [...build.parts.map(p => ({ ...p })), { ...part }].sort((a, b) => a.positionM - b.positionM || a.id.localeCompare(b.id)) }
}

export function removePart(build: VehicleBuild, partId: string): VehicleBuild {
  return { ...build, parts: build.parts.filter(part => part.id !== partId).map(p => ({ ...p })) }
}

/** Validates the actual bottom-to-top stack; gaps between positions are allowed. */
export function validateConnections(parts: readonly VehiclePart[]): ConnectionResult[] {
  const ordered = [...parts].filter(part => (part.mountMode ?? 'stack') === 'stack').sort((a, b) => a.positionM - b.positionM || a.id.localeCompare(b.id))
  const errors: ConnectionResult[] = []
  for (let i = 1; i < ordered.length; i += 1) {
    const lower = ordered[i - 1]
    const upper = ordered[i]
    const lowNode = definition(lower).topNode
    const highNode = definition(upper).bottomNode
    if (lowNode === null || highNode === null || lowNode !== highNode) {
      errors.push({ valid: false, reason: `${lower.id} top node (${lowNode ?? 'none'}) does not match ${upper.id} bottom node (${highNode ?? 'none'})`, lowerPartId: lower.id, upperPartId: upper.id })
    }
  }
  return errors
}

export function arePartsCompatible(lower: VehiclePart, upper: VehiclePart): ConnectionResult {
  const a = definition(lower).topNode
  const b = definition(upper).bottomNode
  return a !== null && a === b
    ? { valid: true, lowerPartId: lower.id, upperPartId: upper.id }
    : { valid: false, reason: `Top node ${a ?? 'none'} is incompatible with bottom node ${b ?? 'none'}`, lowerPartId: lower.id, upperPartId: upper.id }
}

export function calculateBuildStats(build: VehicleBuild, budget = Number.POSITIVE_INFINITY): BuildStats {
  const errors = validateConnections(build.parts)
  let dry = 0, propellant = 0, weightedPosition = 0, thrust = 0, cost = 0, solar = 0, demand = 0
  const engines: BuildStats['engines'] = []
  for (const part of build.parts) {
    const d = definition(part)
    const fuel = (d.fuelCapacityKg ?? 0) * clamp(part.fuelFraction ?? 1, 0, 1)
    dry += d.dryMassKg
    propellant += fuel
    weightedPosition += part.positionM * (d.dryMassKg + fuel)
    cost += d.cost
    solar += d.electricGenerationW ?? 0
    demand += d.electricConsumptionW ?? 0
    if (d.thrustSeaLevelN) {
      thrust += d.thrustSeaLevelN
      const compatibleFuel = build.parts.filter(t => t.kind === 'tank' && (!d.fuelType || definition(t).fuelType === d.fuelType))
      const available = compatibleFuel.reduce((sum, t) => sum + (PART_CATALOG.tank.fuelCapacityKg ?? 0) * clamp(t.fuelFraction ?? 1, 0, 1), 0)
      const flow = d.propellantFlowKgPerSecond ?? 0
      engines.push({ partId: part.id, fuelType: d.fuelType, flowKgPerSecond: flow, burnTimeSeconds: flow > 0 ? available / flow : 0 })
    }
  }
  const wet = dry + propellant
  return {
    wetMassKg: wet,
    dryMassKg: dry,
    propellantMassKg: propellant,
    centerOfMassM: wet > 0 ? weightedPosition / wet : 0,
    thrustN: thrust,
    thrustToWeight: wet > 0 ? thrust / (wet * STANDARD_SEA_LEVEL_G_M_S2) : 0,
    cost,
    budgetRemaining: budget - cost,
    solarPowerAvailableW: solar,
    instrumentPowerDemandW: demand,
    powerSurplusW: solar - demand,
    instrumentsPowered: solar >= demand,
    compatible: errors.length === 0,
    connectionErrors: errors,
    engines,
  }
}

/** Detaches the lowest remaining stage (all parts assigned its stage), then advances. */
export function separateNextStage(build: VehicleBuild): SeparationResult | null {
  if (build.parts.length === 0) return null
  const stages = [...new Set(build.parts.map(p => p.stage))].sort((a, b) => a - b)
  const separatedStage = stages[0]
  const detachedParts = build.parts.filter(p => p.stage === separatedStage).map(p => ({ ...p }))
  const remaining = build.parts.filter(p => p.stage !== separatedStage).map(p => ({ ...p }))
  const detachedMassKg = detachedParts.reduce((sum, p) => sum + partMassKg(p), 0)
  const remainingMassKg = remaining.reduce((sum, p) => sum + partMassKg(p), 0)
  const impulseNs = build.separationImpulseNs
  return {
    build: { ...build, parts: remaining }, detachedParts, detachedMassKg, remainingMassKg,
    impulseNs, deltaVelocityMPerSecond: detachedMassKg > 0 ? impulseNs / detachedMassKg : 0,
    separatedStage, complete: remaining.length === 0,
  }
}

/** Fairings may be jettisoned once no longer needed; returns a new build and the discarded pieces. */
export function jettisonFairings(build: VehicleBuild): { build: VehicleBuild; detachedParts: VehiclePart[]; detachedMassKg: number } {
  const detachedParts = build.parts.filter(p => definition(p).fairing).map(p => ({ ...p }))
  const detachedMassKg = detachedParts.reduce((sum, p) => sum + partMassKg(p), 0)
  return { build: { ...build, parts: build.parts.filter(p => !definition(p).fairing).map(p => ({ ...p })) }, detachedParts, detachedMassKg }
}
