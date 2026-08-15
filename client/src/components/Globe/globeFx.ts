import * as THREE from 'three';

const GLOBE_R = 100;

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

/** Thin rim glow — encom has fog + hex tiles, not a fat soap-bubble shell. */
export function createAtmosphere(colorHex: string): THREE.Mesh {
  const color = new THREE.Color(colorHex);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: color },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndv = abs(dot(normalize(vNormal), viewDir));
        float rim = pow(1.0 - ndv, 2.8);
        float a = clamp(rim * 0.42, 0.0, 0.55);
        gl_FragColor = vec4(glowColor, a);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.07, 48, 48), mat);
  mesh.renderOrder = 1;
  return mesh;
}

export function setAtmosphereColor(mesh: THREE.Mesh, colorHex: string): void {
  const mat = mesh.material as THREE.ShaderMaterial;
  (mat.uniforms.glowColor.value as THREE.Color).set(colorHex);
}

interface Orbit {
  group: THREE.Group;
  speed: number;
}

export interface SignalOrbits {
  group: THREE.Group;
  tick(dt: number): void;
  setColor(colorHex: string): void;
  dispose(): void;
}

/** Inclined signal tracks + moving nodes, in the spirit of encom satellites. */
export function createSignalOrbits(colorHex: string): SignalOrbits {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const orbits: Orbit[] = [];
  const specs = [
    { tiltX: 0.42, tiltZ: 0.08, r: GLOBE_R * 1.18, speed: 0.18 },
    { tiltX: -0.62, tiltZ: 0.2, r: GLOBE_R * 1.28, speed: -0.12 },
    { tiltX: 1.05, tiltZ: -0.12, r: GLOBE_R * 1.38, speed: 0.08 },
  ];

  for (const spec of specs) {
    const orbit = new THREE.Group();
    orbit.rotation.x = spec.tiltX;
    orbit.rotation.z = spec.tiltZ;

    const pts = Array.from({ length: 96 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * spec.r, 0, Math.sin(a) * spec.r);
    });
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    orbit.add(line);

    const sat = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sat.position.set(spec.r, 0, 0);
    orbit.add(sat);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.4, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    sat.add(halo);

    group.add(orbit);
    orbits.push({ group: orbit, speed: spec.speed });
  }

  return {
    group,
    tick(dt: number) {
      for (const o of orbits) o.group.rotation.y += o.speed * dt;
    },
    setColor(next: string) {
      const c = new THREE.Color(next);
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial | undefined;
        if (mat && 'color' in mat) mat.color.copy(c);
      });
    },
    dispose() {
      disposeObject(group);
    },
  };
}

export interface ScanField {
  group: THREE.Group;
  tick(dt: number): void;
  setColor(colorHex: string): void;
  dispose(): void;
}

/** Faint longitude traces that drift, like encom intro lines after they settle. */
export function createScanField(colorHex: string): ScanField {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const r = GLOBE_R * 1.04;
  for (let i = 0; i < 18; i++) {
    const lon = (i / 18) * Math.PI * 2;
    const pts = Array.from({ length: 40 }, (_, k) => {
      const lat = -Math.PI / 2 + (k / 39) * Math.PI;
      return new THREE.Vector3(Math.cos(lat) * Math.cos(lon) * r, Math.sin(lat) * r, Math.cos(lat) * Math.sin(lon) * r);
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return {
    group,
    tick(dt: number) {
      group.rotation.y += dt * 0.04;
    },
    setColor(next: string) {
      mat.color.set(next);
    },
    dispose() {
      disposeObject(group);
    },
  };
}

export function hexTint(baseHex: string, seed: string, alpha: number): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const c = new THREE.Color(baseHex);
  c.offsetHSL(0, 0, ((h % 17) - 8) / 90);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}
