import { CAMERA_STATES } from '../engine/CameraController.js'

const fmt = (value, digits = 1) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
  : '—'
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value) }
const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value) }

export class UIManager {
  constructor(root, actions, settings) {
    this.root = root
    this.actions = actions
    this.settings = settings
    this.started = false
    this.paused = false
    this.activeModal = null
    this.modalStack = []
    this.modalSnapshot = null
    this.api = null
    this.alertTimer = 0
    this.root.innerHTML = this.template()
    this.loaderTimer = setTimeout(() => document.getElementById('boot-loader')?.classList.add('is-hidden'), 650)
    this.setStageEnabled(false)
    this.root.addEventListener('click', event => this.handleClick(event))
    this.root.addEventListener('input', event => this.handleInput(event))
    this.root.addEventListener('change', event => this.handleChange(event))
    this.refreshSettings()
    setText('utc-clock', new Date().toISOString().slice(11, 19) + ' UTC')
    this.clockTimer = setInterval(() => setText('utc-clock', new Date().toISOString().slice(11, 19) + ' UTC'), 1000)
  }

  template() {
    return `
      <div id="boot-loader" class="boot-loader" role="status" aria-live="polite"><div class="boot-card"><img src="./assets/share/favicon.png" alt=""/><span class="boot-kicker">ETHIO-NASA // MISSION SYSTEMS</span><b>ORBITAL DEFENSE</b><i class="boot-progress"><span></span></i><small>INITIALIZING FLIGHT DYNAMICS · LOADING MISSION DATA</small></div></div>
      <div class="orientation-block" role="alert"><div class="orientation-card"><span class="brand-mark"><i></i><i></i><i></i></span><b>LANDSCAPE REQUIRED</b><small>Rotate your device to continue mission control.</small></div></div>
      <header class="command-bar">
        <div class="brand"><span class="brand-mark"><i></i><i></i><i></i></span><div><b>ETHIO-NASA</b><small>ORBITAL DEFENSE // MISSION CONTROL</small></div></div>
        <div class="top-status"><span class="live-dot"></span><span id="api-source">CONNECTING NASA TELEMETRY</span><b id="utc-clock">--:--:-- UTC</b><button class="header-button" data-action="settings">SETTINGS</button><button class="header-button" data-action="pause" id="pause-button">PAUSE</button></div>
      </header>
      <section id="mission-panel" class="mission-panel">
        <div class="eyebrow">MISSION CONTROL <span class="eyeline"></span></div>
        <h1>ORBITAL<br><em>DEFENSE</em></h1>
        <p class="mission-intro">Command the launch. Own the orbital corridor.</p>
        <div class="mission-select-label">SELECT ETHIOPIAN SPACECRAFT · DRAG TO INSPECT</div>
        <div class="satellite-options">
          <button class="satellite-option is-selected" data-satellite="ETRSS-1"><b>ETRSS-1</b><small>EARTH OBSERVATION · 1,000 WH</small></button>
          <button class="satellite-option" data-satellite="ET-SMART-RSS"><b>ET-SMART-RSS</b><small>SMART RELAY · 650 WH</small></button>
          <button class="satellite-option" data-satellite="ETHIO-DEEP-SPACE 1"><b>DEEP-SPACE 1</b><small>DEEP SPACE · 2,200 WH</small></button>
        </div>
        <label class="mission-select-label" for="destination-select">MISSION DESTINATION</label>
        <select id="destination-select" aria-label="Mission destination"><option value="LEO">LOW EARTH ORBIT</option><option value="MOON">MOON GATEWAY</option><option value="MARS">MARS INSERTION</option><option value="NEO">NEAR-EARTH OBJECT</option></select>
        <div class="home-actions"><button class="primary-button" data-action="start-mission"><span>START MISSION</span><b>↗</b></button><button class="ghost-button" data-action="settings">CONTROL OPTIONS</button></div>
        <div class="high-score-strip"><span>MISSION SYSTEMS</span><b>SFS2-STYLE FLIGHT</b><b>NASA NEO TRACKING</b></div>
      </section>
      <section id="telemetry-hud" class="telemetry-hud is-hidden" aria-label="Flight telemetry">
        <div class="telemetry-top">
          <div class="metric"><small>ALTITUDE</small><b><span id="hud-alt">0.0</span><i id="hud-alt-unit">KM</i></b><div class="meter-track"><i id="alt-meter"></i></div></div>
          <div class="metric"><small>VELOCITY</small><b><span id="hud-velocity">0</span><i id="hud-velocity-unit">M/S</i></b><div class="metric-sub">MACH <span id="hud-mach">0.0</span></div></div>
          <div class="metric q-metric"><small>DYNAMIC PRESSURE</small><b><span id="hud-q">0.0</span><i>KPA</i></b><div id="q-status" class="metric-sub status-normal">STRUCTURAL LOAD NORMAL</div></div>
          <div class="metric"><small>THROTTLE / TWR</small><b><span id="hud-throttle">0</span><i>%</i></b><div class="metric-sub">TWR <span id="hud-twr">0.00</span></div></div>
          <div class="metric apsis-metric"><small>APOAPSIS / PERIAPSIS</small><b><span id="hud-ap">—</span><i id="hud-apsis-unit">KM</i></b><div class="metric-sub">PE <span id="hud-pe">—</span> <span id="hud-pe-unit">KM</span></div></div>
          <div class="metric"><small>ORBIT / POWER</small><b><span id="hud-battery">0</span><i>WH</i></b><div class="metric-sub">SOLAR <span id="hud-solar">0</span> W</div></div>
        </div>
        <aside class="left-readout glass-panel">
          <div class="panel-heading"><span>MISSION TELEMETRY</span><b id="scene-label">PAYLOAD INSPECTION</b></div>
          <div class="readout-grid"><div><small>FLIGHT TIME</small><b id="hud-time">00:00</b></div><div><small>FUEL</small><b><span id="hud-fuel">100</span><i>%</i></b></div><div><small>MISSION TARGET</small><b id="destination-state">LEO</b></div><div><small>STAGE</small><b id="stage-state">BOOSTERS ATTACHED</b></div></div>
          <div class="mini-status"><span class="status-chip">DONKI <b id="hud-flare">LOW</b></span><span class="status-chip">TRACKED NEO <b id="hud-neos">0</b></span></div>
          <div class="tracked-line" id="neo-line">Awaiting NASA vector data…</div>
        </aside>
        <aside class="right-readout glass-panel">
          <div class="panel-heading"><span>FLIGHT SYSTEMS</span><span class="signal-bars"><i></i><i></i><i></i></span></div>
          <div class="system-row"><span>TRAJECTORY</span><b class="cyan" id="trajectory-state">STANDBY</b></div>
          <div class="system-row"><span>SAS HOLD</span><b id="hud-sas">OFF</b></div>
          <div class="system-row"><span>TIME WARP</span><b id="hud-warp">1×</b></div>
          <div class="system-row"><span>STRUCTURAL LOAD</span><b id="hud-load">NOMINAL</b></div>
          <div class="battery-track"><i id="battery-meter"></i></div>
          <div class="system-foot"><span>SPACE WEATHER</span><b id="radiation-status">NOMINAL</b></div>
        </aside>
        <div class="flight-aux-controls glass-panel">
          <label>SAS <select id="sas-select" aria-label="Stability augmentation mode"><option>Off</option><option>Prograde</option><option>Retrograde</option><option>Normal</option><option>Target</option></select></label>
          <label>TIME WARP <select id="warp-select" aria-label="Time warp rate"><option value="1">1×</option><option value="5">5×</option><option value="10">10×</option><option value="50">50×</option><option value="1000">1000×</option></select></label>
          <button class="camera-preset" data-action="camera-state" data-value="1B">LAUNCHPAD CAM</button><button class="camera-preset" data-action="camera-state" data-value="2">CHASE CAM</button><button class="camera-preset" data-action="camera-state" data-value="4">CINEMATIC CAM</button><button class="camera-preset" data-action="camera-state" data-value="5">ORBIT MAP CAM</button>
        </div>
        <div id="orbit-map-panel" class="orbit-map-panel glass-panel is-hidden" aria-label="Keplerian orbital map">
          <div class="panel-heading"><span>KEPLERIAN ORBIT PREDICTION</span><b id="orbit-element-readout">a — · e — · i —</b></div>
          <svg id="orbit-map" viewBox="0 0 400 260" role="img" aria-label="Predictive orbital map"><circle cx="200" cy="130" r="42" class="map-earth"/><circle cx="200" cy="130" r="49" class="map-atmosphere"/><path id="orbit-map-path" class="map-orbit" d=""/><circle id="map-ap-marker" class="map-apsis" cx="200" cy="20" r="4"/><circle id="map-pe-marker" class="map-periapsis" cx="200" cy="240" r="4"/><circle id="map-vessel-marker" class="map-vessel" cx="200" cy="32" r="5"/></svg>
          <div class="map-legend"><span>AP <b id="map-ap-label">—</b></span><span>PE <b id="map-pe-label">—</b></span><span>INCLINATION <b id="map-inclination">—</b></span></div>
        </div>
        <div id="maxq-alert" class="maxq-alert" role="alert"><span class="alert-icon">!</span><div><b>WARNING: MAX-Q STRESS LIMIT REACHED</b><small>STRUCTURAL LOAD EXCEEDS NOMINAL THRESHOLD</small></div></div>
        <div id="radar-tag" class="radar-tag">RADAR PULSE ACTIVE</div>
        <div class="flight-actions">
          <button data-action="stage" id="stage-button">STAGE: BOOSTERS</button>
          <button data-action="deploy" id="deploy-button">DEPLOY PAYLOAD</button>
          <button data-action="camera" id="camera-button">NEXT CAM <b id="camera-index">1A</b></button>
          <button data-action="scan">RADAR SCAN</button>
          <button data-action="debrief" id="debrief-button">DEBRIEF</button>
        </div>
        <div class="touch-controls">
          <div class="stick-wrap"><div id="flight-stick" class="stick-base" aria-label="Dual-axis flight attitude joystick"><div id="stick-knob" class="stick-knob"></div><span class="stick-axis pitch">PITCH</span><span class="stick-axis yaw">YAW</span></div><small>ATTITUDE CONTROL</small></div>
          <div class="roll-buttons"><button data-action="roll-left" aria-label="Roll left">↶</button><button data-action="roll-right" aria-label="Roll right">↷</button><small>ROLL</small></div>
          <div class="throttle-wrap"><label for="throttle-slider">THROTTLE <b id="throttle-label">0%</b></label><div class="throttle-stepper"><button data-action="throttle-step" data-value="-5" aria-label="Decrease throttle">−</button><input id="throttle-slider" type="range" min="0" max="100" step="1" value="0" orient="vertical" aria-label="Throttle 0 to 100 percent"/><button data-action="throttle-step" data-value="5" aria-label="Increase throttle">+</button></div></div>
          <button class="radar-button" data-action="scan"><span class="radar-icon">⌾</span><b>RADAR<br>SCAN</b></button>
        </div>
      </section>
      <section id="launch-prompt" class="launch-prompt is-hidden"><span class="launch-dot"></span><div><b>VEHICLE READY</b><small>THROTTLE UP · IGNITION SEQUENCE</small></div><button data-action="launch">IGNITION / LAUNCH</button></section>
      <section id="settings-panel" class="settings-panel glass-panel is-hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="settings-heading"><div><div class="eyebrow">FLIGHT SYSTEMS <span class="eyeline"></span></div><h2 id="settings-title">CONTROL OPTIONS</h2></div><button class="panel-close" data-action="close-settings" aria-label="Close settings">×</button></div>
        <div class="settings-grid">
          <label class="setting-row"><span>TOUCH SENSITIVITY <b id="sensitivity-value">1.00×</b></span><input data-setting="sensitivity" type="range" min="0.25" max="2" step="0.05" aria-label="Touch sensitivity"/></label>
          <label class="setting-row"><span>JOYSTICK DEADZONE <b id="deadzone-value">0.08</b></span><input data-setting="deadzone" type="range" min="0" max="0.35" step="0.01" aria-label="Joystick deadzone"/></label>
          <fieldset class="setting-row inversion-setting"><legend>GIMBAL AXIS INVERSION</legend><label><input data-setting="invertPitch" type="checkbox"/> PITCH</label><label><input data-setting="invertYaw" type="checkbox"/> YAW</label><label><input data-setting="invertRoll" type="checkbox"/> ROLL</label></fieldset>
          <label class="setting-row">GRAPHICS PRESET<select data-setting="graphics" aria-label="Graphics preset"><option value="low">LOW · MOBILE SAFE</option><option value="medium">MEDIUM · BALANCED</option><option value="ultra">ULTRA · FULL DETAIL</option></select></label>
          <label class="setting-row">TELEMETRY UNITS<select data-setting="units" aria-label="Telemetry units"><option value="metric">METRIC · KM / M/S</option><option value="imperial">IMPERIAL · MI / FT/S</option><option value="mach">MACH-BASED · KM / MACH</option></select></label>
        </div>
        <div class="settings-footer"><span>SETTINGS SAVE AUTOMATICALLY ON THIS DEVICE</span><button class="ghost-button" data-action="close-settings">DONE</button></div>
      </section>
      <section id="pause-panel" class="pause-panel glass-panel is-hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <span class="eyebrow">MISSION PAUSED</span><h2 id="pause-title">FLIGHT CONTROL</h2><div class="pause-actions"><button class="primary-button" data-action="resume-flight"><span>RESUME MISSION</span><b>↗</b></button><button class="ghost-button" data-action="settings">CONTROL OPTIONS</button><button class="ghost-button" data-action="return-home">RETURN TO HOME</button></div>
      </section>
      <section id="debrief-panel" class="debrief-panel is-hidden">
        <div class="eyebrow">MISSION RECORD <span class="eyeline"></span></div><h2>TELEMETRY<br><em>DEBRIEF</em></h2><p class="debrief-copy">Flight data captured. Mission systems standing by.</p>
        <div class="debrief-grid"><div><small>MAX ALTITUDE</small><b id="debrief-alt">0 KM</b></div><div><small>PEAK VELOCITY</small><b id="debrief-velocity">0 M/S</b></div><div><small>MAX-Q</small><b id="debrief-q">0 KPA</b></div><div><small>FUEL REMAINING</small><b id="debrief-fuel">100%</b></div><div><small>APOAPSIS / PERIAPSIS</small><b id="debrief-apsides">— / — KM</b></div><div><small>NEO TRACKS</small><b id="debrief-neos">0</b></div></div>
        <div class="rating-row"><span>MISSION RATING</span><b id="mission-rating">★★★★★</b></div><div class="debrief-buttons"><button class="primary-button" data-action="restart"><span>NEW MISSION</span><b>↗</b></button><button class="ghost-button" data-action="resume-flight">RETURN TO FLIGHT</button></div>
      </section>
      <div id="toast" class="toast" role="status"></div>
      <footer class="bottom-telemetry"><span>ETHIO-NASA FLIGHT SYSTEMS</span><span id="live-data-line">DONKI RADIATION: LOW · NEO TRACKING: STANDBY</span><span>SIM TIME <b id="hud-elapsed">00:00</b></span></footer>
    `
  }

