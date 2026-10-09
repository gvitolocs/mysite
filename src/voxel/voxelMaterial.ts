/**
 * Voxel materials: three.js MeshStandardMaterial, patched at compile time.
 *
 * Patching the standard material (rather than writing a ShaderMaterial from
 * scratch) keeps three's physically based lighting, PMREM reflections, shadow
 * receiving and tone mapping, and only replaces what is voxel-specific:
 *
 *   vertex    instance transform read from the compute textures (or computed inline)
 *   fragment  per-voxel colour and material, a procedural bevel, emissive glow
 *
 * The same bevel chunk is applied to Poko's skinned GLB mesh (Representation A)
 * so A and B are visually identical at the moment they swap.
 */
import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import voxelState from '../shaders/voxelState.glsl?raw';
import { POOL_TEX, VOXEL_SIZE } from './VoxelData.ts';

/** Matches MaterialId in VoxelData.ts and MATERIALS in blender/scripts/build_poko.py. */
const MATERIAL_TABLE = /* glsl */ `
// Gold is a lacquered gold, not mirror metal: a fully metallic surface has no
// diffuse term, so in a dark set it would only show reflections and read as
// olive. Partial metalness keeps the brand yellow while highlights stay warm.
float voxelRoughness(float id) {
  if (id < 0.5) return 0.34;   // gold
  if (id < 1.5) return 0.26;   // enamel
  if (id < 2.5) return 0.4;    // ceramic
  if (id < 3.5) return 0.45;   // glow cyan
  if (id < 4.5) return 0.30;   // glow gold
  return 0.55;                 // graphite
}
float voxelMetalness(float id) {
  if (id < 0.5) return 0.5;
  if (id < 2.5) return 0.0;
  if (id < 3.5) return 0.0;
  if (id < 4.5) return 0.6;
  return 0.35;
}
vec3 voxelEmissive(float id, vec3 color) {
  if (id > 2.5 && id < 3.5) return color * 3.2;
  if (id > 3.5 && id < 4.5) return color * 1.6;
  return vec3(0.0);
}
`;

const BEVEL = /* glsl */ `
uniform float uBevel;
mat3 voxelTangentFrame(vec3 eyePos, vec3 n, vec2 uv) {
  vec3 q0 = dFdx(eyePos);
  vec3 q1 = dFdy(eyePos);
  vec2 st0 = dFdx(uv);
  vec2 st1 = dFdy(uv);
  vec3 q1perp = cross(q1, n);
  vec3 q0perp = cross(n, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float s = det == 0.0 ? 0.0 : inversesqrt(det);
  return mat3(T * s, B * s, n);
}
// Each cube face carries 0..1 UVs. Near a face edge, tilt the normal outward,
// as if the cube had a small chamfer, and darken the seam between voxels.
// Fades out when a voxel is only a few pixels wide to avoid shimmering.
float voxelEdgeDistance(vec2 uv) {
  vec2 d = min(uv, 1.0 - uv);
  return min(d.x, d.y);
}
vec3 voxelBevelNormal(vec3 n, vec3 viewPos, vec2 uv) {
  vec2 fw = fwidth(uv);
  float lod = 1.0 - smoothstep(0.07, 0.22, max(fw.x, fw.y));
  vec2 d = min(uv, 1.0 - uv);
  vec2 tilt = (1.0 - smoothstep(0.0, 0.17, d)) * sign(uv - 0.5);
  vec3 mapN = normalize(vec3(tilt * uBevel * lod, 1.0));
  return normalize(voxelTangentFrame(-viewPos, n, uv) * mapN);
}
float voxelSeam(vec2 uv) {
  vec2 fw = fwidth(uv);
  float w = max(0.025, 1.0 * max(fw.x, fw.y));
  return mix(0.86, 1.0, smoothstep(0.0, w, voxelEdgeDistance(uv)));
}
`;

const FETCH = /* glsl */ `
uniform highp sampler2D uStatePosition;
uniform highp sampler2D uStateQuaternion;
uniform highp sampler2D uStateScale;
uniform highp sampler2D uStateColor;
uniform float uVoxelSize;
struct VoxelXform { vec3 pos; vec4 quat; vec3 scale; vec3 color; float mat; float glow; };
VoxelXform voxelXform() {
  VoxelXform x;
#ifdef VOXEL_INLINE
  VoxelState s = computeVoxel(gl_InstanceID);
  x.pos = s.pos; x.quat = s.quat; x.scale = s.scale; x.color = s.color; x.mat = s.mat; x.glow = s.glow;
#else
  ivec2 c = ivec2(gl_InstanceID % ${POOL_TEX}, gl_InstanceID / ${POOL_TEX});
  vec4 p = texelFetch(uStatePosition, c, 0);
  vec4 q = texelFetch(uStateQuaternion, c, 0);
  vec4 s = texelFetch(uStateScale, c, 0);
  vec4 k = texelFetch(uStateColor, c, 0);
  x.pos = p.xyz; x.quat = q; x.scale = s.xyz; x.color = k.rgb; x.mat = k.a; x.glow = s.w;
#endif
  return x;
}
`;

