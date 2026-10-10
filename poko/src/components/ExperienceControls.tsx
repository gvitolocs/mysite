/** Visitor controls: motion preference, render quality, and a note in static mode. */
import { Show, type Accessor } from 'solid-js';
import type { BootHandle } from '../experience/boot.ts';
import { quality, reducedMotion, staticReason, status } from '../app/store.ts';
import type { QualityTier } from '../systems/QualityManager.ts';

const CYCLE: (QualityTier | 'auto')[] = ['auto', 'high', 'medium', 'low'];

export function ExperienceControls(props: { handle: Accessor<BootHandle | null> }) {
  const nextQuality = () => CYCLE[(CYCLE.indexOf(quality()) + 1) % CYCLE.length];
  return (
    <div class="controls">
      <Show when={status() === 'static'}>
        <p class="controls__note">
          Static version{staticReason() ? `: ${staticReason()}` : ''}
        </p>
      </Show>
      <button
        type="button"
        class="control"
        aria-pressed={reducedMotion()}
        onClick={() => props.handle()?.setReducedMotion(!reducedMotion())}
      >
        {reducedMotion() ? 'Motion: reduced' : 'Motion: full'}
      </button>
      <Show when={status() === 'ready'}>
        <button
          type="button"
          class="control"
          aria-label={`Render quality: ${quality()}. Change to ${nextQuality()}.`}
          onClick={() => props.handle()?.setQuality(nextQuality())}
        >
          Quality: {quality()}
        </button>
      </Show>
    </div>
  );
}
