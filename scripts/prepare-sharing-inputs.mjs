import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// The production UI ships from public/; the sharing metadata tool intentionally accepts only
// regular PNGs beneath assets/. Rehydrate its input copies for clean CI builds without Storage.
const root = process.cwd()
for (const name of ['og.png', 'favicon.png']) {
  const from = resolve(root, 'public/assets/share', name)
  const to = resolve(root, 'assets/share', name)
  if (!existsSync(to)) {
    if (!existsSync(from)) throw new Error(`Missing offline artwork: public/assets/share/${name}`)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to, { errorOnExist: true })
  } else {
    const stat = lstatSync(to)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Sharing asset input must be a regular file: assets/share/${name}`)
  }
}
