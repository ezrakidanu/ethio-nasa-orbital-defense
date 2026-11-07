import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Runtime assets ship from public/; the managed build metadata expects source copies under assets/.
// Rehydrate the exact tracked local inputs so clean APK builds never depend on private Storage.
const root = process.cwd()
const files = [
  ['models', 'astronaut-pilot.glb'],
  ['models', 'orbital-launch-vehicle.glb'],
  ['share', 'favicon.png'],
  ['share', 'og.png'],
]
for (const [group, name] of files) {
  const from = resolve(root, 'public/assets', group, name)
  const to = resolve(root, 'assets', group, name)
  if (!existsSync(to)) {
    if (!existsSync(from)) throw new Error(`Missing offline asset: public/assets/${group}/${name}`)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  } else {
    const stat = lstatSync(to)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Asset input must be a regular file: assets/${group}/${name}`)
  }
}
