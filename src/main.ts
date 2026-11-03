import { Capacitor } from '@capacitor/core'
import { ScreenOrientation } from '@capacitor/screen-orientation'

// Keep the starter's development-only Tweak bridge available in Preview while the gameplay
// runtime uses the requested modular JavaScript paths (engine/, physics/, builders/, api/, ui/).
async function boot(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await ScreenOrientation.lock({ orientation: 'landscape' }) }
    catch (error) { console.warn('Native landscape lock unavailable; relying on the Android activity configuration.', error) }
  }
  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }, { CONFIG }] = await Promise.all([
      import('../scripts/manus-tuning/adapter.js'),
      import('./game/tuning'),
      import('./game/config'),
    ])
    const bridge = window as Window & {
      __ethioConfig?: typeof CONFIG
      __ethioTuning?: typeof tuning
    }
    bridge.__ethioConfig = CONFIG
    bridge.__ethioTuning = tuning
    await registerGameTuning(tuning)
  }
  // @ts-ignore -- Vite bundles the modular runtime JavaScript entry.
  await import('../js/main.js')
}

boot().catch(error => {
  console.error(error)
  const overlay = document.getElementById('ui-overlay')
  if (overlay) {
    overlay.innerHTML = `<div class="boot-fatal" role="alert"><span>MISSION SYSTEMS FAILED TO INITIALIZE</span><button type="button" id="boot-retry">RETRY SYSTEM BOOT</button><small>${String(error?.message || error).replace(/[<>&]/g, '')}</small></div>`
    document.getElementById('boot-retry')?.addEventListener('click', () => window.location.reload())
  }
})
