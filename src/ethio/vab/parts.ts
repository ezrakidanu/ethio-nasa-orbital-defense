export type PartCategory =
  | 'capsule'
  | 'tank'
  | 'engine'
  | 'decoupler'
  | 'fairing'
  | 'power'
  | 'science'
  | 'payload'
  | 'rover';

export type AttachMode = 'stack' | 'radial' | 'surface' | 'payload';

export interface PartDefinition {
  id: string;
  category: PartCategory;
  displayName: string;
  dryMassKg: number;
  propellantCapacityKg: number;
  thrustN: number;
  ispSeconds: number;
  flowKgPerSecond: number;
  electricalGenerationW: number;
  electricalDemandW: number;
  scienceValue: number;
  cost: number;
  color: string;
  attachMode: AttachMode;
}

export interface BuiltPart {
  uid: string;
  typeId: string;
  parentUid?: string;
  attachment: AttachMode;
  stage: number;
}

export interface BuildPlan {
  parts: BuiltPart[];
  budget: number;
}

export interface StageSummary {
  stage: number;
  partCount: number;
  dryMassKg: number;
  fuelKg: number;
  wetMassKg: number;
  thrustN: number;
  generatedPowerW: number;
  consumedPowerW: number;
}

export interface VehicleStats {
  dryMassKg: number;
  fuelKg: number;
  wetMassKg: number;
  maxThrustN: number;
  twr: number;
  generatedPowerW: number;
  consumedPowerW: number;
  netPowerW: number;
  scienceScore: number;
  totalCost: number;
  stageSummaries: StageSummary[];
}

export const PARTS: Readonly<Record<string, PartDefinition>> = Object.freeze({
  command_capsule: { id: 'command_capsule', category: 'capsule', displayName: 'Kestrel Command Capsule', dryMassKg: 1200, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 180, scienceValue: 0, cost: 18000, color: '#4f6d8a', attachMode: 'stack' },
  tank_light: { id: 'tank_light', category: 'tank', displayName: 'Pintle Lightweight Tank', dryMassKg: 350, propellantCapacityKg: 1800, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 0, scienceValue: 0, cost: 4200, color: '#aab6c2', attachMode: 'stack' },
  tank_large: { id: 'tank_large', category: 'tank', displayName: 'Atlas Large Tank', dryMassKg: 900, propellantCapacityKg: 5200, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 0, scienceValue: 0, cost: 9500, color: '#8797a6', attachMode: 'stack' },
  engine_orbital: { id: 'engine_orbital', category: 'engine', displayName: 'Mica Orbital Engine', dryMassKg: 240, propellantCapacityKg: 0, thrustN: 22000, ispSeconds: 315, flowKgPerSecond: 7.1, electricalGenerationW: 0, electricalDemandW: 80, scienceValue: 0, cost: 12500, color: '#d97842', attachMode: 'stack' },
  engine_high_thrust: { id: 'engine_high_thrust', category: 'engine', displayName: 'Badger High-Thrust Engine', dryMassKg: 1150, propellantCapacityKg: 0, thrustN: 680000, ispSeconds: 285, flowKgPerSecond: 243, electricalGenerationW: 0, electricalDemandW: 140, scienceValue: 0, cost: 32000, color: '#c76639', attachMode: 'stack' },
  decoupler: { id: 'decoupler', category: 'decoupler', displayName: 'Single-Use Decoupler', dryMassKg: 90, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 0, scienceValue: 0, cost: 1500, color: '#e4b54d', attachMode: 'stack' },
  fairing: { id: 'fairing', category: 'fairing', displayName: 'Payload Fairing', dryMassKg: 260, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 0, scienceValue: 0, cost: 3800, color: '#d7dce2', attachMode: 'stack' },
  solar_array: { id: 'solar_array', category: 'power', displayName: 'Fold-Out Solar Array', dryMassKg: 75, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 420, electricalDemandW: 0, scienceValue: 0, cost: 2400, color: '#397bb5', attachMode: 'radial' },
  battery: { id: 'battery', category: 'power', displayName: 'Compact Battery', dryMassKg: 110, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 0, scienceValue: 0, cost: 1600, color: '#527c55', attachMode: 'surface' },
  science_instrument: { id: 'science_instrument', category: 'science', displayName: 'Asteria Science Sensor', dryMassKg: 65, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 120, scienceValue: 32, cost: 5200, color: '#6c9c83', attachMode: 'payload' },
  defensive_payload: { id: 'defensive_payload', category: 'payload', displayName: 'Shielded Test Payload', dryMassKg: 420, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 35, scienceValue: 4, cost: 7400, color: '#8574a4', attachMode: 'payload' },
  rover_six_wheel: { id: 'rover_six_wheel', category: 'rover', displayName: 'Six-Wheel Survey Rover', dryMassKg: 680, propellantCapacityKg: 0, thrustN: 0, ispSeconds: 0, flowKgPerSecond: 0, electricalGenerationW: 0, electricalDemandW: 260, scienceValue: 48, cost: 14500, color: '#b7773d', attachMode: 'payload' },
});

let nextUid = 1;
function allocateUid(): string {
  return `part-${nextUid++}`;
}

