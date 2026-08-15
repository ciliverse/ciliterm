import { BufferAttribute, BufferGeometry } from 'three';

/** Stand-in for removed THREE.Geometry, used only by Encom line drawing. */
export default class LineGeometry {
  constructor() {
    this.vertices = [];
    this.buffer = new BufferGeometry();
  }

  sync() {
    const n = this.vertices.length;
    let attr = this.buffer.getAttribute('position');
    if (!attr || attr.count !== n) {
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = this.vertices[i];
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z;
      }
      this.buffer.setAttribute('position', new BufferAttribute(positions, 3));
      return;
    }
    for (let i = 0; i < n; i++) {
      const v = this.vertices[i];
      attr.setXYZ(i, v.x, v.y, v.z);
    }
    attr.needsUpdate = true;
  }

  get verticesNeedUpdate() {
    return false;
  }

  set verticesNeedUpdate(value) {
    if (value) this.sync();
  }
}
