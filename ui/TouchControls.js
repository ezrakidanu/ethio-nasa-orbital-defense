export class TouchControls {
  constructor(root, actions) {
    this.root = root
    this.actions = actions
    this.rotation = { pitch: 0, yaw: 0, roll: 0 }
    this.throttle = 0
    this.pointerId = null
    this.keys = new Set()
    this.joystick = root.querySelector('#flight-stick')
    this.knob = root.querySelector('#stick-knob')
    this.slider = root.querySelector('#throttle-slider')
    this.bindStick()
    this.bindRoll()
    this.bindKeyboard()
    this.slider.addEventListener('input', () => { this.throttle = Number(this.slider.value) / 100 })
  }

  bindStick() {
    const update = event => {
      const rect = this.joystick.getBoundingClientRect(); const radius = rect.width * 0.38
      let x = (event.clientX - (rect.left + rect.width / 2)) / radius
      let y = (event.clientY - (rect.top + rect.height / 2)) / radius
      const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length }
      this.rotation.yaw = x; this.rotation.pitch = -y
      this.knob.style.transform = `translate(${x * radius * 0.62}px, ${y * radius * 0.62}px)`
    }
    this.joystick.addEventListener('pointerdown', event => { event.preventDefault(); this.pointerId = event.pointerId; this.joystick.setPointerCapture(event.pointerId); update(event) })
    this.joystick.addEventListener('pointermove', event => { if (event.pointerId === this.pointerId) update(event) })
    const end = event => { if (event.pointerId !== this.pointerId) return; this.pointerId = null; this.rotation.pitch = 0; this.rotation.yaw = 0; this.knob.style.transform = 'translate(0, 0)' }
    this.joystick.addEventListener('pointerup', end); this.joystick.addEventListener('pointercancel', end)
  }

  bindRoll() {
    for (const [selector, value] of [['[data-action="roll-left"]', -1], ['[data-action="roll-right"]', 1]]) {
      const button = this.root.querySelector(selector)
      button.addEventListener('pointerdown', event => { event.preventDefault(); this.rotation.roll = value; button.setPointerCapture(event.pointerId) })
      const stop = () => { if (!this.keys.has(value < 0 ? 'KeyQ' : 'KeyE')) this.rotation.roll = 0 }
      button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('lostpointercapture', stop)
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', event => {
      if (event.repeat) return
      const code = event.code
      if (['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','Space'].includes(code)) event.preventDefault()
      this.keys.add(code)
      if (code === 'Space') this.actions('launch')
      if (code === 'KeyX') this.actions('stage')
      if (code === 'KeyR') this.actions('scan')
      if (code === 'KeyC') this.actions('camera')
      if (code === 'KeyB') this.actions('deploy')
      if (code === 'Escape') this.actions('debrief')
    }, { passive: false })
    window.addEventListener('keyup', event => this.keys.delete(event.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  update(dt) {
    const pitch = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'))
    const yaw = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'))
    const roll = Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ'))
    this.rotation.pitch = this.pointerId === null ? pitch : this.rotation.pitch
    this.rotation.yaw = this.pointerId === null ? yaw : this.rotation.yaw
    if (this.keys.has('KeyQ') || this.keys.has('KeyE')) this.rotation.roll = roll
    else if (!this.root.querySelector('[data-action="roll-left"]:active, [data-action="roll-right"]:active')) this.rotation.roll = 0
    if (this.keys.has('ArrowUp')) this.throttle = Math.min(1, this.throttle + dt * 0.35)
    if (this.keys.has('ArrowDown')) this.throttle = Math.max(0, this.throttle - dt * 0.35)
    if (this.slider && document.activeElement !== this.slider) this.slider.value = String(Math.round(this.throttle * 100))
    return { ...this.rotation, throttle: this.throttle }
  }

  setThrottle(value) {
    this.throttle = Math.max(0, Math.min(1, value))
    if (this.slider) this.slider.value = String(Math.round(this.throttle * 100))
  }
}
