/**
 * Defaults consumed by the development-only Tweak bridge. Legacy starter sections
 * remain for source compatibility; the active ETHIO-NASA runtime reads flight,
 * orbital power and camera parameters directly.
 */
export const DEFAULT_CONFIG = {
  run: { seconds: 150, lives: 3, invulnerable: 1.6, killY: -18 },
  score: { core: 100, comboWindow: 3.5, comboMax: 5, timeBonus: 25, lifeBonus: 500 },
  player: {
    radius: 0.42, halfHeight: 0.5, walkSpeed: 7, sprintSpeed: 11, acceleration: 60,
    airControl: 0.45, jumpSpeed: 10.5, gravity: -30, lowJumpGravity: -58,
    maxFall: -40, coyoteTime: 0.12, jumpBuffer: 0.14, dashSpeed: 22,
    dashTime: 0.16, dashCooldown: 0.9, turnSpeed: 14,
  },
  camera: { distance: 6.4, height: 2.4, minPitch: -0.35, maxPitch: 1.1, follow: 10, fov: 62 },
  drones: { speed: 3.2, radius: 0.7, rageSpeed: 5, rageAt: 45 },
  flight: { thrustN: 39_100_000, maxQPa: 38_000, dragCoefficient: 0.45 },
  orbit: { solarEfficiency: 1, thrusterDrainW: 34, baseLoadW: 18 },
} as const

// Gameplay always reads active values here. Defaults stay immutable for Tweak Reset;
// Apply updates only the mutable preview copy and never writes source or local storage.
type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
