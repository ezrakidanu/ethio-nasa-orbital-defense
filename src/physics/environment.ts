import { EARTH, magnitude, type Vec3 } from './orbit'

/** Deliberately simple scale-height atmosphere suitable for gameplay and offline simulation, not precision aerodynamics. */
export const ATMOSPHERE = { seaLevelDensity:1.225, scaleHeight:8500, cutoffAltitude:150_000, referenceTemperature:288.15 } as const
export const SUTTON_GRAVES = { coefficient:1.83e-4, noseRadiusDefault:1, effectiveAblationHeat:2.5e7 } as const // SI convention: qdot W/m²; Q* in J/kg
export interface AtmosphericState { altitude:number; density:number; velocityRelative:Vec3; speed:number; dynamicPressure:number }
export function atmosphericDensity(altitude:number):number {
  if(!Number.isFinite(altitude)||altitude>=ATMOSPHERE.cutoffAltitude) return 0
  return ATMOSPHERE.seaLevelDensity*Math.exp(-Math.max(0,altitude)/ATMOSPHERE.scaleHeight)
}
export function atmosphereAt(position:Vec3,inertialVelocity:Vec3,rotationRate=EARTH.rotationRate):AtmosphericState {
  const altitude=magnitude(position)-EARTH.meanRadius
  const wind={x:-rotationRate*position.y,y:rotationRate*position.x,z:0}
  const velocityRelative={x:inertialVelocity.x-wind.x,y:inertialVelocity.y-wind.y,z:inertialVelocity.z}
  const speed=magnitude(velocityRelative),density=atmosphericDensity(altitude)
  return {altitude,density,velocityRelative,speed,dynamicPressure:.5*density*speed*speed}
}
export function aerodynamicDrag(position:Vec3,velocity:Vec3,area:number,dragCoefficient=2.2,mass=1):Vec3 {
  if(area<0||dragCoefficient<0||mass<=0) throw new RangeError('area and drag coefficient must be non-negative; mass must be positive')
  const atm=atmosphereAt(position,velocity); if(!atm.speed||!atm.density||!area||!dragCoefficient)return {x:0,y:0,z:0}
  const factor=-.5*atm.density*dragCoefficient*area*atm.speed/mass
  return {x:factor*atm.velocityRelative.x,y:factor*atm.velocityRelative.y,z:factor*atm.velocityRelative.z}
}
/** Sutton-Graves stagnation-point convective heat flux in W/m². Coefficient convention assumes SI and Earth's air. */
export function stagnationHeatFlux(density:number,speed:number,noseRadius=SUTTON_GRAVES.noseRadiusDefault,coefficient=SUTTON_GRAVES.coefficient):number {
  if(density<0||noseRadius<=0||coefficient<0) throw new RangeError('density/coefficient must be non-negative and nose radius positive')
  return coefficient*Math.sqrt(density/noseRadius)*speed**3
}
export interface AblationEstimate { heatFlux:number; massLossRate:number; estimatedMassLoss:number }
/** Energy-limited ablation estimate; explicitly an approximation, with no material-specific chemistry. */
export function estimateAblation(density:number,speed:number,area:number,exposureSeconds:number,noseRadius=SUTTON_GRAVES.noseRadiusDefault,effectiveAblationHeat=SUTTON_GRAVES.effectiveAblationHeat):AblationEstimate {
  if(area<0||exposureSeconds<0||effectiveAblationHeat<=0) throw new RangeError('area/time must be non-negative and effective ablation heat positive')
  const heatFlux=stagnationHeatFlux(density,speed,noseRadius)
  const massLossRate=heatFlux*area/effectiveAblationHeat
  return {heatFlux,massLossRate,estimatedMassLoss:massLossRate*exposureSeconds}
}
