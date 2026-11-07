import { rk4Step, type OrbitalState, type VehicleParameters } from './orbit'

export const PHYSICS_HZ = 120
export const PHYSICS_STEP_SECONDS = 1 / PHYSICS_HZ
export type PhysicsCommand =
  | { type:'init'; state:OrbitalState; vehicle?:VehicleParameters; stepsPerTick?:number }
  | { type:'set-running'; running:boolean }
  | { type:'set-time-scale'; scale:number }
  | { type:'set-vehicle'; vehicle?:VehicleParameters }
  | { type:'reset'; state:OrbitalState }
  | { type:'advance'; steps?:number }
  | { type:'dispose' }
export type PhysicsResponse = { type:'ready'|'state'; state:OrbitalState; running:boolean; simulatedSteps:number } | { type:'error'; message:string } | { type:'disposed' }
export interface WorkerRuntime { state:OrbitalState|null; running:boolean; timeScale:number; vehicle?:VehicleParameters; stepsPerTick:number; simulatedSteps:number; disposed:boolean }
export function createWorkerRuntime():WorkerRuntime { return {state:null,running:false,timeScale:1,stepsPerTick:1,simulatedSteps:0,disposed:false} }
function cloneState(s:OrbitalState):OrbitalState { return {position:{...s.position},velocity:{...s.velocity},mass:s.mass,time:s.time} }
/** Deterministic message dispatcher, exported for protocol tests and non-Worker hosts. */
export function handlePhysicsCommand(rt:WorkerRuntime,command:PhysicsCommand):PhysicsResponse {
  if(rt.disposed&&command.type!=='init') return {type:'error',message:'Physics worker has been disposed'}
  try {
    switch(command.type){
      case 'init': rt.state=cloneState(command.state);rt.vehicle=command.vehicle;rt.stepsPerTick=Math.max(1,Math.floor(command.stepsPerTick??1));rt.simulatedSteps=0;rt.disposed=false;return {type:'ready',state:cloneState(rt.state),running:rt.running,simulatedSteps:rt.simulatedSteps}
      case 'set-running': rt.running=command.running;break
      case 'set-time-scale': if(!Number.isFinite(command.scale)||command.scale<0)throw new RangeError('time scale must be finite and non-negative');rt.timeScale=command.scale;break
      case 'set-vehicle': rt.vehicle=command.vehicle;break
      case 'reset': rt.state=cloneState(command.state);rt.simulatedSteps=0;break
      case 'advance': advance(rt,Math.max(0,Math.floor(command.steps??1)));break
      case 'dispose':rt.running=false;rt.disposed=true;return {type:'disposed'}
    }
    return snapshot(rt)
  } catch(error) { return {type:'error',message:error instanceof Error?error.message:String(error)} }
}
function advance(rt:WorkerRuntime,steps:number):void { if(!rt.state)throw new Error('Initialize physics worker before advancing'); for(let i=0;i<steps;i++){rt.state=rk4Step(rt.state,PHYSICS_STEP_SECONDS*rt.timeScale,rt.vehicle);rt.simulatedSteps++} }
function snapshot(rt:WorkerRuntime):PhysicsResponse { if(!rt.state)return {type:'error',message:'Physics worker is not initialized'};return {type:'state',state:cloneState(rt.state),running:rt.running,simulatedSteps:rt.simulatedSteps} }

// The module is imported by the main app as well as the dedicated Worker; install only in a worker-like global.
const workerScope=globalThis as typeof globalThis & { document?:unknown; postMessage?:(message:PhysicsResponse)=>void; onmessage?:((event:MessageEvent<PhysicsCommand>)=>void)|null }
if(typeof workerScope.document==='undefined'&&typeof workerScope.postMessage==='function') {
  const runtime=createWorkerRuntime(); let timer:ReturnType<typeof setInterval>|undefined
  const tick=()=>{if(!runtime.running||runtime.disposed)return;const response=handlePhysicsCommand(runtime,{type:'advance',steps:runtime.stepsPerTick});workerScope.postMessage?.(response)}
  timer=setInterval(tick,1000/PHYSICS_HZ)
  workerScope.onmessage=(event)=>{const response=handlePhysicsCommand(runtime,event.data);workerScope.postMessage?.(response);if(response.type==='disposed'&&timer)clearInterval(timer)}
}
