/**
 * Experience: owns the WebGL world and runs one frame at a time.
 *
 * Per frame (only when the FrameScheduler says something can change):
 *   1. scroll progress (smoothed) → evaluateStory(u)    pure scene description
 *   2. camera ← CameraTrack(u) (+ a few cm of pointer parallax)
 *   3. Poko's bones ← story clips + ambient + gaze      → engine bone uniforms
 *   4. voxel engine ← morph / stream / pointer uniforms; one compute pass
 *   5. environment + effects ← story
 *   6. post-processing renders scene → canvas
 *
 * The SolidJS UI never re-renders per frame; it receives chapter changes only.
 */
import * as THREE from 'three';
import { buildPokoModel } from '../character/pokoVoxelizer.ts';
import { PokoRig } from '../character/PokoRig.ts';
import { PokoAnimationController, type PokoAnimState } from '../character/PokoAnimationController.ts';
import { buildFormations } from '../voxel/formations/index.ts';
import { PORTAL_FRAMES, PORTAL_SPACING } from '../voxel/formations/portal.ts';
import { VoxelEngine } from '../voxel/VoxelEngine.ts';
import { patchSkinnedVoxelMaterial } from '../voxel/voxelMaterial.ts';
import { CHAPTERS, chapterAt, progressFor } from '../content/chapters.ts';
import { QualityManager, initialTier, type QualitySettings, type QualityTier } from '../systems/QualityManager.ts';
import { PerformanceMonitor } from '../systems/PerformanceMonitor.ts';
import { FrameScheduler } from '../systems/FrameScheduler.ts';
import { disposeObject, loadPokoCharacter } from '../systems/AssetManager.ts';
import type { Capabilities } from '../systems/capabilities.ts';
import { Environment } from './Environment.ts';
import { Effects } from './Effects.ts';
import { PostProcessing } from './PostProcessing.ts';
import { InteractionController } from './InteractionController.ts';
import type { ScrollController } from './ScrollController.ts';
import { ANCHORS, REST_POINTS, cameraTrack, createFrame, evaluateStory, type StoryFrame } from './story.ts';
import type { CameraPose } from './CameraController.ts';

export interface ExperienceOptions {
  canvas: HTMLCanvasElement;
  scroll: ScrollController;
  capabilities: Capabilities;
  reducedMotion: boolean;
  qualityOverride?: QualityTier | null;
  onChapter?: (index: number) => void;
  onQuality?: (tier: QualityTier) => void;
  debug?: boolean;
}

export interface ExperienceTimings {
  formationsMs: number;
  engineMs: number;
  firstFrameMs: number;
  characterMs: number | null;
}

const STILL: PokoAnimState = { scrubs: [], idle: 0, blink: false, look: 0 };

