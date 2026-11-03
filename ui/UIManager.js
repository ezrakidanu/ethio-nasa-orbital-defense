import { CAMERA_STATES } from '../engine/CameraController.js'

const fmt = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value) }

export class UIManager {
  constructor(root, actions) {
    this.root = root
    this.actions = actions
    this.started = false
    this.api = null
    this.alertTimer = 0
    this.root.innerHTML = this.template()
    this.loaderTimer = setTimeout(() => document.getElementById('boot-loader')?.classList.add('is-hidden'), 650)
    this.setStageEnabled(false)
    this.root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]')
      if (!button || button.disabled) return
      this.actions(button.dataset.action, button.dataset.value || '')
    })
    this.root.addEventListener('click', event => {
      const select = event.target.closest('[data-satellite]')
      if (select) this.actions('select-satellite', select.dataset.satellite)
    })
    this.root.addEventListener('input', event => {
      if (event.target.matches('#throttle-slider')) this.actions('throttle', Number(event.target.value) / 100)
    })
    setText('utc-clock', new Date().toISOString().slice(11, 19) + ' UTC')
    this.clockTimer = setInterval(() => setText('utc-clock', new Date().toISOString().slice(11, 19) + ' UTC'), 1000)
  }

  template() {
    return `
      <div id="boot-loader" class="boot-loader" role="status" aria-live="polite"><div class="boot-card"><img src="./assets/share/favicon.png" alt=""/><span class="boot-kicker">ETHIO-NASA // MISSION SYSTEMS</span><b>ORBITAL DEFENSE</b><i class="boot-progress"><span></span></i><small>INITIALIZING FLIGHT DYNAMICS · LOADING MISSION DATA</small></div></div>
      <header class="command-bar">
        <div class="brand"><span class="brand-mark"><i></i><i></i><i></i></span><div><b>ETHIO-NASA</b><small>ORBITAL DEFENSE // COMMAND HQ</small></div></div>
        <div class="top-status"><span class="live-dot"></span><span id="api-source">CONNECTING NASA TELEMETRY</span><b id="utc-clock">--:--:-- UTC</b></div>
      </header>
      <section id="mission-panel" class="mission-panel">
        <div class="eyebrow">MISSION CONTROL <span class="eyeline"></span></div>
        <h1>ORBITAL<br><em>DEFENSE</em></h1>
        <p class="mission-intro">Launch. Deploy. Protect the orbital corridor.</p>
        <div class="mission-select-label">SELECT SPACECRAFT</div>
        <div class="satellite-options">
          <button class="satellite-option is-selected" data-satellite="ETRSS-1"><b>ETRSS-1</b><small>SCAN 100 · SPEED 60 · SHIELDS 50 · 1000 Wh</small></button>
          <button class="satellite-option" data-satellite="ET-SMART-RSS"><b>ET-SMART-RSS</b><small>SCAN 70 · SPEED 90 · SHIELDS 35 · 650 Wh</small></button>
          <button class="satellite-option" data-satellite="ETHIO-DEEP-SPACE 1"><b>DEEP-SPACE 1</b><small>SCAN 85 · SPEED 40 · SHIELDS 95 · 2200 Wh</small></button>
        </div>
        <label class="mission-select-label" for="destination-select">DESTINATION</label>
        <select id="destination-select" aria-label="Mission destination"><option value="LEO">LOW EARTH ORBIT</option><option value="MOON">MOON GATEWAY</option><option value="MARS">MARS INSERTION</option><option value="NEO">DEEP SPACE NEO</option></select>
        <button class="primary-button" data-action="start-mission"><span>START MISSION</span><b>↗</b></button>
        <div class="high-score-strip"><span>HIGH SCORES</span><b>ETHIO-1 <i>98,500</i></b><b>MAKAVELI <i>84,200</i></b><b>BASHA <i>76,900</i></b></div>
      </section>
      <section id="telemetry-hud" class="telemetry-hud is-hidden" aria-label="Flight telemetry">
        <div class="telemetry-top">
          <div class="metric"><small>ALTITUDE</small><b><span id="hud-alt">0.0</span><i>KM</i></b><div class="meter-track"><i id="alt-meter"></i></div></div>
          <div class="metric"><small>VELOCITY</small><b><span id="hud-velocity">0</span><i>M/S</i></b><div class="metric-sub">MACH <span id="hud-mach">0.0</span></div></div>
          <div class="metric q-metric"><small>DYNAMIC PRESSURE</small><b><span id="hud-q">0.0</span><i>KPA</i></b><div id="q-status" class="metric-sub status-normal">STRUCTURAL LOAD NORMAL</div></div>
          <div class="metric"><small>THROTTLE</small><b><span id="hud-throttle">0</span><i>%</i></b><div class="meter-track"><i id="throttle-meter"></i></div></div>
        </div>
        <div class="left-readout glass-panel">
          <div class="panel-heading"><span>MISSION TELEMETRY</span><b id="scene-label">HANGAR VIEW</b></div>
          <div class="readout-grid"><div><small>FLIGHT TIME</small><b id="hud-time">00:00</b></div><div><small>FUEL</small><b><span id="hud-fuel">100</span><i>%</i></b></div><div><small>SOLAR POWER</small><b><span id="hud-solar">0</span><i>W</i></b></div><div><small>BATTERY</small><b><span id="hud-battery">0</span><i>Wh</i></b></div></div>
          <div class="mini-status"><span class="status-chip">DONKI <b id="hud-flare">LOW</b></span><span class="status-chip">TRACKED NEO <b id="hud-neos">0</b></span></div>
          <div class="tracked-line" id="neo-line">Awaiting NASA vector data…</div>
        </div>
        <div class="right-readout glass-panel">
          <div class="panel-heading"><span>FLIGHT SYSTEMS</span><span class="signal-bars"><i></i><i></i><i></i></span></div>
          <div class="system-row"><span>TRAJECTORY ARC</span><b class="cyan" id="trajectory-state">STANDBY</b></div>
          <div class="system-row"><span>STAGE</span><b id="stage-state">CORE / BOOSTERS</b></div>
          <div class="system-row"><span>DESTINATION</span><b class="cyan" id="destination-state">LEO</b></div>
          <div class="trajectory-arc"><svg viewBox="0 0 220 72" role="img" aria-label="Trajectory arc"><path d="M4 62 C55 59 72 6 136 22 S186 61 216 7" fill="none" stroke="#16384e" stroke-width="2"/><path id="trajectory-path" d="M4 62 C55 59 72 6 136 22 S186 61 216 7" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="250" stroke-dashoffset="250"/><circle cx="216" cy="7" r="3.5" fill="#b8ef55"/></svg></div>
          <div class="system-row"><span>SHIELDS</span><b id="hud-shields">100%</b></div>
          <div class="battery-track"><i id="battery-meter"></i></div>
          <div class="system-foot"><span>SPACE WEATHER</span><b id="radiation-status">NOMINAL</b></div>
        </div>
        <div id="maxq-alert" class="maxq-alert" role="alert"><span class="alert-icon">!</span><div><b>WARNING: MAX-Q STRESS LIMIT REACHED</b><small>STRUCTURAL LOAD EXCEEDS NOMINAL THRESHOLD</small></div></div>
        <div id="radar-tag" class="radar-tag">RADAR PULSE ACTIVE</div>
        <div class="flight-actions">
          <button data-action="stage" id="stage-button">STAGE SEPARATION</button>
          <button data-action="deploy" id="deploy-button">DEPLOY PAYLOAD</button>
          <button data-action="camera" id="camera-button">CAMERA <b id="camera-index">0</b></button>
          <button data-action="debrief" id="debrief-button">DEBRIEF</button>
        </div>
        <div class="touch-controls">
          <div class="stick-wrap"><div id="flight-stick" class="stick-base" aria-label="Flight attitude joystick"><div id="stick-knob" class="stick-knob"></div><span class="stick-axis pitch">PITCH</span><span class="stick-axis yaw">YAW</span></div><small>ATTITUDE CONTROL</small></div>
          <div class="roll-buttons"><button data-action="roll-left" aria-label="Roll left">↶</button><button data-action="roll-right" aria-label="Roll right">↷</button><small>ROLL</small></div>
          <div class="throttle-wrap"><label for="throttle-slider">THROTTLE <b id="throttle-label">0%</b></label><input id="throttle-slider" type="range" min="0" max="100" value="0" orient="vertical" aria-label="Throttle 0 to 100 percent"/><small>0&nbsp;&nbsp;&nbsp;&nbsp;100</small></div>
          <button class="radar-button" data-action="scan"><span class="radar-icon">⌾</span><b>RADAR<br>SCAN</b></button>
        </div>
      </section>
      <section id="launch-prompt" class="launch-prompt is-hidden"><span class="launch-dot"></span><div><b>VEHICLE READY</b><small>THROTTLE UP · IGNITION SEQUENCE</small></div><button data-action="launch">IGNITION / LAUNCH</button></section>
      <section id="debrief-panel" class="debrief-panel is-hidden">
        <div class="eyebrow">MISSION RECORD <span class="eyeline"></span></div><h2>TELEMETRY<br><em>DEBRIEF</em></h2><p class="debrief-copy">Flight data captured. Mission systems standing by.</p>
        <div class="debrief-grid"><div><small>MAX ALTITUDE</small><b id="debrief-alt">0 KM</b></div><div><small>PEAK VELOCITY</small><b id="debrief-velocity">0 M/S</b></div><div><small>MAX-Q</small><b id="debrief-q">0 KPA</b></div><div><small>FUEL REMAINING</small><b id="debrief-fuel">100%</b></div><div><small>BATTERY</small><b id="debrief-battery">0 Wh</b></div><div><small>NEO TRACKS</small><b id="debrief-neos">0</b></div></div>
        <div class="rating-row"><span>MISSION RATING</span><b id="mission-rating">★★★★★</b></div><div class="debrief-buttons"><button class="primary-button" data-action="restart"><span>NEW MISSION</span><b>↗</b></button><button class="ghost-button" data-action="resume">RETURN TO FLIGHT</button></div>
      </section>
      <div id="toast" class="toast" role="status"></div>
      <footer class="bottom-telemetry"><span>ETHIO-NASA FLIGHT SYSTEMS</span><span id="live-data-line">DONKI RADIATION: LOW · NEO TRACKING: STANDBY</span><span>SIM TIME <b id="hud-elapsed">00:00</b></span></footer>
    `
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
    setText('scene-label', state.label)
    setText('camera-index', state.id)
    if (state.id === '3') this.showDebrief()
    else document.getElementById('debrief-panel').classList.add('is-hidden')
    document.body.dataset.scene = state.id
  }

  setLaunchActive(active) {
    if (active) document.getElementById('launch-prompt').classList.add('is-hidden')
    else if (this.started) document.getElementById('launch-prompt').classList.remove('is-hidden')
  }

  setSatellite(name) {
    document.querySelectorAll('[data-satellite]').forEach(button => button.classList.toggle('is-selected', button.dataset.satellite === name))
    this.toast(`${name} PAYLOAD CONFIGURED`, 1500)
  }

  setDestination(name) { this.destination = name }

  update(data) {
    if (!data) return
    const flight = data.flight || {}
    const orbit = data.orbit || {}
    setText('hud-alt', fmt((flight.altitudeM || 0) / 1000, 1))
    setText('hud-velocity', fmt(flight.speedMps || orbit.speedMps || 0, 0))
    setText('hud-mach', fmt(flight.mach || ((orbit.speedMps || 0) / 330), 1))
    setText('hud-q', fmt((flight.qPa || 0) / 1000, 1))
    setText('hud-throttle', fmt(flight.throttle || 0, 0))
    setText('hud-fuel', fmt(flight.fuelPercent ?? 100, 0))
    setText('hud-solar', fmt(orbit.solarInputW || 0, 0))
    setText('hud-battery', `${fmt(orbit.batteryWh || 0, 0)}/${fmt(orbit.batteryCapacityWh || 1000, 0)}`)
    setText('hud-shields', `${fmt(orbit.shields ?? 50, 0)}%`)
    setText('hud-time', this.clock(flight.elapsed || orbit.elapsed || 0))
    setText('hud-elapsed', this.clock(flight.elapsed || orbit.elapsed || 0))
    const altMeter = document.getElementById('alt-meter'); if (altMeter) altMeter.style.width = `${Math.max(2, Math.min(100, ((flight.altitudeM || 0) / 500000) * 100))}%`
    const throttleMeter = document.getElementById('throttle-meter'); if (throttleMeter) throttleMeter.style.width = `${flight.throttle || 0}%`
    const qState = document.getElementById('q-status')
    if (qState) { const stressed = (flight.qPa || 0) >= (flight.maxQLimitPa || 38000); qState.textContent = stressed ? 'MAX-Q STRUCTURAL STRESS' : 'STRUCTURAL LOAD NORMAL'; qState.classList.toggle('status-alert', stressed); qState.classList.toggle('status-normal', !stressed) }
    const trail = document.getElementById('trajectory-path'); if (trail) trail.style.strokeDashoffset = String(250 - (Math.min(100, flight.altitudeM / 1000) / 100) * 250)
    const battery = document.getElementById('battery-meter'); if (battery) battery.style.width = `${orbit.batteryPercent || 0}%`
    const slider = document.getElementById('throttle-slider'); if (slider && document.activeElement !== slider) slider.value = String(Math.round(flight.throttle || 0))
    setText('throttle-label', `${fmt(flight.throttle || 0, 0)}%`)
    const flightStatus = document.getElementById('trajectory-state'); if (flightStatus) flightStatus.textContent = flight.launched ? (data.orbitActive ? 'ORBITAL ARC ACTIVE' : 'ASCENT ACTIVE') : 'STANDBY'
    setText('stage-state', flight.staged ? 'CORE STAGE' : 'CORE / BOOSTERS')
    setText('destination-state', data.destination || this.destination || 'LEO')
    const warning = document.getElementById('maxq-alert'); if (warning) warning.classList.toggle('is-visible', Boolean(flight.maxQReached && !data.ackMaxQ))
    setText('radiation-status', data.nasa?.radiationMultiplier > 1 ? 'SOLAR STORM' : 'NOMINAL')
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
      setText('debrief-alt', `${fmt((data.flight?.altitudeM || 0) / 1000, 1)} KM`)
      setText('debrief-velocity', `${fmt(data.flight?.speedMps || data.orbit?.speedMps || 0, 0)} M/S`)
      setText('debrief-q', `${fmt((data.flight?.qPa || 0) / 1000, 1)} KPA`)
      setText('debrief-fuel', `${fmt(data.flight?.fuelPercent ?? 100, 0)}%`)
      setText('debrief-battery', `${fmt(data.orbit?.batteryWh || 0, 0)} Wh`)
    }
    document.getElementById('mission-rating').textContent = data?.flight?.maxQReached ? '★★★★☆' : '★★★★★'
  }

  setRadar(active) { document.getElementById('radar-tag').classList.toggle('is-visible', active) }
  setStageEnabled(enabled) { const button = document.getElementById('stage-button'); if (button) button.disabled = !enabled }
  setOrbitActive(active) { document.getElementById('deploy-button').classList.toggle('is-hidden', active); document.getElementById('stage-button').classList.toggle('is-hidden', active) }

  toast(message, duration = 2200) {
    const el = document.getElementById('toast'); el.textContent = message; el.classList.add('is-visible')
    clearTimeout(this.alertTimer); this.alertTimer = setTimeout(() => el.classList.remove('is-visible'), duration)
  }

  clock(seconds) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
}