  handleClick(event) {
    const select = event.target.closest('[data-satellite]')
    if (select) { this.actions('select-satellite', select.dataset.satellite); return }
    const button = event.target.closest('[data-action]')
    if (!button || button.disabled) return
    this.actions(button.dataset.action, button.dataset.value || '')
  }

  handleInput(event) {
    const control = event.target
    if (control.matches('#throttle-slider')) this.actions('throttle', Number(control.value) / 100)
    if (control.matches('[data-setting]')) this.commitSetting(control)
  }

  handleChange(event) {
    const control = event.target
    if (control.matches('#destination-select')) this.actions('destination', control.value)
    if (control.matches('#sas-select')) this.actions('sas', control.value)
    if (control.matches('#warp-select')) this.actions('time-warp', Number(control.value))
    if (control.matches('[data-setting]')) this.commitSetting(control)
  }

  commitSetting(control) {
    const value = control.type === 'checkbox' ? control.checked : control.type === 'range' ? Number(control.value) : control.value
    this.actions('setting', control.dataset.setting, value)
  }

  refreshSettings() {
    const settings = this.settings?.getAll?.() || {}
    this.root.querySelectorAll('[data-setting]').forEach(control => {
      const value = settings[control.dataset.setting]
      if (control.type === 'checkbox') control.checked = Boolean(value)
      else if (value !== undefined) control.value = String(value)
    })
    setText('sensitivity-value', `${fmt(settings.sensitivity ?? 1, 2)}×`)
    setText('deadzone-value', fmt(settings.deadzone ?? 0.08, 2))
  }

