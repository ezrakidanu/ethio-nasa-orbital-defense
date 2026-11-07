import { aerodynamicDrag } from './environment'

/** SI units throughout. Earth constants use the WGS-84 / conventional gravitational parameter set. */
export const EARTH = {
  mu: 3.986004418e14, // m^3 s^-2
  meanRadius: 6_371_000, // m
  equatorialRadius: 6_378_137, // m
  j2: 1.08262668e-3,
  rotationRate: 7.2921150e-5, // rad s^-1
} as const

export type Vec3 = { x: number; y: number; z: number }
export interface OrbitalState { position: Vec3; velocity: Vec3; mass: number; time: number }
export interface KeplerianElements {
  semiMajorAxis: number | null; eccentricity: number; inclination: number; ascendingNode: number | null;
  argumentOfPeriapsis: number | null; trueAnomaly: number | null; periapsis: number | null; apoapsis: number | null;
  specificEnergy: number; bound: boolean
}
export interface VehicleParameters { area: number; dragCoefficient?: number; thrust?: number; specificImpulse?: number; fuelMassFlow?: number; dryMassKg?: number }
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
const scale=(a:Vec3,s:number):Vec3=>({x:a.x*s,y:a.y*s,z:a.z*s})
export const magnitude=(a:Vec3):number=>Math.hypot(a.x,a.y,a.z)
export const dot=(a:Vec3,b:Vec3):number=>a.x*b.x+a.y*b.y+a.z*b.z
export const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x})
function acceleration(r:Vec3, mu:number=EARTH.mu, j2:number=EARTH.j2):Vec3 {
  const radius=magnitude(r); if (!(radius>0)) return {x:0,y:0,z:0}
  const r2=radius*radius, z2=r.z*r.z, common=-mu/(radius*r2)
  const factor=1.5*j2*(EARTH.equatorialRadius**2/r2)
  const q=5*z2/r2
  return {x:common*r.x*(1+factor*(1-q)),y:common*r.y*(1+factor*(1-q)),z:common*r.z*(1+factor*(3-q))}
}
export function gravitationalAcceleration(position:Vec3, includeJ2=true):Vec3 { return acceleration(position,EARTH.mu,includeJ2?EARTH.j2:0) }
interface Derivative { dr:Vec3; dv:Vec3; dm:number }
function derivative(s:OrbitalState, vehicle?:VehicleParameters):Derivative {
  let a=gravitationalAcceleration(s.position)
  if(vehicle&&vehicle.area>0&&s.mass>0) {
    const drag=aerodynamicDrag(s.position,s.velocity,vehicle.area,vehicle.dragCoefficient??2.2,s.mass)
    a=add(a,drag)
  }
  let dm=0
  if (vehicle && vehicle.thrust && vehicle.thrust>0 && s.mass>(vehicle.dryMassKg??0)) {
    const direction=magnitude(s.velocity)>0?scale(s.velocity,1/magnitude(s.velocity)):{x:0,y:0,z:0}
    a=add(a,scale(direction,vehicle.thrust/s.mass))
    dm=vehicle.fuelMassFlow!==undefined?-Math.abs(vehicle.fuelMassFlow):vehicle.specificImpulse? -vehicle.thrust/(vehicle.specificImpulse*9.80665):0
  }
  return {dr:s.velocity,dv:a,dm}
}
function combine(s:OrbitalState, terms:readonly [Derivative,number][], dt:number, minimumMass=0):OrbitalState {
  let dr={x:0,y:0,z:0},dv={x:0,y:0,z:0},dm=0
  for(const [d,w] of terms){dr=add(dr,scale(d.dr,w));dv=add(dv,scale(d.dv,w));dm+=d.dm*w}
  return {position:add(s.position,scale(dr,dt)),velocity:add(s.velocity,scale(dv,dt)),mass:Math.max(minimumMass,s.mass+dm*dt),time:s.time+dt}
}
/** One classical fourth-order Runge-Kutta step. */
export function rk4Step(state:OrbitalState,dt:number,vehicle?:VehicleParameters):OrbitalState {
  if(!Number.isFinite(dt)||dt<=0) throw new RangeError('dt must be finite and positive')
  const dryMass=vehicle?.dryMassKg??0, available=vehicle?Math.max(0,state.mass-dryMass):0
  const nominalFlow=vehicle?.fuelMassFlow!==undefined?Math.abs(vehicle.fuelMassFlow):vehicle?.thrust&&vehicle.specificImpulse?vehicle.thrust/(vehicle.specificImpulse*9.80665):0
  const fuelScale=nominalFlow>0&&nominalFlow*dt>available?available/(nominalFlow*dt):1
  const stepVehicle=vehicle&&fuelScale<1?{...vehicle,thrust:(vehicle.thrust??0)*fuelScale,fuelMassFlow:vehicle.fuelMassFlow===undefined?undefined:vehicle.fuelMassFlow*fuelScale}:vehicle
  const k1=derivative(state,stepVehicle), k2=derivative(combine(state,[[k1,.5]],dt,dryMass),stepVehicle), k3=derivative(combine(state,[[k2,.5]],dt,dryMass),stepVehicle), k4=derivative(combine(state,[[k3,1]],dt,dryMass),stepVehicle)
  return combine(state,[[k1,1/6],[k2,1/3],[k3,1/3],[k4,1/6]],dt,dryMass)
}
export function propagate(state:OrbitalState,duration:number,stepSeconds=1,vehicle?:VehicleParameters):OrbitalState {
  if(duration<0||stepSeconds<=0) throw new RangeError('duration must be non-negative and stepSeconds positive')
  let s={...state,position:{...state.position},velocity:{...state.velocity}},left=duration
  while(left>1e-10){const dt=Math.min(left,stepSeconds);s=rk4Step(s,dt,vehicle);left-=dt}
  return s
}
export function orbitalElements(s:Pick<OrbitalState,'position'|'velocity'>,mu=EARTH.mu):KeplerianElements {
  const r=s.position,v=s.velocity,rm=magnitude(r),vm=magnitude(v),h=cross(r,v),hm=magnitude(h),energy=vm*vm/2-mu/rm
  if(!(rm>0)||!(mu>0)) throw new RangeError('position radius and mu must be positive')
  const ev=add(scale(cross(v,h),1/mu),scale(r,-1/rm)), e=magnitude(ev), bound=energy<0, a=bound?-mu/(2*energy):null
  const inc=hm>1e-14?Math.acos(Math.max(-1,Math.min(1,h.z/hm))):0
  const n=cross({x:0,y:0,z:1},h),nm=magnitude(n), node=nm>1e-12?Math.atan2(n.y,n.x):null
  const arg=nm>1e-12&&e>1e-12?Math.atan2(dot(cross(n,ev),h)/(nm*e*hm),dot(n,ev)/(nm*e)):null
  const nu=e>1e-12?Math.atan2(dot(cross(ev,r),h)/(e*rm*hm),dot(ev,r)/(e*rm)):Math.atan2(r.y,r.x)
  const p=hm*hm/mu, peri=p/(1+e), apo=bound&&a!==null?a*(1+e):null
  return {semiMajorAxis:a,eccentricity:e,inclination:inc,ascendingNode:node,argumentOfPeriapsis:arg,trueAnomaly:nu,periapsis:peri,apoapsis:apo,specificEnergy:energy,bound}
}
/** Samples an ideal two-body conic. Returns an empty array for an unbound orbit. */
export function predictTrajectory(state:Pick<OrbitalState,'position'|'velocity'>,samples=180):Vec3[] {
  if(samples<2) throw new RangeError('samples must be at least 2')
  const el=orbitalElements(state); if(!el.bound||!el.semiMajorAxis) return []
  const h=cross(state.position,state.velocity),hn=magnitude(h), normal=scale(h,1/hn), ev=add(scale(cross(state.velocity,h),1/EARTH.mu),scale(state.position,-1/magnitude(state.position))), e=magnitude(ev)
  const peri=e>1e-10?scale(ev,1/e):scale(state.position,1/magnitude(state.position)), side=cross(normal,peri), p=hn*hn/EARTH.mu
  const end=e<1?Math.PI:Math.PI
  return Array.from({length:samples},(_,i)=>{const nu=-end+2*end*i/(samples-1),rr=p/(1+e*Math.cos(nu));return add(scale(peri,rr*Math.cos(nu)),scale(side,rr*Math.sin(nu)))})
}
export { add as addVectors, scale as scaleVector }
