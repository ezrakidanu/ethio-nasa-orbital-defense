import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
const rocketAsset = `${import.meta.env.BASE_URL}assets/models/orbital-launch-vehicle.glb`
const astronautAsset = `${import.meta.env.BASE_URL}assets/models/astronaut-pilot.glb`
import { Audio } from './engine/audio'
import { Renderer } from './engine/renderer'
import { atmosphereAt, stagnationHeatFlux } from './physics/environment'
import { EARTH, orbitalElements, predictTrajectory, type OrbitalState, type Vec3 } from './physics/orbit'
import { PHYSICS_HZ, type PhysicsCommand, type PhysicsResponse } from './physics/worker'
import { PART_CATALOG, addPart, calculateBuildStats, createBuild, jettisonFairings, separateNextStage, type PartKind, type VehicleBuild } from './vab/model'

type Mode = 'menu' | 'mission' | 'vab' | 'flight'
type Activity = 'orbit' | 'eva' | 'rover'
const $ = <T extends HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector)!
const fmt = (n: number, digits = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const clamp = (v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v))
class OrbitalScene {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.001, 300)
  readonly renderer: Renderer
  readonly earth = new THREE.Group()
  readonly vehicle = new THREE.Group()
  private stars?: THREE.Points
  private orbit?: THREE.Line
  private rocket?: THREE.Object3D
  private astronaut?: THREE.Object3D
  private activity: Activity = 'orbit'
  private cockpit = false
  private roverDistance = 0
  private cameraAzimuth = 0.82
  private cameraElevation = 1.15
  private attitude = { x: 0, y: 0 }

  constructor(canvas:HTMLCanvasElement, quality:'low'|'medium'|'high') {
    this.renderer=new Renderer(canvas,quality)
    this.scene.background=new THREE.Color('#020611')
    this.scene.fog=new THREE.FogExp2('#07101f',0.0015)
    this.camera.position.set(2.8,1.3,2.8)
    const amb=new THREE.HemisphereLight(0xbad8ff,0x080b16,1.5); this.scene.add(amb)
    const sun=new THREE.DirectionalLight(0xffedc5,3.2); sun.position.set(-5,4,6); this.scene.add(sun)
    this.makeEarth(); this.makeStars(); this.makeStation(); this.makeVehicle()
    this.scene.add(this.earth,this.vehicle)
    this.scene.add(new THREE.AmbientLight(0xffffff,0.45))
    window.addEventListener('resize',()=>this.renderer.resize())
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId)})
    canvas.addEventListener('pointermove',e=>{if(canvas.hasPointerCapture(e.pointerId)){this.cameraAzimuth-=e.movementX*.004;this.cameraElevation=clamp(this.cameraElevation-e.movementY*.003,.15,2.6)}})
  }
  private makeEarth(){
    const mat=new THREE.MeshStandardMaterial({color:'#164b80',roughness:0.8,metalness:0.06,emissive:'#05182d',emissiveIntensity:0.55})
    const globe=new THREE.Mesh(new THREE.SphereGeometry(1,72,48),mat); globe.position.y=-0.015; globe.userData.base=true; this.earth.add(globe)
    const cloud=new THREE.Mesh(new THREE.SphereGeometry(1.008,48,32),new THREE.MeshBasicMaterial({color:'#5cbefc',transparent:true,opacity:.12,side:THREE.BackSide})); this.earth.add(cloud)
    for(let i=0;i<16;i++){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.002+i*.0008,.0015,5,160),new THREE.MeshBasicMaterial({color:i%2?'#4a9fff':'#cce6ff',transparent:true,opacity:.1}))
      ring.rotation.x=Math.PI/2+(i%4)*.07; ring.rotation.y=i*.39; this.earth.add(ring)
    }
  }
  private makeStars(){
    const positions=new Float32Array(5000*3)
    for(let i=0;i<5000;i++){const r=THREE.MathUtils.randFloat(8,180),a=Math.random()*Math.PI*2,z=THREE.MathUtils.randFloatSpread(2);const q=Math.sqrt(1-z*z);positions[i*3]=r*q*Math.cos(a);positions[i*3+1]=r*z;positions[i*3+2]=r*q*Math.sin(a)}
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(positions,3)); this.stars=new THREE.Points(geo,new THREE.PointsMaterial({color:'#d7e8ff',size:.075,transparent:true,opacity:.85}));this.scene.add(this.stars)
  }
  private makeStation(){
    const g=new THREE.Group(); const body=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.22,16),new THREE.MeshStandardMaterial({color:'#d6dce5',metalness:.7,roughness:.35}));g.add(body)
    for(const x of [-1,1]){const panel=new THREE.Mesh(new THREE.BoxGeometry(.5,.012,.13),new THREE.MeshStandardMaterial({color:'#1e3d69',metalness:.65,roughness:.35,emissive:'#102241'}));panel.position.x=x*.28;g.add(panel)}
    g.position.set(-1.23,.18,.32);g.rotation.z=.3; this.scene.add(g)
  }
  private async makeVehicle(){
    const fallback=new THREE.Group();
    const hull=new THREE.Mesh(new THREE.CylinderGeometry(.04,.055,.32,12),new THREE.MeshStandardMaterial({color:'#ded7c5',metalness:.55,roughness:.45})); fallback.add(hull)
    const cap=new THREE.Mesh(new THREE.ConeGeometry(.04,.11,12),new THREE.MeshStandardMaterial({color:'#d5aa55',metalness:.45}));cap.position.y=.21;fallback.add(cap)
    const engine=new THREE.Mesh(new THREE.CylinderGeometry(.065,.035,.08,12),new THREE.MeshStandardMaterial({color:'#717986',metalness:.8,roughness:.25}));engine.position.y=-.2;fallback.add(engine)
    this.rocket=fallback
    try{const gltf=await new GLTFLoader().loadAsync(rocketAsset);this.rocket=gltf.scene; this.fitModel(this.rocket,.42)}catch(e){console.warn('Rocket model unavailable; using local procedural craft.',e)}
    this.vehicle.add(this.rocket); this.rocket.position.set(1.04,.03,0)
    const people = await new GLTFLoader().loadAsync(astronautAsset).catch(()=>null)
    if(people){this.astronaut=people.scene;this.fitModel(this.astronaut,.16);this.astronaut.position.set(1.1,.04,.12);this.astronaut.visible=false;this.vehicle.add(this.astronaut)}
  }
  private fitModel(model:THREE.Object3D,height:number){const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());const s=height/Math.max(size.x,size.y,size.z);model.scale.setScalar(s);model.position.sub(center.multiplyScalar(s));model.rotation.x=Math.PI/2}
  setActivity(a:Activity){this.activity=a;if(this.astronaut)this.astronaut.visible=a==='eva';this.vehicle.visible=a!=='rover';if(a==='rover')this.vehicle.visible=true}
  setCockpit(value:boolean){this.cockpit=value}
  setAttitude(x:number,y:number){this.attitude.x=x;this.attitude.y=y}
  setOrbit(points:Vec3[]){if(this.orbit){this.scene.remove(this.orbit);this.orbit.geometry.dispose();(this.orbit.material as THREE.Material).dispose();this.orbit=undefined}if(points.length<2)return;const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x/EARTH.meanRadius,p.y/EARTH.meanRadius,p.z/EARTH.meanRadius)));this.orbit=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#ffd271',transparent:true,opacity:.75}));this.scene.add(this.orbit)}
  setState(s:OrbitalState){const p=new THREE.Vector3(s.position.x/EARTH.meanRadius,s.position.y/EARTH.meanRadius,s.position.z/EARTH.meanRadius);this.vehicle.position.copy(p);if(this.rocket){this.rocket.position.set(0,0,0);this.rocket.rotation.z=Math.atan2(s.velocity.y,s.velocity.x)-Math.PI/2+this.attitude.x*.3;this.rocket.rotation.x=this.attitude.y*.3}if(this.cockpit&&this.activity==='orbit'){this.camera.position.copy(p).add(new THREE.Vector3(.08,.08,.14));this.camera.lookAt(p.clone().add(new THREE.Vector3(0,.02,-.1)))} }
  render(dt:number){if(this.activity==='rover')this.roverDistance+=dt*3;this.earth.rotation.y+=dt*.018;if(this.stars)this.stars.rotation.y+=dt*.0003;if(!this.cockpit){const target=this.vehicle.position.clone();const radius=3.35;const desired=new THREE.Vector3(Math.sin(this.cameraAzimuth)*radius,this.cameraElevation,Math.cos(this.cameraAzimuth)*radius);this.camera.position.lerp(desired,Math.min(1,dt*.45));this.camera.lookAt(target)}this.renderer.render(this.scene,this.camera)}
}