  startMission() {
    this.started = true
    document.getElementById('mission-panel').classList.add('is-hidden')
    document.getElementById('telemetry-hud').classList.remove('is-hidden')
    document.getElementById('launch-prompt').classList.remove('is-hidden')
    this.setScene('1A')
  }

  setScene(id) {
    const state = CAMERA_STATES.find(item => item.id === String(id))
    if (!state) return
    const home = state.id === '0'
    document.getElementById('mission-panel').classList.toggle('is-hidden', !home)
    document.getElementById('telemetry-hud').classList.toggle('is-hidden', home)
    if (home) document.getElementById('launch-prompt').classList.add('is-hidden')
    setText('scene-label', state.label)
    setText('camera-index', state.id)
    if (state.id === '3') this.showDebrief()
    else document.getElementById('debrief-panel').classList.add('is-hidden')
    const map = document.getElementById('orbit-map-panel')
    map.classList.toggle('is-hidden', state.id !== '5')
    map.classList.toggle('is-visible', state.id === '5')
    document.body.dataset.scene = state.id
  }

  setLaunchActive(active) {
    if (active) document.getElementById('launch-prompt').classList.add('is-hidden')
    else if (this.started) document.getElementById('launch-prompt').classList.remove('is-hidden')
  }

  setSatellite(name) {
    this.root.querySelectorAll('[data-satellite]').forEach(button => button.classList.toggle('is-selected', button.dataset.satellite === name))
    this.toast(`${name} PAYLOAD CONFIGURED`, 1500)
  }

