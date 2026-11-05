import type { Input } from '../engine/input'
import { PARTS, validateBuild, type BuildPlan, type VehicleStats } from './vab/parts'
import type { Telemetry } from './flight-sim'

type UiAction = (action: string, value?: string) => void

type BuildPreview = { plan: BuildPlan; stats: VehicleStats; funds: number }

const number = (value: number, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—'

export class SimulatorUI {
  readonly root: HTMLElement
  screen = 'splash'
  private readonly action: UiAction
  private lastBuild?: BuildPreview
  private timeSinceTelemetry = 0
  private portrait = false
  private lastRoverSpeed = -1

  constructor(root: HTMLElement, input: Input, action: UiAction) {
    this.root = root
    this.action = action
    root.innerHTML = this.markup()
    this.bindActions(input)
    this.bindTouch(input)
    this.show('splash')
    this.portrait = matchMedia('(orientation: portrait)').matches
    window.addEventListener('orientationchange', () => { this.portrait = matchMedia('(orientation: portrait)').matches })
  }

  private markup(): string {
    return `
      <div class="orientation-warning" aria-live="polite"><div class="rotate-icon">↻</div><strong>LANDSCAPE REQUIRED</strong><span>Rotate your device to enter mission control.</span></div>
      <section class="screen intro-screen is-active" data-screen="splash" aria-label="MG Studio introduction">
        <div class="intro-scanline"></div>
        <div class="intro-core">
          <div class="mg-mark" aria-hidden="true"><svg viewBox="0 0 140 140"><path d="M70 7 130 42v56l-60 35L10 98V42L70 7Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m33 91V50l18 26 19-26v41M77 91V50h29v12H91v5h12v11H91v13" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="square" stroke-linejoin="miter"/><circle cx="116" cy="28" r="4" fill="currentColor"/></svg></div>
          <div class="intro-eyebrow">MG STUDIO PRESENTS</div>
          <h1>ETHIO-NASA</h1><div class="intro-subtitle">ORBITAL DEFENSE</div>
          <div class="intro-credit">CREATED BY <strong>EZRA KIDANU</strong></div>
          <div class="intro-progress"><i></i></div>
          <div class="intro-status">INITIALIZING FLIGHT SYSTEMS</div>
          <button class="intro-audio-hint" data-action="activate-sound">TAP TO ACTIVATE CINEMATIC AUDIO</button>
        </div>
        <div class="intro-corner intro-left">ESA / E-NASA<br>MISSION CONTROL</div><div class="intro-corner intro-right">BUILD 0.9.4<br>ORBITAL SYSTEMS</div>
      </section>

      <section class="screen title-screen" data-screen="title" aria-label="Main menu">
        <div class="title-top"><div class="wordmark"><b>ETHIO<span>-</span>NASA</b><small>ORBITAL DEFENSE SIMULATOR</small></div><div class="title-status"><i></i> SYSTEMS NOMINAL <span>UTC 18:44:09</span></div></div>
        <div class="title-copy"><div class="eyebrow">MG STUDIO / INDEPENDENT SPACEFLIGHT</div><h2>THE NEXT<br><em>FRONTIER.</em></h2><p>Design your vehicle. Own your trajectory.<br>Protect the orbital commons.</p>
          <div class="title-actions"><button class="button button-primary" data-action="vab"><span>01</span><b>VEHICLE ASSEMBLY</b><small>OPEN THE VAB</small></button><button class="button button-secondary" data-action="surface-mission"><span>02</span><b>LUNAR SURVEY</b><small>SURFACE OPERATIONS</small></button><button class="button button-tertiary" data-action="continue"><span>03</span><b>FLIGHT TRAINING</b><small>ORBITAL DEFENSE</small></button></div>
          <div class="title-footer"><span>DESIGNED & BUILT BY <b>EZRA KIDANU</b></span><span>ORIGINAL GAMEPLAY / NO THIRD-PARTY FRANCHISE ASSETS</span></div>
        </div>
        <div class="title-telemetry"><div class="telemetry-label">LIVE MISSION FEED</div><div class="orbit-status"><span class="pulse"></span><b>LOW EARTH ORBIT</b><span>ACTIVE</span></div><div class="mini-grid"><div><small>VEHICLES</small><b>03</b></div><div><small>FLIGHT RULE</small><b>RK4 + J2</b></div><div><small>DEFENSE NET</small><b>READY</b></div></div><div class="model-loading">MODELS <span data-ui="asset-status">LOADING</span> <button class="model-retry" data-action="retry-assets">RETRY</button></div></div>
        <div class="title-bottom"><span>ETHIO-NASA FLIGHT DIRECTORATE</span><span>THREE.JS / LANDSCAPE DISPLAY</span><button data-action="settings">SETTINGS</button></div>
      </section>

      <section class="screen vab-screen" data-screen="vab" aria-label="Vehicle assembly building">
        <header class="panel-header"><button class="icon-button" data-action="title" aria-label="Back to main menu">←</button><div><small>ETHIO-NASA / VEHICLE ASSEMBLY BUILDING</small><h2>VAB <span>DESIGN BAY 04</span></h2></div><div class="vab-header-right"><span class="status-pill"><i></i> POWER / ONLINE</span><span>MISSION BUDGET <b data-ui="vab-budget">$100,000</b></span></div></header>
        <main class="vab-layout">
          <aside class="vab-catalog"><div class="section-label">PARTS CATALOG <span>DRAG OR TAP TO ADD</span></div><div class="catalog-tabs"><button class="is-selected" data-filter="all">ALL SYSTEMS</button><button data-filter="propulsion">PROPULSION</button><button data-filter="science">SCIENCE</button></div><div class="part-grid" data-ui="part-catalog"></div><div class="catalog-hint"><kbd>DRAG</kbd> modules onto the stack to snap-connect. Click to attach at the final node.</div></aside>
          <section class="vab-center"><div class="build-view-label"><span>VEHICLE STACK / NODE SNAP</span><div class="build-view-actions"><span>WORLD GRID <b>0.25 M</b></span><button data-action="save-build">SAVE DESIGN</button><button data-action="load-build">LOAD DESIGN</button></div></div><div class="assembly-viewport"><div class="assembly-axis"></div><div class="snap-target" data-ui="drop-zone"><span>DROP TO SNAP / CONNECTOR READY</span></div><div class="stack-card" data-ui="build-list"></div><div class="assembly-bottom"><span>ACTIVE ROOT <b>Kestrel Command Capsule</b></span><span>STAGES <b data-ui="stage-count">03</b></span></div></div><div class="build-alert" data-ui="build-errors" role="status"></div></section>
          <aside class="vab-analysis"><div class="section-label">VEHICLE ANALYSIS <span>LIVE</span></div><div class="analysis-callout"><small>THRUST-TO-WEIGHT</small><b data-ui="stat-twr">—</b><span>EARTH / SEA LEVEL</span></div><div class="analysis-table"><div><span>DRY MASS</span><b data-ui="stat-dry">—</b><small>KG</small></div><div><span>PROPELLANT</span><b data-ui="stat-fuel">—</b><small>KG</small></div><div class="analysis-total"><span>WET MASS</span><b data-ui="stat-wet">—</b><small>KG</small></div><div><span>MAX THRUST</span><b data-ui="stat-thrust">—</b><small>KN</small></div><div><span>POWER BALANCE</span><b data-ui="stat-power">—</b><small>W</small></div><div><span>SCIENCE PAYLOAD</span><b data-ui="stat-science">—</b><small>PTS</small></div><div><span>VEHICLE COST</span><b data-ui="stat-cost">—</b><small>CR</small></div></div><div class="stage-list-title">STAGING / SEPARATION ORDER</div><div data-ui="stage-summaries" class="stage-summaries"></div><button class="button button-primary vab-launch" data-action="launch"><span>▶</span><b>LAUNCH VEHICLE</b><small>COMMIT TO FLIGHT</small></button></aside>
        </main>
      </section>

      <section class="screen hud-screen" data-screen="hud" aria-label="Flight operations">
        <header class="hud-top"><div class="hud-brand"><b>ETHIO<span>-</span>NASA</b><small>FLIGHT OPERATIONS</small></div><div class="mission-title"><small>MISSION TELEMETRY / <span data-ui="soi">EARTH</span> FRAME</small><b data-ui="mission-title">ORBITAL DEFENSE / MISSION 01</b></div><div class="mission-objective"><small>MISSION OBJECTIVE</small><span data-ui="objective">Load mission objective</span></div><button class="icon-button pause-button" data-action="pause" aria-label="Pause mission">Ⅱ</button></header>
        <div class="flight-state-badge"><i></i><b data-ui="flight-phase">PAD / READY</b><span data-ui="time-warp">1×</span></div>
        <div class="flight-left">
          <div class="instrument-panel"><div class="panel-title">ORBITAL ELEMENTS <small>OSCULATING / J2</small></div><div class="orbit-ring"><div class="ring-center"><b data-ui="altitude">0.0</b><small>KM ALT</small></div><span class="orbit-dot"></span></div><div class="orbit-readouts"><div><small>APOAPSIS</small><b data-ui="apoapsis">—</b><em>KM</em></div><div><small>PERIAPSIS</small><b data-ui="periapsis">—</b><em>KM</em></div><div><small>INCLINATION</small><b data-ui="inclination">—</b><em>°</em></div></div></div>
          <div class="instrument-panel vessel-panel"><div class="panel-title">VEHICLE <small data-ui="stage">STAGE 02</small></div><div class="fuel-row"><span>PROPELLANT</span><b data-ui="fuel">0 KG</b></div><div class="meter"><i data-ui="fuel-bar"></i></div><div class="fuel-row"><span>POWER / NET</span><b data-ui="power">+0 W</b></div><div class="meter meter-power"><i data-ui="power-bar"></i></div><div class="fuel-row"><span>BATTERY</span><b data-ui="battery">100%</b></div><div class="meter meter-battery"><i data-ui="battery-bar"></i></div></div>
        </div>
        <div class="flight-right">
          <div class="instrument-panel flight-data"><div class="panel-title">FLIGHT DATA <small>LIVE / SI</small></div><div class="data-item"><small>VELOCITY</small><b data-ui="speed">0.000</b><em>KM/S</em></div><div class="data-item"><small>DYNAMIC PRESSURE</small><b data-ui="q">0.0</b><em>KPA</em></div><div class="data-item"><small>RE-ENTRY HEAT</small><b data-ui="heat">0.0</b><em>MW/M²</em></div><div class="data-item"><small>SCIENCE RETURN</small><b data-ui="science">0</b><em>PTS</em></div><div class="data-item"><small>CAMPAIGN FUNDS</small><b data-ui="funds">100,000</b><em>CR</em></div></div>
          <div class="throttle-panel"><div class="throttle-header"><span>THROTTLE</span><b data-ui="throttle-readout">18%</b></div><input data-range="throttle" type="range" min="0" max="100" step="1" value="18" aria-label="Engine throttle"><div class="throttle-scale"><span>0</span><span>50</span><span>100</span></div><div class="engine-status"><i></i> <span data-ui="engine-status">ENGINE STANDBY</span></div></div>
        </div>
        <div class="flight-controls"><div class="control-row"><div class="sas-group"><small>SAS / ATTITUDE</small><button data-action="sas-prograde">PROGRADE</button><button data-action="sas-retrograde">RETROGRADE</button></div><button class="control-button" data-action="stage"><kbd>E</kbd><b>STAGE</b><small>SEPARATE</small></button><button class="control-button" data-action="cockpit"><kbd>C</kbd><b>COCKPIT</b><small>INTERIOR VIEW</small></button><button class="control-button" data-action="eva"><kbd>V</kbd><b>EVA / RCS</b><small>SPACEWALK</small></button><button class="control-button" data-action="map"><kbd>M</kbd><b>MAP VIEW</b><small>TRAJECTORY</small></button><div class="warp-group"><small>TIME WARP</small><button data-action="warp" data-value="1">1×</button><button data-action="warp" data-value="5">5×</button><button data-action="warp" data-value="20">20×</button><button data-action="warp" data-value="100">100×</button></div></div><div class="input-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ATTITUDE <span>•</span> <kbd>E</kbd> STAGE / INTERACT <span>•</span> <kbd>SPACE</kbd> EVA RCS <span>•</span> <kbd>ESC</kbd> PAUSE</div></div>
        <div class="flight-notice" data-ui="notice" role="status">SYSTEMS NOMINAL</div>
        <div class="map-label" data-ui="map-label"><span>MAP MODE</span><small>J2 / PERTURBED TRAJECTORY PREVIEW</small><button data-action="transfer">EXECUTE LUNAR TRANSFER</button><button data-action="map">EXIT MAP</button></div>
        <div class="eva-hint" data-ui="eva-hint"><b>EVA RCS CONTROL</b><span>WASD MOVE / SPACE UP / E RETURN TO CAPSULE</span><button data-action="return-capsule">RETURN TO CAPSULE</button><button data-action="rover">BOARD ROVER</button></div>
        <div class="touch-controls" aria-label="Touch controls"><div class="touch-pad" data-touch="move"><span>ATTITUDE</span><i></i></div><div class="touch-look" data-touch="look"><span>LOOK</span></div><div class="touch-buttons"><button data-touch-button="interact">STAGE / E</button><button data-touch-button="jump">RCS UP</button><button data-touch-button="dash">BOOST</button></div></div>
      </section>

      <section class="screen rover-screen" data-screen="rover" aria-label="Lunar surface rover mission">
        <header class="hud-top rover-top"><div class="hud-brand"><b>ETHIO<span>-</span>NASA</b><small>SURFACE OPERATIONS</small></div><div class="mission-title"><small>MISSION 02 / LUNAR SURVEY</small><b>SIX-WHEEL ROVER / FIELD UNIT</b></div><div class="mission-objective"><small>OBJECTIVE</small><span data-ui="objective">Drive to the survey station.</span></div><button class="icon-button" data-action="pause">Ⅱ</button></header>
        <div class="rover-telemetry"><div><small>LOCAL SPEED</small><b data-ui="rover-speed">0.0</b><em>M/S</em></div><div><small>POWER</small><b data-ui="battery">100%</b><em>BATTERY</em></div><div><small>SURFACE SAMPLE</small><b data-ui="science">0</b><em>PTS</em></div></div>
        <div class="rover-compass"><span>FIELD HEADING</span><b>N <i>•</i> E <i>•</i> S <i>•</i> W</b></div>
        <div class="rover-controls"><div class="control-hint"><kbd>W</kbd><kbd>S</kbd> DRIVE <span>•</span> <kbd>A</kbd><kbd>D</kbd> STEER <span>•</span> <kbd>E</kbd> EXIT TO EVA</div><button class="control-button" data-action="exit-rover"><b>EXIT TO EVA</b><small>SPACEWALK / SURFACE</small></button><button class="control-button" data-action="vab"><b>MISSION SELECT</b><small>RETURN TO VAB</small></button></div>
        <div class="touch-controls" aria-label="Touch controls"><div class="touch-pad" data-touch="move"><span>DRIVE</span><i></i></div><div class="touch-look" data-touch="look"><span>LOOK</span></div><div class="touch-buttons"><button data-touch-button="interact">EXIT / E</button></div></div>
        <div class="flight-notice" data-ui="notice">ROVER READY</div>
      </section>

      <section class="screen pause-screen" data-screen="pause" aria-label="Pause menu"><div class="pause-card"><small>MISSION CONTROL / LINK HELD</small><h2>FLIGHT <em>PAUSED</em></h2><p>Vehicle state and orbital time are frozen.</p><button class="button button-primary" data-action="resume"><span>▶</span><b>RESUME FLIGHT</b><small>RETURN TO COCKPIT</small></button><button class="button button-secondary" data-action="title"><span>⌂</span><b>ABORT TO HANGAR</b><small>RETURN TO MAIN MENU</small></button></div></section>

      <section class="screen settings-screen" data-screen="settings" aria-label="Settings"><div class="pause-card settings-card"><small>ETHIO-NASA / FLIGHT SYSTEMS</small><h2>SIMULATOR <em>SETTINGS</em></h2><div class="settings-row"><span>RENDER QUALITY</span><select data-setting="quality"><option value="low">LOW</option><option value="medium" selected>MEDIUM</option><option value="high">HIGH</option></select></div><div class="settings-row"><span>MUSIC LEVEL</span><input data-setting="music" type="range" min="0" max="100" value="55"></div><div class="settings-row"><span>SFX LEVEL</span><input data-setting="sfx" type="range" min="0" max="100" value="70"></div><button class="button button-primary" data-action="settings-close"><span>✓</span><b>APPLY / CLOSE</b><small>SETTINGS ARE LOCAL TO THIS DEVICE</small></button></div></section>
      <div class="global-toast" data-ui="toast" aria-live="polite"></div>
    `
  }

  private bindActions(input: Input): void {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (target) {
        event.preventDefault()
        this.action(target.dataset.action ?? '', target.dataset.value)
        return
      }
      const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part-id]')
      if (part) this.action('add-part', part.dataset.partId)
    })
    this.root.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement
      if (target.dataset.range === 'throttle') this.action('throttle', target.value)
      if (target.dataset.setting === 'music' || target.dataset.setting === 'sfx' || target.dataset.setting === 'quality') this.action('setting', `${target.dataset.setting}:${target.value}`)
    })
    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement
      if (target.dataset.setting === 'quality') this.action('setting', `quality:${target.value}`)
    })
    this.root.addEventListener('dragstart', (event) => {
      const part = (event.target as HTMLElement).closest<HTMLElement>('[data-part-id]')
      if (part && event.dataTransfer) {
        event.dataTransfer.setData('text/plain', part.dataset.partId ?? '')
        event.dataTransfer.effectAllowed = 'copy'
      }
    })
    const dropZone = this.root.querySelector<HTMLElement>('[data-ui="drop-zone"]')
    dropZone?.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('drop-active') })
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drop-active'))
    dropZone?.addEventListener('drop', (event) => {
      event.preventDefault()
      dropZone.classList.remove('drop-active')
      const typeId = event.dataTransfer?.getData('text/plain')
      if (typeId) this.action('add-part', typeId)
    })
    this.root.addEventListener('click', (event) => {
      const remove = (event.target as HTMLElement).closest<HTMLElement>('[data-remove-part]')
      if (remove) this.action('remove-part', remove.dataset.removePart)
      const stage = (event.target as HTMLElement).closest<HTMLElement>('[data-stage-part]')
      if (stage) this.action('cycle-part-stage', stage.dataset.stagePart)
    })
    this.root.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement
      if (!target.matches('button, input, select, [tabindex]')) return
      if (event.key === 'Enter' || event.key === ' ') target.click()
    })
    this.root.addEventListener('contextmenu', (event) => event.preventDefault())
    this.root.addEventListener('click', (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-filter]')
      if (!tab) return
      const category = tab.dataset.filter ?? 'all'
      for (const sibling of this.root.querySelectorAll<HTMLElement>('.catalog-tabs [data-filter]')) {
        sibling.classList.toggle('is-selected', sibling === tab)
      }
      this.root.querySelector('.catalog-tabs button:not([data-filter])')?.classList.toggle('is-selected', category === 'all')
      for (const card of this.root.querySelectorAll<HTMLElement>('.part-card')) {
        const type = card.dataset.category ?? ''
        const matches = category === 'all' || category === 'propulsion'
          ? category === 'all' || ['tank', 'engine', 'decoupler', 'fairing'].includes(type)
          : ['science', 'payload', 'power', 'rover'].includes(type)
        card.hidden = !matches
      }
    })
    this.root.dataset.inputReady = String(!!input)
  }

  show(screen: string): void {
    this.screen = screen
    for (const section of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      section.classList.toggle('is-active', section.dataset.screen === screen)
    }
    this.root.dataset.screen = screen
    this.root.classList.toggle('is-portrait', this.portrait)
    document.body.classList.toggle('in-mission', screen === 'hud' || screen === 'rover')
  }

  renderBuild(plan: BuildPlan, stats: VehicleStats): void {
    this.lastBuild = { plan, stats, funds: Math.max(0, plan.budget - stats.totalCost) }
    const catalog = this.root.querySelector<HTMLElement>('[data-ui="part-catalog"]')
    if (catalog) {
      catalog.innerHTML = Object.values(PARTS).map((part) => `<button class="part-card" data-part-id="${part.id}" data-category="${part.category}" draggable="true"><span class="part-accent" style="--part:${part.color}"></span><span class="part-category">${part.category.toUpperCase()}</span><b>${part.displayName}</b><small>${number(part.dryMassKg)} KG · ${number(part.cost)} CR</small><em>${part.thrustN ? `${number(part.thrustN / 1000)} KN` : part.electricalGenerationW ? `+${number(part.electricalGenerationW)} W` : part.scienceValue ? `${part.scienceValue} SCIENCE` : 'MODULAR'}</em></button>`).join('')
    }
    const list = this.root.querySelector<HTMLElement>('[data-ui="build-list"]')
    if (list) {
      list.innerHTML = plan.parts.map((part) => {
        const def = PARTS[part.typeId]!
        const parent = part.parentUid ? plan.parts.find((candidate) => candidate.uid === part.parentUid) : undefined
        return `<div class="stack-part" data-stage="${part.stage}"><span class="part-node"></span><div><b>${def.displayName}</b><small>${def.category.toUpperCase()} / ${def.dryMassKg} KG${parent ? ` / SNAP → ${PARTS[parent.typeId]?.displayName ?? 'NODE'}` : ' / ROOT NODE'}</small></div><button data-stage-part="${part.uid}" title="Cycle stage">S${part.stage}</button><button data-remove-part="${part.uid}" aria-label="Remove ${def.displayName}">×</button></div>`
      }).join('') || '<div class="empty-stack">ADD A COMMAND CAPSULE TO BEGIN</div>'
    }
    const set = (key: string, value: string) => { const el = this.root.querySelector<HTMLElement>(`[data-ui="${key}"]`); if (el) el.textContent = value }
    set('vab-budget', `$${number(plan.budget)}`)
    set('stat-twr', stats.twr.toFixed(2))
    set('stat-dry', number(stats.dryMassKg))
    set('stat-fuel', number(stats.fuelKg))
    set('stat-wet', number(stats.wetMassKg))
    set('stat-thrust', number(stats.maxThrustN / 1000, 1))
    set('stat-power', `${stats.netPowerW >= 0 ? '+' : ''}${number(stats.netPowerW)}`)
    set('stat-science', number(stats.scienceScore))
    set('stat-cost', number(stats.totalCost))
    set('stage-count', String(stats.stageSummaries.length).padStart(2, '0'))
    const stages = this.root.querySelector<HTMLElement>('[data-ui="stage-summaries"]')
    if (stages) stages.innerHTML = stats.stageSummaries.slice().reverse().map((stage) => `<div class="stage-summary"><b>S${stage.stage}</b><span>${stage.partCount} PARTS</span><small>${number(stage.thrustN / 1000, 1)} KN</small></div>`).join('') || '<small>NO STAGES</small>'
    const issues = validateBuild(plan)
    const errorBox = this.root.querySelector<HTMLElement>('[data-ui="build-errors"]')
    if (errorBox) {
      errorBox.classList.toggle('is-ok', issues.length === 0)
      errorBox.innerHTML = issues.length ? `<b>FLIGHT READINESS / ${issues.length} ISSUE(S)</b><span>${issues.join('<br>')}</span>` : '<b>FLIGHT READINESS / GO</b><span>CREW MODULE, POWER, ENGINE, PAYLOAD AND BUDGET VERIFIED</span>'
    }
    const launch = this.root.querySelector<HTMLButtonElement>('[data-action="launch"]')
    if (launch) launch.disabled = issues.length > 0
  }

  setAssetStatus(status: string): void {
    const label = this.root.querySelector<HTMLElement>('[data-ui="asset-status"]')
    if (label) label.textContent = status
    const retry = this.root.querySelector<HTMLElement>('.model-retry')
    if (retry) retry.classList.toggle('is-visible', /FAILED|RETRY|OFFLINE/i.test(status))
  }

  updateTelemetry(t: Telemetry, delta: number): void {
    this.timeSinceTelemetry += delta
    if (this.timeSinceTelemetry < 0.08) return
    this.timeSinceTelemetry = 0
    const set = (key: string, value: string) => { const node = this.root.querySelector<HTMLElement>(`[data-ui="${key}"]`); if (node) node.textContent = value }
    set('soi', t.soi)
    set('mission-title', t.mission)
    set('objective', t.objective)
    set('flight-phase', t.altitudeKm < 100 ? 'ASCENT / ATMOSPHERE' : t.apoapsisKm !== null ? 'ORBITAL INSERTION' : 'FLIGHT / BALLISTIC')
    set('time-warp', `${t.mode === 'rover' ? 'SURFACE' : ''}${this.root.querySelectorAll('[data-action="warp"].is-selected').item(0)?.textContent ?? '1×'}`)
    set('altitude', number(t.altitudeKm, 1))
    set('apoapsis', t.apoapsisKm === null ? 'ESCAPE' : number(t.apoapsisKm, 1))
    set('periapsis', number(t.periapsisKm, 1))
    set('inclination', number(t.inclinationDeg, 1))
    set('fuel', `${number(t.fuelKg)} KG`)
    set('power', `${t.powerW >= 0 ? '+' : ''}${number(t.powerW)} W`)
    set('battery', `${number(t.batteryPct * 100)}%`)
    set('speed', number(t.speedKmS, 3))
    set('q', number(t.dynamicPressureKPa, 1))
    set('heat', number(t.heatMWM2, 2))
    set('science', number(t.science))
    set('funds', number(t.funds))
    set('stage', `STAGE ${String(t.stage).padStart(2, '0')}`)
    set('throttle-readout', `${number(t.throttle * 100)}%`)
    set('engine-status', t.fuelKg > 0 && t.throttle > 0 ? 'BURN / NOMINAL' : 'ENGINE STANDBY')
    set('notice', t.notice)
    set('rover-speed', Math.abs(t.roverSpeed).toFixed(1))
    const bar = (key: string, value: number) => { const el = this.root.querySelector<HTMLElement>(`[data-ui="${key}"]`); if (el) el.style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }
    bar('fuel-bar', t.fuelKg / Math.max(1, this.lastBuild?.stats.fuelKg ?? t.fuelKg))
    bar('power-bar', Math.max(0, Math.min(1, (t.powerW + 300) / 1200)))
    bar('battery-bar', t.batteryPct)
    const throttle = this.root.querySelector<HTMLInputElement>('[data-range="throttle"]')
    if (throttle && document.activeElement !== throttle) throttle.value = String(Math.round(t.throttle * 100))
    this.root.querySelector('[data-ui="map-label"]')?.classList.toggle('is-visible', t.mode === 'map')
    this.root.querySelector('[data-ui="eva-hint"]')?.classList.toggle('is-visible', t.mode === 'eva')
    this.root.querySelector('.flight-state-badge')?.classList.toggle('is-warning', t.dynamicPressureKPa > 35 || t.heatMWM2 > 0.9)
    this.root.querySelector('.flight-state-badge')?.classList.toggle('is-complete', t.objective.toLowerCase().includes('complete'))
    if (Math.abs(t.roverSpeed - this.lastRoverSpeed) > 0.4) this.lastRoverSpeed = t.roverSpeed
  }

  setToast(message: string): void {
    const toast = this.root.querySelector<HTMLElement>('[data-ui="toast"]')
    if (!toast) return
    toast.textContent = message
    toast.classList.add('is-visible')
    window.setTimeout(() => toast.classList.remove('is-visible'), 3500)
  }

  private bindTouch(input: Input): void {
    const pad = this.root.querySelector<HTMLElement>('[data-touch="move"]')
    const look = this.root.querySelector<HTMLElement>('[data-touch="look"]')
    const activePointers = new Map<number, { target: 'move' | 'look'; x: number; y: number }>()
    const release = (id: number) => {
      const active = activePointers.get(id)
      if (!active) return
      activePointers.delete(id)
      if (active.target === 'move') input.setTouchMove(0, 0)
    }
    const moveStart = (event: PointerEvent, target: 'move' | 'look') => {
      const node = target === 'move' ? pad : look
      if (!node) return
      event.preventDefault()
      node.setPointerCapture(event.pointerId)
      activePointers.set(event.pointerId, { target, x: event.clientX, y: event.clientY })
      if (target === 'move') this.updateStick(event, node, input)
    }
    pad?.addEventListener('pointerdown', (event) => moveStart(event, 'move'))
    look?.addEventListener('pointerdown', (event) => moveStart(event, 'look'))
    const pointerMove = (event: PointerEvent) => {
      const current = activePointers.get(event.pointerId)
      if (!current) return
      const node = current.target === 'move' ? pad : look
      if (current.target === 'move' && node) this.updateStick(event, node, input)
      if (current.target === 'look') {
        input.addTouchLook(event.clientX - current.x, event.clientY - current.y)
        current.x = event.clientX; current.y = event.clientY
      }
    }
    this.root.addEventListener('pointermove', pointerMove)
    this.root.addEventListener('pointerup', (event) => release(event.pointerId))
    this.root.addEventListener('pointercancel', (event) => release(event.pointerId))
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-touch-button]')) {
      const action = button.dataset.touchButton as 'jump' | 'sprint' | 'dash' | 'interact'
      button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); input.setTouchButton(action, true) })
      const up = () => input.setTouchButton(action, false)
      button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up)
    }
  }

  private updateStick(event: PointerEvent, node: HTMLElement, input: Input): void {
    const rect = node.getBoundingClientRect()
    const x = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.34)))
    const y = Math.max(-1, Math.min(1, -((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.34))))
    input.setTouchMove(x, y)
    const knob = node.querySelector<HTMLElement>('i')
    if (knob) knob.style.transform = `translate(${x * 30}px, ${-y * 30}px)`
  }
}
