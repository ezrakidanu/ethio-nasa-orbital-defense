import * as THREE from 'three'

export class EngineCore {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.graphics = { pixelRatioCap: 2, shadowsEnabled: true, shadowMapSize: 1536 }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 2000)
    this.running = false
    this.last = 0
    this.resize = this.resize.bind(this)
    window.addEventListener('resize', this.resize, { passive: true })
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(canvas.parentElement || document.body)
    this.resize()
  }

  resize() {
    const screenWidth = Math.max(1, window.innerWidth)
    const screenHeight = Math.max(1, window.innerHeight)
    const minAspect = 16 / 9
    const maxAspect = 19 / 9
    const ratio = screenWidth / screenHeight
    let width = screenWidth
    let height = screenHeight
    let left = 0
    let top = 0
    if (ratio < minAspect) {
      height = screenWidth / minAspect
      top = (screenHeight - height) / 2
    } else if (ratio > maxAspect) {
      width = screenHeight * maxAspect
      left = (screenWidth - width) / 2
    }
    const root = document.documentElement
    root.style.setProperty('--viewport-left', `${left}px`)
    root.style.setProperty('--viewport-top', `${top}px`)
    root.style.setProperty('--viewport-width', `${width}px`)
    root.style.setProperty('--viewport-height', `${height}px`)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.graphics.pixelRatioCap, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  setGraphicsSettings(settings = {}) {
    const pixelRatioCap = Number.isFinite(settings.pixelRatioCap) ? settings.pixelRatioCap : (settings.shadowMapSize <= 512 ? 1 : settings.shadowMapSize >= 2048 ? 2 : 1.5)
    this.graphics = {
      pixelRatioCap: Math.max(0.75, Math.min(2, pixelRatioCap)),
      shadowsEnabled: Boolean(settings.shadowsEnabled),
      shadowMapSize: Math.max(256, Math.min(2048, Number(settings.shadowMapSize) || 1024)),
    }
    this.renderer.shadowMap.enabled = this.graphics.shadowsEnabled
    this.resize()
  }

  start(frame) {
    this.running = true
    const tick = now => {
      if (!this.running) return
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60
      this.last = now
      frame(dt, now / 1000)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  render(scene, camera = this.camera) {
    this.renderer.render(scene, camera)
  }

  dispose() {
    this.running = false
    this.observer.disconnect()
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
  }
}