export class Experience {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
  readonly quality: QualityManager;
  readonly perf = new PerformanceMonitor();
  readonly timings: ExperienceTimings = { formationsMs: 0, engineMs: 0, firstFrameMs: 0, characterMs: null };
  private readonly env: Environment;
  private readonly effects: Effects;
  private readonly engine: VoxelEngine;
  private readonly rig: PokoRig;
  private readonly anim: PokoAnimationController;
  private readonly post: PostProcessing;
  private readonly interaction: InteractionController;
  private readonly scheduler: FrameScheduler;
  private readonly frame: StoryFrame = createFrame();
  private readonly pose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 };
  private readonly parallax = new THREE.Vector3();
  private readonly pokoBox = new THREE.Box3();
  private readonly hit = new THREE.Vector3();
  private time = 0;
  private frozenTime: number | null = null;
  private rippleAge = 99;
  private readonly rippleOrigin = new THREE.Vector3();
  private lastChapter = -1;
  private lastFrameAt = 0;
  private frames = 0;
  private reducedMotion: boolean;
  private disposed = false;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly wake = () => this.scheduler.wake();
  private readonly resizeObserver: ResizeObserver;

  private constructor(private readonly opts: ExperienceOptions) {
    const t0 = performance.now();
    this.reducedMotion = opts.reducedMotion;
    const tier = opts.qualityOverride ?? initialTier(opts.capabilities.device);
    this.quality = new QualityManager(tier, Boolean(opts.qualityOverride));
    const q = this.quality.settings;

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false, // MSAA happens on the HDR target instead
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: Boolean(opts.debug),
    });
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // done in the composite pass
    this.renderer.info.autoReset = false;

    const model = buildPokoModel();
    const t1 = performance.now();
    const set = buildFormations(model);
    this.timings.formationsMs = performance.now() - t1;

    this.env = new Environment(this.renderer, q);
    this.scene.add(this.env.group);
    this.scene.environment = this.env.envMap;
    this.scene.fog = this.env.fog;

    const t2 = performance.now();
    this.engine = new VoxelEngine(this.renderer, set.formations, set.staticData, set.pokoCenter, model.bones.length);
    this.timings.engineMs = performance.now() - t2 + (t1 - t0);
    this.scene.add(this.engine.mesh);

    this.rig = new PokoRig(model.bones);
    this.scene.add(this.rig.root);
    this.anim = new PokoAnimationController(this.rig);

    const tunnelEnd = ANCHORS.portal.z - (PORTAL_FRAMES - 1) * PORTAL_SPACING - 0.9;
    const gate = set.cardRailGate;
    const yaw = -0.32;
    const gateWorld = new THREE.Vector3(...gate.center).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(ANCHORS.cardrail);
    this.effects = new Effects({
      rift: ANCHORS.rift,
      horizon: new THREE.Vector3(ANCHORS.portal.x, ANCHORS.portal.y, tunnelEnd),
      horizonSize: 2.6,
      scanCenter: gateWorld,
      scanYaw: yaw,
      scanSize: [gate.width, gate.height],
    });
    this.scene.add(this.effects.group);

    this.post = new PostProcessing(this.renderer, q);
    this.interaction = new InteractionController();
    this.interaction.onClick((ray) => this.handleClick(ray));
    this.scheduler = new FrameScheduler((dt, now) => this.tick(dt, now));

    this.quality.onChange((s) => this.applyQuality(s));
    this.applyQuality(q);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(opts.canvas);

    this.unsubscribers.push(opts.scroll.onChange(this.wake));
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'focus'] as const) {
      window.addEventListener(ev, this.wake, { passive: true });
      this.unsubscribers.push(() => window.removeEventListener(ev, this.wake));
    }
    const onVisibility = () => (document.hidden ? this.scheduler.stop() : this.scheduler.wake());
    document.addEventListener('visibilitychange', onVisibility);
    this.unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisibility));
  }

  /** Build the world and draw the first frame. Throws if WebGL is unusable. */
  static async create(opts: ExperienceOptions): Promise<Experience> {
    const start = performance.now();
    const exp = new Experience(opts);
    opts.scroll.snap();
    exp.resize();
    exp.tick(0, performance.now());
    exp.timings.firstFrameMs = performance.now() - start;
    if (opts.debug) exp.installDebugApi();
    exp.scheduler.wake();
    // Stage 2: the Blender character, after first paint.
    const t = performance.now();
    void loadPokoCharacter().then((gltf) => {
      if (!gltf || exp.disposed) return;
      gltf.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        m.material = patchSkinnedVoxelMaterial(m.material as THREE.MeshStandardMaterial);
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      });
      if (exp.rig.attachSkinned(gltf.scene)) {
        exp.anim.attachClips(gltf.scene, gltf.animations);
        exp.timings.characterMs = performance.now() - t;
        exp.scheduler.wake();
      } else {
        disposeObject(gltf.scene);
      }
    });
    return exp;
  }

  // ------------------------------------------------------------------ frame
  private tick(dt: number, now: number): boolean {
    if (this.disposed) return false;
    const cpu0 = performance.now();
    const scroll = this.opts.scroll;
    const settling = scroll.update(dt);
    this.interaction.update(dt, this.camera);
    this.time = this.frozenTime ?? this.time + dt;
    this.rippleAge += dt;

    // In reduced-motion mode, show each chapter's settled state instead of the journey.
    let u = scroll.value;
    if (this.reducedMotion) {
      const { index } = chapterAt(scroll.target);
      const id = CHAPTERS[index].id;
      u = progressFor(id, REST_POINTS[id]);
    }
    const f = evaluateStory(u, this.frame);

    if (f.chapterIndex !== this.lastChapter) {
      this.lastChapter = f.chapterIndex;
      this.opts.onChapter?.(f.chapterIndex);
    }

    // Camera
    const aspect = this.camera.aspect;
    cameraTrack.evaluate(u, aspect, this.pose);
    const presence = this.reducedMotion ? 0 : this.interaction.presence;
    this.camera.position.copy(this.pose.position);
    this.camera.lookAt(this.pose.target);
    this.parallax.set(this.interaction.pointer.x * 0.12, this.interaction.pointer.y * 0.07, 0).multiplyScalar(presence);
    this.parallax.applyQuaternion(this.camera.quaternion);
    this.camera.position.add(this.parallax);
    this.camera.lookAt(this.pose.target);
    if (Math.abs(this.camera.fov - this.pose.fov) > 1e-3) {
      this.camera.fov = this.pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();

    // Poko
    this.rig.root.position.copy(f.poko.position);
    this.rig.root.rotation.y = f.poko.yaw;
    const animState = this.reducedMotion ? { ...STILL, scrubs: f.poko.anim.scrubs } : f.poko.anim;
    this.anim.pointer.copy(this.interaction.pointer).multiplyScalar(presence);
    this.anim.update(dt, this.time, animState);
    this.engine.setBones(this.rig.computePose());

    // Representation A (skinned GLB) or B (voxel pool)?
    const skinnedReady = this.rig.skinnedScene !== null;
    const useSkinned = f.pokoSkinned && skinnedReady && f.poko.visible;
    if (this.rig.skinnedScene) this.rig.skinnedScene.visible = useSkinned;
    const pokoNeedsVoxels = f.pokoSkinned && !skinnedReady && f.poko.visible;
    this.engine.mesh.visible = f.voxels || pokoNeedsVoxels;
    this.engine.setHideRigged(f.hideRigged && useSkinned);
    this.engine.setDepth(f.depth, 0.62);
    this.engine.setMorph(f.morph);
    if (f.stream) this.engine.setStream(f.stream);
    const ray = this.interaction.ray;
    this.engine.setPointer(ray.origin, ray.direction, this.reducedMotion ? 0 : f.push * presence * 0.32, 0.75);
    this.engine.setRipple(this.rippleAge < 2 ? this.rippleOrigin : null, this.rippleAge);
    this.engine.setCamera(this.camera.position);

    // World
    this.env.apply(f.env, this.time, this.camera.position);
    this.effects.update(this.time, f.effects.rift, f.effects.portal, f.effects.scan);

    // Render
    this.renderer.info.reset();
    if (this.engine.mesh.visible) this.engine.update(this.renderer, this.time);
    this.post.render(this.scene, this.camera, {
      bloom: f.effects.bloom,
      flash: this.reducedMotion ? 0 : f.effects.flash,
      warp: this.reducedMotion ? 0 : f.effects.warp,
      vignette: f.effects.vignette,
      exposure: 1,
    }, this.time);

    // Bookkeeping
    const cpu = performance.now() - cpu0;
    if (this.lastFrameAt > 0) this.perf.record(now - this.lastFrameAt, cpu);
    this.lastFrameAt = now;
    if (++this.frames % 90 === 0) this.quality.evaluate(this.perf.stats(90).p90, 1000 / 60);
    const pointerActive = this.interaction.idleTime < 1.5;
    return settling || pointerActive || this.rippleAge < 2;
  }

  private handleClick(ray: THREE.Ray): void {
    if (!this.frame.poko.visible || this.reducedMotion) return;
    const p = this.frame.poko.position;
    this.pokoBox.min.set(p.x - 1.4, p.y, p.z - 0.5);
    this.pokoBox.max.set(p.x + 1.4, p.y + 2.5, p.z + 0.5);
    if (ray.intersectBox(this.pokoBox, this.hit)) {
      this.anim.poke();
      this.rippleOrigin.copy(this.hit);
      this.rippleAge = 0;
      this.scheduler.wake();
    }
  }

  // ------------------------------------------------------------------ sizing & quality
  private resize(): void {
    const canvas = this.opts.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const q = this.quality.settings;
    const ratio = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * q.resolutionScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.setSize(size.x, size.y);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.scheduler?.wake();
  }

  private applyQuality(q: QualitySettings): void {
    this.renderer.shadowMap.enabled = q.shadows;
    this.env.setShadows(q.shadows, q.shadowMapSize);
    this.post.setQuality(q);
    this.resize();
    this.opts.onQuality?.(q.tier);
  }

  setQuality(tier: QualityTier): void {
    this.quality.set(tier, true);
  }

  setReducedMotion(reduce: boolean): void {
    this.reducedMotion = reduce;
    this.opts.scroll.setReducedMotion(reduce);
    this.scheduler.wake();
  }

  // ------------------------------------------------------------------ testing hooks
  private installDebugApi(): void {
    const api = {
      ready: true,
      experience: this,
      /** Jump to progress u (scrolls the document; visuals snap). */
      setProgress: (u: number) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, u * max);
        this.opts.scroll.snap();
        this.scheduler.wake();
        this.tick(0, performance.now());
      },
      /** Freeze ambient time for pixel-stable screenshots. */
      freeze: (t: number | null) => {
        this.frozenTime = t;
        this.scheduler.neverSleep = t === null ? false : true;
        this.tick(0, performance.now());
      },
      renderNow: () => this.tick(0, performance.now()),
      info: () => ({
        progress: this.opts.scroll.value,
        chapter: CHAPTERS[this.frame.chapterIndex].id,
        quality: this.quality.settings.tier,
        compute: this.engine.usesCompute,
        skinned: this.rig.skinnedScene !== null,
        render: { ...this.renderer.info.render },
        memory: { ...this.renderer.info.memory },
        programs: this.renderer.info.programs?.length ?? 0,
        frames: this.perf.stats(),
        timings: this.timings,
        scheduler: this.scheduler.state,
        pixelRatio: this.renderer.getPixelRatio(),
        drawingBuffer: this.renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
      }),
      samples: () => this.perf.samples(),
      resetPerf: () => this.perf.reset(),
      /** Checksum of every voxel's computed position (determinism tests). */
      voxelChecksum: () => {
        if (!this.engine.compute) return null;
        this.engine.update(this.renderer, this.time);
        const data = this.engine.compute.readPositions(this.renderer);
        let h = 0;
        for (let i = 0; i < data.length; i++) h = (h * 31 + Math.round(data[i] * 1000)) | 0;
        return h;
      },
      dispose: () => this.dispose(),
    };
    (window as unknown as { __poko: typeof api }).__poko = api;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.stop();
    this.resizeObserver.disconnect();
    for (const u of this.unsubscribers) u();
    this.interaction.dispose();
    this.engine.dispose();
    this.effects.dispose();
    this.env.dispose();
    this.post.dispose();
    if (this.rig.skinnedScene) disposeObject(this.rig.skinnedScene);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}
