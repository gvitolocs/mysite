/**
 * UI state shared by components. Updated on *events* (chapter change, status,
 * settings), never per animation frame: the renderer and the DOM run on
 * separate clocks, which is what keeps scrolling cheap.
 */
import { createSignal } from 'solid-js';
import type { QualityTier } from '../systems/QualityManager.ts';

export type ExperienceStatus = 'idle' | 'loading' | 'ready' | 'static';

export const [status, setStatus] = createSignal<ExperienceStatus>('idle');
/** Chapter index from scroll position (drives overlays and the index). */
export const [chapter, setChapter] = createSignal(0);
/** Index of the chapter whose overlay is visible, or -1. */
export const [overlay, setOverlay] = createSignal(0);
export const [reducedMotion, setReducedMotion] = createSignal(false);
export const [quality, setQualityLabel] = createSignal<QualityTier | 'auto'>('auto');
export const [staticReason, setStaticReason] = createSignal<string>('');
