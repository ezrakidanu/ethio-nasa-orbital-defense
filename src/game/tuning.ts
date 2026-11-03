import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'dash' | 'run'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string;
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  const category = section === 'camera' ? 'Camera' : section === 'flight' ? 'Launch vehicle' : section === 'orbit' ? 'Orbital power' : 'Run'
  const integrity = section === 'camera' ? 'COSMETIC' : 'GAMEPLAY'
  bindings.push({ control: Object.freeze({ id: `${section}.${key}`, type: 'number', category,
    label, description: boundary === 'run' ? 'Applies when the next mission starts.' : 'Updates the current preview immediately.',
    unit, default: defaults[key], min, max, step,
    applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE', integrity }), boundary,
    read: () => values[key], write: value => { values[key] = value } })
}
number('flight', 'thrustN', 'Main engine thrust', 29_000_000, 49_000_000, 500_000, 'N', 'run')
number('flight', 'maxQPa', 'Max-Q structural limit', 20_000, 60_000, 1_000, 'Pa', 'run')
number('flight', 'dragCoefficient', 'Aerodynamic drag coefficient', 0.1, 0.9, 0.01, '', 'run')
number('orbit', 'solarEfficiency', 'Solar array efficiency', 0.5, 1.5, 0.05, '×')
number('orbit', 'thrusterDrainW', 'Thruster electrical load', 10, 120, 1, 'W')
number('orbit', 'baseLoadW', 'Bus electrical load', 5, 80, 1, 'W')
number('camera', 'fov', 'Camera field of view', 40, 100, 1, '°')
number('camera', 'distance', 'Camera follow distance', 3, 12, 0.1, 'm')
number('camera', 'follow', 'Camera smoothing', 2, 20, 1, '')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    const candidate = { ...requested, ...patch } as Record<string, number>
    const nextActive = this.read().active
    for (const [id, value] of entries) if (byId.get(id)!.control.applyMode === 'LIVE') nextActive[id] = value
    requested = candidate
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    unranked = boundary === 'run' ? gameplayModified() : unranked || gameplayModified()
  },
}
