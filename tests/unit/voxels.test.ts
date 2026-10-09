import { describe, expect, it } from 'vitest';
import { BONE_NAMES, buildPokoModel } from '../../src/character/pokoVoxelizer.ts';
import { SPRITE_HEIGHT, SPRITE_WIDTH, spriteAt } from '../../src/character/pokoSprite.ts';
import { POKO_VOXEL_COUNT } from '../../src/content/chapters.ts';
import { hilbertIndex3, hilbertOrder } from '../../src/math/hilbert.ts';
import { toPoolFormation } from '../../src/voxel/correspondence.ts';
import { buildFormations } from '../../src/voxel/formations/index.ts';
import { RIG_BOUND } from '../../src/voxel/formations/finale.ts';
import { POOL_SIZE } from '../../src/voxel/VoxelData.ts';

const model = buildPokoModel();

describe('voxelizer', () => {
  it('produces the documented voxel count', () => {
    expect(model.voxels).toHaveLength(POKO_VOXEL_COUNT);
  });

  it('is deterministic', () => {
    expect(buildPokoModel()).toEqual(model);
  });

  it('never places two voxels in the same cell', () => {
    const keys = new Set(model.voxels.map((v) => `${v.x},${v.y},${v.z}`));
    expect(keys.size).toBe(model.voxels.length);
  });

  it('shows every sprite pixel, in its own colour, as exactly one front voxel', () => {
    for (let y = 0; y < SPRITE_HEIGHT; y++) {
      for (let x = 0; x < SPRITE_WIDTH; x++) {
        const fronts = model.voxels.filter((v) => v.front && v.px === x && v.py === y);
        if (!spriteAt(x, y)) {
          expect(fronts).toHaveLength(0);
        } else {
          expect(fronts, `pixel (${x},${y})`).toHaveLength(1);
          expect(fronts[0].color).toBe(spriteAt(x, y));
          // ...and it is the frontmost voxel of its column.
          const column = model.voxels.filter((v) => v.px === x && v.py === y);
          expect(fronts[0].z).toBe(Math.max(...column.map((v) => v.z)));
        }
      }
    }
  });

  it('is left/right balanced (relief is symmetric, only colours differ)', () => {
    const xs = model.voxels.map((v) => v.x);
    expect(Math.min(...xs)).toBe(-Math.max(...xs));
    expect(model.bounds.min[2]).toBe(-model.bounds.max[2]);
  });

  it('binds features to their bones', () => {
    const count = (name: string) => model.voxels.filter((v) => BONE_NAMES[v.bone] === name).length;
    expect(count('eye_l')).toBe(6);
    expect(count('eye_r')).toBe(6);
    expect(count('mouth')).toBe(4);
    expect(count('hand_l')).toBe(count('hand_r'));
    expect(count('foot_l')).toBe(count('foot_r'));
  });

  it('defines nine upright bones with valid parents', () => {
    expect(model.bones.map((b) => b.name)).toEqual([...BONE_NAMES]);
    for (const b of model.bones) {
      if (b.parent) expect(BONE_NAMES).toContain(b.parent);
      expect(b.tail[0]).toBe(b.head[0]);
      expect(b.tail[2]).toBe(b.head[2]);
      expect(b.tail[1]).toBeGreaterThan(b.head[1]);
    }
  });
});

describe('Hilbert ordering', () => {
  it('is a bijection on a 3-bit cube', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) seen.add(hilbertIndex3(x, y, z, 3));
    expect(seen.size).toBe(512);
    expect(Math.max(...seen)).toBe(511);
  });

  it('visits face-adjacent cells consecutively (that is what preserves locality)', () => {
    const cells: [number, number, number][] = [];
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) cells.push([x, y, z]);
    const ordered = [...cells].sort((a, b) => hilbertIndex3(...a, 3) - hilbertIndex3(...b, 3));
    for (let i = 1; i < ordered.length; i++) {
      const d = Math.abs(ordered[i][0] - ordered[i - 1][0]) + Math.abs(ordered[i][1] - ordered[i - 1][1]) + Math.abs(ordered[i][2] - ordered[i - 1][2]);
      expect(d).toBe(1);
    }
  });

  it('orders points deterministically', () => {
    const pts = new Float32Array(Array.from({ length: 300 }, (_, i) => Math.sin(i * 12.9898) * 10));
    expect(hilbertOrder(pts, 100)).toEqual(hilbertOrder(pts, 100));
  });
});

describe('formations', () => {
  const set = buildFormations(model);

  it('fit the pool and are all distinct named layers', () => {
    expect(set.formations[0].name).toBe('poko');
    expect(new Set(set.formations.map((f) => f.name)).size).toBe(set.formations.length);
    for (const f of set.formations) {
      expect(f.positions).toHaveLength(POOL_SIZE * 4);
      expect(f.colors).toHaveLength(POOL_SIZE * 4);
      expect(f.visible).toBeGreaterThan(0);
      expect(f.visible).toBeLessThanOrEqual(POOL_SIZE);
      for (let i = 0; i < f.positions.length; i++) expect(Number.isFinite(f.positions[i])).toBe(true);
    }
  });

  it('show each target exactly once (twins are hidden, not duplicated)', () => {
    for (const f of set.formations.filter((f) => f.name !== 'finale' && f.name !== 'cloud')) {
      let shown = 0;
      for (let i = 0; i < POOL_SIZE; i++) if (f.positions[i * 4 + 3] !== 0) shown++;
      expect(shown, f.name).toBe(f.visible);
    }
  });

  it('keep Poko inside the finale bound to his rig, voxel for voxel', () => {
    const poko = set.formations[0];
    const finale = set.formations.find((f) => f.name === 'finale')!;
    for (let i = 0; i < POOL_SIZE; i++) {
      const isPoko = poko.positions[i * 4 + 3] > 0;
      expect(finale.positions[i * 4 + 3] === RIG_BOUND).toBe(isPoko);
    }
  });

  it('map neighbours to neighbours (correspondence locality)', () => {
    // Two random-ish clouds: average distance between consecutive pool voxels'
    // targets must be far below the distance between random pairs.
    const make = (n: number, s: number) => {
      const p = new Float32Array(n * 3);
      for (let i = 0; i < p.length; i++) p[i] = Math.sin((i + s) * 78.233) * 4;
      return { name: `t${s}`, count: n, positions: p, colors: new Uint8Array(n * 4) };
    };
    const a = toPoolFormation(make(3000, 1));
    let consecutive = 0;
    let random = 0;
    for (let i = 1; i < POOL_SIZE; i++) {
      const j = (i * 2654435761) % POOL_SIZE;
      const d = (k: number, l: number) => Math.hypot(a.positions[k * 4] - a.positions[l * 4], a.positions[k * 4 + 1] - a.positions[l * 4 + 1], a.positions[k * 4 + 2] - a.positions[l * 4 + 2]);
      consecutive += d(i, i - 1);
      random += d(i, j);
    }
    expect(consecutive / random).toBeLessThan(0.2);
  });
});
