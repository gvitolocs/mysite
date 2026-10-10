import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, CHAPTER_STARTS, TOTAL_LENGTH, chapterAt, progressFor } from '../../src/content/chapters.ts';
import { cameraTrack, createFrame, evaluateStory } from '../../src/experience/story.ts';
import type { CameraPose } from '../../src/experience/CameraController.ts';

const snapshot = (u: number) => JSON.parse(JSON.stringify(evaluateStory(u, createFrame())));

describe('chapters', () => {
  it('cover [0, 1] in order', () => {
    expect(CHAPTER_STARTS[0]).toBe(0);
    for (let i = 1; i < CHAPTER_STARTS.length; i++) expect(CHAPTER_STARTS[i]).toBeGreaterThan(CHAPTER_STARTS[i - 1]);
    expect(CHAPTER_STARTS[CHAPTER_STARTS.length - 1]).toBeLessThan(1);
    expect(TOTAL_LENGTH).toBeGreaterThan(CHAPTERS.length);
  });

  it('round-trip between chapter-local and global progress', () => {
    for (const c of CHAPTERS) {
      for (const t of [0.1, 0.5, 0.9]) {
        const { index, local } = chapterAt(progressFor(c.id, t));
        expect(CHAPTERS[index].id).toBe(c.id);
        expect(local).toBeCloseTo(t, 9);
      }
    }
  });
});

describe('story determinism', () => {
  it('is a pure function of progress: forward and backward sweeps agree', () => {
    const us = Array.from({ length: 401 }, (_, i) => i / 400);
    const shared = createFrame();
    const forward = us.map((u) => JSON.stringify(evaluateStory(u, shared)));
    const backward = [...us].reverse().map((u) => JSON.stringify(evaluateStory(u, shared))).reverse();
    expect(backward).toEqual(forward);
  });

  it('does not leak state between evaluations (reused frame object)', () => {
    const f = createFrame();
    evaluateStory(0.9, f);
    expect(JSON.parse(JSON.stringify(evaluateStory(0.05, f)))).toEqual(snapshot(0.05));
  });

  it('hands over the voxel state continuously at every chapter boundary', () => {
    // Just before a boundary, the voxels' effective formation is the morph's
    // destination; just after, it is the new morph's origin. They must match.
    for (let i = 1; i < CHAPTERS.length; i++) {
      const u = CHAPTER_STARTS[i];
      const before = evaluateStory(u - 1e-6, createFrame());
      const after = evaluateStory(u + 1e-6, createFrame());
      const settled = before.morph.t >= 1 - 1e-3 ? { f: before.morph.to, p: before.morph.toPlacement } : before.morph.t <= 1e-3 ? { f: before.morph.from, p: before.morph.fromPlacement } : null;
      expect(settled, `${CHAPTERS[i - 1].id} must end settled`).not.toBeNull();
      const starting = after.morph.t <= 1e-3 ? { f: after.morph.from, p: after.morph.fromPlacement } : { f: after.morph.to, p: after.morph.toPlacement };
      expect(starting.f, `${CHAPTERS[i].id} starts from what ${CHAPTERS[i - 1].id} ended with`).toBe(settled!.f);
      if (settled!.f !== 'poko') {
        for (let k = 0; k < 3; k++) expect(starting.p.position[k]).toBeCloseTo(settled!.p.position[k], 3);
        for (let k = 0; k < 4; k++) expect(Math.abs(starting.p.quaternion[k])).toBeCloseTo(Math.abs(settled!.p.quaternion[k]), 3);
      }
    }
  });

  it('only shows the skinned character when no voxel of Poko is in flight', () => {
    for (let i = 0; i <= 1000; i++) {
      const f = evaluateStory(i / 1000, createFrame());
      if (f.pokoSkinned && !f.hideRigged) {
        expect(f.morph.from === 'poko' && (f.morph.to === 'poko' || f.morph.t === 0)).toBe(true);
      }
    }
  });
});

describe('camera', () => {
  const pose = (u: number, aspect = 16 / 10): CameraPose => cameraTrack.evaluate(u, aspect, { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0 });

  it('moves continuously: no jumps between neighbouring scroll positions', () => {
    // 250 samples per viewport of scroll, so the bound means the same whatever the story's length.
    const n = Math.round(TOTAL_LENGTH * 250);
    let prev = pose(0).position.clone();
    for (let i = 1; i <= n; i++) {
      const p = pose(i / n).position.clone();
      expect(p.distanceTo(prev), `jump at u=${i / n}`).toBeLessThan(0.25);
      prev = p;
    }
  });

  it('keeps a sane field of view on any aspect ratio', () => {
    for (const aspect of [0.46, 0.75, 1, 1.6, 2.4]) {
      for (let i = 0; i <= 50; i++) {
        const { fov } = pose(i / 50, aspect);
        expect(fov).toBeGreaterThan(15);
        expect(fov).toBeLessThanOrEqual(60);
      }
    }
  });
});
