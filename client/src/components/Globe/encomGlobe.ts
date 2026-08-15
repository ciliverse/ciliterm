import * as THREE from 'three';
import type { GeoData, GeoPoint } from '@ciliterm/shared';
import { geoPointKey } from './geoDiff';
import { formatGlobePin, rankHudRows } from './globeHud';
import { EXTRA_CITIES } from './cityPins';
import Globe from './vendor/encom/Globe.js';
import grid from './vendor/encom/grid.js';
import pinLocations from './vendor/encom/pin-locations.js';
import utils from './vendor/encom/utils.js';

export interface ProjectedPin {
  key: string;
  point: GeoPoint;
  x: number;
  y: number;
}

const DEG2RAD = Math.PI / 180;
const DEFAULT_DAY = 28000;

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0.016, g: 0.027, b: 0.039 };
  return {
    r: parseInt(m[1].slice(0, 2), 16) / 255,
    g: parseInt(m[1].slice(2, 4), 16) / 255,
    b: parseInt(m[1].slice(4, 6), 16) / 255,
  };
}

/** Original Encom globe (arscan), fed with CiliTerm live geo. */
export class EncomGlobe {
  private container: HTMLElement;
  private core: Globe;
  private frame = 0;
  private running = false;
  private lowPower = false;
  private lastFrameTime = 0;
  private oriented = false;
  private holdUntil = 0;
  private ro: ResizeObserver;
  private geo: GeoData = { self: null, points: [], arcs: [] };
  private onSelect: ((p: GeoPoint | null) => void) | null = null;
  private downPos: { x: number; y: number } | null = null;
  private dragging = false;
  private lastPointer: { x: number; y: number } | null = null;
  private openHostIds = new Set<string>();
  private onProject: ((pins: ProjectedPin[]) => void) | null = null;
  private lastProjectAt = 0;
  private lastPins: ProjectedPin[] = [];
  private pinByKey = new Map<string, { remove(): void }>();
  private markerSig = '';
  private satellitesReady = false;
  private cPrimary = '#35e6ff';
  private cSecondary = '#ffae00';
  private cRed = '#ff4d5e';
  private cBg = '#04070a';

