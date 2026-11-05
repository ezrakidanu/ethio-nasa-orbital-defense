import * as THREE from 'three';

/** Earth reference parameters in SI units. */
export const EARTH = {
  mu: 3.986004418e14,
  radius: 6378137,
  j2: 1.08262668e-3,
  omega: 7.292115e-5,
  atmosphereScaleHeight: 8500,
  rho0: 1.225,
} as const;

/** Instantaneous flight state. Position and velocity are game-world units and units/second; mass is kg. */
export interface FlightState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  massKg: number;
  propellantKg: number;
  /** Accumulated heating proxy, W·s/m². */
  heatFlux: number;
  ablatorKg: number;
}

/** Physical model parameters. `scale` is meters per game-world unit (default 1). */
export interface OrbitOptions {
  mu?: number;
  bodyRadius?: number;
  j2?: number;
  dragCoefficient?: number;
  areaM2?: number;
  massFlowKgS?: number;
  maxThrustN?: number;
  throttle?: number;
  ablatorKg?: number;
  /** Optional world-frame thrust axis; defaults to prograde when omitted. */
  thrustDirection?: THREE.Vector3;
  scale?: number;
}

const finite = (n: number | undefined, fallback: number): number => n !== undefined && Number.isFinite(n) ? n : fallback;
const positive = (n: number | undefined, fallback: number): number => Math.max(0, finite(n, fallback));
const scaleOf = (o?: OrbitOptions): number => Math.max(1e-12, positive(o?.scale, 1));

/** Point-mass gravity with the standard J2 zonal-harmonic correction. Input/output acceleration use SI. */
export function gravityJ2(position: THREE.Vector3, mu: number = EARTH.mu, j2: number = EARTH.j2, bodyRadius: number = EARTH.radius): THREE.Vector3 {
  const x = finite(position?.x, 0), y = finite(position?.y, 0), z = finite(position?.z, 0);
  const r2 = x*x + y*y + z*z;
  if (!(r2 > 0) || !Number.isFinite(r2) || !(mu > 0)) return new THREE.Vector3();
  const r = Math.sqrt(r2), invR3 = 1 / (r2 * r);
  const k = 1.5 * finite(j2, 0) * (bodyRadius / r) ** 2;
  const q = 5 * z*z/r2;
  return new THREE.Vector3(-mu*x*invR3*(1-k*(q-1)), -mu*y*invR3*(1-k*(q-1)), -mu*z*invR3*(1-k*(q-3)));
}

/** Exponential atmospheric density in kg/m³, clamped to zero above the atmosphere. */
export function atmosphericDensity(altitudeM: number, rho0 = EARTH.rho0, scaleHeightM = EARTH.atmosphereScaleHeight): number {
  if (!Number.isFinite(altitudeM) || altitudeM < 0 || !(rho0 > 0) || !(scaleHeightM > 0)) return 0;
  return rho0 * Math.exp(-altitudeM / scaleHeightM);
}

/** Dynamic pressure in pascals for speed in m/s. */
export function dynamicPressure(densityKgM3: number, speedMS: number): number {
  if (!(densityKgM3 > 0) || !Number.isFinite(densityKgM3) || !Number.isFinite(speedMS)) return 0;
  return 0.5 * densityKgM3 * speedMS * speedMS;
}

/** Drag acceleration in m/s², opposite velocity; invalid or degenerate inputs yield zero. */
export function dragAcceleration(velocity: THREE.Vector3, densityKgM3: number, dragCoefficient: number, areaM2: number, massKg: number): THREE.Vector3 {
  const speed = velocity?.length?.() ?? 0;
  if (!(speed > 0) || !(densityKgM3 > 0) || !(dragCoefficient >= 0) || !(areaM2 >= 0) || !(massKg > 0) || !Number.isFinite(speed)) return new THREE.Vector3();
  return velocity.clone().multiplyScalar(-0.5 * densityKgM3 * dragCoefficient * areaM2 * speed / massKg);
}

