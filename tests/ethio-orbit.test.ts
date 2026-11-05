import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EARTH, atmosphericDensity, dynamicPressure, gravityJ2, orbitalElements, predictTrajectory, rk4Step, sphereOfInfluence, type FlightState } from '../src/ethio/physics/orbit';

const close = (a:number,b:number,tol:number) => expect(Math.abs(a-b)).toBeLessThanOrEqual(tol);
describe('orbital physics',()=>{
  it('has inverse-square gravity and finite J2 acceleration',()=>{
    const r=7e6, g1=gravityJ2(new THREE.Vector3(r,0,0),EARTH.mu,0), g2=gravityJ2(new THREE.Vector3(2*r,0,0),EARTH.mu,0);
    close(g1.x/g2.x,4,1e-12);
    expect(gravityJ2(new THREE.Vector3(r,0,r)).toArray().every(Number.isFinite)).toBe(true);
  });
  it('models exponential density and dynamic pressure',()=>{
    close(atmosphericDensity(8500),EARTH.rho0/Math.E,1e-12);
    expect(dynamicPressure(1.2,100)).toBe(6000);
  });
  it('advances RK4 without mutating input and approximately conserves a circular orbit',()=>{
    const radius=EARTH.radius+400000, speed=Math.sqrt(EARTH.mu/radius);
    const state:FlightState={position:new THREE.Vector3(radius,0,0),velocity:new THREE.Vector3(0,speed,0),massKg:1000,propellantKg:0,heatFlux:0,ablatorKg:0};
    const next=rk4Step(state,10,{j2:0});
    expect(state.position.x).toBe(radius);
    expect(next.position.y).toBeGreaterThan(0);
    const initial=orbitalElements(state.position,state.velocity,EARTH.mu,EARTH.radius);
    const after=orbitalElements(next.position,next.velocity,EARTH.mu,EARTH.radius);
    expect(Math.abs(after.specificEnergy-initial.specificEnergy)).toBeLessThan(0.01);
    expect(next.position.toArray().every(Number.isFinite)).toBe(true);
  });
  it('returns circular-orbit elements and impact-free trajectory samples',()=>{
    const radius=EARTH.radius+400000, speed=Math.sqrt(EARTH.mu/radius);
    const p=new THREE.Vector3(radius,0,0), v=new THREE.Vector3(0,speed,0), el=orbitalElements(p,v,EARTH.mu,EARTH.radius);
    expect(el.eccentricity).toBeLessThan(1e-12);
    close(el.periapsisAltitude,400000,1e-6);
    expect(el.period).toBeGreaterThan(5000);
    const samples=predictTrajectory({position:p,velocity:v,massKg:1,propellantKg:0,heatFlux:0,ablatorKg:0},20,10,{j2:0});
    expect(samples).toHaveLength(21);
    expect(samples.every(x=>x.length()>EARTH.radius)).toBe(true);
    expect(samples[0]).not.toBe(p);
  });
  it('orders Laplace spheres of influence with orbital radius and mass ratio',()=>{
    const small=sphereOfInfluence(1e8,1e20,1e30), large=sphereOfInfluence(2e8,1e20,1e30);
    expect(large).toBeGreaterThan(small);
    expect(sphereOfInfluence(1e8,1e21,1e30)).toBeGreaterThan(small);
  });
});
