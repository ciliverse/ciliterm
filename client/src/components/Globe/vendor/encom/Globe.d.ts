export default class Globe {
  constructor(width: number, height: number, opts?: Record<string, unknown>);
  width: number;
  height: number;
  domElement: HTMLCanvasElement;
  cameraAngle: number;
  viewAngle: number;
  dayLength: number;
  cameraDistance: number;
  fogHex?: number;
  fogRgb?: { r: number; g: number; b: number };
  introLines?: { children: unknown[] };
  pins: Array<{ remove(): void }>;
  markers: Array<{ remove(): void }>;
  camera: {
    aspect: number;
    far: number;
    position: { x: number; y: number; z: number };
    updateProjectionMatrix(): void;
    lookAt(target: unknown): void;
  };
  scene: {
    position: { x: number; y: number; z: number };
    fog?: { near: number; far: number };
  };
  renderer: {
    setSize(width: number, height: number): void;
    setPixelRatio(ratio: number): void;
    dispose(): void;
    domElement: HTMLCanvasElement;
  };
  init(cb?: () => void): void;
  tick(): void;
  destroy(cb?: () => void): void;
  addPin(lat: number, lon: number, text: string): { remove(): void };
  addMarker(
    lat: number,
    lon: number,
    text: string,
    connected?: boolean | { remove(): void },
  ): { remove(): void };
  addConstellation(
    sats: Array<{ lat: number; lon: number; altitude: number }>,
    opts?: Record<string, unknown>,
  ): unknown[];
  setBaseColor(color: string): void;
  setMarkerColor(color: string): void;
  setPinColor(color: string): void;
  setMaxPins(n: number): void;
  setMaxMarkers(n: number): void;
}
