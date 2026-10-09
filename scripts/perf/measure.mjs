/**
 * Performance harness: same measurements for any URL, so the old portfolio
 * (baseline) and Poko Genesis can be compared like for like.
 *
 *   node scripts/perf/measure.mjs <url> <label> [--experience] [--mobile] [--network=4g] [--out=file.json]
 *
 * Measures, per run:
 *  - cold and warm navigation: FCP, LCP, DOMContentLoaded, load
 *  - requests, raw bytes and gzip-equivalent bytes (servers compress differently)
 *  - main-thread script time and blocking time (long tasks > 50 ms)
 *  - JS heap
 *  - with --experience: time to first WebGL frame, a scripted scroll through
 *    the whole story with frame-interval percentiles, draw calls, and
 *    wheel → next-frame latency.
 *
 * Caveat printed with every report: headless Chromium in this environment has
 * no GPU (SwiftShader), so frame timings are relative, not absolute.
 */
import { chromium, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [url, label, ...flags] = process.argv.slice(2);
const has = (f) => flags.includes(f);
const opt = (k) => flags.find((f) => f.startsWith(`--${k}=`))?.split('=')[1];
const experience = has('--experience');
const mobile = has('--mobile');
const network = opt('network');
const out = opt('out');

const PROFILES = {
  // Chrome DevTools "Fast 4G"-like profile.
  '4g': { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function load(context, target, { cold }) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (cold) await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (network) await cdp.send('Network.emulateNetworkConditions', PROFILES[network]);
  const responses = new Map();
  cdp.on('Network.responseReceived', (e) => responses.set(e.requestId, { url: e.response.url, type: e.type, fromCache: e.response.fromDiskCache || e.response.fromMemoryCache, status: e.response.status }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = responses.get(e.requestId);
    if (r) r.encoded = e.encodedDataLength;
  });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, longTasks: [] };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(target, { waitUntil: 'load', timeout: 180_000 });
  let firstFrame = null;
  if (experience) {
    await page.waitForFunction(() => window.__poko?.ready === true, null, { timeout: 180_000 });
    firstFrame = await page.evaluate(() => performance.now());
  }
  await page.waitForTimeout(1500); // let LCP and late requests settle
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const tasks = window.__perf.longTasks;
    return {
      fcp: fcp?.startTime ?? null,
      lcp: window.__perf.lcp || null,
      domContentLoaded: n.domContentLoadedEventEnd,
      load: n.loadEventEnd,
      longTasks: tasks.length,
      blockingMs: tasks.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
    };
  });
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  // Raw and gzip-equivalent sizes of every response body (bodies are re-fetched from the browser).
  let raw = 0, gz = 0, encoded = 0, requests = 0;
  const byType = {};
  for (const [id, r] of responses) {
    requests++;
    encoded += r.encoded ?? 0;
    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: id });
      const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
      raw += buf.length;
      const compressible = /text|javascript|json|css|svg|xml|html/.test(r.type + r.url) || /\.(js|css|html|svg|json)(\?|$)/.test(r.url);
      const g = compressible ? gzipSync(buf, { level: 9 }).length : buf.length;
      gz += g;
      byType[r.type] = (byType[r.type] ?? 0) + g;
    } catch {
      /* bodies of some requests (e.g. redirects) are unavailable */
    }
  }
  return {
    page,
    cdp,
    result: {
      wallMs: Date.now() - t0,
      ...nav,
      firstWebGLFrameMs: firstFrame,
      requests,
      rawBytes: raw,
      gzipBytes: gz,
      wireBytes: encoded,
      gzipBytesByType: byType,
      scriptMs: Math.round(metrics.ScriptDuration * 1000),
      taskMs: Math.round(metrics.TaskDuration * 1000),
      jsHeapUsedMB: +(metrics.JSHeapUsedSize / 1048576).toFixed(1),
    },
  };
}

async function story(page) {
  // Scripted wheel scroll through the whole story at a steady pace, recording
  // every rendered frame interval and the latency from wheel to next frame.
  await page.evaluate(() => {
    window.__latency = [];
    window.addEventListener('wheel', (e) => {
      const t = e.timeStamp;
      requestAnimationFrame((now) => window.__latency.push(now - t));
    }, { passive: true });
    window.__poko.resetPerf();
  });
  const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const steps = 160;
  const t0 = Date.now();
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, height / steps);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1500);
  const duration = Date.now() - t0;
  return page.evaluate((ms) => {
    const s = window.__poko.experience.perf.stats();
    const lat = window.__latency.slice().sort((a, b) => a - b);
    const info = window.__poko.info();
    const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
    return {
      scrollDurationMs: ms,
      frames: s.frames,
      avgFps: +s.fps.toFixed(1),
      frameP50: +s.p50.toFixed(1),
      frameP95: +s.p95.toFixed(1),
      frameP99: +s.p99.toFixed(1),
      frameMax: +s.max.toFixed(1),
      jankFrames: s.jank,
      cpuPerFrameP50: +s.cpuP50.toFixed(2),
      cpuPerFrameP95: +s.cpuP95.toFixed(2),
      wheelToFrameP50: lat.length ? +pct(lat, 0.5).toFixed(1) : null,
      wheelToFrameP95: lat.length ? +pct(lat, 0.95).toFixed(1) : null,
      quality: info.quality,
      drawCallsAtEnd: info.render.calls,
      trianglesAtEnd: info.render.triangles,
      gpuGeometries: info.memory.geometries,
      gpuTextures: info.memory.textures,
      programs: info.programs,
      drawingBuffer: info.drawingBuffer,
      timings: info.timings,
      histogram: (() => {
        const h = { '<17': 0, '17-33': 0, '33-50': 0, '50-100': 0, '>100': 0 };
        for (const v of window.__poko.samples()) {
          if (v < 17) h['<17']++; else if (v < 33) h['17-33']++; else if (v < 50) h['33-50']++; else if (v < 100) h['50-100']++; else h['>100']++;
        }
        return h;
      })(),
    };
  }, duration);
}

const contextOptions = mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } };
const target = experience ? `${url}${url.includes('?') ? '&' : '?'}debug${opt('quality') ? `&quality=${opt('quality')}` : ''}` : url;
const report = { label, url: target, mobile, network: network ?? 'none', date: new Date().toISOString(), environment: 'headless Chromium 141 (Playwright 1.56.1), SwiftShader software WebGL, no GPU; loopback server' };

const ctx = await browser.newContext(contextOptions);
const cold = await load(ctx, target, { cold: true });
report.cold = cold.result;
if (experience) report.story = await story(cold.page);
await cold.page.close();
const warm = await load(ctx, target, { cold: false });
report.warm = warm.result;
await ctx.close();
await browser.close();

console.log(JSON.stringify(report, null, 2));
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
