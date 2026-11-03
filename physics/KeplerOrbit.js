/**
 * Two-body Keplerian utilities for Earth-centered inertial (ECI) states.
 * Vectors may be THREE.Vector3 instances or finite array-like [x, y, z] values.
 * Coordinates are returned as [x, y, z] triples in the supplied ECI frame; a
 * circular orbit starting at +X with +Z velocity is sampled in the XZ plane.
 */
export const EARTH_MU = 3.986004418e14 // m^3 s^-2
export const EARTH_RADIUS = 6_371_000 // m
const TAU = 2 * Math.PI
const EPS = 1e-12

function vector3(value, label) {
  const v = value != null && typeof value.length === 'number'
    ? [Number(value[0]), Number(value[1]), Number(value[2])]
    : [Number(value?.x), Number(value?.y), Number(value?.z)]
  if (v.length !== 3 || !v.every(Number.isFinite)) throw new Error(`${label} must be a finite 3D vector`)
  return v
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => Math.hypot(...a)
const scale = (a, s) => a.map((x) => x * s)
const add = (a, b) => a.map((x, i) => x + b[i])
const unit = (a) => scale(a, 1 / norm(a))
const clamp = (x) => Math.max(-1, Math.min(1, x))
const finite = (x, label) => { if (!Number.isFinite(x)) throw new Error(`${label} is not finite`); return x }

/** Convert inertial position (m) and velocity (m/s) to classical orbital elements. */
export function stateToElements(position, velocity, mu = EARTH_MU) {
  const r = vector3(position, 'Position')
  const v = vector3(velocity, 'Velocity')
  if (!Number.isFinite(mu) || mu <= 0) throw new Error('Gravitational parameter mu must be positive and finite')
  const radius = norm(r)
  if (!(radius > 0)) throw new Error('Position radius must be nonzero')
  const speed2 = dot(v, v)
  const h = cross(r, v)
  const hMag = norm(h)
  if (!(hMag > Number.EPSILON * radius * Math.max(norm(v), 1))) throw new Error('Degenerate state: radial velocity has no defined orbital plane')
  const energy = speed2 / 2 - mu / radius
  if (!(energy < 0)) throw new Error('State is not a bound elliptical orbit (specific energy must be negative)')
  const a = -mu / (2 * energy)
  const eVec = add(scale(cross(v, h), 1 / mu), scale(r, -1 / radius))
  let e = norm(eVec)
  if (e >= 1 || !Number.isFinite(e)) throw new Error('State does not define a finite ellipse')
  if (e < 1e-10) e = 0 // suppress round-off eccentricity for circular states
  const n = [-h[1], h[0], 0]
  const nMag = norm(n)
  const inclination = Math.acos(clamp(h[2] / hMag))
  const equatorial = nMag <= hMag * 1e-10
  const circular = e === 0
  // Undefined angular elements are set to zero; true anomaly becomes argument
  // of latitude for circular inclined orbits and longitude for circular equatorial ones.
  const rHat = scale(r, 1 / radius)
  let raan = equatorial ? 0 : Math.atan2(n[1], n[0])
  if (raan < 0) raan += TAU
  let argPeriapsis = 0
  let trueAnomaly
  if (circular) {
    trueAnomaly = equatorial ? Math.atan2(r[1], r[0]) : Math.atan2(dot(cross(unit(n), rHat), unit(h)), dot(unit(n), rHat))
  } else {
    if (!equatorial) {
      argPeriapsis = Math.atan2(dot(cross(unit(n), unit(eVec)), unit(h)), dot(unit(n), unit(eVec)))
      if (argPeriapsis < 0) argPeriapsis += TAU
    } else {
      argPeriapsis = Math.atan2(eVec[1], eVec[0])
      if (argPeriapsis < 0) argPeriapsis += TAU
    }
    trueAnomaly = Math.atan2(dot(cross(eVec, r), h) / (e * radius * hMag), dot(eVec, r) / (e * radius))
  }
  if (trueAnomaly < 0) trueAnomaly += TAU
  const periapsisRadius = a * (1 - e)
  const apoapsisRadius = a * (1 + e)
  const result = {
    semiMajorAxis: finite(a, 'Semi-major axis'), a,
    eccentricity: e, e,
    inclination: finite(inclination, 'Inclination'), inclinationRad: inclination,
    raan, argumentOfPeriapsis: argPeriapsis, trueAnomaly,
    angularMomentum: hMag, specificOrbitalEnergy: energy,
    periapsisRadius, apoapsisRadius,
    periapsisAltitude: periapsisRadius - EARTH_RADIUS,
    apoapsisAltitude: apoapsisRadius - EARTH_RADIUS,
    mu,
  }
  if (!Object.values(result).every(Number.isFinite)) throw new Error('State produced non-finite orbital elements')
  return result
}

/** Derive surface-referenced Ap/Pe altitudes (meters) from elements or state. */
export function apsisAltitudes(elementsOrPosition, velocity, mu = EARTH_MU) {
  const el = velocity === undefined ? elementsOrPosition : stateToElements(elementsOrPosition, velocity, mu)
  const a = el.semiMajorAxis ?? el.a
  const e = el.eccentricity ?? el.e
  if (!Number.isFinite(a) || !Number.isFinite(e) || a <= 0 || e < 0 || e >= 1) throw new Error('Invalid elliptical orbital elements')
  return { apoapsisAltitude: a * (1 + e) - EARTH_RADIUS, periapsisAltitude: a * (1 - e) - EARTH_RADIUS }
}

function orbitalBasis(el) {
  const i = el.inclinationRad ?? el.inclination ?? 0
  const O = el.raan ?? 0
  const w = el.argumentOfPeriapsis ?? 0
  // Perifocal P points toward periapsis, Q follows motion; H is the orbit normal.
  const P = [Math.cos(O) * Math.cos(w) - Math.sin(O) * Math.sin(w) * Math.cos(i), Math.sin(O) * Math.cos(w) + Math.cos(O) * Math.sin(w) * Math.cos(i), Math.sin(w) * Math.sin(i)]
  const Q = [-Math.cos(O) * Math.sin(w) - Math.sin(O) * Math.cos(w) * Math.cos(i), -Math.sin(O) * Math.sin(w) + Math.cos(O) * Math.cos(w) * Math.cos(i), Math.cos(w) * Math.sin(i)]
  return { P, Q }
}

/** Sample a closed elliptical orbit as an array of ECI [x, y, z] meter triples. */
export function sampleOrbit(elements, sampleCount = 128) {
  const a = elements?.semiMajorAxis ?? elements?.a
  const e = elements?.eccentricity ?? elements?.e
  if (!Number.isInteger(sampleCount) || sampleCount < 3) throw new Error('sampleCount must be an integer of at least 3')
  if (!Number.isFinite(a) || !Number.isFinite(e) || a <= 0 || e < 0 || e >= 1) throw new Error('Invalid elliptical orbital elements')
  const { P, Q } = orbitalBasis(elements)
  const points = []
  for (let j = 0; j <= sampleCount; j++) {
    const nu = TAU * j / sampleCount
    if (j === sampleCount) { points.push([...points[0]]); continue }
    const radius = a * (1 - e * e) / (1 + e * Math.cos(nu))
    const point = add(scale(P, radius * Math.cos(nu)), scale(Q, radius * Math.sin(nu)))
    if (!point.every(Number.isFinite)) throw new Error('Orbit sampling produced non-finite coordinates')
    points.push(point)
  }
  return points
}

/** Propagate an ECI state by seconds using the elliptic Kepler equation. Returns { position, velocity, elements }. */
export function propagateState(position, velocity, timeOffsetSeconds, mu = EARTH_MU) {
  if (!Number.isFinite(timeOffsetSeconds)) throw new Error('Time offset must be finite')
  const r0 = vector3(position, 'Position')
  const v0 = vector3(velocity, 'Velocity')
  const el = stateToElements(r0, v0, mu)
  const { a, eccentricity: e, inclinationRad: inc, raan: O, argumentOfPeriapsis: w } = el
  const { P, Q } = orbitalBasis({ ...el, inclinationRad: inc })
  const h = cross(r0, v0)
  const eVec = add(scale(cross(v0, h), 1 / mu), scale(r0, -1 / norm(r0)))
  let E0
  if (e > 0) {
    const cosNu = clamp(dot(eVec, r0) / (e * norm(r0)))
    const sinNu = dot(cross(eVec, r0), h) / (e * norm(r0) * norm(h))
    const nu = Math.atan2(sinNu, cosNu)
    E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
  } else {
    const rHat = unit(r0)
    const n = [-h[1], h[0], 0]
    const nMag = norm(n)
    const nu = nMag <= norm(h) * 1e-10 ? Math.atan2(r0[1], r0[0]) : Math.atan2(dot(cross(unit(n), rHat), unit(h)), dot(unit(n), rHat))
    E0 = nu
  }
  const meanMotion = Math.sqrt(mu / (a * a * a))
  const M0 = E0 - e * Math.sin(E0)
  const M = M0 + meanMotion * timeOffsetSeconds
  let E = M
  for (let k = 0; k < 64; k++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= delta
    if (Math.abs(delta) < 1e-13) break
    if (k === 63) throw new Error('Kepler equation solver did not converge')
  }
  const x = a * (Math.cos(E) - e)
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const factor = Math.sqrt(mu * a) / (a * (1 - e * Math.cos(E)))
  const outPosition = add(scale(P, x), scale(Q, y))
  const outVelocity = add(scale(P, -factor * Math.sin(E)), scale(Q, factor * Math.sqrt(1 - e * e) * Math.cos(E)))
  if (![...outPosition, ...outVelocity].every(Number.isFinite)) throw new Error('Propagation produced non-finite state')
  return { position: outPosition, velocity: outVelocity, elements: el }
}
