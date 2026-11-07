import { describe, expect, it } from 'vitest'
import { EARTH, orbitalElements, propagate, rk4Step, type OrbitalState } from '../src/physics/orbit'
import { atmosphericDensity, atmosphereAt, estimateAblation, stagnationHeatFlux } from '../src/physics/environment'
import { createWorkerRuntime, handlePhysicsCommand, PHYSICS_STEP_SECONDS } from '../src/physics/worker'

const circular=():OrbitalState=>{const radius=EARTH.meanRadius+400_000;return {position:{x:radius,y:0,z:0},velocity:{x:0,y:Math.sqrt(EARTH.mu/radius),z:0},mass:1000,time:0}}

describe('orbital physics',()=>{
  it('derives circular-orbit elements and handles parabolic/unbound orbits',()=>{
    const state=circular(),el=orbitalElements(state)
    expect(el.semiMajorAxis).toBeCloseTo(EARTH.meanRadius+400_000,0)
    expect(el.eccentricity).toBeLessThan(1e-12)
    expect(el.inclination).toBeCloseTo(0,8)
    expect(el.apoapsis).toBeCloseTo(el.periapsis!,2)
    const escaping={...state,velocity:{x:0,y:Math.sqrt(2*EARTH.mu/(EARTH.meanRadius+400_000))*1.1,z:0}}
    expect(orbitalElements(escaping).bound).toBe(false)
    expect(orbitalElements(escaping).semiMajorAxis).toBeNull()
  })
  it('preserves two-body specific energy closely through short RK4 propagation',()=>{
    const state=circular(),initial=orbitalElements(state).specificEnergy
    let next=state
    for(let i=0;i<120;i++) next=rk4Step(next,1/120)
    expect(orbitalElements(next).specificEnergy).toBeCloseTo(initial,2)
    expect(next.time).toBeCloseTo(1,10)
    expect(propagate(state,1,1/120).position.x).toBeCloseTo(next.position.x,7)
  })
  it('computes altitude-dependent atmosphere, corotating relative flow, heating and ablation',()=>{
    expect(atmosphericDensity(0)).toBeCloseTo(1.225)
    expect(atmosphericDensity(150_000)).toBe(0)
    const p={x:EARTH.meanRadius+100_000,y:0,z:0},v={x:0,y:7500,z:0},atm=atmosphereAt(p,v)
    expect(atm.dynamicPressure).toBeGreaterThan(0)
    expect(atm.velocityRelative.y).toBeLessThan(v.y)
    expect(stagnationHeatFlux(atm.density,7500)).toBeGreaterThan(0)
    expect(estimateAblation(atm.density,7500,10,5).estimatedMassLoss).toBeGreaterThan(0)
  })
  it('supports deterministic worker init, fixed-step advance, running state and disposal',()=>{
    const rt=createWorkerRuntime(),init=handlePhysicsCommand(rt,{type:'init',state:circular()})
    expect(init.type).toBe('ready')
    const start=rt.state!.time
    const advanced=handlePhysicsCommand(rt,{type:'advance',steps:3})
    expect(advanced.type).toBe('state')
    expect(rt.state!.time-start).toBeCloseTo(3*PHYSICS_STEP_SECONDS,12)
    expect(rt.simulatedSteps).toBe(3)
    expect(handlePhysicsCommand(rt,{type:'set-running',running:true})).toMatchObject({type:'state',running:true})
    expect(handlePhysicsCommand(rt,{type:'dispose'})).toEqual({type:'disposed'})
    expect(handlePhysicsCommand(rt,{type:'advance'}).type).toBe('error')
  })
})
