/**
 * Persistent, validated settings for the ETHIO-NASA game.
 *
 * API: new GameSettings({ storage?, storageKey? }), get(name), getAll(),
 * set(name, value), setAll(values), reset(), and getGraphicsSettings().
 * Invalid values are rejected (set/setAll return false) without mutation.
 * Storage is optional; unavailable or throwing storage is treated as disabled.
 */
export const GAME_SETTINGS_DEFAULTS = Object.freeze({
  sensitivity: 1,
  deadzone: 0.08,
  invertPitch: false,
  invertYaw: false,
  invertRoll: false,
  graphics: 'medium',
  units: 'metric',
})

/** Concrete bounded graphics/render options keyed by the graphics setting. */
export const GRAPHICS_PRESETS = Object.freeze({
  low: Object.freeze({ particleCount: 350, shadowMapSize: 512, shadowsEnabled: false, atmosphereBloom: false }),
  medium: Object.freeze({ particleCount: 900, shadowMapSize: 1024, shadowsEnabled: true, atmosphereBloom: false }),
  ultra: Object.freeze({ particleCount: 1800, shadowMapSize: 2048, shadowsEnabled: true, atmosphereBloom: true }),
})

const ENUMS = Object.freeze({ graphics: Object.keys(GRAPHICS_PRESETS), units: ['metric', 'imperial', 'mach'] })
const NUMERIC_RANGES = Object.freeze({ sensitivity: [0.25, 2], deadzone: [0, 0.35] })
const BOOLEAN_KEYS = new Set(['invertPitch', 'invertYaw', 'invertRoll'])
const SETTINGS_KEYS = new Set(Object.keys(GAME_SETTINGS_DEFAULTS))

function validValue(key, value) {
  if (Object.hasOwn(NUMERIC_RANGES, key)) {
    return typeof value === 'number' && Number.isFinite(value)
      && value >= NUMERIC_RANGES[key][0] && value <= NUMERIC_RANGES[key][1]
  }
  if (BOOLEAN_KEYS.has(key)) return typeof value === 'boolean'
  if (Object.hasOwn(ENUMS, key)) return typeof value === 'string' && ENUMS[key].includes(value)
  return false
}

function copy(value) {
  return { ...value }
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

export class GameSettings {
  /** @param {{ storage?: Storage|null, storageKey?: string }} [options] */
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? 'ethio-nasa-game-settings'
    this.storage = Object.hasOwn(options, 'storage') ? options.storage : defaultStorage()
    this.state = copy(GAME_SETTINGS_DEFAULTS)
    this.load()
  }

  /** Load persisted valid known settings, ignoring corrupt or unavailable storage. */
  load() {
    try {
      const raw = this.storage?.getItem(this.storageKey)
      if (raw == null) return this.getAll()
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (SETTINGS_KEYS.has(key) && validValue(key, value)) this.state[key] = value
        }
      }
    } catch { /* Storage and malformed JSON must never prevent game startup. */ }
    return this.getAll()
  }

  /** Return a setting, or undefined for an unknown key. Values are primitives. */
  get(name) {
    return SETTINGS_KEYS.has(name) ? this.state[name] : undefined
  }

  /** Return a detached snapshot of all user settings. */
  getAll() {
    return copy(this.state)
  }

  /** Set one valid setting; return false and preserve state on invalid input. */
  set(name, value) {
    if (!SETTINGS_KEYS.has(name) || !validValue(name, value)) return false
    this.state[name] = value
    this.persist()
    return true
  }

  /** Atomically set a collection of valid settings; reject the whole update otherwise. */
  setAll(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return false
    const entries = Object.entries(values)
    if (entries.some(([key, value]) => !SETTINGS_KEYS.has(key) || !validValue(key, value))) return false
    for (const [key, value] of entries) this.state[key] = value
    if (entries.length) this.persist()
    return true
  }

  /** Restore defaults and persist them where possible. */
  reset() {
    this.state = copy(GAME_SETTINGS_DEFAULTS)
    this.persist()
    return this.getAll()
  }

  /** Return a detached graphics configuration derived from the current preset. */
  getGraphicsSettings() {
    return copy(GRAPHICS_PRESETS[this.state.graphics])
  }

  /** Alias emphasizing that these values drive particle/render configuration. */
  getRenderSettings() {
    return this.getGraphicsSettings()
  }

  persist() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(this.state)) } catch { /* Storage is best-effort. */ }
  }
}

export default GameSettings
