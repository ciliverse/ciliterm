import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeoArc, GeoData, GeoPoint } from '@ciliterm/shared';
import { cssVar, hexToRgba } from '../../theme/themes';
import countriesRaw from '../../assets/countries.geojson?raw';

const countries = JSON.parse(countriesRaw) as { features: object[] };

const DEG2RAD = Math.PI / 180;

/** TRON/ENCOM-style glowing hex globe driven by real geolocation data. */
export class EncomGlobe {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private globe: ThreeGlobe;
  private composer: EffectComposer;
  private controls: OrbitControls;
  private frame = 0;
  private running = false;
  private lowPower = false;
  private lastFrameTime = 0;
  private oriented = false;
  private autoRotate = true;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private ro: ResizeObserver;
  private geo: GeoData = { self: null, points: [], arcs: [] };
  private onSelect: ((p: GeoPoint | null) => void) | null = null;
  private downPos: { x: number; y: number } | null = null;
  // Theme colors (read from CSS variables), refreshed on theme change.
  private cPrimary = '#35e6ff';
  private cSecondary = '#ffae00';
  private cAccent = '#7dffb0';

  private colorForKind(kind: GeoPoint['kind']): string {
    return kind === 'self' ? this.cAccent : kind === 'ssh' ? this.cPrimary : this.cSecondary;
  }

  private readColors(): void {
    this.cPrimary = cssVar('--cyan') || this.cPrimary;
    this.cSecondary = cssVar('--orange') || this.cSecondary;
    this.cAccent = cssVar('--green') || this.cAccent;
  }