export interface OrbitalElements {
  specificEnergy: number;
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  apoapsisAltitude: number | null;
  periapsisAltitude: number;
  period: number | null;
}

/** Computes osculating two-body elements from SI position and velocity; angles are radians. */
export function orbitalElements(position: THREE.Vector3, velocity: THREE.Vector3, mu: number = EARTH.mu, bodyRadius: number = EARTH.radius): OrbitalElements {
  const r = position?.length?.() ?? 0, v2 = velocity?.lengthSq?.() ?? NaN;
  if (!(r > 0) || !(mu > 0) || !Number.isFinite(v2)) return { specificEnergy: NaN, semiMajorAxis: NaN, eccentricity: NaN, inclination: NaN, apoapsisAltitude: null, periapsisAltitude: NaN, period: null };
  const energy = v2/2-mu/r, h = new THREE.Vector3().crossVectors(position, velocity), h2=h.lengthSq();
  const evec = velocity.clone().cross(h).divideScalar(mu).sub(position.clone().divideScalar(r));
  const e=evec.length(), a=Math.abs(energy) < 1e-14 ? Infinity : -mu/(2*energy);
  const inclination=h2 > 0 ? Math.acos(THREE.MathUtils.clamp(h.z/Math.sqrt(h2),-1,1)) : 0;
  const peri=r; // fallback for degenerate radial trajectories
  const rp=h2 > 0 ? (h2/mu)/(1+e) : Math.max(0, a*(1-e));
  const ra=e < 1 && Number.isFinite(a) ? a*(1+e) : null;
  return { specificEnergy:energy, semiMajorAxis:a, eccentricity:e, inclination, apoapsisAltitude:ra === null ? null : ra-bodyRadius, periapsisAltitude:(Number.isFinite(rp)?rp:peri)-bodyRadius, period: energy < 0 && Number.isFinite(a) ? 2*Math.PI*Math.sqrt(a*a*a/mu) : null };
}