export class OrbitalApp {
  private canvas=$<HTMLCanvasElement>('#game'); private host=$<HTMLDivElement>('#ui')
  private audio=new Audio(); private scene:OrbitalScene
  private screen:Mode='menu'; private activity:Activity='orbit'; private build:VehicleBuild; private budget=5_500_000
  private state:OrbitalState={position:{x:EARTH.meanRadius+400_000,y:0,z:0},velocity:{x:0,y:7_670,z:300},mass:46_000,time:0}
  private worker:Worker; private throttle=0; private timeScale=1; private running=false; private sas='OFF'; private stageIndex=0; private fairing=true; private landingLegs=false; private missionName='Ethiopian Earth Observation'; private maxQ=0; private drag=0; private heat=0; private evaPos={x:0,y:0,z:0}; private roverSpeed=0; private cockpit=false

  constructor(){
    this.scene=new OrbitalScene(this.canvas,'medium')
    this.build=createBuild([
      {id:'payload',kind:'satellite-payload',mountMode:'side',positionM:5,stage:2,fuelFraction:1},
      {id:'sensor',kind:'optical-sensor',mountMode:'side',positionM:4.2,stage:2},
      {id:'fairing',kind:'fairing',mountMode:'shell',positionM:3.8,stage:2},
      {id:'capsule',kind:'capsule',positionM:3,stage:2},
      {id:'upper-engine',kind:'engine',positionM:2,stage:2},
      {id:'upper-tank',kind:'tank',positionM:1.3,stage:2,fuelFraction:.45},
      {id:'booster-engine',kind:'engine',positionM:.5,stage:1},
      {id:'booster-tank',kind:'tank',positionM:0,stage:1,fuelFraction:.85},
      {id:'solar',kind:'solar-array',mountMode:'side',positionM:4.5,stage:2},
    ])
    this.worker=new Worker(new URL('./physics/worker.ts',import.meta.url),{type:'module'})
    this.worker.onmessage=(ev:MessageEvent<PhysicsResponse>)=>{const msg=ev.data;if(msg.type==='state'||msg.type==='ready'){this.state=msg.state;this.scene.setState(this.state);this.updateFlight()}}
    this.worker.postMessage({type:'init',state:this.state,stepsPerTick:1} satisfies PhysicsCommand)
    this.makeShell();this.showMenu();this.updateOrbit()
    const start=performance.now();const tick=(now:number)=>{this.scene.render(Math.min(.05,(now-(this.lastFrame??now))/1000));this.lastFrame=now;if(this.screen==='menu'&&now-start>=2500&&this.splashVisible){this.splashVisible=false;$('#boot')?.classList.add('fade-out')}requestAnimationFrame(tick)};requestAnimationFrame(tick)
  }
  private lastFrame?:number;private splashVisible=true
  private makeShell(){this.host.innerHTML=`<div id="boot" class="boot"><div class="brand-mark"><span class="mark-orbit"></span><span class="mark-star">✦</span></div><div class="boot-brand">MG STUDIO</div><div class="boot-credit">DEVELOPED BY MG STUDIO / EZRA KIDANU</div><div class="boot-sub">FLIGHT SYSTEMS INITIALIZING</div><div class="boot-progress"><i></i></div></div><div class="app-shell"><header class="topbar"><a class="brand" data-action="home"><span class="brand-glyph">◈</span><span>ETHIO<span class="gold">—</span>NASA</span></a><span class="top-status"><i></i> OFFLINE MISSION SYSTEMS</span><button class="icon-button" data-action="sound" aria-label="Toggle sound">♫</button></header><main id="screen" class="screen"></main><footer><span>MG STUDIO · EZRA KIDANU</span><span>NASA SPACE APPS CHALLENGE · 2026</span></footer></div>`
    this.host.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(b)this.act(b.dataset.action!,b)});this.host.addEventListener('input',e=>this.onInput(e));this.host.addEventListener('change',e=>this.onInput(e));this.host.addEventListener('pointerdown',e=>{const t=(e.target as HTMLElement).closest<HTMLElement>('[data-stick]');if(t){t.setPointerCapture(e.pointerId);this.controlStick(e)}});this.host.addEventListener('pointermove',e=>{if((e.target as HTMLElement).hasPointerCapture(e.pointerId))this.controlStick(e)});this.host.addEventListener('pointerup',e=>{const t=e.target as HTMLElement;if(t.hasPointerCapture(e.pointerId))t.releasePointerCapture(e.pointerId)})
    setTimeout(()=>{const b=$('#boot');if(b)b.classList.add('fade-out')},2500);setTimeout(()=>{$('#boot')?.remove()},3050)
  }
  private top(){return this.host.querySelector<HTMLElement>('#screen')!}
  private switchMode(m:Mode){this.screen=m;this.top().scrollTop=0;this.top().classList.toggle('flight-screen',m==='flight')}
  private act(action:string,el:HTMLElement){this.audio.unlock();this.audio.play('ui');switch(action){
    case 'home':this.stopFlight();this.showMenu();break
    case 'mission':this.showMission();break
    case 'mission-go':this.missionName=$<HTMLSelectElement>('#mission-select')?.value||this.missionName;this.showVab();break
    case 'vab':this.showVab();break
    case 'part':this.addVabPart(el.dataset.kind as PartKind);break
    case 'remove':this.removeVabPart(el.dataset.id!);break
    case 'launch':this.launch();break
    case 'stage':this.stage();break
    case 'fairing':this.jettison();break
    case 'map':this.showMap();break
    case 'flight':this.activity='orbit';this.scene.setActivity('orbit');this.showFlight();break
    case 'eva':this.activity=this.activity==='eva'?'orbit':'eva';this.scene.setActivity(this.activity);this.showFlight();break
    case 'rover':this.activity=this.activity==='rover'?'orbit':'rover';this.scene.setActivity(this.activity);this.showFlight();break
    case 'cockpit':this.scene.setCockpit(!this.cockpit);this.cockpit=!this.cockpit;this.showFlight();break
    case 'sas-prograde':this.sas=this.sas==='PROGRADE'?'OFF':'PROGRADE';this.showFlight();break
    case 'sas-retrograde':this.sas=this.sas==='RETROGRADE'?'OFF':'RETROGRADE';this.showFlight();break
    case 'legs':this.landingLegs=!this.landingLegs;el.classList.toggle('active',this.landingLegs);break
    case 'scale':this.timeScale=Number(el.dataset.scale)||1;this.worker.postMessage({type:'set-time-scale',scale:this.timeScale} satisfies PhysicsCommand);this.showFlight();break
    case 'throttle-up':this.throttle=clamp(this.throttle+10,0,100);this.showFlight();break
    case 'throttle-down':this.throttle=clamp(this.throttle-10,0,100);this.showFlight();break
    case 'eva-move':this.evaPos.x+=Number(el.dataset.x||0)*.2;this.evaPos.y+=Number(el.dataset.y||0)*.2;this.showFlight();break
    case 'rover-left':this.roverSpeed=clamp(this.roverSpeed-.3,-4,4);break
    case 'rover-right':this.roverSpeed=clamp(this.roverSpeed+.3,-4,4);break
    case 'sound':this.audio.play('ui');break
    case 'restart':this.launch();break
  }}
  private onInput(e:Event){const t=e.target as HTMLInputElement;if(t.dataset.action==='throttle'){this.throttle=Number(t.value);if(this.screen==='flight')this.refreshHud()}}
  private controlStick(e:PointerEvent){const el=e.target as HTMLElement;const r=el.getBoundingClientRect();const x=clamp((e.clientX-r.left)/r.width*2-1,-1,1);const y=clamp((e.clientY-r.top)/r.height*2-1,-1,1);this.scene.setAttitude(x,y)}
  private showMenu(){this.switchMode('menu');this.scene.setActivity('orbit');this.top().innerHTML=`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-dot"></span> ETHIOPIA · LOW EARTH ORBIT</div><h1>DEFEND<br><em>THE ORBIT.</em></h1><p class="lead">Design and fly an Earth-observation mission. Balance payload, power, propellant and orbital precision—then build, launch, and operate the spacecraft.</p><div class="hero-actions"><button class="primary" data-action="mission">PLAN YOUR MISSION <span>→</span></button><button class="text-button" data-action="vab">ENTER THE VAB ↗</button></div><div class="hero-stats"><div><b>2026</b><small>SPACE APPS CHALLENGE</small></div><div><b>3</b><small>MISSION PHASES</small></div><div><b>120 <small>Hz</small></b><small>ORBITAL SOLVER</small></div></div></div><div class="hero-panel"><div class="panel-top"><span>MISSION CONTROL</span><span class="live-dot">● LIVE</span></div><div class="orbit-graphic"><div class="orbit-ring one"></div><div class="orbit-ring two"></div><div class="planet"></div><div class="satellite">✦</div><span class="orbit-label label-a">LEO / 400 KM</span><span class="orbit-label label-b">ETHIOPIA</span></div><div class="telemetry-mini"><span><small>MISSION</small><b>ORBITAL DEFENSE</b></span><span><small>FLIGHT MODE</small><b class="green-text">OFFLINE READY</b></span></div></div><div class="hero-caption">A PLAYABLE ORBITAL MISSION SIMULATOR <span>01 / 03</span></div></section><section class="feature-strip"><div><b>01</b><span><strong>DESIGN</strong><small>Build a balanced vehicle in the VAB</small></span></div><div><b>02</b><span><strong>ASCEND</strong><small>Stage, steer and manage your launch</small></span></div><div><b>03</b><span><strong>OPERATE</strong><small>Map, EVA and maintain the payload</small></span></div></section>`}
  private showMission(){this.switchMode('mission');this.top().innerHTML=`<section class="page"><div class="page-heading"><div><div class="eyebrow">MISSION DESIGN · 01</div><h2>Choose the objective.</h2><p>Every kilogram, watt, and dollar has a destination.</p></div><span class="step-chip">01 — 03</span></div><div class="mission-layout"><div class="mission-list"><label class="field-label">SELECT MISSION PROFILE</label><select id="mission-select"><option>Ethiopian Earth Observation</option><option>Rift Valley SAR Survey</option><option>Orbital Defense Demonstrator</option></select><article class="mission-card selected"><span class="card-icon">⌖</span><div><b>Earth observation constellation</b><p>Deploy an optical imaging payload into a 400 km circular orbit at 51.6° inclination.</p><small>SCIENCE · MISSION 01 · SOLO</small></div><span class="check">✓</span></article><div class="objective-row"><span>ORBITAL ALTITUDE <b>400 KM</b></span><span>INCLINATION <b>51.6°</b></span><span>MISSION WINDOW <b>30 DAYS</b></span></div></div><aside class="budget-card"><div class="eyebrow">PROGRAMME BUDGET</div><strong class="budget-value">$5.5<span>M</span></strong><div class="budget-meter"><i></i></div><p>Allocate launch and spacecraft funds in the assembly building.</p><div class="budget-line"><span>Available</span><b>$5,500,000</b></div><div class="budget-line"><span>Payload ceiling</span><b>1,500 kg</b></div><div class="budget-line"><span>Power reserve</span><b>≥ 0 W</b></div><button class="primary full" data-action="mission-go">CONTINUE TO VAB <span>→</span></button></aside></div></section>`}
  private showVab(){this.switchMode('vab');const stats=calculateBuildStats(this.build,this.budget);const parts=[...this.build.parts].sort((a,b)=>b.positionM-a.positionM);this.top().innerHTML=`<section class="page vab-page"><div class="page-heading compact"><div><div class="eyebrow">VEHICLE ASSEMBLY BUILDING · 02</div><h2>Build your stack.</h2></div><div class="step-chip">MISSION: ${this.missionName.toUpperCase()}</div></div><div class="vab-layout"><div class="build-column"><div class="vab-toolbar"><span>STACK OVERVIEW <small>NODE-SNAP ASSEMBLY</small></span><span class="green-text">● ${stats.compatible?'STRUCTURE VALID':'CHECK CONNECTIONS'}</span></div><div class="vehicle-preview"><div class="preview-grid"></div><div class="vehicle-stack">${parts.map(p=>`<div class="stack-part kind-${p.kind}" style="--part-height:${this.partHeight(p.kind)}px" title="${PART_CATALOG[p.kind].name}"><span>${PART_CATALOG[p.kind].name}</span><button data-action="remove" data-id="${p.id}" aria-label="Remove ${p.id}">×</button></div>`).join('')}</div><div class="vab-com"><span class="com-line"></span> CENTER OF MASS</div><div class="preview-caption"><b>ETHIO-1 · ORBITAL LAUNCH VEHICLE</b><small>2-STAGE LIQUID PROPULSION · ACTIVE GUIDANCE</small></div></div><div class="part-tray"><div class="tray-label">ADD COMPONENT <small>SELECT TO SNAP TO VEHICLE</small></div><div class="part-buttons">${(['engine','tank','capsule','fairing','solar-array','optical-sensor','synthetic-radar','rtg','satellite-payload'] as PartKind[]).map(k=>`<button class="part-add" data-action="part" data-kind="${k}"><b>${this.partSymbol(k)}</b><span>${PART_CATALOG[k].name}<small>${fmt(PART_CATALOG[k].dryMassKg)} KG · $${fmt(PART_CATALOG[k].cost/1000)}K</small></span><i>+</i></button>`).join('')}</div></div></div><aside class="build-stats"><div class="stats-title">VEHICLE TELEMETRY <span>LIVE</span></div><div class="stat-big"><small>WET MASS</small><b>${fmt(stats.wetMassKg)} <i>kg</i></b><span>DRY ${fmt(stats.dryMassKg)} KG · PROP ${fmt(stats.propellantMassKg)} KG</span></div><div class="stat-grid"><div><small>THRUST / WEIGHT</small><b>${stats.thrustToWeight.toFixed(2)} <i>TWR</i></b></div><div><small>TOTAL THRUST</small><b>${fmt(stats.thrustN/1000)} <i>kN</i></b></div><div><small>POWER BUDGET</small><b class="${stats.powerSurplusW>=0?'green-text':'red-text'}">${stats.powerSurplusW>=0?'+':''}${fmt(stats.powerSurplusW)} <i>W</i></b></div><div><small>CENTER OF MASS</small><b>${stats.centerOfMassM.toFixed(1)} <i>m</i></b></div></div><div class="budget-box"><span>PROGRAMME SPEND</span><b>$${fmt(stats.cost)}</b><small>REMAINING $${fmt(stats.budgetRemaining)}</small></div><div class="science-check ${stats.instrumentsPowered?'':'warning'}"><b>${stats.instrumentsPowered?'✓':'!'}</b><span>${stats.instrumentsPowered?'SCIENCE SYSTEMS POWERED':'POWER DEFICIT'}<small>${fmt(stats.solarPowerAvailableW)} W generation · ${fmt(stats.instrumentPowerDemandW)} W demand</small></span></div><button class="primary full launch-button" data-action="launch" ${!stats.compatible||stats.thrustToWeight<.5?'disabled':''}>IGNITE · LAUNCH <span>→</span></button><button class="text-button back-link" data-action="mission">← EDIT MISSION</button></aside></div></section>`}
  private partHeight(k:PartKind){return ({capsule:44,engine:34,tank:70,fairing:45,'solar-array':20,'optical-sensor':24,'synthetic-radar':27,rtg:21,'satellite-payload':31} as Record<PartKind,number>)[k]}
  private partSymbol(k:PartKind){return ({capsule:'◉',engine:'▾',tank:'▤',fairing:'△','solar-array':'▥','optical-sensor':'◎','synthetic-radar':'⌁',rtg:'⚛','satellite-payload':'✦'} as Record<PartKind,string>)[k]}
  private addVabPart(k:PartKind){const stage=k==='engine'||k==='tank'?0:2;const y=this.build.parts.reduce((m,p)=>Math.max(m,p.positionM),0)+.65;const mountMode:VehicleBuild['parts'][number]['mountMode']=['solar-array','optical-sensor','synthetic-radar','rtg','satellite-payload'].includes(k)?'side':k==='fairing'?'shell':'stack';this.build=addPart(this.build,{id:`${k}-${Date.now()}`,kind:k,mountMode,positionM:y,stage,fuelFraction:k==='tank'?1:undefined});this.showVab()}
  private removeVabPart(id:string){this.build={...this.build,parts:this.build.parts.filter(p=>p.id!==id)};this.showVab()}
  private launch(){this.state={position:{x:EARTH.meanRadius+300_000,y:0,z:0},velocity:{x:0,y:7_500,z:450},mass:Math.max(3_000,calculateBuildStats(this.build).wetMassKg),time:0};this.stageIndex=0;this.fairing=true;this.throttle=0;this.timeScale=1;this.running=true;this.worker.postMessage({type:'init',state:this.state,vehicle:{area:12,dragCoefficient:0.35,thrust:calculateBuildStats(this.build).thrustN,specificImpulse:300},stepsPerTick:1} satisfies PhysicsCommand);this.worker.postMessage({type:'set-time-scale',scale:this.timeScale} satisfies PhysicsCommand);this.worker.postMessage({type:'set-running',running:true} satisfies PhysicsCommand);this.audio.play('win');this.showFlight()}
  private stopFlight(){this.running=false;this.worker.postMessage({type:'set-running',running:false} satisfies PhysicsCommand)}
  private stage(){const r=separateNextStage(this.build);if(!r){return}this.build=r.build;this.stageIndex++;this.state.mass=Math.max(500,this.state.mass-r.detachedMassKg);this.worker.postMessage({type:'reset',state:this.state} satisfies PhysicsCommand);this.worker.postMessage({type:'set-vehicle',vehicle:{area:6,dragCoefficient:.25,thrust:this.stageIndex<2?600_000:90_000,specificImpulse:315}} satisfies PhysicsCommand);this.audio.play('dash');this.showFlight()}
  private jettison(){if(!this.fairing)return;const r=jettisonFairings(this.build);this.build=r.build;this.fairing=false;this.state.mass=Math.max(300,this.state.mass-r.detachedMassKg);this.worker.postMessage({type:'reset',state:this.state} satisfies PhysicsCommand);this.audio.play('dash');this.showFlight()}
  private updateOrbit(){const pts=predictTrajectory(this.state,180);this.scene.setOrbit(pts)}
  private telemetryValues(){const atm=atmosphereAt(this.state.position,this.state.velocity);this.maxQ=Math.max(this.maxQ,atm.dynamicPressure);this.drag=atm.dynamicPressure*.35*12/Math.max(1,this.state.mass);this.heat=stagnationHeatFlux(atm.density,atm.speed,1);return {atm,el:orbitalElements(this.state)}}
  private showFlight(){this.switchMode('flight');this.scene.setActivity(this.activity);const {atm,el}=this.telemetryValues();this.updateOrbit();this.top().innerHTML=`<section class="flight-shell"><div class="flight-top"><div><span class="eyebrow">${this.activity==='orbit'?'ASCENT & ORBIT':'EXTRAVEHICULAR ACTIVITY'}</span><h2>${this.activity==='rover'?'PLANETARY SURFACE':this.activity==='eva'?'EVA · SATELLITE SERVICE':'FLIGHT TELEMETRY'}</h2></div><div class="mission-flags"><span class="pill">${this.missionName}</span><span class="pill green-text">● ${this.running?'LIVE':'PAUSED'}</span><button class="pill-button" data-action="map">⌖ MAP VIEW</button></div></div><div class="flight-grid"><div class="flight-view"><div class="view-corner tl">ETHIO-1 · STAGE ${this.stageIndex+1}</div><div class="view-corner tr">${this.activity.toUpperCase()} · 60 FPS</div><div class="reticle"><i></i><b>+</b><i></i></div><div class="altitude-marker"><span>APOAPSIS</span><b>${el.apoapsis?`${fmt((el.apoapsis-EARTH.meanRadius)/1000)} KM`:'ESCAPE'}</b></div><div class="rcs-stick" data-stick="rcs"><i></i><b>RCS<br>ATTITUDE</b><span>↕ &nbsp;↔</span></div><div class="view-bottom"><span><i class="green-dot"></i> ORBIT PREDICTOR ACTIVE</span><span>J2 · DRAG · RK4 / ${PHYSICS_HZ} HZ</span></div><div class="flight-controls"><label>THROTTLE <b>${Math.round(this.throttle)}%</b></label><input type="range" min="0" max="100" value="${this.throttle}" data-action="throttle"><div class="control-row"><button class="flight-button ${this.sas==='PROGRADE'?'active':''}" data-action="sas-prograde">SAS · PROGRADE</button><button class="flight-button ${this.sas==='RETROGRADE'?'active':''}" data-action="sas-retrograde">RETROGRADE</button><button class="flight-button" data-action="cockpit">${this.cockpit?'EXTERIOR':'COCKPIT'}</button><button class="flight-button" data-action="legs">LANDER LEGS</button></div></div></div><aside class="flight-side"><div class="telemetry-heading">VEHICLE STATUS <span>● LIVE</span></div><div class="hud-value"><small>ALTITUDE</small><b>${fmt((Math.hypot(this.state.position.x,this.state.position.y,this.state.position.z)-EARTH.meanRadius)/1000,1)} <i>KM</i></b></div><div class="hud-value"><small>ORBITAL VELOCITY</small><b>${fmt(Math.hypot(this.state.velocity.x,this.state.velocity.y,this.state.velocity.z))} <i>M/S</i></b></div><div class="telemetry-tiles"><div><small>APOAPSIS</small><b>${el.apoapsis?fmt((el.apoapsis-EARTH.meanRadius)/1000):'ESC' } KM</b></div><div><small>PERIAPSIS</small><b>${el.periapsis?fmt((el.periapsis-EARTH.meanRadius)/1000):'ESC'} KM</b></div><div><small>ECCENTRICITY</small><b>${el.eccentricity.toFixed(4)}</b></div><div><small>INCLINATION</small><b>${(el.inclination*180/Math.PI).toFixed(2)}°</b></div></div><div class="alert-box ${atm.dynamicPressure>35_000?'danger':''}"><span>MAX-Q</span><b>${atm.dynamicPressure>35_000?'WARNING':'NOMINAL'}</b><small>${fmt(atm.dynamicPressure/1000,1)} kPa · HEAT ${fmt(this.heat/1000,1)} kW/m²</small></div><div class="stage-row"><button class="stage-button" data-action="stage">STAGE SEPARATION <span>⏵</span></button><button class="fairing-button" data-action="fairing" ${!this.fairing?'disabled':''}>FAIRING ↗</button></div><div class="timewarp"><span>TIME WARP</span>${[1,10,50,100].map(s=>`<button class="${this.timeScale===s?'active':''}" data-action="scale" data-scale="${s}">${s}×</button>`).join('')}</div><div class="activity-actions"><button data-action="eva">${this.activity==='eva'?'CLOSE HATCH':'EVA SPACEWALK'} ↗</button><button data-action="rover">ROVER OPS ↗</button><button data-action="map">ORBIT MAP ↗</button></div>${this.activity==='eva'?`<div class="mobility"><div class="eyebrow">MMU TRANSLATION</div><div><button data-action="eva-move" data-y="1">↑</button></div><button data-action="eva-move" data-x="-1">←</button><button data-action="eva-move" data-y="-1">↓</button><button data-action="eva-move" data-x="1">→</button><small>RELATIVE POSITION ${this.evaPos.x.toFixed(1)}, ${this.evaPos.y.toFixed(1)} M</small></div>`:''}${this.activity==='rover'?`<div class="mobility"><div class="eyebrow">SIX-WHEEL ROVER · ${this.roverSpeed.toFixed(1)} M/S</div><button data-action="rover-left">◀ STEER</button><button data-action="rover-right">DRIVE ▶</button></div>`:''}</aside></div><div class="flight-footer"><span>MISSION ELAPSED <b>${fmt(this.state.time,1)} SEC</b></span><span>VEHICLE MASS <b>${fmt(this.state.mass)} KG</b></span><span>DRAG <b>${fmt(this.drag,1)} M/S²</b></span><span>STAGE <b>${this.stageIndex+1} / 3</b></span></div></section>`;this.bindThrottle()}
  private bindThrottle(){const range=this.top().querySelector<HTMLInputElement>('[data-action="throttle"]');range?.addEventListener('input',()=>{this.throttle=Number(range.value);range.parentElement?.querySelector('label b')?.replaceChildren(document.createTextNode(`${Math.round(this.throttle)}%`));if(this.running&&this.throttle>0){this.worker.postMessage({type:'set-vehicle',vehicle:{area:12,dragCoefficient:.35,thrust:calculateBuildStats(this.build).thrustN*this.throttle/100,specificImpulse:300}} satisfies PhysicsCommand)}})}
  private updateFlight(){if(this.screen==='flight'){const val=this.telemetryValues();if(val.atm.dynamicPressure>35_000&&!this.top().querySelector('.danger'))this.top().querySelector('.alert-box')?.classList.add('danger');this.refreshHud();if(Math.floor(this.state.time)%8===0)this.updateOrbit()}}
  private refreshHud(){const h=this.top();if(this.screen!=='flight')return;const alt=h.querySelector('.hud-value b');if(alt)alt.innerHTML=`${fmt((Math.hypot(this.state.position.x,this.state.position.y,this.state.position.z)-EARTH.meanRadius)/1000,1)} <i>KM</i>`;const vel=h.querySelectorAll('.hud-value b')[1];if(vel)vel.innerHTML=`${fmt(Math.hypot(this.state.velocity.x,this.state.velocity.y,this.state.velocity.z))} <i>M/S</i>`;const lbl=h.querySelector('.flight-controls label b');if(lbl)lbl.textContent=`${Math.round(this.throttle)}%`}
  private showMap(){this.switchMode('flight');this.updateOrbit();const {el}=this.telemetryValues();this.top().innerHTML=`<section class="page map-page"><div class="page-heading"><div><div class="eyebrow">NAVIGATION · KEPLERIAN ELEMENTS</div><h2>Orbit map.</h2><p>Predictive trajectory and current orbital solution.</p></div><button class="pill-button" data-action="flight">← RETURN TO FLIGHT</button></div><div class="map-card"><div class="map-earth"></div><div class="map-orbit"></div><div class="map-spacecraft">✦<span>ETHIO-1</span></div><span class="map-ap">APOAPSIS ${el.apoapsis?fmt((el.apoapsis-EARTH.meanRadius)/1000):'ESC'} KM</span><span class="map-pe">PERIAPSIS ${el.periapsis?fmt((el.periapsis-EARTH.meanRadius)/1000):'ESC'} KM</span><span class="map-equator">EQUATOR</span></div><div class="orbit-elements">${[['SEMI-MAJOR AXIS',el.semiMajorAxis?`${fmt(el.semiMajorAxis/1000)} KM`:'UNBOUND'],['ECCENTRICITY',el.eccentricity.toFixed(5)],['INCLINATION',`${(el.inclination*180/Math.PI).toFixed(2)}°`],['SPECIFIC ENERGY',`${fmt(el.specificEnergy/1e6,2)} MJ/KG`]].map(([a,b])=>`<div><small>${a}</small><b>${b}</b></div>`).join('')}</div><div class="map-legend"><span><i class="legend-earth"></i> EARTH</span><span><i class="legend-orbit"></i> PREDICTED ORBIT</span><span>ELEMENTS UPDATED FROM 120 HZ STATE</span></div></section>`}
}