  setDestination(name) { this.destination = name }
  setSAS(mode) { setText('hud-sas', mode.toUpperCase()); setValue('sas-select', mode) }
  setTimeWarp(rate) { setText('hud-warp', `${rate}×`); setValue('warp-select', rate) }
  setStageLabel(label, enabled = true) { setText('stage-button', label); this.setStageEnabled(enabled) }
  setStageState(label) { setText('stage-state', String(label || 'STANDBY').toUpperCase()) }
  setPaused(paused) {
    this.paused = Boolean(paused)
    document.getElementById('pause-button').textContent = this.paused ? 'PAUSED' : 'PAUSE'
    if (this.paused) this.openModal('pause-panel')
    else if (this.activeModal === 'pause-panel') this.closeModal()
  }
  showSettings() {
    this.openModal('settings-panel')
    this.refreshSettings()
  }
  closeSettings() {
    if (this.activeModal === 'settings-panel') this.closeModal()
  }

  openModal(id) {
    const modalIds = ['#settings-panel', '#pause-panel']
    const backgroundSelectors = ['.command-bar', '#mission-panel', '#telemetry-hud', '#launch-prompt', '#debrief-panel', '.bottom-telemetry', '#orbit-map-panel', '#maxq-alert', '#radar-tag', '#toast']
    if (!document.getElementById(id) || this.activeModal === id) return
    if (!this.modalSnapshot) {
      this.modalSnapshot = [...backgroundSelectors, ...modalIds].flatMap(selector => [...this.root.querySelectorAll(selector)]).map(element => ({
        element,
        hidden: element.classList.contains('is-hidden'),
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }))
    }
    if (this.activeModal) this.modalStack.push(this.activeModal)
    for (const { element } of this.modalSnapshot) {
      element.classList.add('is-hidden')
      element.inert = true
      element.setAttribute('aria-hidden', 'true')
    }
    const active = document.getElementById(id)
    active.classList.remove('is-hidden')
    active.inert = false
    active.removeAttribute('aria-hidden')
    this.activeModal = id
    this.root.dataset.modal = id
    active.querySelector('button')?.focus({ preventScroll: true })
  }