export interface VoxelMaterialOptions {
  /** Uniforms shared with the compute pass (needed for the inline fallback). */
  sharedUniforms: Record<string, THREE.IUniform>;
  /** Compute pass outputs; null selects the inline (vertex shader) path. */
  stateTextures: THREE.Texture[] | null;
  envMapIntensity?: number;
}

function voxelUniforms(opts: VoxelMaterialOptions): Record<string, THREE.IUniform> {
  const [position, quaternion, scale, color] = opts.stateTextures ?? [null, null, null, null];
  return {
    ...opts.sharedUniforms,
    uStatePosition: { value: position },
    uStateQuaternion: { value: quaternion },
    uStateScale: { value: scale },
    uStateColor: { value: color },
    uVoxelSize: { value: VOXEL_SIZE },
  };
}

function vertexPrelude(inline: boolean): string {
  return (inline ? `${common}\n${voxelState}\n` : `${common}\n`) + FETCH;
}

/** Material for the instanced voxel pool (Representation B). */
export function createVoxelMaterial(opts: VoxelMaterialOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0, envMapIntensity: opts.envMapIntensity ?? 1 });
  const uniforms = { ...voxelUniforms(opts), uBevel: { value: 0.95 }, uGlowBoost: { value: 2.5 } };
  const inline = opts.stateTextures === null;
  material.defines = { USE_UV: '', ...(inline ? { VOXEL_INLINE: '' } : {}) };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexPrelude(inline)}\nvarying vec3 vVoxelColor;\nflat varying float vVoxelMat;\nvarying float vVoxelGlow;`)
      .replace(
        '#include <beginnormal_vertex>',
        `VoxelXform vox = voxelXform();
        vVoxelColor = vox.color; vVoxelMat = vox.mat; vVoxelGlow = vox.glow;
        vec3 objectNormal = normalize(qrotate(vox.quat, normal / max(vox.scale, vec3(1e-4))));`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = vox.pos + qrotate(vox.quat, position * uVoxelSize * vox.scale);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${MATERIAL_TABLE}\n${BEVEL}\nuniform float uGlowBoost;\nvarying vec3 vVoxelColor;\nflat varying float vVoxelMat;\nvarying float vVoxelGlow;`,
      )
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vVoxelColor * voxelSeam(vUv);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = voxelRoughness(vVoxelMat);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = voxelMetalness(vVoxelMat);')
      .replace('#include <normal_fragment_maps>', 'normal = voxelBevelNormal(normal, vViewPosition, vUv);')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += voxelEmissive(vVoxelMat, vVoxelColor) + vVoxelColor * vVoxelGlow * uGlowBoost;',
      );
  };
  material.customProgramCacheKey = () => `voxel-b-${inline ? 'inline' : 'texture'}`;
  return material;
}

/** Shadow-map material that applies the same instance transform. */
export function createVoxelDepthMaterial(opts: VoxelMaterialOptions): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const uniforms = voxelUniforms(opts);
  const inline = opts.stateTextures === null;
  if (inline) material.defines = { VOXEL_INLINE: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexPrelude(inline)}`)
      .replace(
        '#include <begin_vertex>',
        'VoxelXform vox = voxelXform();\nvec3 transformed = vox.pos + qrotate(vox.quat, position * uVoxelSize * vox.scale);',
      );
  };
  material.customProgramCacheKey = () => `voxel-depth-${inline ? 'inline' : 'texture'}`;
  return material;
}

/**
 * Patch a glTF material of Poko's skinned mesh (Representation A) with the
 * same bevel and seam treatment. Base colour comes from COLOR_0.
 */
export function patchSkinnedVoxelMaterial(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.vertexColors = true;
  material.color.set(0xffffff);
  material.defines = { ...(material.defines ?? {}), USE_UV: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBevel = { value: 0.95 };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BEVEL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= voxelSeam(vUv);')
      .replace('#include <normal_fragment_maps>', 'normal = voxelBevelNormal(normal, vViewPosition, vUv);');
  };
  material.customProgramCacheKey = () => `voxel-a-${material.metalness}-${material.roughness}`;
  return material;
}
