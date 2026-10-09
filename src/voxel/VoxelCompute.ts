/**
 * GPGPU pass: evaluates computeVoxel() once per voxel into four float targets.
 *
 * Why: the voxel mesh draws 24 vertices per cube. Running the trajectory maths
 * (curl noise alone is 12 simplex evaluations) in the vertex shader would repeat
 * it 24× per voxel per pass, and again for the shadow pass. Here it runs exactly
 * once per voxel (64 × 64 fragments); the voxel vertex shader then does four
 * texelFetch()es. Multiple render targets (MRT) let one draw write position,
 * rotation, scale and colour together.
 *
 * Requires rendering to RGBA32F (EXT_color_buffer_float, ~universal on WebGL2).
 * Without it the engine falls back to evaluating computeVoxel() in the vertex shader.
 */
import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import voxelState from '../shaders/voxelState.glsl?raw';
import { POOL_TEX } from './VoxelData.ts';

const VERTEX = /* glsl */ `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position, 1.0); }
`;

const FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
${common}
${voxelState}
layout(location = 0) out vec4 oPosition;
layout(location = 1) out vec4 oQuaternion;
layout(location = 2) out vec4 oScale;
layout(location = 3) out vec4 oColor;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  VoxelState s = computeVoxel(c.y * POOL_TEX + c.x);
  oPosition = vec4(s.pos, 1.0);
  oQuaternion = s.quat;
  oScale = vec4(s.scale, s.glow);
  oColor = vec4(s.color, s.mat);
}
`;

export class VoxelCompute {
  readonly target: THREE.WebGLRenderTarget;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  private readonly material: THREE.RawShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  static isSupported(renderer: THREE.WebGLRenderer): boolean {
    return renderer.capabilities.isWebGL2 !== false && renderer.extensions.has('EXT_color_buffer_float');
  }

  constructor(uniforms: Record<string, THREE.IUniform>) {
    this.target = new THREE.WebGLRenderTarget(POOL_TEX, POOL_TEX, {
      count: 4,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    // One oversized triangle covers the viewport without a diagonal seam.
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  get textures(): THREE.Texture[] {
    return this.target.textures;
  }

  run(renderer: THREE.WebGLRenderer): void {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
  }

  /** Read back positions (for determinism tests). Synchronous; never call per frame. */
  readPositions(renderer: THREE.WebGLRenderer): Float32Array {
    const out = new Float32Array(POOL_TEX * POOL_TEX * 4);
    renderer.readRenderTargetPixels(this.target, 0, 0, POOL_TEX, POOL_TEX, out, undefined, 0);
    return out;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
