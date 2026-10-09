/**
 * Uploads every formation as one layer of two DataArrayTextures.
 *
 *   uFormPos  RGBA32F  64 × 64 × layers   xyz position, w scale
 *   uFormCol  SRGB8_A8 64 × 64 × layers   colour (decoded to linear on fetch), a = material id
 *
 * A 2D-array texture keeps formations addressable by an integer layer, needs no
 * atlas maths, and stays within WebGL2's guaranteed minimum sizes (64 × 64 is far
 * below MAX_TEXTURE_SIZE ≥ 2048; MAX_ARRAY_TEXTURE_LAYERS ≥ 256).
 */
import * as THREE from 'three';
import { POOL_SIZE, POOL_TEX, type PoolFormation } from './VoxelData.ts';

export class FormationLibrary {
  readonly positions: THREE.DataArrayTexture;
  readonly colors: THREE.DataArrayTexture;
  readonly staticData: THREE.DataTexture;
  private readonly layerOf = new Map<string, number>();

  constructor(formations: PoolFormation[], staticData: Float32Array) {
    const layers = formations.length;
    const pos = new Float32Array(POOL_SIZE * 4 * layers);
    const col = new Uint8Array(POOL_SIZE * 4 * layers);
    formations.forEach((f, layer) => {
      pos.set(f.positions, layer * POOL_SIZE * 4);
      col.set(f.colors, layer * POOL_SIZE * 4);
      this.layerOf.set(f.name, layer);
    });

    this.positions = new THREE.DataArrayTexture(pos, POOL_TEX, POOL_TEX, layers);
    this.positions.format = THREE.RGBAFormat;
    this.positions.type = THREE.FloatType;
    configure(this.positions);

    this.colors = new THREE.DataArrayTexture(col, POOL_TEX, POOL_TEX, layers);
    this.colors.format = THREE.RGBAFormat;
    this.colors.type = THREE.UnsignedByteType;
    this.colors.colorSpace = THREE.SRGBColorSpace;
    configure(this.colors);

    this.staticData = new THREE.DataTexture(staticData, POOL_TEX, POOL_TEX, THREE.RGBAFormat, THREE.FloatType);
    configure(this.staticData);
  }

  layer(name: string): number {
    const layer = this.layerOf.get(name);
    if (layer === undefined) throw new Error(`Unknown formation "${name}"`);
    return layer;
  }

  get byteLength(): number {
    return (this.positions.image.data as Float32Array).byteLength
      + (this.colors.image.data as Uint8Array).byteLength
      + (this.staticData.image.data as Float32Array).byteLength;
  }

  dispose(): void {
    this.positions.dispose();
    this.colors.dispose();
    this.staticData.dispose();
  }
}

function configure(texture: THREE.Texture): void {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
}