  constructor(container: HTMLElement, lowPower = false) {
    this.container = container;
    this.lowPower = lowPower;

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1 : 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    // Keep the globe (centered at the origin) in the middle of the frame.
    this.camera.position.set(0, 0, 300);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x88ccff, 1.4));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1, 1, 1);
    this.scene.add(dir);

    this.readColors();
    this.globe = new ThreeGlobe({ animateIn: true })
      .hexPolygonsData(countries.features)
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.35)
      .hexPolygonColor(() => hexToRgba(this.cPrimary, 0.65))
      .showAtmosphere(true)
      .atmosphereColor(this.cPrimary)
      .atmosphereAltitude(0.18)
      // Arcs: primary for saved SSH hosts, secondary for live outbound connections.
      .arcColor((d: object) =>
        (d as GeoArc).kind === 'ssh'
          ? [this.cPrimary, this.cAccent]
          : [this.cSecondary, this.cPrimary],
      )
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(1600)
      .arcStroke(0.5)
      .arcAltitudeAutoScale(0.4)
      // Endpoint markers + the home marker.
      .pointColor((d: object) => this.colorForKind((d as GeoPoint).kind))
      .pointAltitude(0.01)
      .pointRadius((d: object) => ((d as GeoPoint).kind === 'self' ? 0.6 : 0.28))
      // Pulsing ring on the current location.
      .ringColor(() => (t: number) => hexToRgba(this.cAccent, 1 - t))
      .ringMaxRadius(5)
      .ringPropagationSpeed(3)
      .ringRepeatPeriod(1100)
      // 3D text label for the current location.
      .labelText((d: object) => (d as GeoPoint).label)
      .labelColor(() => this.cAccent)
      .labelSize(1.6)
      .labelDotRadius(0.3)
      .labelAltitude(0.02)
      .labelResolution(2);

    const globeMat = this.globe.globeMaterial() as THREE.MeshPhongMaterial;
    globeMat.color = new THREE.Color(0x04141c);
    globeMat.emissive = new THREE.Color(0x001018);
    globeMat.shininess = 6;
    globeMat.transparent = true;
    globeMat.opacity = 0.9;

    this.scene.add(this.globe);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), lowPower ? 0.6 : 1.1, 0.6, 0.1);
    this.composer.addPass(bloom);

    // Drag to rotate, scroll to zoom. Idle auto-rotation stops once the user grabs it.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = 160;
    this.controls.maxDistance = 520;
    // Pause the idle spin while interacting; resume a few seconds after release.
    this.controls.addEventListener('start', () => {
      this.autoRotate = false;
      if (this.resumeTimer) clearTimeout(this.resumeTimer);
    });
    this.controls.addEventListener('end', () => {
      if (this.resumeTimer) clearTimeout(this.resumeTimer);
      this.resumeTimer = setTimeout(() => {
        this.autoRotate = true;
      }, 3000);
    });

    // Treat a press-without-drag as a click so it doesn't fight OrbitControls.
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.downPos = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (!this.downPos) return;
      const moved = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
      this.downPos = null;
      if (moved > 5 || !this.onSelect) return;
      this.onSelect(this.pickPoint(e.clientX, e.clientY));
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  /** Register a handler that receives the endpoint clicked on the globe (or null). */
  setSelectHandler(fn: (p: GeoPoint | null) => void): void {
    this.onSelect = fn;
  }

  private allPoints(): GeoPoint[] {
    return this.geo.self ? [this.geo.self, ...this.geo.points] : this.geo.points;
  }

  /** Screen-space hit test: nearest front-facing endpoint within a pixel radius. */
  private pickPoint(clientX: number, clientY: number): GeoPoint | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const getCoords = (this.globe as unknown as {
      getCoords(lat: number, lng: number, alt: number): { x: number; y: number; z: number };
    }).getCoords.bind(this.globe);

    const v = new THREE.Vector3();
    const camPos = this.camera.position;
    let best: GeoPoint | null = null;
    let bestDist = 20;
    for (const p of this.allPoints()) {
      const c = getCoords(p.lat, p.lng, 0.02);
      v.set(c.x, c.y, c.z);
      this.globe.localToWorld(v);
      // Skip endpoints on the far hemisphere (occluded by the globe body).
      const normal = v.clone().normalize();
      const toCam = camPos.clone().sub(v).normalize();
      if (normal.dot(toCam) <= 0.05) continue;
      const proj = v.clone().project(this.camera);
      const sx = (proj.x * 0.5 + 0.5) * rect.width;
      const sy = (-proj.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  /** Feed real geolocation data: home marker, endpoint points and connection arcs. */
  setData(data: GeoData): void {
    this.geo = data;
    const self = data.self;
    const points = self ? [self, ...data.points] : data.points;
    this.globe
      .pointsData(points)
      .arcsData(data.arcs)
      .ringsData(self ? [self] : [])
      .labelsData(self ? [self] : []);

    // Rotate the current location toward the camera on first fix.
    if (self && !this.oriented) {
      this.globe.rotation.y = -self.lng * DEG2RAD;
      this.oriented = true;
    }
  }

  /** Re-read theme colors and repaint statically-colored layers. */
  refreshColors(): void {
    this.readColors();
    this.globe
      .hexPolygonColor(() => hexToRgba(this.cPrimary, 0.65))
      .atmosphereColor(this.cPrimary)
      .arcColor((d: object) =>
        (d as GeoArc).kind === 'ssh'
          ? [this.cPrimary, this.cAccent]
          : [this.cSecondary, this.cPrimary],
      )
      .pointColor((d: object) => this.colorForKind((d as GeoPoint).kind))
      .ringColor(() => (t: number) => hexToRgba(this.cAccent, 1 - t))
      .labelColor(() => this.cAccent);
    // Re-apply data so points/arcs pick up the new color accessors immediately.
    this.setData(this.geo);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  private loop = (t: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    // Low-power mode caps to ~30fps.
    if (this.lowPower && t - this.lastFrameTime < 33) return;
    this.lastFrameTime = t;
    // Gentle idle spin until the user drags the globe.
    if (this.autoRotate) this.globe.rotation.y += this.lowPower ? 0.0006 : 0.001;
    this.controls.update();
    this.composer.render();
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frame = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.frame) cancelAnimationFrame(this.frame);
  }

  setLowPower(low: boolean): void {
    this.lowPower = low;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : 2));
  }

  dispose(): void {
    this.stop();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.ro.disconnect();
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
