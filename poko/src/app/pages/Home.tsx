import { createSignal, onCleanup, onMount } from 'solid-js';
import { ChapterIndex, Loader, Story } from '../../components/Story.tsx';
import { ExperienceControls } from '../../components/ExperienceControls.tsx';
import { PokoMark } from '../../components/PokoMark.tsx';
import { SiteHeader } from '../../components/SiteChrome.tsx';
import type { BootHandle } from '../../experience/boot.ts';

export function Home() {
  let canvas!: HTMLCanvasElement;
  const [handle, setHandle] = createSignal<BootHandle | null>(null);
  let disposed = false;

  onMount(async () => {
    // three.js and the engine load after hydration; the page is usable before.
    const { boot } = await import('../../experience/boot.ts');
    const h = await boot(canvas);
    if (disposed) h.dispose();
    else setHandle(h);
  });
  onCleanup(() => {
    disposed = true;
    handle()?.dispose();
  });

  return (
    <>
      <a class="skip-link" href="#finale">Skip to contact</a>
      <SiteHeader current="home" />
      <canvas ref={canvas} class="stage" aria-hidden="true" />
      <div class="static-stage" aria-hidden="true">
        <PokoMark size={208} class="static-poko" />
      </div>
      <Loader />
      <ChapterIndex onGo={(id) => handle()?.scroll.goTo(id)} />
      <Story />
      <ExperienceControls handle={handle} />
    </>
  );
}