interface Derivative { p: THREE.Vector3; v: THREE.Vector3; mass: number; propellant: number; heat: number; ablator: number }
/** Advances a coupled translational flight state by classic RK4. State vectors are cloned, never mutated. */
export function rk4Step(state: FlightState, dt: number, options: OrbitOptions = {}): FlightState {
  if (!Number.isFinite(dt) || dt === 0) return { ...state, position: state.position.clone(), velocity: state.velocity.clone() };
  const s=scaleOf(options), mu=positive(options.mu,EARTH.mu), radius=positive(options.bodyRadius,EARTH.radius), j2=finite(options.j2,EARTH.j2);
  const cd=positive(options.dragCoefficient,0), area=positive(options.areaM2,0), flow=positive(options.massFlowKgS,0), thrust=positive(options.maxThrustN,0), throttle=THREE.MathUtils.clamp(finite(options.throttle,0),0,1);
  const initialAblator=options.ablatorKg === undefined ? state.ablatorKg : positive(options.ablatorKg,0);
  const calc=(p:THREE.Vector3,v:THREE.Vector3,m:number,prop:number,abl:number):Derivative=>{
    const pM=p.clone().multiplyScalar(s), vMS=v.clone().multiplyScalar(s), r=pM.length();
    let acc=gravityJ2(pM,mu,j2,radius).divideScalar(s);
    if (r>0) acc.add(dragAcceleration(vMS,atmosphericDensity(r-radius),cd,area,Math.max(m,1e-9)).divideScalar(s));
    const actualFlow=prop<=0 ? 0 : Math.min(flow*throttle,prop/Math.max(Math.abs(dt),1e-12));
    const dir=options.thrustDirection?.lengthSq() ? options.thrustDirection.clone().normalize() : v.lengthSq()>1e-24?v.clone().normalize():new THREE.Vector3(1,0,0);
    if (m>0) acc.addScaledVector(dir,thrust*throttle/(m*s));
    const flux=thermalFlux(r-radius,vMS.length());
    const loss=Math.min(abl, Math.max(0,flux*1e-8));
    return {p:v.clone(),v:acc,mass:-actualFlow,propellant:-actualFlow,heat:flux,ablator:-loss};
  };
  const apply=(d:Derivative,f:number):FlightState=>({position:state.position.clone().addScaledVector(d.p,f),velocity:state.velocity.clone().addScaledVector(d.v,f),massKg:Math.max(1e-9,state.massKg+d.mass*f),propellantKg:Math.max(0,state.propellantKg+d.propellant*f),heatFlux:Math.max(0,state.heatFlux+d.heat*f),ablatorKg:Math.max(0,state.ablatorKg+d.ablator*f)});
  const d1=calc(state.position,state.velocity,state.massKg,state.propellantKg,initialAblator);
  const k2state=apply(d1,dt/2), d2=calc(k2state.position,k2state.velocity,k2state.massKg,k2state.propellantKg,k2state.ablatorKg);
  const k3state=apply(d2,dt/2), d3=calc(k3state.position,k3state.velocity,k3state.massKg,k3state.propellantKg,k3state.ablatorKg);
  const k4state=apply(d3,dt), d4=calc(k4state.position,k4state.velocity,k4state.massKg,k4state.propellantKg,k4state.ablatorKg);
  const combine=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3)=>a.clone().addScaledVector(b,2).addScaledVector(c,2).add(d).multiplyScalar(dt/6);
  const p=state.position.clone().add(combine(d1.p,d2.p,d3.p,d4.p));
  const v=state.velocity.clone().add(combine(d1.v,d2.v,d3.v,d4.v));
  const mass=state.massKg+dt*(d1.mass+2*d2.mass+2*d3.mass+d4.mass)/6;
  const prop=state.propellantKg+dt*(d1.propellant+2*d2.propellant+2*d3.propellant+d4.propellant)/6;
  const heat=state.heatFlux+dt*(d1.heat+2*d2.heat+2*d3.heat+d4.heat)/6;
  const abl=initialAblator+dt*(d1.ablator+2*d2.ablator+2*d3.ablator+d4.ablator)/6;
  return {position:p,velocity:v,massKg:Math.max(1e-9,mass),propellantKg:Math.max(0,prop),heatFlux:Math.max(0,heat),ablatorKg:Math.max(0,abl)};
}

/** Returns stable cloned position samples, including the initial state. */
export function predictTrajectory(state: FlightState, steps: number, dt: number, options: OrbitOptions = {}): THREE.Vector3[] {
  const count=Math.max(0,Math.min(100000,Math.floor(Number.isFinite(steps)?steps:0))), samples=[state.position.clone()];
  let current={...state,position:state.position.clone(),velocity:state.velocity.clone()};
  for(let i=0;i<count;i++){ current=rk4Step(current,dt,options); samples.push(current.position.clone()); }
  return samples;
}

/** Laplace sphere-of-influence approximation in the same length units as the supplied radii. */
export function sphereOfInfluence(orbitalRadius: number, satelliteMassKg: number, primaryMassKg: number): number {
  if (!(orbitalRadius>=0) || !(satelliteMassKg>0) || !(primaryMassKg>0) || ![orbitalRadius,satelliteMassKg,primaryMassKg].every(Number.isFinite)) return 0;
  return orbitalRadius * (satelliteMassKg/primaryMassKg)**0.4;
}

/** Non-flight-certified heating proxy in W/m², increasing with speed and decreasing exponentially with altitude. */
export function thermalFlux(altitudeM: number, speedMS: number): number {
  if (!Number.isFinite(altitudeM) || !Number.isFinite(speedMS) || speedMS<=0) return 0;
  const density=atmosphericDensity(Math.max(0,altitudeM));
  return 1.83e-4 * Math.sqrt(density/Math.max(EARTH.rho0,1e-12)) * speedMS**3;
}