  closeModal() {
    if (!this.activeModal) return
    const previous = this.modalStack.pop()
    if (previous) {
      for (const id of ['settings-panel', 'pause-panel']) {
        const panel = document.getElementById(id)
        if (!panel) continue
        const active = id === previous
        panel.classList.toggle('is-hidden', !active)
        panel.inert = !active
        if (active) panel.removeAttribute('aria-hidden')
        else panel.setAttribute('aria-hidden', 'true')
      }
      this.activeModal = previous
      this.root.dataset.modal = previous
      document.getElementById(previous)?.querySelector('button')?.focus({ preventScroll: true })
      return
    }
    for (const state of this.modalSnapshot || []) {
      state.element.classList.toggle('is-hidden', state.hidden)
      state.element.inert = state.inert
      if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden')
      else state.element.setAttribute('aria-hidden', state.ariaHidden)
    }
    this.modalSnapshot = null
    this.activeModal = null
    delete this.root.dataset.modal
  }

  update(data) {
    if (!data) return
    const flight = data.flight || {}
    const orbit = data.orbit || {}
    const units = this.settings?.get?.('units') || 'metric'
    const altitude = Number.isFinite(flight.altitudeM) ? flight.altitudeM : (orbit.altitudeM || 0)
    const speed = Number.isFinite(flight.speedMps) ? flight.speedMps : (orbit.speedMps || 0)
    const miles = units === 'imperial'
    const alt = miles ? altitude / 1609.344 : altitude / 1000
    const velocity = units === 'mach' ? speed / 343 : miles ? speed * 3.28084 : speed
    setText('hud-alt', fmt(alt, 1))
    setText('hud-alt-unit', miles ? 'MI' : 'KM')
    setText('hud-velocity', fmt(velocity, units === 'mach' ? 2 : 0))
    setText('hud-velocity-unit', units === 'mach' ? 'MACH' : miles ? 'FT/S' : 'M/S')
    setText('hud-mach', fmt(speed / 343, 2))
    setText('hud-q', fmt((flight.qPa || 0) / 1000, 1))
    setText('hud-throttle', fmt(flight.throttle || 0, 0))
    setText('hud-twr', fmt(flight.twr ?? 0, 2))
    setText('hud-fuel', fmt(flight.fuelPercent ?? 100, 0))
    setText('hud-solar', fmt(orbit.solarInputW || 0, 0))
    setText('hud-battery', fmt(orbit.batteryWh || 0, 0))
    setText('hud-shields', `${fmt(orbit.shields ?? 50, 0)}%`)
    setText('hud-time', this.clock(flight.elapsed || orbit.elapsed || 0))
    setText('hud-elapsed', this.clock(data.elapsed || flight.elapsed || orbit.elapsed || 0))
    const apsides = data.apsides || orbit.apsides
    const altUnit = miles ? 'MI' : 'KM'
    const toDistance = meters => miles ? meters / 1609.344 : meters / 1000
    setText('hud-ap', Number.isFinite(apsides?.apoapsisAltitude) ? fmt(toDistance(apsides.apoapsisAltitude), 0) : '—')
    setText('hud-pe', Number.isFinite(apsides?.periapsisAltitude) ? fmt(toDistance(apsides.periapsisAltitude), 0) : '—')
    setText('hud-apsis-unit', altUnit); setText('hud-pe-unit', altUnit)
    const altMeter = document.getElementById('alt-meter'); if (altMeter) altMeter.style.width = `${Math.max(2, Math.min(100, (altitude / 500000) * 100))}%`
    const throttleMeter = document.getElementById('throttle-meter'); if (throttleMeter) throttleMeter.style.width = `${flight.throttle || 0}%`
    const stressed = (flight.qPa || 0) >= (flight.maxQLimitPa || 38000)
    const qState = document.getElementById('q-status')
    if (qState) { qState.textContent = stressed ? 'MAX-Q STRUCTURAL STRESS' : 'STRUCTURAL LOAD NORMAL'; qState.classList.toggle('status-alert', stressed); qState.classList.toggle('status-normal', !stressed) }
    setText('hud-load', stressed ? 'STRESS' : 'NOMINAL')
    const battery = document.getElementById('battery-meter'); if (battery) battery.style.width = `${orbit.batteryPercent || 0}%`
    const slider = document.getElementById('throttle-slider'); if (slider && document.activeElement !== slider) slider.value = String(Math.round(flight.throttle || 0))
    setText('throttle-label', `${fmt(flight.throttle || 0, 0)}%`)
    const flightStatus = document.getElementById('trajectory-state'); if (flightStatus) flightStatus.textContent = flight.launched ? (data.orbitActive ? 'ORBITAL ARC ACTIVE' : 'ASCENT ACTIVE') : 'STANDBY'
    setText('destination-state', data.destination || this.destination || 'LEO')
    const warning = document.getElementById('maxq-alert'); if (warning) warning.classList.toggle('is-visible', Boolean(flight.maxQReached && !data.ackMaxQ))
    setText('radiation-status', data.nasa?.radiationMultiplier > 1 ? 'SOLAR STORM' : 'NOMINAL')
    if (data.sasMode) this.setSAS(data.sasMode)
    if (data.timeWarp) this.setTimeWarp(data.timeWarp)
    this.updateOrbitMap(data.orbitSamples, data.elements, apsides, miles)
  }

