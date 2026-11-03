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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
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
    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
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
