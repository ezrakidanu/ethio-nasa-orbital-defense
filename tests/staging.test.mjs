import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { AssetBuilder } from '../builders/AssetBuilder.js'

describe('modular ascent staging', () => {
  it('animates both fairing hinges before jettison and preserves the payload interlock', () => {
    const launchComplex = new THREE.Group()
    const manager = {
      scene: new THREE.Scene(),
      launchComplex,
      spaceEnvironment: new THREE.Group(),
      showroomWorld: new THREE.Group(),
    }
    const assets = new AssetBuilder(manager)
    assets.upperStage = new THREE.Group()
    launchComplex.add(assets.upperStage)
    assets.ascentStage = 2
    assets.fairingHalves = [-1, 1].map(side => {
      const half = new THREE.Group()
      half.position.set(side * 0.455, 38.3, 0)
      assets.upperStage.add(half)
      return half
    })

    const start = assets.stageSeparation()
    expect(start).toMatchObject({ ok: true, pending: true, id: 'fairing-opening' })
    expect(assets.detachedParts).toHaveLength(0)
    expect(assets.fairingsOpened).toBe(false)

    assets.advanceFairingHinges(0.3)
    const animatedRotations = assets.fairingHalves.map(half => half.rotation.z)
    expect(animatedRotations[0]).toBeLessThan(0)
    expect(animatedRotations[1]).toBeGreaterThan(0)
    expect(assets.detachedParts).toHaveLength(0)
    expect(assets.stageSeparation()).toMatchObject({ ok: false, pending: true })

    assets.advanceFairingHinges(0.52)
    expect(assets.fairingsOpened).toBe(true)
    expect(assets.fairingJustOpened).toBe(true)
    expect(assets.ascentStage).toBe(3)
    expect(assets.detachedParts.map(part => part.id)).toEqual(['fairing-1', 'fairing-2'])
    expect(assets.detachedParts.every(part => part.velocity.length() > 0)).toBe(true)
    expect(assets.fairingHalves.every(half => half.parent === launchComplex)).toBe(true)

    const blocked = assets.stageSeparation()
    expect(blocked).toMatchObject({ ok: false, id: 'blocked' })
    expect(blocked.message).toMatch(/must be deployed/i)
  })
})