  updateOrbitMap(samples, elements, apsides, imperial = false) {
    if (!Array.isArray(samples) || samples.length < 2) return
    const a = elements?.semiMajorAxis || elements?.a || 6_779_000
    const scale = 147 / a
    const point = vector => ({ x: 200 + vector[0] * scale, y: 130 - vector[2] * scale })
    const coords = samples.map(point)
    const path = document.getElementById('orbit-map-path')
    if (path) path.setAttribute('d', coords.map((value, index) => `${index ? 'L' : 'M'}${value.x.toFixed(1)},${value.y.toFixed(1)}`).join(' '))
    if (elements) setText('orbit-element-readout', `a ${fmt(a / 1000, 0)} km · e ${fmt(elements.eccentricity ?? elements.e ?? 0, 3)} · i ${fmt((elements.inclination ?? 0) * 180 / Math.PI, 1)}°`)
    const byRadius = [...coords].sort((left, right) => Math.hypot(left.x - 200, left.y - 130) - Math.hypot(right.x - 200, right.y - 130))
    const place = (id, xy) => { const marker = document.getElementById(id); if (marker) { marker.setAttribute('cx', xy.x); marker.setAttribute('cy', xy.y) } }
    if (byRadius.length) { place('map-pe-marker', byRadius[0]); place('map-ap-marker', byRadius[byRadius.length - 1]); place('map-vessel-marker', coords[Math.floor(coords.length / 2)]) }
    if (apsides) {
      const divisor = imperial ? 1609.344 : 1000
      setText('map-ap-label', `${fmt(apsides.apoapsisAltitude / divisor, 0)} ${imperial ? 'mi' : 'km'}`)
      setText('map-pe-label', `${fmt(apsides.periapsisAltitude / divisor, 0)} ${imperial ? 'mi' : 'km'}`)
    }
    if (elements) setText('map-inclination', `${fmt((elements.inclination ?? 0) * 180 / Math.PI, 1)}°`)
  }

