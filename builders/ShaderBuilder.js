import * as THREE from 'three'

export function createAtmosphereShader(radius) {
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uAltitude: { value: 0 },
      uRayleigh: { value: new THREE.Color('#38bdf8') },
      uMie: { value: new THREE.Color('#0284c7') },
      uSunDirection: { value: new THREE.Vector3(-0.7, 0.35, 0.5).normalize() },
      uOpacity: { value: 0.82 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vNormalWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uAltitude;
      uniform vec3 uRayleigh;
      uniform vec3 uMie;
      uniform vec3 uSunDirection;
      uniform float uOpacity;
      varying vec3 vWorldPosition;
      varying vec3 vNormalWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 normal = normalize(vNormalWorld);
        float rim = pow(1.0 - clamp(abs(dot(viewDir, normal)), 0.0, 1.0), 2.35);
        float rayleighPhase = 0.35 + 0.65 * pow(max(dot(viewDir, -uSunDirection), 0.0), 2.0);
        float miePhase = pow(max(dot(viewDir, -uSunDirection), 0.0), 18.0);
        float altitudeFade = 1.0 - smoothstep(0.0, 100000.0, uAltitude);
        vec3 color = uRayleigh * rim * rayleighPhase + uMie * miePhase * 0.42;
        float alpha = clamp(rim * uOpacity * altitudeFade + miePhase * 0.12, 0.0, 0.86);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), material)
  mesh.renderOrder = 2
  return mesh
}

export function createSolarFlareMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uTime; uniform float uIntensity; varying vec2 vUv; void main(){vec2 p=vUv-0.5; float r=length(p); float rays=0.5+0.5*sin(atan(p.y,p.x)*22.0+uTime*1.7); float glow=exp(-r*10.0)*(0.55+0.45*rays)*uIntensity; vec3 c=mix(vec3(1.0,0.25,0.04),vec3(1.0,0.88,0.28),glow); gl_FragColor=vec4(c,clamp(glow,0.0,0.9));}`,
  })
}

export function createFlagMaterial() {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 160
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#009A44'; ctx.fillRect(0, 0, 256, 54)
  ctx.fillStyle = '#FED100'; ctx.fillRect(0, 54, 256, 53)
  ctx.fillStyle = '#D80027'; ctx.fillRect(0, 107, 256, 53)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.02 })
}

export function createDecalTexture(title, subtitle = '') {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 192)
  ctx.fillStyle = 'rgba(2, 12, 24, .86)'; ctx.fillRect(8, 16, 496, 160)
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 5; ctx.strokeRect(10, 18, 492, 156)
  ctx.fillStyle = '#e8f8ff'; ctx.font = 'bold 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(title, 256, subtitle ? 78 : 98)
  if (subtitle) { ctx.fillStyle = '#fed100'; ctx.font = 'bold 25px Arial'; ctx.fillText(subtitle, 256, 133) }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
