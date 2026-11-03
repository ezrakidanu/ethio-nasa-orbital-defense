const API_KEY = 'DEMO_KEY'
const TIMEOUT_MS = 2500

const FALLBACK = Object.freeze({
  flares: [
    { classType: 'C3.2', peakTime: new Date().toISOString(), sourceLocation: 'N12E08', activeRegionNum: 4321 },
    { classType: 'B8.1', peakTime: new Date(Date.now() - 86_400_000).toISOString(), sourceLocation: 'S04W22', activeRegionNum: 4318 },
  ],
  asteroids: [
    { id: '2026 FT3', name: '(2026 FT3)', estimatedDiameter: 0.042, relativeVelocityKps: 18.4, missDistanceAu: 0.04, hazardous: true },
    { id: '2026 QX1', name: '(2026 QX1)', estimatedDiameter: 0.018, relativeVelocityKps: 12.7, missDistanceAu: 0.08, hazardous: false },
    { id: '2026 JW5', name: '(2026 JW5)', estimatedDiameter: 0.076, relativeVelocityKps: 22.1, missDistanceAu: 0.11, hazardous: true },
    { id: '2026 KP9', name: '(2026 KP9)', estimatedDiameter: 0.011, relativeVelocityKps: 9.6, missDistanceAu: 0.16, hazardous: false },
  ],
})

function today() { return new Date().toISOString().slice(0, 10) }
function withTimeout(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { signal: controller.signal, mode: 'cors', headers: { Accept: 'application/json' } })
    .then(response => { if (!response.ok) throw new Error(`NASA API HTTP ${response.status}`); return response.json() })
    .finally(() => clearTimeout(timer))
}
function parseFlares(items) {
  return (Array.isArray(items) ? items : []).map(item => ({
    classType: String(item.classType || 'C1.0'), peakTime: item.peakTime || item.beginTime || '',
    sourceLocation: item.sourceLocation || 'Solar disk', activeRegionNum: item.activeRegionNum || null,
  })).slice(0, 12)
}
function parseAsteroids(data) {
  const objects = Object.values(data?.near_earth_objects || {}).flat()
  return objects.slice(0, 16).map(item => {
    const diameter = item.estimated_diameter?.kilometers
    const approach = item.close_approach_data?.[0] || {}
    return {
      id: String(item.id || item.neo_reference_id || ''), name: String(item.name || 'Unnamed NEO'),
      estimatedDiameter: diameter ? (diameter.estimated_diameter_min + diameter.estimated_diameter_max) / 2 : 0.03,
      relativeVelocityKps: Number(approach.relative_velocity?.kilometers_per_second || 0),
      missDistanceAu: Number(approach.miss_distance?.astronomical || 0), hazardous: Boolean(item.is_potentially_hazardous_asteroid),
    }
  })
}

export class NASADataPipeline {
  constructor() {
    this.data = { flares: [...FALLBACK.flares], asteroids: [...FALLBACK.asteroids], source: 'OFFLINE FALLBACK', loadedAt: null, error: '' }
  }

  async load() {
    const date = today()
    const requests = await Promise.allSettled([
      withTimeout(`https://api.nasa.gov/DONKI/FLR?startDate=${date}&api_key=${API_KEY}`),
      withTimeout(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${date}&api_key=${API_KEY}`),
    ])
    const errors = []
    if (requests[0].status === 'fulfilled') {
      const parsed = parseFlares(requests[0].value)
      if (parsed.length) this.data.flares = parsed
    } else errors.push(String(requests[0].reason?.message || 'DONKI unavailable'))
    if (requests[1].status === 'fulfilled') {
      const parsed = parseAsteroids(requests[1].value)
      if (parsed.length) this.data.asteroids = parsed
    } else errors.push(String(requests[1].reason?.message || 'NeoWs unavailable'))
    this.data.source = errors.length ? 'NASA + OFFLINE FALLBACK' : 'NASA LIVE'
    this.data.loadedAt = new Date().toISOString()
    this.data.error = errors.join('; ')
    return this.snapshot()
  }

  snapshot() {
    const flareLevel = this.data.flares.reduce((level, flare) => {
      const match = String(flare.classType).match(/^([BCMX])/i)
      const weight = ({ B: 0.12, C: 0.28, M: 0.65, X: 1 })[String(match?.[1] || 'B').toUpperCase()] || 0.12
      return Math.max(level, weight)
    }, 0.08)
    return { ...this.data, flareLevel, radiationMultiplier: flareLevel >= 0.65 ? 2.5 : 1 }
  }

  static get fallback() { return FALLBACK }
}
