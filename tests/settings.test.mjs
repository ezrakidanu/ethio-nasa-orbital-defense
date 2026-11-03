import { describe, expect, it } from 'vitest'
import { GameSettings, GAME_SETTINGS_DEFAULTS, GRAPHICS_PRESETS } from '../ui/GameSettings.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

describe('GameSettings', () => {
  it('starts with documented defaults and returns detached snapshots', () => {
    const settings = new GameSettings({ storage: null })
    expect(settings.getAll()).toEqual(GAME_SETTINGS_DEFAULTS)
    expect(settings.get('sensitivity')).toBe(1)
    const snapshot = settings.getAll()
    snapshot.graphics = 'low'
    expect(settings.get('graphics')).toBe('medium')
    expect(settings.get('unknown')).toBeUndefined()
  })

  it('persists updates and restores them into a new instance', () => {
    const storage = memoryStorage()
    const first = new GameSettings({ storage })
    expect(first.set('sensitivity', 1.5)).toBe(true)
    expect(first.set('units', 'mach')).toBe(true)
    const reloaded = new GameSettings({ storage })
    expect(reloaded.get('sensitivity')).toBe(1.5)
    expect(reloaded.get('units')).toBe('mach')
  })

  it('supports independent inversion toggles and atomically sets multiple settings', () => {
    const settings = new GameSettings({ storage: null })
    expect(settings.set('invertPitch', true)).toBe(true)
    expect(settings.set('invertYaw', true)).toBe(true)
    expect(settings.set('invertRoll', false)).toBe(true)
    expect(settings.getAll()).toMatchObject({ invertPitch: true, invertYaw: true, invertRoll: false })
    expect(settings.setAll({ sensitivity: 0.75, deadzone: 0.12 })).toBe(true)
    expect(settings.get('sensitivity')).toBe(0.75)
    expect(settings.get('deadzone')).toBe(0.12)
    expect(settings.setAll({ sensitivity: 1.25, graphics: 'invalid' })).toBe(false)
    expect(settings.get('sensitivity')).toBe(0.75)
  })

  it('provides bounded settings for each graphics preset', () => {
    const settings = new GameSettings({ storage: null })
    for (const preset of ['low', 'medium', 'ultra']) {
      expect(settings.set('graphics', preset)).toBe(true)
      expect(settings.getGraphicsSettings()).toEqual(GRAPHICS_PRESETS[preset])
      expect(settings.getRenderSettings()).toEqual(GRAPHICS_PRESETS[preset])
    }
    const result = settings.getGraphicsSettings()
    result.particleCount = -1
    expect(settings.getGraphicsSettings().particleCount).toBe(GRAPHICS_PRESETS.ultra.particleCount)
  })

  it('accepts each supported unit selection', () => {
    const settings = new GameSettings({ storage: null })
    for (const unit of ['metric', 'imperial', 'mach']) {
      expect(settings.set('units', unit)).toBe(true)
      expect(settings.get('units')).toBe(unit)
    }
  })

  it('rejects invalid enums, types, and out-of-range numeric values without mutation', () => {
    const settings = new GameSettings({ storage: null })
    for (const [key, value] of [
      ['graphics', 'high'], ['units', 'nautical'], ['sensitivity', 0.2],
      ['sensitivity', 2.01], ['sensitivity', NaN], ['deadzone', -0.01],
      ['deadzone', 0.36], ['invertPitch', 1], ['missingSetting', true],
    ]) expect(settings.set(key, value)).toBe(false)
    expect(settings.getAll()).toEqual(GAME_SETTINGS_DEFAULTS)
  })

  it('works without storage and when storage access throws', () => {
    const noStorage = new GameSettings({ storage: null })
    expect(noStorage.set('units', 'imperial')).toBe(true)
    expect(noStorage.reset()).toEqual(GAME_SETTINGS_DEFAULTS)
    const throwingStorage = {
      getItem() { throw new Error('blocked') },
      setItem() { throw new Error('blocked') },
    }
    const settings = new GameSettings({ storage: throwingStorage })
    expect(settings.getAll()).toEqual(GAME_SETTINGS_DEFAULTS)
    expect(settings.set('deadzone', 0.2)).toBe(true)
    expect(settings.get('deadzone')).toBe(0.2)
  })

  it('ignores corrupt persisted JSON and invalid saved values', () => {
    const storage = memoryStorage()
    storage.setItem('ethio-nasa-game-settings', '{broken')
    expect(new GameSettings({ storage }).getAll()).toEqual(GAME_SETTINGS_DEFAULTS)
    storage.setItem('ethio-nasa-game-settings', JSON.stringify({ graphics: 'maximum', deadzone: 0.2, extra: true }))
    expect(new GameSettings({ storage }).getAll()).toMatchObject({ graphics: 'medium', deadzone: 0.2 })
  })
})
