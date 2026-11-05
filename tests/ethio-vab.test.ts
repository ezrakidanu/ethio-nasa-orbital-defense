import { describe, expect, it } from 'vitest';
import { addPart, computeStats, PARTS, removePart, setStage, starterBuild, validateBuild, type BuildPlan } from '../src/ethio/vab/parts';

describe('VAB build model', () => {
  it('provides a launchable starter build with science and power generation', () => {
    const plan = starterBuild();
    const stats = computeStats(plan);
    expect(validateBuild(plan)).toEqual([]);
    expect(stats.scienceScore).toBeGreaterThan(0);
    expect(stats.generatedPowerW).toBeGreaterThan(0);
    expect(stats.netPowerW).toBeGreaterThan(0);
    expect(plan.parts.some((p) => p.typeId === 'science_instrument')).toBe(true);
  });

  it('aggregates mass, fuel, thrust, cost, science and stage summaries', () => {
    const plan = starterBuild();
    const stats = computeStats(plan);
    expect(stats.dryMassKg).toBe(plan.parts.reduce((n, p) => n + PARTS[p.typeId].dryMassKg, 0));
    expect(stats.fuelKg).toBe(1800);
    expect(stats.wetMassKg).toBe(stats.dryMassKg + stats.fuelKg);
    expect(stats.maxThrustN).toBe(22000);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.stageSummaries.map((s) => s.stage)).toEqual([0, 1]);
  });

  it('computes surface TWR from total wet mass', () => {
    const stats = computeStats(starterBuild());
    expect(stats.twr).toBeCloseTo(stats.maxThrustN / (stats.wetMassKg * 9.80665));
    expect(stats.twr).toBeGreaterThan(0);
  });

  it('reports power deficit and budget tradeoffs', () => {
    let plan = starterBuild();
    const capsule = plan.parts.find((p) => p.typeId === 'command_capsule')!;
    plan = addPart(plan, 'rover_six_wheel', capsule.uid, 'payload');
    expect(computeStats(plan).netPowerW).toBeLessThan(0);
    expect(validateBuild(plan).some((problem) => problem.includes('Power deficit'))).toBe(true);
    const overBudget: BuildPlan = { ...plan, budget: 1 };
    expect(validateBuild(overBudget).some((problem) => problem.includes('Over budget'))).toBe(true);
  });

  it('checks part types, parents and attachment modes', () => {
    const plan = starterBuild();
    expect(() => addPart(plan, 'unknown')).toThrow('Unknown part type');
    expect(() => addPart(plan, 'battery', 'missing-parent')).toThrow('Parent part not found');
    const capsule = plan.parts.find((p) => p.typeId === 'command_capsule')!;
    expect(() => addPart(plan, 'solar_array', capsule.uid, 'stack')).toThrow('requires radial attachment');
  });

  it('assigns stages immutably and removes a part together with descendants', () => {
    const original = starterBuild();
    const tank = original.parts.find((p) => p.typeId === 'tank_light')!;
    const staged = setStage(original, tank.uid, 3);
    expect(staged.parts.find((p) => p.uid === tank.uid)?.stage).toBe(3);
    expect(original.parts.find((p) => p.uid === tank.uid)?.stage).toBe(1);
    const removed = removePart(original, tank.uid);
    expect(removed.parts.some((p) => p.uid === tank.uid)).toBe(false);
    expect(removed.parts.some((p) => p.typeId === 'engine_orbital')).toBe(false);
    expect(original.parts.some((p) => p.typeId === 'engine_orbital')).toBe(true);
    expect(() => setStage(original, tank.uid, -1)).toThrow('non-negative');
  });

  it('does not mutate a plan during add, remove, or stage updates', () => {
    const plan = starterBuild();
    const before = JSON.stringify(plan);
    const root = plan.parts[0];
    addPart(plan, 'battery', root.uid, 'surface');
    removePart(plan, root.uid);
    setStage(plan, root.uid, 2);
    expect(JSON.stringify(plan)).toBe(before);
  });
});