export function starterBuild(): BuildPlan {
  const capsule: BuiltPart = { uid: allocateUid(), typeId: 'command_capsule', attachment: 'stack', stage: 0 };
  const tank: BuiltPart = { uid: allocateUid(), typeId: 'tank_light', parentUid: capsule.uid, attachment: 'stack', stage: 1 };
  const engine: BuiltPart = { uid: allocateUid(), typeId: 'engine_orbital', parentUid: tank.uid, attachment: 'stack', stage: 1 };
  const solar: BuiltPart = { uid: allocateUid(), typeId: 'solar_array', parentUid: capsule.uid, attachment: 'radial', stage: 0 };
  const science: BuiltPart = { uid: allocateUid(), typeId: 'science_instrument', parentUid: capsule.uid, attachment: 'payload', stage: 0 };
  return { parts: [capsule, tank, engine, solar, science], budget: 100000 };
}

export function addPart(plan: BuildPlan, typeId: string, parentUid?: string, attachment?: AttachMode): BuildPlan {
  const definition = PARTS[typeId];
  if (!definition) throw new Error(`Unknown part type: ${typeId}`);
  if (parentUid && !plan.parts.some((part) => part.uid === parentUid)) throw new Error(`Parent part not found: ${parentUid}`);
  const attach = attachment ?? definition.attachMode;
  if (attach !== definition.attachMode) throw new Error(`${definition.displayName} requires ${definition.attachMode} attachment`);
  if (plan.parts.length && !parentUid) throw new Error('A parent part is required for non-root attachments');
  const built: BuiltPart = { uid: allocateUid(), typeId, ...(parentUid ? { parentUid } : {}), attachment: attach, stage: 0 };
  return { ...plan, parts: [...plan.parts, built] };
}

export function removePart(plan: BuildPlan, uid: string): BuildPlan {
  if (!plan.parts.some((part) => part.uid === uid)) return { ...plan, parts: [...plan.parts] };
  const remove = new Set<string>([uid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const part of plan.parts) if (part.parentUid && remove.has(part.parentUid) && !remove.has(part.uid)) { remove.add(part.uid); changed = true; }
  }
  return { ...plan, parts: plan.parts.filter((part) => !remove.has(part.uid)) };
}

export function setStage(plan: BuildPlan, uid: string, stage: number): BuildPlan {
  if (!Number.isInteger(stage) || stage < 0) throw new Error('Stage must be a non-negative integer');
  if (!plan.parts.some((part) => part.uid === uid)) throw new Error(`Part not found: ${uid}`);
  return { ...plan, parts: plan.parts.map((part) => part.uid === uid ? { ...part, stage } : part) };
}

export function computeStats(plan: BuildPlan): VehicleStats {
  const stageMap = new Map<number, StageSummary>();
  let dryMassKg = 0, fuelKg = 0, maxThrustN = 0, generatedPowerW = 0, consumedPowerW = 0, scienceScore = 0, totalCost = 0;
  for (const part of plan.parts) {
    const def = PARTS[part.typeId];
    if (!def) continue;
    dryMassKg += def.dryMassKg; fuelKg += def.propellantCapacityKg; maxThrustN += def.thrustN;
    generatedPowerW += def.electricalGenerationW; consumedPowerW += def.electricalDemandW;
    scienceScore += def.scienceValue; totalCost += def.cost;
    const stage = stageMap.get(part.stage) ?? { stage: part.stage, partCount: 0, dryMassKg: 0, fuelKg: 0, wetMassKg: 0, thrustN: 0, generatedPowerW: 0, consumedPowerW: 0 };
    stage.partCount++; stage.dryMassKg += def.dryMassKg; stage.fuelKg += def.propellantCapacityKg; stage.wetMassKg += def.dryMassKg + def.propellantCapacityKg;
    stage.thrustN += def.thrustN; stage.generatedPowerW += def.electricalGenerationW; stage.consumedPowerW += def.electricalDemandW;
    stageMap.set(part.stage, stage);
  }
  const wetMassKg = dryMassKg + fuelKg;
  return { dryMassKg, fuelKg, wetMassKg, maxThrustN, twr: wetMassKg ? maxThrustN / (wetMassKg * 9.80665) : 0, generatedPowerW, consumedPowerW, netPowerW: generatedPowerW - consumedPowerW, scienceScore, totalCost, stageSummaries: [...stageMap.values()].sort((a, b) => a.stage - b.stage) };
}

export function validateBuild(plan: BuildPlan): string[] {
  const problems: string[] = [];
  const definitions = plan.parts.map((part) => PARTS[part.typeId]).filter(Boolean);
  if (!definitions.some((part) => part.category === 'capsule')) problems.push('Add a crew-rated command capsule before launch.');
  if (!definitions.some((part) => part.category === 'engine' && part.thrustN > 0)) problems.push('Add at least one engine before launch.');
  if (definitions.some((part) => part.category === 'engine' && part.flowKgPerSecond > 0) && !definitions.some((part) => part.category === 'tank' && part.propellantCapacityKg > 0)) problems.push('Add a propellant tank for the installed engine(s).');
  const stats = computeStats(plan);
  if (stats.totalCost > plan.budget) problems.push(`Over budget: build costs ${stats.totalCost}, budget is ${plan.budget}.`);
  if (stats.consumedPowerW > stats.generatedPowerW) problems.push(`Power deficit: demand is ${stats.consumedPowerW} W but generation is ${stats.generatedPowerW} W.`);
  return problems;
}