  setNASA(data) {
    this.api = data
    setText('api-source', data.source || 'OFFLINE FALLBACK')
    setText('hud-neos', (data.asteroids || []).length)
    setText('hud-flare', (data.flares?.[0]?.classType || 'LOW').toUpperCase())
    const neo = data.asteroids?.[0]
    setText('neo-line', neo ? `${neo.name} · ${fmt(neo.relativeVelocityKps, 1)} km/s · ${fmt(neo.missDistanceAu, 2)} AU` : 'No current NEO vectors')
    setText('live-data-line', `${data.source || 'OFFLINE FALLBACK'} · DONKI ${data.flares?.[0]?.classType || 'LOW'} · ${data.asteroids?.length || 0} NEO TRACKS`)
    setText('debrief-neos', data.asteroids?.length || 0)
  }

  showDebrief(data = null) {
    const box = document.getElementById('debrief-panel')
    box.classList.remove('is-hidden')
    if (data) {
      const units = this.settings?.get?.('units') || 'metric'
      const factor = units === 'imperial' ? 1609.344 : 1000
      const altUnit = units === 'imperial' ? 'MI' : 'KM'
      setText('debrief-alt', `${fmt((data.flight?.altitudeM || 0) / factor, 1)} ${altUnit}`)
      const speed = data.flight?.speedMps || data.orbit?.speedMps || 0
      const velocity = units === 'mach' ? speed / 343 : units === 'imperial' ? speed * 3.28084 : speed
      const velocityUnit = units === 'mach' ? 'MACH' : units === 'imperial' ? 'FT/S' : 'M/S'
      setText('debrief-velocity', `${fmt(velocity, units === 'mach' ? 2 : 0)} ${velocityUnit}`)
      setText('debrief-q', `${fmt((data.flight?.qPa || 0) / 1000, 1)} KPA`)
      setText('debrief-fuel', `${fmt(data.flight?.fuelPercent ?? 100, 0)}%`)
      const a = data.apsides
      setText('debrief-apsides', a ? `${fmt(a.apoapsisAltitude / factor, 0)} / ${fmt(a.periapsisAltitude / factor, 0)} ${altUnit}` : '— / — KM')
    }
    document.getElementById('mission-rating').textContent = data?.flight?.maxQReached ? '★★★★☆' : '★★★★★'
  }

  setRadar(active) { document.getElementById('radar-tag').classList.toggle('is-visible', active) }
  setStageEnabled(enabled) { const button = document.getElementById('stage-button'); if (button) button.disabled = !enabled }
  setOrbitActive(active) { document.getElementById('deploy-button').classList.toggle('is-hidden', active) }

  toast(message, duration = 2200) {
    const el = document.getElementById('toast'); el.textContent = message; el.classList.add('is-visible')
    clearTimeout(this.alertTimer); this.alertTimer = setTimeout(() => el.classList.remove('is-visible'), duration)
  }

  clock(seconds) { const value = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
}