  constructor(container: HTMLElement, lowPower = false) {
    this.container = container;
    this.lowPower = lowPower;
    this.readColors();

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

    this.core = new Globe(w, h, {
      tiles: grid.tiles,
      font: 'JetBrains Mono',
      baseColor: this.cPrimary,
      markerColor: this.cSecondary,
      pinColor: this.cPrimary,
      satelliteColor: this.cRed,
      introLinesColor: this.cPrimary,
      introLinesDuration: 2000,
      introLinesCount: 60,
      scale: 1.4,
      dayLength: DEFAULT_DAY,
      viewAngle: 0.1,
      maxPins: 500,
      maxMarkers: 16,
      pinsData: [...pinLocations, ...EXTRA_CITIES]
        .filter((p) => p.label.trim().length > 0)
        .map((p) => ({ ...p })),
    });
    this.core.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1 : 2));
    this.paintFog();
    container.appendChild(this.core.domElement);
    this.core.init(() => {
      this.paintFog();
      this.seedSatellites();
    });

    const dom = this.core.domElement;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  setSelectHandler(fn: (p: GeoPoint | null) => void): void {
    this.onSelect = fn;
  }

  setOpenHostIds(ids: string[]): void {
    this.openHostIds = new Set(ids);
  }

  setProjectHandler(fn: ((pins: ProjectedPin[]) => void) | null): void {
    this.onProject = fn;
  }

  focusLatLng(lat: number, lng: number): void {
    this.core.cameraAngle = (180 - lng) * DEG2RAD;
    this.core.viewAngle = THREE.MathUtils.clamp(lat * DEG2RAD * 0.35, -0.45, 0.45);
    this.holdUntil = Date.now() + 4000;
  }

  setData(data: GeoData): void {
    this.geo = data;
    this.lastProjectAt = 0;
    this.syncPins();
    this.syncMarkers();

    if (data.self && !this.oriented) {
      this.focusLatLng(data.self.lat, data.self.lng);
      this.oriented = true;
    }
  }

  refreshColors(): void {
    this.readColors();
    this.paintFog();
    this.core.setBaseColor(this.cPrimary);
    this.core.setPinColor(this.cPrimary);
    this.core.setMarkerColor(this.cSecondary);
    const lines = this.core.introLines;
    if (lines) {
      for (const child of lines.children) {
        const mat = (child as { material?: { color?: { set(c: string): void } } }).material;
        mat?.color?.set(this.cPrimary);
      }
    }
  }

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
    this.core.renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : 2));
  }

  dispose(): void {
    this.stop();
    this.onProject = null;
    this.ro.disconnect();
    const dom = this.core.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    this.core.renderer.dispose();
    this.core.domElement.remove();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.downPos = { x: e.clientX, y: e.clientY };
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.dragging = true;
    this.holdUntil = Date.now() + 60_000;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || !this.lastPointer) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.core.cameraAngle += dx * 0.005;
    this.core.viewAngle = THREE.MathUtils.clamp(this.core.viewAngle + dy * 0.004, -1.15, 1.15);
    this.holdUntil = Date.now() + 60_000;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const start = this.downPos;
    this.dragging = false;
    this.lastPointer = null;
    this.downPos = null;
    this.holdUntil = Date.now() + 2500;
    if (!start || !this.onSelect) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 5) return;
    this.onSelect(this.pickPoint(e.clientX, e.clientY));
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomBy(e.deltaY);
    this.holdUntil = Date.now() + 2500;
  };

  private zoomBy(deltaY: number): void {
    const next = THREE.MathUtils.clamp(this.core.cameraDistance + deltaY * 0.9, 480, 2600);
    this.core.cameraDistance = next;
    if (this.core.scene.fog) {
      this.core.scene.fog.near = next;
      this.core.scene.fog.far = next + 300;
    }
    this.core.camera.far = next + 300;
    this.core.camera.updateProjectionMatrix();
  }

  private readColors(): void {
    const root = getComputedStyle(document.documentElement);
    this.cPrimary = root.getPropertyValue('--cyan').trim() || this.cPrimary;
    this.cSecondary = root.getPropertyValue('--orange').trim() || this.cSecondary;
    this.cRed = root.getPropertyValue('--red').trim() || this.cRed;
    this.cBg = root.getPropertyValue('--bg').trim() || this.cBg;
  }

  private paintFog(): void {
    const rgb = hexToRgb01(this.cBg);
    this.core.fogHex = parseInt(this.cBg.replace('#', ''), 16) || 0x04070a;
    this.core.fogRgb = rgb;
    const fog = this.core.scene?.fog as { color?: { set(c: string): void } } | undefined;
    fog?.color?.set(this.cBg);
  }

  private allPoints(): GeoPoint[] {
    return this.geo.self ? [this.geo.self, ...this.geo.points] : this.geo.points;
  }

  private pinLabel(p: GeoPoint): string {
    if (p.kind === 'self') return 'HOME';
    const name = formatGlobePin(p).name;
    if (p.hostId && this.openHostIds.has(p.hostId)) return `${name} *`;
    return name;
  }

  private syncPins(): void {
    const want = new Map<string, GeoPoint>();
    for (const p of this.allPoints()) want.set(geoPointKey(p), p);

    for (const [key, pin] of this.pinByKey) {
      if (want.has(key)) continue;
      pin.remove();
      this.pinByKey.delete(key);
      const idx = this.core.pins.indexOf(pin);
      if (idx >= 0) this.core.pins.splice(idx, 1);
    }

    for (const [key, p] of want) {
      if (this.pinByKey.has(key)) continue;
      const label = this.pinLabel(p).trim();
      if (!label) continue;
      this.pinByKey.set(key, this.core.addPin(p.lat, p.lng, label));
    }
  }

  private syncMarkers(): void {
    const self = this.geo.self;
    const ends = rankHudRows(this.geo.points).slice(0, 8);
    const sig = [
      self ? `${self.lat.toFixed(2)},${self.lng.toFixed(2)}` : '',
      ...ends.map((p) => geoPointKey(p)),
    ].join('|');
    if (sig === this.markerSig) return;
    this.markerSig = sig;

    while (this.core.markers.length) this.core.markers.shift()?.remove();
    if (!self || ends.length === 0) return;

    this.core.setMaxMarkers(ends.length + 1);
    const home = this.core.addMarker(self.lat, self.lng, 'HOME', false);
    for (const p of ends) {
      this.core.addMarker(p.lat, p.lng, this.pinLabel(p), home);
    }
  }

  private seedSatellites(): void {
    if (this.satellitesReady) return;
    this.satellitesReady = true;
    const sats: Array<{ lat: number; lon: number; altitude: number }> = [];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        sats.push({
          lat: 50 * i - 30 + 15 * Math.random(),
          lon: 120 * j - 120 + 30 * i,
          altitude: 1.3,
        });
      }
    }
    this.core.addConstellation(sats, {
      waveColor: '#FFF',
      coreColor: '#FF0000',
      shieldColor: '#fff',
      numWaves: 8,
    });
  }

  private pickPoint(clientX: number, clientY: number): GeoPoint | null {
    const rect = this.core.domElement.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const v = new THREE.Vector3();
    const camPos = this.core.camera.position;
    let best: GeoPoint | null = null;
    let bestDist = 22;
    for (const p of this.allPoints()) {
      const c = utils.mapPoint(p.lat, p.lng);
      v.set(c.x * 1.2, c.y * 1.2, c.z * 1.2);
      const toCam = new THREE.Vector3(camPos.x - v.x, camPos.y - v.y, camPos.z - v.z).normalize();
      if (v.clone().normalize().dot(toCam) <= 0.05) continue;
      const proj = v.project(this.core.camera as unknown as THREE.Camera);
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

  private pinCandidates(): GeoPoint[] {
    const ranked = rankHudRows(this.geo.points).slice(0, 8);
    return this.geo.self ? [this.geo.self, ...ranked] : ranked;
  }

  private projectPins(): ProjectedPin[] {
    const rect = this.core.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const camPos = this.core.camera.position;
    const out: ProjectedPin[] = [];
    for (const p of this.pinCandidates()) {
      const c = utils.mapPoint(p.lat, p.lng);
      v.set(c.x * 1.2, c.y * 1.2, c.z * 1.2);
      const toCam = new THREE.Vector3(camPos.x - v.x, camPos.y - v.y, camPos.z - v.z).normalize();
      if (v.clone().normalize().dot(toCam) <= 0.12) continue;
      const proj = v.project(this.core.camera as unknown as THREE.Camera);
      if (proj.z > 1) continue;
      const x = (proj.x * 0.5 + 0.5) * rect.width;
      const y = (-proj.y * 0.5 + 0.5) * rect.height;
      if (x < 176 || y < 8 || x > rect.width - 8 || y > rect.height - 28) continue;
      out.push({ key: geoPointKey(p), point: p, x, y });
    }
    return out;
  }

  private emitPins(): void {
    if (!this.onProject) return;
    const now = Date.now();
    if (now - this.lastProjectAt < 80) return;
    this.lastProjectAt = now;
    const pins = this.projectPins();
    const prev = this.lastPins;
    const changed =
      pins.length !== prev.length ||
      pins.some((p, i) => {
        const q = prev[i];
        return !q || q.key !== p.key || Math.abs(q.x - p.x) > 2 || Math.abs(q.y - p.y) > 2;
      });
    if (!changed) return;
    this.lastPins = pins;
    this.onProject(pins);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.core.width = w;
    this.core.height = h;
    this.core.camera.aspect = w / h;
    this.core.camera.updateProjectionMatrix();
    this.core.renderer.setSize(w, h);
  }

  private loop = (t: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    if (this.lowPower && t - this.lastFrameTime < 33) return;
    this.lastFrameTime = t;
    this.core.dayLength = Date.now() < this.holdUntil ? 1e12 : this.lowPower ? 48000 : DEFAULT_DAY;
    this.core.tick();
    this.emitPins();
  };
}
