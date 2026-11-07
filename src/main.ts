import './styles/main.css'
import { OrbitalApp } from './orbital-app'

function lockLandscape(): void {
  const viewport = document.querySelector('meta[name="viewport"]')
  viewport?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
  document.documentElement.classList.add('landscape-only')
  const screen = window.screen as Screen & { orientation?: { lock?: (mode:string)=>Promise<void> } }
  void screen.orientation?.lock?.('landscape').catch(() => undefined)
}

lockLandscape()
const game = new OrbitalApp()
if (import.meta.env.DEV) {
  void import('../scripts/manus-tuning/adapter.js').then(async ({ registerGameTuning }) => {
    const { tuning } = await import('./game/tuning')
    await registerGameTuning(tuning)
  })
}
;(window as unknown as { __game: unknown }).__game = game
