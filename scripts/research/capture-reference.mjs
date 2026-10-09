#!/usr/bin/env node
/**
 * capture-reference.mjs — reproducible reference capture for WebGL-heavy sites.
 *
 * Research tooling for POKO GENESIS (see docs/research/). It loads one or more
 * URLs in Chromium via Playwright, instruments WebGL / three.js / scrolling from
 * an init script, and writes everything it measures into <outDir> only.
 *
 * Usage
 *   node scripts/research/capture-reference.mjs <outDir> [options]
 *
 * Options
 *   --url <url>          URL to capture (repeatable). Default: https://lusion.co/ and https://lusion.co/about/
 *   --variants <list>    Comma list of: desktop, mobile, reduced, nowebgl  (default: all four)
 *   --segments <n>       Scroll checkpoints (screenshots) per run (default 6)
 *   --segment-px <n>     Wheel distance per checkpoint in CSS px (default 1400)
 *   --settle <ms>        Wait after load before measuring (default 8000)
 *   --no-video           Do not record a video
 *   --no-trace           Do not record a Chromium performance trace
 *   --no-warm            Skip the warm-cache reload
 *   --save-shaders       Store full shader sources in <outDir> (for private analysis only)
 *   --save-bodies        Store script / model response bodies in <outDir> (for private analysis only)
 *   --executable <path>  Chromium binary to use (else Playwright default, else first chrome under
 *                        $PLAYWRIGHT_BROWSERS_PATH)
 *   --timeout <ms>       Navigation timeout (default 90000)
 *
 * Requirements: `playwright` resolvable from the current working directory / NODE_PATH
 * (`npm i playwright`). Never needs `playwright install` if a matching Chromium exists.
 * Proxies: honours HTTPS_PROXY / NO_PROXY by passing them to Chromium.
 *
 * Caveats (also written into every summary):
 *   - In a headless container without a GPU, WebGL runs on SwiftShader (CPU). Frame
 *     timings are then only meaningful relative to each other, never as absolute FPS.
 *   - The instrumentation wraps WebGL calls and adds overhead of its own.
 *   - Third-party captures (screenshots, HAR, video, bodies, shaders) are for private
 *     analysis. Keep <outDir> outside any public repository.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
	const out = {
		outDir: null,
		urls: [],
		variants: ['desktop', 'mobile', 'reduced', 'nowebgl'],
		segments: 6,
		segmentPx: 1400,
		settle: 8000,
		video: true,
		trace: true,
		warm: true,
		saveShaders: false,
		saveBodies: false,
		executable: process.env.CHROMIUM_PATH || null,
		timeout: 90000,
	};
	const rest = [...argv];
	while (rest.length) {
		const a = rest.shift();
		if (a === '--url') out.urls.push(rest.shift());
		else if (a === '--variants') out.variants = rest.shift().split(',').map((s) => s.trim()).filter(Boolean);
		else if (a === '--segments') out.segments = Number(rest.shift());
		else if (a === '--segment-px') out.segmentPx = Number(rest.shift());
		else if (a === '--settle') out.settle = Number(rest.shift());
		else if (a === '--no-video') out.video = false;
		else if (a === '--no-trace') out.trace = false;
		else if (a === '--no-warm') out.warm = false;
		else if (a === '--save-shaders') out.saveShaders = true;
		else if (a === '--save-bodies') out.saveBodies = true;
		else if (a === '--executable') out.executable = rest.shift();
		else if (a === '--timeout') out.timeout = Number(rest.shift());
		else if (a === '-h' || a === '--help') {
			out.help = true;
		} else if (!a.startsWith('--') && !out.outDir) out.outDir = a;
		else throw new Error(`Unknown argument: ${a}`);
	}
	if (!out.urls.length) out.urls = ['https://lusion.co/', 'https://lusion.co/about/'];
	return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help || !opts.outDir) {
	console.log('Usage: node scripts/research/capture-reference.mjs <outDir> [--url <url>]... [--variants desktop,mobile,reduced,nowebgl]');
	process.exit(opts.help ? 0 : 1);
}
const OUT = path.resolve(opts.outDir);
fs.mkdirSync(OUT, { recursive: true });

// Resolve playwright from the CWD first (so it can live in a scratch folder), then normally.
let playwrightVersion = null;
async function loadPlaywright() {
	const tries = [path.join(process.cwd(), 'noop.js'), import.meta.url];
	for (const base of tries) {
		try {
			const req = createRequire(base);
			const p = req.resolve('playwright');
			try {
				playwrightVersion = req('playwright/package.json').version;
			} catch {}
			return await import(pathToFileURL(p).href);
		} catch {
			/* try next */
		}
	}
	return import('playwright');
}
const pw = await loadPlaywright();
const { chromium, devices } = pw.default ?? pw;

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (u) => {
	const x = new URL(u);
	const p = x.pathname.replace(/\/+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
	const q = x.search.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);
	return `${x.hostname.replace(/[^a-z0-9.]+/gi, '-')}${x.port ? '-' + x.port : ''}${p ? '_' + p : ''}${q ? '_' + q : ''}`;
};
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
function quantiles(arr, qs = [0.5, 0.95, 0.99]) {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	const pick = (q) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
	const mean = s.reduce((a, b) => a + b, 0) / s.length;
	const o = { n: s.length, min: s[0], mean: +mean.toFixed(3), max: s[s.length - 1] };
	for (const q of qs) o[`p${Math.round(q * 100)}`] = pick(q);
	return o;
}
function log(...a) {
	console.log(`[capture ${new Date().toISOString().slice(11, 19)}]`, ...a);
}
function findChromium() {
	const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
	if (!root || !fs.existsSync(root)) return null;
	const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
	for (const d of dirs) {
		const p = path.join(root, d, 'chrome-linux', 'chrome');
		if (fs.existsSync(p)) return p;
	}
	return null;
}

// ---------------------------------------------------------------------------
// In-page instrumentation (serialised into the page by addInitScript)
// ---------------------------------------------------------------------------
function pageInstrumentation(OPT) {
	if (window !== window.top) return; // top document only
	const R = (window.__cap = {
		opts: OPT,
		t0: performance.now(),
		contexts: [],
		blocked: [],
		extensions: {},
		totals: {},
		shaders: [],
		shaderTags: {},
		shaderFlags: {},
		shaderNames: {},
		msaaSamples: [],
		compressedFormats: {},
		floatTextures: 0,
		maxDrawBuffers: 0,
		workers: [],
		wasm: [],
		listeners: {},
		frames: [],
		samples: [],
		marks: [],
		longtasks: [],
		lcp: null,
		cls: 0,
		rafCallsTotal: 0,
		three: { revisions: [], renderers: [], scenes: [] },
		errors: [],
	});
	const tot = (k, n = 1) => (R.totals[k] = (R.totals[k] || 0) + n);
	let C = newCounters();
	function newCounters() {
		return {
			draws: 0,
			instancedDraws: 0,
			instances: 0,
			multiDraws: 0,
			fbBinds: 0,
			programSwitches: 0,
			texUploads: 0,
			bufferUploads: 0,
			bufferBytes: 0,
			readPixels: 0,
			clears: 0,
			blits: 0,
			rafCalls: 0,
			threeRenders: 0,
			threeCalls: 0,
			threeTriangles: 0,
			passes: [],
		};
	}
	R.mark = (name) => R.marks.push({ name, t: performance.now() });

	// ---- three.js devtools hook: three dispatches 'register'/'observe' on this target ----
	try {
		const dt = new EventTarget();
		dt.addEventListener('register', (e) => R.three.revisions.push(e.detail && e.detail.revision));
		dt.addEventListener('observe', (e) => {
			const o = e.detail;
			if (!o) return;
			if (o.isWebGLRenderer || (o.render && o.info && o.domElement)) {
				if (R.three.renderers.includes(o)) return;
				R.three.renderers.push(o);
				const orig = o.render;
				o.render = function (scene, camera) {
					const res = orig.apply(this, arguments);
					C.threeRenders++;
					try {
						C.threeCalls += this.info.render.calls;
						C.threeTriangles += this.info.render.triangles;
						if (C.passes.length < 48) {
							const rt = this.getRenderTarget && this.getRenderTarget();
							C.passes.push({
								kind: 'three.render',
								target: rt ? `${rt.width}x${rt.height}${rt.samples ? ' s' + rt.samples : ''}${rt.texture && rt.texture.type ? ' t' + rt.texture.type : ''}` : 'screen',
								calls: this.info.render.calls,
								scene: scene && (scene.name || scene.type),
							});
						}
					} catch (err) {
						/* ignore */
					}
					return res;
				};
			} else if (o.isScene) {
				if (!R.three.scenes.includes(o)) R.three.scenes.push(o);
			}
		});
		Object.defineProperty(window, '__THREE_DEVTOOLS__', { value: dt, configurable: true, writable: true });
	} catch (err) {
		R.errors.push('devtools hook: ' + err);
	}

	// ---- getContext: record (or block) WebGL / WebGPU ----
	const GL_TYPES = ['webgl', 'webgl2', 'experimental-webgl'];
	function hookGetContext(Proto, label) {
		if (!Proto || !Proto.prototype.getContext) return;
		const orig = Proto.prototype.getContext;
		Proto.prototype.getContext = function (type, attrs) {
			const t = String(type).toLowerCase();
			const isGL = GL_TYPES.includes(t);
			if (OPT.blockWebGL && (isGL || t === 'webgpu')) {
				R.blocked.push({ type: t, at: performance.now() });
				return null;
			}
			const ctx = orig.apply(this, arguments);
			if (ctx && (isGL || t === 'webgpu') && !this.__capProbe) {
				if (!this.__capSeen) this.__capSeen = {};
				if (!this.__capSeen[t]) {
					this.__capSeen[t] = true;
					let actual = null;
					try {
						actual = isGL ? ctx.getContextAttributes() : null;
					} catch {}
					R.contexts.push({
						type: t,
						host: label,
						requested: attrs || null,
						actual,
						size: [this.width, this.height],
						at: +performance.now().toFixed(1),
						inDom: !!this.isConnected,
					});
					if (this.dataset) this.dataset.capCtx = t;
				}
			}
			return ctx;
		};
	}
	hookGetContext(window.HTMLCanvasElement, 'canvas');
	hookGetContext(window.OffscreenCanvas, 'offscreen');
	if (OPT.blockWebGL) {
		try {
			Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
		} catch {}
	} else if (navigator.gpu && navigator.gpu.requestAdapter) {
		const ra = navigator.gpu.requestAdapter.bind(navigator.gpu);
		navigator.gpu.requestAdapter = function () {
			tot('webgpu.requestAdapter');
			return ra.apply(this, arguments);
		};
	}

	// ---- WebGL prototype hooks ----
	const fbIds = new WeakMap();
	let fbSeq = 0;
	let curFb = 'screen';
	let curViewport = '';
	const progIds = new WeakMap();
	let progSeq = 0;
	let lastProg = null;
	const shaderType = new WeakMap();
	function seg(kind) {
		if (C.passes.length >= 48) return;
		const last = C.passes[C.passes.length - 1];
		if (last && last.kind === 'gl' && last.fb === curFb && last.vp === curViewport) {
			last.draws += kind === 'draw' ? 1 : 0;
			last.clears += kind === 'clear' ? 1 : 0;
			return;
		}
		C.passes.push({ kind: 'gl', fb: curFb, vp: curViewport, draws: kind === 'draw' ? 1 : 0, clears: kind === 'clear' ? 1 : 0 });
	}
	const TAGS = [
		['instancing', /\binstanceMatrix\b|gl_InstanceID|\battribute\s+\w+\s+(a_)?instance|\bin\s+\w+\s+(a_)?instance|USE_INSTANCING/i],
		['texelFetch', /\btexelFetch\s*\(/],
		['sampler2DArray', /sampler2DArray/],
		['sampler3D', /sampler3D\b/],
		['noise', /snoise|simplex|perlin|\bfbm\b|curl(Noise)?\s*\(|cnoise|valueNoise/i],
		['hash', /\bhash\d*\s*\(/i],
		['toneMapping.ACES', /ACESFilmic/],
		['toneMapping.AgX', /\bAgX/],
		['toneMapping.other', /ReinhardToneMapping|CineonToneMapping|NeutralToneMapping|toneMapping\s*\(/],
		['fxaa', /fxaa/i],
		['smaa', /smaa/i],
		['bloom/blur', /bloom|kawase|luminosityHighPass|gaussian|blur/i],
		['dof', /bokeh|\bcoc\b|depthOfField|circleOfConfusion/i],
		['vignette', /vignette/i],
		['grain/dither', /grain|dither/i],
		['chromaticAberration', /chromatic|aberration|\brgbShift/i],
		['motionBlur', /motionBlur|velocity/i],
		['ao', /ssao|gtao|ambientOcclusion|\bsao\b/i],
		['shadows', /shadowMap|getShadow|PCFShadow|VSM|shadowCoord/],
		['envMap/PMREM', /envMap|cubeUV|PMREM|textureCubeUV/],
		['pbr', /PHYSICAL|STANDARD|physicalMaterial|BRDF_GGX|roughness/],
		['skinning', /skinIndex|boneTexture|boneMatrices|USE_SKINNING/],
		['morphTargets', /morphTarget/],
		['fog', /\bfog(Color|Near|Density)/],
		['glsl3', /#version\s+300\s+es/],
		['mrt', /layout\s*\(\s*location\s*=\s*[1-7]\s*\)/],
		['derivatives', /dFdx|dFdy|fwidth/],
		['raymarch/sdf', /raymarch|\bsdf\b|sdBox|sdSphere|MAX_STEPS/i],
		['fluid', /advect|divergence|pressure|vorticity/i],
		['gpgpu', /texturePosition|textureVelocity|u_?(pos|position|vel|velocity)Tex|resolution\.xy\s*\)\s*;\s*\n?.*texture/i],
		['matcap', /matcap/i],
		['transmission', /transmission/i],
		['logDepth', /logdepthbuf|LOG_DEPTH/i],
	];
	// Minimal GLSL preprocessor: keeps only lines that are active given the shader's own #defines,
	// so declarations inside inactive `#ifdef USE_INSTANCING` (etc.) blocks do not produce false tags.
	// Unknown #if expressions are treated as active.
	function preprocess(src) {
		const defines = {};
		const out = [];
		const stack = []; // each: { active, taken }
		const isActive = () => stack.every((s) => s.active);
		const evalIf = (expr) => {
			let e = expr.replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (m, a, b) => (defines[a || b] !== undefined ? '1' : '0'));
			e = e.replace(/\b[A-Za-z_]\w*\b/g, (id) => (defines[id] !== undefined && /^-?[\d.]+$/.test(defines[id]) ? defines[id] : '0'));
			if (!/^[\d\s()+\-*/%<>=!&|.]+$/.test(e)) return true;
			try {
				return !!Function('"use strict";return (' + e + ')')();
			} catch {
				return true;
			}
		};
		for (const line of String(src).split('\n')) {
			const m = line.match(/^\s*#\s*(define|undef|ifdef|ifndef|if|elif|else|endif)\b\s*(.*)$/);
			if (!m) {
				if (isActive()) out.push(line);
				continue;
			}
			const [, dir, rest] = m;
			if (dir === 'define' && isActive()) {
				const d = rest.match(/^(\w+)(?:\s+(.*))?$/);
				if (d) defines[d[1]] = (d[2] || '').trim();
			} else if (dir === 'undef' && isActive()) delete defines[rest.trim()];
			else if (dir === 'ifdef') stack.push({ active: defines[rest.trim()] !== undefined, taken: defines[rest.trim()] !== undefined });
			else if (dir === 'ifndef') stack.push({ active: defines[rest.trim()] === undefined, taken: defines[rest.trim()] === undefined });
			else if (dir === 'if') {
				const v = evalIf(rest);
				stack.push({ active: v, taken: v });
			} else if (dir === 'elif') {
				const s = stack[stack.length - 1];
				if (s) {
					const v = !s.taken && evalIf(rest);
					s.active = v;
					s.taken = s.taken || v;
				}
			} else if (dir === 'else') {
				const s = stack[stack.length - 1];
				if (s) {
					s.active = !s.taken;
					s.taken = true;
				}
			} else if (dir === 'endif') stack.pop();
		}
		// strip precision statements (three.js declares every sampler type up front)
		return { active: out.filter((l) => !/^\s*precision\s/.test(l)).join('\n'), defines };
	}
	function hookProto(P) {
		if (!P) return;
		const p = P.prototype;
		const wrap = (name, fn) => {
			const orig = p[name];
			if (typeof orig !== 'function') return;
			p[name] = function () {
				try {
					fn.apply(this, arguments);
				} catch {}
				return orig.apply(this, arguments);
			};
		};
		wrap('drawArrays', () => {
			C.draws++;
			seg('draw');
		});
		wrap('drawElements', () => {
			C.draws++;
			seg('draw');
		});
		wrap('drawArraysInstanced', (m, f, c, n) => {
			C.draws++;
			C.instancedDraws++;
			C.instances += n;
			seg('draw');
		});
		wrap('drawElementsInstanced', (m, c, t, o, n) => {
			C.draws++;
			C.instancedDraws++;
			C.instances += n;
			seg('draw');
		});
		wrap('drawRangeElements', () => {
			C.draws++;
			seg('draw');
		});
		wrap('clear', () => {
			C.clears++;
			seg('clear');
		});
		wrap('bindFramebuffer', function (target, fb) {
			if (target === 0x8ca8 /* READ_FRAMEBUFFER */) return;
			C.fbBinds++;
			if (!fb) curFb = 'screen';
			else {
				if (!fbIds.has(fb)) fbIds.set(fb, 'fb' + ++fbSeq);
				curFb = fbIds.get(fb);
			}
		});
		wrap('viewport', (x, y, w, h) => {
			curViewport = `${w}x${h}`;
		});
		wrap('useProgram', (prog) => {
			if (prog !== lastProg) C.programSwitches++;
			lastProg = prog;
			if (prog && !progIds.has(prog)) progIds.set(prog, ++progSeq);
		});
		wrap('createProgram', () => tot('createProgram'));
		wrap('linkProgram', () => tot('linkProgram'));
		wrap('createShader', () => tot('createShader'));
		wrap('createTexture', () => tot('createTexture'));
		wrap('deleteTexture', () => tot('deleteTexture'));
		wrap('createBuffer', () => tot('createBuffer'));
		wrap('deleteBuffer', () => tot('deleteBuffer'));
		wrap('createFramebuffer', () => tot('createFramebuffer'));
		wrap('deleteFramebuffer', () => tot('deleteFramebuffer'));
		wrap('createRenderbuffer', () => tot('createRenderbuffer'));
		wrap('createVertexArray', () => tot('createVertexArray'));
		wrap('shaderSource', function (shader, src) {
			tot('shaderSource');
			const { active, defines } = preprocess(src);
			const tags = [];
			for (const [name, re] of TAGS) if (re.test(active)) tags.push(name);
			for (const tg of tags) R.shaderTags[tg] = (R.shaderTags[tg] || 0) + 1;
			// three.js programs carry their feature switches as #defines (USE_INSTANCING, USE_SHADOWMAP, ...)
			const flags = Object.keys(defines).filter((d) => /^(USE_|TONE_MAPPING$|\w+_TONE_MAPPING$|SRGB_TRANSFER$|SRGB_COLOR_SPACE$|PHYSICAL$|STANDARD$|ENVMAP_TYPE_|DITHERING$|FLAT_SHADED$|DOUBLE_SIDED$|SHADOWMAP_TYPE_|NUM_DIR_LIGHTS$|NUM_POINT_LIGHTS$|NUM_SPOT_LIGHTS$|OPAQUE$|ALPHA)/.test(d) && defines[d] !== '0');
			// three.js defines every tone-mapping operator in its prelude; the selected one is the body of toneMapping()
			const tm = active.match(/vec3\s+toneMapping\s*\(\s*vec3\s+color\s*\)\s*\{\s*return\s+(\w+)\s*\(/);
			if (tm) flags.push('toneMapping=' + tm[1]);
			for (const f of flags) R.shaderFlags[f] = (R.shaderFlags[f] || 0) + 1;
			if (defines.SHADER_NAME) R.shaderNames[defines.SHADER_NAME] = (R.shaderNames[defines.SHADER_NAME] || 0) + 1;
			let h = 0;
			for (let i = 0; i < src.length; i++) h = (Math.imul(31, h) + src.charCodeAt(i)) | 0;
			const rec = { hash: (h >>> 0).toString(16), length: src.length, lines: src.split('\n').length, shaderName: defines.SHADER_NAME || null, tags, flags };
			if (OPT.saveShaders) rec.source = src;
			if (R.shaders.length < 600) R.shaders.push(rec);
		});
		const texUp = (name) =>
			wrap(name, function () {
				C.texUploads++;
				tot(name);
				const a = arguments;
				// texImage2D(target, level, internalformat, w, h, border, format, type, src) or (target, level, ifmt, format, type, src)
				const type = a.length >= 9 ? a[7] : a.length === 6 ? a[4] : null;
				if (type === 0x1406 || type === 0x140b || type === 0x8d61) R.floatTextures++;
			});
		['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'copyTexImage2D', 'copyTexSubImage2D'].forEach(texUp);
		wrap('compressedTexImage2D', (t, l, fmt) => {
			C.texUploads++;
			tot('compressedTexImage2D');
			R.compressedFormats['0x' + fmt.toString(16)] = (R.compressedFormats['0x' + fmt.toString(16)] || 0) + 1;
		});
		wrap('compressedTexSubImage2D', () => {
			C.texUploads++;
			tot('compressedTexSubImage2D');
		});
		wrap('generateMipmap', () => tot('generateMipmap'));
		wrap('bufferData', (t, d) => {
			C.bufferUploads++;
			C.bufferBytes += typeof d === 'number' ? d : (d && d.byteLength) || 0;
		});
		wrap('bufferSubData', (t, o, d) => {
			C.bufferUploads++;
			C.bufferBytes += (d && d.byteLength) || 0;
		});
		wrap('readPixels', () => {
			C.readPixels++;
			tot('readPixels');
		});
		wrap('getError', () => tot('getError'));
		wrap('finish', () => tot('finish'));
		wrap('renderbufferStorageMultisample', (t, s) => R.msaaSamples.push(s));
		wrap('blitFramebuffer', () => C.blits++);
		wrap('drawBuffers', (arr) => (R.maxDrawBuffers = Math.max(R.maxDrawBuffers, (arr && arr.length) || 0)));
		wrap('getExtension', (name) => (R.extensions[name] = (R.extensions[name] || 0) + 1));
		wrap('getSupportedExtensions', () => tot('getSupportedExtensions'));
		// ANGLE_instanced_arrays / WEBGL_multi_draw are extension objects: patch them on retrieval
		const ge = p.getExtension;
		p.getExtension = function (name) {
			const ext = ge.apply(this, arguments);
			try {
				if (ext && name === 'ANGLE_instanced_arrays' && !ext.__cap) {
					ext.__cap = true;
					const a = ext.drawArraysInstancedANGLE;
					const e = ext.drawElementsInstancedANGLE;
					ext.drawArraysInstancedANGLE = function (m, f, c, n) {
						C.draws++;
						C.instancedDraws++;
						C.instances += n;
						seg('draw');
						return a.apply(this, arguments);
					};
					ext.drawElementsInstancedANGLE = function (m, c, t, o, n) {
						C.draws++;
						C.instancedDraws++;
						C.instances += n;
						seg('draw');
						return e.apply(this, arguments);
					};
				}
				if (ext && name === 'WEBGL_multi_draw' && !ext.__cap) {
					ext.__cap = true;
					for (const k of Object.keys(Object.getPrototypeOf(ext))) {
						const f = ext[k];
						if (typeof f === 'function' && /^multiDraw/.test(k))
							ext[k] = function () {
								C.multiDraws++;
								C.draws++;
								seg('draw');
								return f.apply(this, arguments);
							};
					}
				}
			} catch {}
			return ext;
		};
	}
	hookProto(window.WebGLRenderingContext);
	hookProto(window.WebGL2RenderingContext);

	// ---- rAF: per-frame sampling. Registered first, so each tick sees the previous frame's work ----
	const origRAF = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = function (cb) {
		C.rafCalls++;
		R.rafCallsTotal++;
		return origRAF(cb);
	};
	let prevTs = null;
	let frameNo = 0;
	function tick(ts) {
		if (prevTs !== null) {
			const f = {
				t: +ts.toFixed(2),
				dt: +(ts - prevTs).toFixed(2),
				sy: Math.round(window.scrollY),
				draws: C.draws,
				inst: C.instancedDraws,
				instances: C.instances,
				multi: C.multiDraws,
				fb: C.fbBinds,
				prog: C.programSwitches,
				tex: C.texUploads,
				bufUp: C.bufferUploads,
				bufBytes: C.bufferBytes,
				rp: C.readPixels,
				clears: C.clears,
				blits: C.blits,
				raf: C.rafCalls,
				tr: C.threeRenders,
				tc: C.threeCalls,
				tt: C.threeTriangles,
			};
			if (R.frames.length < 20000) R.frames.push(f);
			if (frameNo % 30 === 0 && R.samples.length < 400 && (C.passes.length || C.draws)) {
				R.samples.push({ t: f.t, passes: C.passes });
			}
			if (frameNo % 60 === 0 && performance.memory && R.samples.length < 400) {
				f.heap = performance.memory.usedJSHeapSize;
			}
			frameNo++;
		}
		prevTs = ts;
		C = newCounters();
		origRAF(tick);
	}
	origRAF(tick);

	// ---- listeners (scroll / input relevant) ----
	const WATCH = /^(wheel|mousewheel|DOMMouseScroll|scroll|touchstart|touchmove|touchend|pointermove|pointerdown|pointerup|mousemove|keydown|keyup|resize|visibilitychange|deviceorientation|devicemotion|gesturestart)$/;
	const ael = EventTarget.prototype.addEventListener;
	EventTarget.prototype.addEventListener = function (type, listener, o) {
		try {
			if (WATCH.test(type)) {
				const tgt = this === window ? 'window' : this === document ? 'document' : this.tagName ? this.tagName.toLowerCase() + (this.id ? '#' + this.id : '') : 'other';
				const passive = typeof o === 'object' && o ? (o.passive === undefined ? 'default' : String(o.passive)) : 'default';
				const capture = typeof o === 'boolean' ? o : !!(o && o.capture);
				const k = `${type}|${tgt}|passive=${passive}|capture=${capture}`;
				R.listeners[k] = (R.listeners[k] || 0) + 1;
			}
		} catch {}
		return ael.apply(this, arguments);
	};

	// ---- workers / wasm ----
	if (window.Worker) {
		const W = window.Worker;
		window.Worker = function (url, o) {
			R.workers.push({ url: String(url).slice(0, 200), type: o && o.type, at: +performance.now().toFixed(1) });
			return new W(url, o);
		};
		window.Worker.prototype = W.prototype;
	}
	if (window.WebAssembly) {
		for (const k of ['instantiate', 'instantiateStreaming', 'compile', 'compileStreaming']) {
			const f = WebAssembly[k];
			if (typeof f !== 'function') continue;
			WebAssembly[k] = function (src) {
				R.wasm.push({ fn: k, bytes: src && src.byteLength ? src.byteLength : null, at: +performance.now().toFixed(1) });
				return f.apply(this, arguments);
			};
		}
	}

	// ---- performance observers ----
	try {
		new PerformanceObserver((l) => {
			for (const e of l.getEntries()) if (R.longtasks.length < 2000) R.longtasks.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) });
		}).observe({ type: 'longtask', buffered: true });
	} catch {}
	try {
		new PerformanceObserver((l) => {
			for (const e of l.getEntries())
				R.lcp = { t: +e.startTime.toFixed(1), size: e.size, el: e.element ? e.element.tagName + (e.element.id ? '#' + e.element.id : '') : null, url: e.url ? e.url.slice(0, 160) : null };
		}).observe({ type: 'largest-contentful-paint', buffered: true });
	} catch {}
	try {
		new PerformanceObserver((l) => {
			for (const e of l.getEntries()) if (!e.hadRecentInput) R.cls += e.value;
		}).observe({ type: 'layout-shift', buffered: true });
	} catch {}
}

// ---------------------------------------------------------------------------
// Page-side probes (run via page.evaluate)
// ---------------------------------------------------------------------------
function probeDom() {
	const cs = (el) => getComputedStyle(el);
	const desc = (el) => {
		if (!el || !el.tagName) return String(el);
		const c = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
		return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + c;
	};
	const chain = (el, n = 6) => {
		const out = [];
		for (let e = el.parentElement; e && out.length < n; e = e.parentElement) {
			const s = cs(e);
			out.push({ el: desc(e), position: s.position, overflow: `${s.overflowX}/${s.overflowY}`, transform: s.transform === 'none' ? null : s.transform, zIndex: s.zIndex });
		}
		return out;
	};
	const canvases = [...document.querySelectorAll('canvas')].map((c) => {
		const s = cs(c);
		const r = c.getBoundingClientRect();
		return {
			el: desc(c),
			ctx: (c.dataset && c.dataset.capCtx) || null,
			buffer: [c.width, c.height],
			css: [Math.round(r.width), Math.round(r.height)],
			rect: { x: Math.round(r.x), y: Math.round(r.y) },
			bufferToCssRatio: r.width ? +(c.width / r.width).toFixed(3) : null,
			position: s.position,
			zIndex: s.zIndex,
			transform: s.transform === 'none' ? null : s.transform,
			pointerEvents: s.pointerEvents,
			opacity: s.opacity,
			mixBlendMode: s.mixBlendMode,
			display: s.display,
			ancestors: chain(c),
		};
	});
	const html = document.documentElement;
	const body = document.body;
	const hs = cs(html);
	const bs = body ? cs(body) : null;
	// Large containers that might be smooth-scroll wrappers (transform-driven)
	const tall = [];
	for (const el of document.querySelectorAll('body *')) {
		if (tall.length >= 25) break;
		const r = el.getBoundingClientRect();
		if (r.height > innerHeight * 1.8) {
			const s = cs(el);
			tall.push({ el: desc(el), h: Math.round(r.height), top: Math.round(r.top), position: s.position, overflowY: s.overflowY, transform: s.transform === 'none' ? null : s.transform, willChange: s.willChange });
		}
	}
	const fixed = [];
	for (const el of document.querySelectorAll('body *')) {
		const s = cs(el);
		if ((s.position === 'fixed' || s.position === 'sticky') && fixed.length < 40) {
			const r = el.getBoundingClientRect();
			fixed.push({ el: desc(el), position: s.position, zIndex: s.zIndex, w: Math.round(r.width), h: Math.round(r.height), pointerEvents: s.pointerEvents });
		}
	}
	// What sits on top of the canvas at a few points
	const stacks = [];
	for (const [fx, fy] of [
		[0.5, 0.5],
		[0.25, 0.3],
		[0.75, 0.7],
		[0.1, 0.1],
	]) {
		const x = Math.round(innerWidth * fx);
		const y = Math.round(innerHeight * fy);
		const els = document.elementsFromPoint(x, y).slice(0, 8);
		stacks.push({ at: [x, y], stack: els.map((e) => `${desc(e)} (${cs(e).position}, z=${cs(e).zIndex}, pe=${cs(e).pointerEvents})`) });
	}
	const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: +h.tagName[1], text: (h.innerText || h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90), visible: !!(h.offsetWidth || h.offsetHeight) }));
	const imgs = [...document.querySelectorAll('img')];
	const interactive = [...document.querySelectorAll('a[href],button,[role=button],input,select,textarea,[tabindex]')];
	const nameless = interactive.filter((e) => !((e.innerText || '').trim() || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.querySelector && e.querySelector('img[alt]:not([alt=""])'))));
	const g = window;
	const libs = {
		__THREE__: g.__THREE__ ?? null,
		THREE_global: !!g.THREE,
		threeDevtoolsRevisions: g.__cap ? g.__cap.three.revisions : [],
		gsap: g.gsap ? g.gsap.version || true : null,
		ScrollTrigger: !!g.ScrollTrigger,
		Lenis: !!(g.Lenis || g.lenis),
		LocomotiveScroll: !!g.LocomotiveScroll,
		PIXI: !!g.PIXI,
		BABYLON: !!g.BABYLON,
		Howler: !!g.Howler,
		barba: !!g.barba,
		jQuery: !!g.jQuery,
		next: !!g.__NEXT_DATA__,
		nuxt: !!(g.__NUXT__ || g.$nuxt),
		react: !!document.querySelector('[data-reactroot]') || !!g.React,
		vue: !!g.Vue || !!document.querySelector('[data-v-app]'),
	};
	const htmlClasses = html.className && typeof html.className === 'string' ? html.className : '';
	const bodyClasses = body && typeof body.className === 'string' ? body.className : '';
	return {
		url: location.href,
		title: document.title,
		lang: html.getAttribute('lang'),
		metaViewport: document.querySelector('meta[name=viewport]')?.content || null,
		metaDescription: document.querySelector('meta[name=description]')?.content || null,
		viewport: [innerWidth, innerHeight],
		devicePixelRatio,
		prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
		canvases,
		scroll: {
			scrollingElement: desc(document.scrollingElement),
			scrollY: scrollY,
			docScrollHeight: document.scrollingElement ? document.scrollingElement.scrollHeight : null,
			innerHeight,
			htmlOverflow: `${hs.overflowX}/${hs.overflowY}`,
			bodyOverflow: bs ? `${bs.overflowX}/${bs.overflowY}` : null,
			htmlHeight: hs.height,
			bodyHeight: bs ? bs.height : null,
			bodyPosition: bs ? bs.position : null,
			scrollBehavior: hs.scrollBehavior,
			overscrollBehavior: hs.overscrollBehaviorY,
			touchAction: bs ? bs.touchAction : null,
			htmlClasses: htmlClasses.slice(0, 300),
			bodyClasses: bodyClasses.slice(0, 300),
			tallElements: tall,
		},
		fixedOrSticky: fixed,
		stacks,
		headings,
		images: { total: imgs.length, missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length, emptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length },
		interactive: { total: interactive.length, withoutAccessibleName: nameless.length, samplesWithoutName: nameless.slice(0, 10).map(desc) },
		landmarks: {
			header: document.querySelectorAll('header,[role=banner]').length,
			nav: document.querySelectorAll('nav,[role=navigation]').length,
			main: document.querySelectorAll('main,[role=main]').length,
			footer: document.querySelectorAll('footer,[role=contentinfo]').length,
		},
		ariaLive: document.querySelectorAll('[aria-live]').length,
		ariaHiddenCount: document.querySelectorAll('[aria-hidden=true]').length,
		iframes: document.querySelectorAll('iframe').length,
		videos: [...document.querySelectorAll('video')].map((v) => ({ src: (v.currentSrc || v.src || '').slice(0, 160), autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsInline: v.playsInline })).slice(0, 20),
		scripts: [...document.scripts].map((s) => ({ src: s.src ? s.src.slice(0, 200) : null, type: s.type || null, async: s.async, defer: s.defer, inlineBytes: s.src ? 0 : (s.textContent || '').length })).slice(0, 60),
		preloads: [...document.querySelectorAll('link[rel=preload],link[rel=modulepreload],link[rel=prefetch],link[rel=preconnect]')].map((l) => ({ rel: l.rel, as: l.getAttribute('as'), href: (l.href || '').slice(0, 200) })).slice(0, 60),
		fontsLoaded: document.fonts ? [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`).slice(0, 30) : [],
		domNodes: document.getElementsByTagName('*').length,
		textLength: body ? (body.innerText || '').length : 0,
		noscriptLength: [...document.querySelectorAll('noscript')].reduce((a, n) => a + (n.textContent || '').length, 0),
		libs,
	};
}

function probeThree() {
	const R = window.__cap;
	if (!R) return null;
	const TM = { 0: 'NoToneMapping', 1: 'Linear', 2: 'Reinhard', 3: 'Cineon', 4: 'ACESFilmic', 5: 'Custom', 6: 'AgX', 7: 'Neutral' };
	const SH = { 0: 'Basic', 1: 'PCF', 2: 'PCFSoft', 3: 'VSM' };
	const renderers = R.three.renderers.map((r) => {
		let caps = null;
		try {
			const c = r.capabilities;
			caps = { isWebGL2: c.isWebGL2, maxTextures: c.maxTextures, maxVertexTextures: c.maxVertexTextures, maxTextureSize: c.maxTextureSize, maxSamples: c.maxSamples, precision: c.precision, logarithmicDepthBuffer: c.logarithmicDepthBuffer };
		} catch {}
		let info = null;
		try {
			info = { memory: { ...r.info.memory }, programs: r.info.programs ? r.info.programs.length : null, autoReset: r.info.autoReset, lastRender: { ...r.info.render } };
		} catch {}
		return {
			pixelRatio: r.getPixelRatio ? r.getPixelRatio() : null,
			size: r.domElement ? [r.domElement.width, r.domElement.height] : null,
			toneMapping: TM[r.toneMapping] ?? r.toneMapping,
			toneMappingExposure: r.toneMappingExposure,
			outputColorSpace: r.outputColorSpace ?? r.outputEncoding,
			shadowMap: r.shadowMap ? { enabled: r.shadowMap.enabled, type: SH[r.shadowMap.type] ?? r.shadowMap.type, autoUpdate: r.shadowMap.autoUpdate } : null,
			autoClear: r.autoClear,
			sortObjects: r.sortObjects,
			localClippingEnabled: r.localClippingEnabled,
			xr: r.xr ? r.xr.enabled : null,
			caps,
			info,
		};
	});
	const scenes = R.three.scenes.slice(0, 12).map((s) => {
		const count = {};
		const materials = {};
		const lights = [];
		let instances = 0;
		let skinned = 0;
		let vertices = 0;
		const inc = (k) => (count[k] = (count[k] || 0) + 1);
		try {
			s.traverse((o) => {
				inc(o.type || 'Object3D');
				if (o.isInstancedMesh) instances += o.count;
				if (o.isSkinnedMesh) skinned++;
				if (o.isLight) lights.push({ type: o.type, castShadow: !!o.castShadow, shadowMap: o.shadow && o.shadow.mapSize ? `${o.shadow.mapSize.x}x${o.shadow.mapSize.y}` : null });
				if (o.geometry && o.geometry.attributes && o.geometry.attributes.position) vertices += o.geometry.attributes.position.count;
				const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
				for (const m of ms) {
					// A user-supplied onBeforeCompile is an own property; the default lives on Material.prototype.
					const k = m.type + (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? '+onBeforeCompile' : '');
					materials[k] = (materials[k] || 0) + 1;
				}
			});
		} catch {}
		return {
			name: s.name || null,
			children: s.children.length,
			objectTypes: count,
			materials,
			lights: lights.slice(0, 20),
			instancedMeshInstances: instances,
			skinnedMeshes: skinned,
			vertices,
			background: s.background ? s.background.constructor && (s.background.isColor ? 'Color' : s.background.isTexture ? 'Texture' : 'other') : null,
			environment: !!s.environment,
			fog: s.fog ? s.fog.type || 'fog' : null,
		};
	});
	return { revisions: R.three.revisions, renderers, scenes };
}

function probeGLCaps() {
	const c = document.createElement('canvas');
	c.__capProbe = true;
	const out = {};
	for (const t of ['webgl2', 'webgl']) {
		const gl = c.getContext(t);
		if (!gl) {
			out[t] = null;
			continue;
		}
		const dbg = gl.getExtension('WEBGL_debug_renderer_info');
		const P = (k) => {
			try {
				const v = gl.getParameter(k);
				return v && v.length !== undefined && typeof v !== 'string' ? Array.from(v) : v;
			} catch {
				return null;
			}
		};
		out[t] = {
			renderer: dbg ? P(dbg.UNMASKED_RENDERER_WEBGL) : P(gl.RENDERER),
			vendor: dbg ? P(dbg.UNMASKED_VENDOR_WEBGL) : P(gl.VENDOR),
			version: P(gl.VERSION),
			glsl: P(gl.SHADING_LANGUAGE_VERSION),
			MAX_TEXTURE_SIZE: P(gl.MAX_TEXTURE_SIZE),
			MAX_CUBE_MAP_TEXTURE_SIZE: P(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
			MAX_RENDERBUFFER_SIZE: P(gl.MAX_RENDERBUFFER_SIZE),
			MAX_VERTEX_ATTRIBS: P(gl.MAX_VERTEX_ATTRIBS),
			MAX_VERTEX_TEXTURE_IMAGE_UNITS: P(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
			MAX_TEXTURE_IMAGE_UNITS: P(gl.MAX_TEXTURE_IMAGE_UNITS),
			MAX_VERTEX_UNIFORM_VECTORS: P(gl.MAX_VERTEX_UNIFORM_VECTORS),
			MAX_VIEWPORT_DIMS: P(gl.MAX_VIEWPORT_DIMS),
			MAX_SAMPLES: t === 'webgl2' ? P(gl.MAX_SAMPLES) : null,
			MAX_3D_TEXTURE_SIZE: t === 'webgl2' ? P(gl.MAX_3D_TEXTURE_SIZE) : null,
			MAX_ARRAY_TEXTURE_LAYERS: t === 'webgl2' ? P(gl.MAX_ARRAY_TEXTURE_LAYERS) : null,
			MAX_DRAW_BUFFERS: t === 'webgl2' ? P(gl.MAX_DRAW_BUFFERS) : null,
			supportedExtensions: gl.getSupportedExtensions(),
		};
		const lose = gl.getExtension('WEBGL_lose_context');
		if (lose) lose.loseContext();
		break; // one context type is enough per canvas
	}
	return out;
}

function collectPage() {
	const R = window.__cap;
	const nav = performance.getEntriesByType('navigation')[0];
	const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, +p.startTime.toFixed(1)]));
	return {
		contexts: R ? R.contexts : [],
		blocked: R ? R.blocked : [],
		extensions: R ? R.extensions : {},
		totals: R ? R.totals : {},
		shaderTags: R ? R.shaderTags : {},
		shaderFlags: R ? R.shaderFlags : {},
		shaderNames: R ? R.shaderNames : {},
		shaderCount: R ? R.shaders.length : 0,
		uniqueShaderHashes: R ? new Set(R.shaders.map((s) => s.hash)).size : 0,
		msaaSamples: R ? R.msaaSamples : [],
		compressedFormats: R ? R.compressedFormats : {},
		floatTextureUploads: R ? R.floatTextures : 0,
		maxDrawBuffers: R ? R.maxDrawBuffers : 0,
		workers: R ? R.workers : [],
		wasm: R ? R.wasm : [],
		listeners: R ? R.listeners : {},
		frames: R ? R.frames : [],
		samples: R ? R.samples : [],
		marks: R ? R.marks : [],
		longtasks: R ? R.longtasks : [],
		lcp: R ? R.lcp : null,
		cls: R ? +R.cls.toFixed(4) : null,
		rafCallsTotal: R ? R.rafCallsTotal : 0,
		errors: R ? R.errors : [],
		paints,
		navigation: nav
			? {
					ttfb: +nav.responseStart.toFixed(1),
					domInteractive: +nav.domInteractive.toFixed(1),
					domContentLoaded: +nav.domContentLoadedEventEnd.toFixed(1),
					load: +nav.loadEventEnd.toFixed(1),
					transferSize: nav.transferSize,
					encodedBodySize: nav.encodedBodySize,
					decodedBodySize: nav.decodedBodySize,
					protocol: nav.nextHopProtocol,
				}
			: null,
		memory: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
		shaders: R ? R.shaders : [],
	};
}

// ---------------------------------------------------------------------------
// Network capture over CDP
// ---------------------------------------------------------------------------
const MODEL_EXT = /\.(glb|gltf)(\?|$)/i;
const SIG = [
	['three:REVISION', /REVISION\s*=\s*["'](\d{2,3}[a-z]*)["']|["'](1[2-9]\d)(dev)?["']\s*[,;]\s*\w+\s*=\s*["']?0["']?/],
	['three:WebGLRenderer', /WebGLRenderer|isWebGLRenderer/],
	['three:WebGPURenderer', /WebGPURenderer|isWebGPUBackend/],
	['three:InstancedMesh', /isInstancedMesh/],
	['three:InstancedBufferGeometry', /isInstancedBufferGeometry/],
	['three:DataArrayTexture', /isDataArrayTexture|DataTexture2DArray/],
	['three:Data3DTexture', /isData3DTexture/],
	['three:ShaderMaterial', /isShaderMaterial/],
	['three:RawShaderMaterial', /isRawShaderMaterial/],
	['three:onBeforeCompile', /onBeforeCompile/],
	['three:PMREMGenerator', /PMREMGenerator|_pmremGenerator|cubeUV/],
	['three:SkinnedMesh', /isSkinnedMesh/],
	['three:AnimationMixer', /AnimationMixer|_actions/],
	['three:GLTFLoader', /KHR_materials_|glTF|GLTFLoader/],
	['DRACOLoader', /DRACOLoader|draco_decoder|KHR_draco_mesh_compression/],
	['KTX2/Basis', /KTX2Loader|basis_transcoder|KHR_texture_basisu/],
	['Meshopt', /MeshoptDecoder|EXT_meshopt_compression|meshopt/],
	['RGBE/HDR', /RGBELoader|HDRLoader|#\?RADIANCE/],
	['EXR', /EXRLoader/],
	['EffectComposer', /EffectComposer/],
	['UnrealBloomPass', /UnrealBloomPass|LuminosityHighPass/],
	['pmndrs/postprocessing', /EffectPass|BlendFunction|KawaseBlurPass|SelectiveBloomEffect/],
	['GPUComputationRenderer', /GPUComputationRenderer|addVariable|setVariableDependencies/],
	['FXAA', /FXAA/],
	['SMAA', /SMAA/],
	['gsap', /gsap|GreenSock/i],
	['ScrollTrigger', /ScrollTrigger/],
	['Lenis', /lenis/i],
	['virtual-scroll', /virtual-scroll|VirtualScroll/],
	['locomotive', /locomotive/i],
	['physics', /cannon|ammo\.js|Ammo\(|rapier|oimo|matter-js|box2d|PhysX/i],
	['howler/audio', /Howler|AudioContext|webkitAudioContext/],
	['OffscreenCanvas', /OffscreenCanvas|transferControlToOffscreen/],
	['Worker', /new Worker\(/],
	['WebAssembly', /WebAssembly\.(instantiate|compile)/],
	['lil-gui/dat.gui', /lil-gui|dat\.gui|GUI\(\)/],
	['stats', /Stats\(\)|stats\.js/],
	['matchMedia reduced-motion', /prefers-reduced-motion/],
	['pixi', /PIXI\./],
	['ogl', /\bogl\b/],
];

function attachNetwork(cdp, store) {
	const map = new Map();
	store.requests = [];
	store.map = map;
	cdp.on('Network.requestWillBeSent', (e) => {
		if (!map.has(e.requestId)) {
			const r = { id: e.requestId, url: e.request.url, method: e.request.method, type: e.type || null, start: e.timestamp, wall: e.wallTime, initiator: e.initiator ? e.initiator.type : null, priority: e.request.initialPriority, encoded: 0, decoded: 0 };
			map.set(e.requestId, r);
			store.requests.push(r);
		} else if (e.redirectResponse) {
			map.get(e.requestId).redirect = (map.get(e.requestId).redirect || 0) + 1;
		}
	});
	cdp.on('Network.requestServedFromCache', (e) => {
		const r = map.get(e.requestId);
		if (r) r.servedFromCache = true;
	});
	cdp.on('Network.responseReceived', (e) => {
		const r = map.get(e.requestId);
		if (!r) return;
		const h = Object.fromEntries(Object.entries(e.response.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
		Object.assign(r, {
			type: e.type || r.type,
			status: e.response.status,
			mime: e.response.mimeType,
			protocol: e.response.protocol,
			fromDiskCache: !!e.response.fromDiskCache,
			fromServiceWorker: !!e.response.fromServiceWorker,
			fromPrefetchCache: !!e.response.fromPrefetchCache,
			respTime: e.timestamp,
			headers: pickHeaders(h),
		});
	});
	cdp.on('Network.dataReceived', (e) => {
		const r = map.get(e.requestId);
		if (r) r.decoded += e.dataLength;
	});
	cdp.on('Network.loadingFinished', (e) => {
		const r = map.get(e.requestId);
		if (!r) return;
		r.end = e.timestamp;
		r.encoded = e.encodedDataLength;
		r.finished = true;
	});
	cdp.on('Network.loadingFailed', (e) => {
		const r = map.get(e.requestId);
		if (!r) return;
		r.end = e.timestamp;
		r.failed = e.errorText;
		r.blockedReason = e.blockedReason || null;
	});
}
function pickHeaders(h) {
	const keep = ['content-type', 'content-encoding', 'content-length', 'cache-control', 'etag', 'last-modified', 'expires', 'age', 'server', 'via', 'x-cache', 'cf-cache-status', 'cf-ray', 'x-amz-cf-pop', 'x-amz-cf-id', 'x-served-by', 'x-vercel-cache', 'x-nf-request-id', 'x-github-request-id', 'alt-svc', 'timing-allow-origin', 'access-control-allow-origin', 'vary', 'x-powered-by', 'cross-origin-opener-policy', 'cross-origin-embedder-policy'];
	const o = {};
	for (const k of keep) if (h[k] !== undefined) o[k] = h[k].slice(0, 200);
	return o;
}

function extOf(u) {
	try {
		const p = new URL(u).pathname.toLowerCase();
		const m = p.match(/\.([a-z0-9]{1,6})$/);
		return m ? m[1] : '(none)';
	} catch {
		return '(none)';
	}
}

function summarizeNetwork(requests, navStart) {
	const rows = requests.filter((r) => !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
	const t0 = navStart ?? Math.min(...rows.map((r) => r.start));
	const add = (m, k, r) => {
		const x = (m[k] = m[k] || { count: 0, transfer: 0, decoded: 0 });
		x.count++;
		x.transfer += r.encoded || 0;
		x.decoded += r.decoded || 0;
	};
	const byType = {};
	const byExt = {};
	const byHost = {};
	const encodings = {};
	const cacheControl = {};
	const cdnHints = {};
	const buckets = {};
	let immutable = 0;
	let hashedNames = 0;
	let cached = 0;
	const protocols = {};
	for (const r of rows) {
		add(byType, r.type || 'Other', r);
		add(byExt, extOf(r.url), r);
		try {
			add(byHost, new URL(r.url).host, r);
		} catch {}
		const h = r.headers || {};
		encodings[h['content-encoding'] || '(none)'] = (encodings[h['content-encoding'] || '(none)'] || 0) + 1;
		const cc = h['cache-control'] || '(none)';
		cacheControl[cc] = (cacheControl[cc] || 0) + 1;
		if (/immutable/i.test(cc)) immutable++;
		if (/[.\-_][0-9a-f]{8,}\.|[.\-_][A-Za-z0-9_-]{8}\.(js|css|glb|ktx2|webp|avif|woff2|bin|png|jpg)$/i.test(new URL(r.url).pathname)) hashedNames++;
		for (const k of ['server', 'via', 'x-cache', 'cf-cache-status', 'x-amz-cf-pop', 'x-served-by', 'x-vercel-cache', 'x-nf-request-id', 'x-github-request-id']) {
			if (h[k]) {
				const key = `${k}: ${h[k].slice(0, 40)}`;
				cdnHints[key] = (cdnHints[key] || 0) + 1;
			}
		}
		if (r.fromDiskCache || r.servedFromCache) cached++;
		protocols[r.protocol || '(unknown)'] = (protocols[r.protocol || '(unknown)'] || 0) + 1;
		const rel = (r.start - t0) * 1000;
		const b = rel < 1000 ? '0-1s' : rel < 2000 ? '1-2s' : rel < 5000 ? '2-5s' : rel < 10000 ? '5-10s' : rel < 20000 ? '10-20s' : rel < 40000 ? '20-40s' : '>40s';
		add(buckets, b, r);
	}
	const tot = rows.reduce((a, r) => ({ transfer: a.transfer + (r.encoded || 0), decoded: a.decoded + (r.decoded || 0) }), { transfer: 0, decoded: 0 });
	const waterfall = [...rows]
		.sort((a, b) => a.start - b.start)
		.slice(0, 80)
		.map((r) => ({ t_ms: Math.round((r.start - t0) * 1000), dur_ms: r.end ? Math.round((r.end - r.start) * 1000) : null, type: r.type, ext: extOf(r.url), transfer: r.encoded, decoded: r.decoded, status: r.status ?? r.failed, url: r.url.slice(0, 140) }));
	const heaviest = [...rows]
		.sort((a, b) => (b.decoded || 0) - (a.decoded || 0))
		.slice(0, 25)
		.map((r) => ({ ext: extOf(r.url), type: r.type, transfer: r.encoded, decoded: r.decoded, enc: (r.headers || {})['content-encoding'] || null, cc: (r.headers || {})['cache-control'] || null, url: r.url.slice(0, 160) }));
	const failed = rows.filter((r) => r.failed).map((r) => ({ url: r.url.slice(0, 160), error: r.failed, blockedReason: r.blockedReason }));
	return { requests: rows.length, totals: tot, cachedResponses: cached, byType, byExt, byHost, encodings, cacheControl, immutable, hashedNames, cdnHints, protocols, timeBuckets: buckets, waterfall, heaviest, failed };
}

async function inspectBodies(cdp, requests, dir, saveBodies) {
	const scripts = [];
	const models = [];
	const ktx2 = [];
	for (const r of requests) {
		if (!r.finished || r.status >= 400) continue;
		const ext = extOf(r.url);
		const isScript = r.type === 'Script' || ext === 'js' || ext === 'mjs';
		const isModel = MODEL_EXT.test(r.url) || /gltf/.test(r.mime || '');
		const isKtx = ext === 'ktx2';
		if (!isScript && !isModel && !isKtx) continue;
		let body;
		try {
			const res = await cdp.send('Network.getResponseBody', { requestId: r.id });
			body = res.base64Encoded ? Buffer.from(res.body, 'base64') : Buffer.from(res.body, 'utf8');
		} catch (err) {
			continue;
		}
		if (saveBodies) {
			const name = `${String(r.id).replace(/[^a-z0-9.]/gi, '_')}_${path.basename(new URL(r.url).pathname).slice(0, 60) || 'index'}`;
			fs.mkdirSync(path.join(dir, 'bodies'), { recursive: true });
			fs.writeFileSync(path.join(dir, 'bodies', name), body);
		}
		if (isScript) {
			const text = body.toString('utf8');
			const hits = {};
			for (const [k, re] of SIG) {
				const m = text.match(re);
				if (m) hits[k] = k === 'three:REVISION' ? m[1] || m[2] : true;
			}
			scripts.push({ url: r.url.slice(0, 160), transfer: r.encoded, decoded: body.length, enc: (r.headers || {})['content-encoding'] || null, signatures: hits });
		} else if (isModel) {
			models.push({ url: r.url.slice(0, 160), transfer: r.encoded, decoded: body.length, ...parseGltf(body) });
		} else if (isKtx) {
			ktx2.push({ url: r.url.slice(0, 160), transfer: r.encoded, ...parseKtx2(body) });
		}
	}
	return { scripts, models, ktx2 };
}

function parseGltf(buf) {
	try {
		let json;
		let binBytes = 0;
		if (buf.readUInt32LE(0) === 0x46546c67) {
			const version = buf.readUInt32LE(4);
			const len0 = buf.readUInt32LE(12);
			json = JSON.parse(buf.subarray(20, 20 + len0).toString('utf8'));
			if (buf.length > 20 + len0 + 8) binBytes = buf.readUInt32LE(20 + len0);
			json.__container = `GLB v${version}`;
		} else {
			json = JSON.parse(buf.toString('utf8'));
			json.__container = 'glTF JSON';
		}
		const n = (k) => (Array.isArray(json[k]) ? json[k].length : 0);
		const prims = (json.meshes || []).reduce((a, m) => a + (m.primitives || []).length, 0);
		const attrs = new Set();
		for (const m of json.meshes || []) for (const p of m.primitives || []) for (const a of Object.keys(p.attributes || {})) attrs.add(a);
		return {
			container: json.__container,
			generator: json.asset && json.asset.generator,
			extensionsUsed: json.extensionsUsed || [],
			extensionsRequired: json.extensionsRequired || [],
			counts: { scenes: n('scenes'), nodes: n('nodes'), meshes: n('meshes'), primitives: prims, materials: n('materials'), textures: n('textures'), images: n('images'), animations: n('animations'), skins: n('skins'), accessors: n('accessors'), bufferViews: n('bufferViews') },
			imageMimeTypes: [...new Set((json.images || []).map((i) => i.mimeType || (i.uri ? extOf('http://x/' + i.uri) : null)))],
			attributes: [...attrs],
			animationChannels: (json.animations || []).reduce((a, an) => a + (an.channels || []).length, 0),
			binChunkBytes: binBytes,
		};
	} catch (err) {
		return { parseError: String(err).slice(0, 120) };
	}
}

function parseKtx2(buf) {
	try {
		const id = buf.subarray(0, 12).toString('latin1');
		if (!id.includes('KTX 20')) return { parseError: 'not KTX2' };
		const vkFormat = buf.readUInt32LE(12);
		const w = buf.readUInt32LE(20);
		const h = buf.readUInt32LE(24);
		const levels = buf.readUInt32LE(40);
		const scs = buf.readUInt32LE(44);
		return { vkFormat, size: [w, h], levels, supercompression: ['none', 'BasisLZ(ETC1S)', 'Zstandard', 'ZLIB'][scs] ?? scs, likelyBasis: vkFormat === 0 };
	} catch (err) {
		return { parseError: String(err).slice(0, 120) };
	}
}

// ---------------------------------------------------------------------------
// Trace summary (Chromium JSON trace)
// ---------------------------------------------------------------------------
function summarizeTrace(file) {
	try {
		const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
		const ev = Array.isArray(raw) ? raw : raw.traceEvents || [];
		const threadNames = {};
		for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') threadNames[`${e.pid}:${e.tid}`] = e.args && e.args.name;
		const mainKeys = new Set(Object.entries(threadNames).filter(([, n]) => n === 'CrRendererMain').map(([k]) => k));
		const names = ['FireAnimationFrame', 'FunctionCall', 'EvaluateScript', 'v8.compile', 'Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'RasterTask', 'GPUTask', 'BeginFrame', 'DrawFrame', 'DroppedFrame', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'V8.GC_MARK_COMPACTOR', 'ParseHTML', 'ScrollLayer', 'EventDispatch', 'TimerFire', 'ResourceSendRequest', 'decode', 'ImageDecodeTask', 'Decode Image'];
		const agg = {};
		const rafDur = [];
		const mainTasks = [];
		for (const e of ev) {
			if (names.includes(e.name)) {
				const a = (agg[e.name] = agg[e.name] || { count: 0, totalMs: 0 });
				a.count++;
				if (e.dur) a.totalMs += e.dur / 1000;
				if (e.name === 'FireAnimationFrame' && e.dur) rafDur.push(e.dur / 1000);
			}
			if (e.name === 'RunTask' && e.dur && mainKeys.has(`${e.pid}:${e.tid}`)) mainTasks.push(e.dur / 1000);
		}
		for (const k of Object.keys(agg)) agg[k].totalMs = +agg[k].totalMs.toFixed(1);
		return {
			events: ev.length,
			aggregates: agg,
			fireAnimationFrameMs: quantiles(rafDur.map((x) => +x.toFixed(2))),
			mainThreadTasksMs: quantiles(mainTasks.map((x) => +x.toFixed(2))),
			mainThreadTasksOver50ms: mainTasks.filter((x) => x > 50).length,
			mainThreadBusyMs: +mainTasks.reduce((a, b) => a + b, 0).toFixed(1),
		};
	} catch (err) {
		return { error: String(err).slice(0, 200) };
	}
}

function summarizeFrames(frames, marks) {
	if (!frames.length) return null;
	const pick = (arr) => ({
		frames: arr.length,
		dtMs: quantiles(arr.map((f) => f.dt)),
		approxFps: arr.length ? +(1000 / (arr.reduce((a, f) => a + f.dt, 0) / arr.length)).toFixed(1) : null,
		over33ms: arr.filter((f) => f.dt > 33.4).length,
		over50ms: arr.filter((f) => f.dt > 50).length,
		drawsPerFrame: quantiles(arr.map((f) => f.draws)),
		instancedDrawsPerFrame: quantiles(arr.map((f) => f.inst)),
		instancesPerFrame: quantiles(arr.map((f) => f.instances)),
		fbBindsPerFrame: quantiles(arr.map((f) => f.fb)),
		programSwitchesPerFrame: quantiles(arr.map((f) => f.prog)),
		texUploadsPerFrame: quantiles(arr.map((f) => f.tex)),
		bufferBytesPerFrame: quantiles(arr.map((f) => f.bufBytes)),
		readPixelsTotal: arr.reduce((a, f) => a + f.rp, 0),
		rafCallsPerFrame: quantiles(arr.map((f) => f.raf)),
		threeRendersPerFrame: quantiles(arr.map((f) => f.tr)),
		threeCallsPerFrame: quantiles(arr.map((f) => f.tc)),
		threeTrianglesPerFrame: quantiles(arr.map((f) => f.tt)),
	});
	const m = Object.fromEntries(marks.map((x) => [x.name, x.t]));
	const out = { all: pick(frames) };
	if (m['scroll-start'] && m['scroll-end']) {
		out.idleBeforeScroll = pick(frames.filter((f) => f.t < m['scroll-start']));
		out.duringScroll = pick(frames.filter((f) => f.t >= m['scroll-start'] && f.t <= m['scroll-end']));
	}
	return out;
}

// ---------------------------------------------------------------------------
// Image diff helper (runs in a blank page; no extra dependencies)
// ---------------------------------------------------------------------------
async function imageDiff(browser, a, b) {
	if (!a || !b || !fs.existsSync(a) || !fs.existsSync(b)) return null;
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	try {
		return await page.evaluate(
			async ([A, B]) => {
				const load = async (b64) => createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
				const [ia, ib] = await Promise.all([load(A), load(B)]);
				const w = Math.min(ia.width, ib.width);
				const h = Math.min(ia.height, ib.height);
				const get = (img) => {
					const c = new OffscreenCanvas(w, h);
					const g = c.getContext('2d');
					g.drawImage(img, 0, 0);
					return g.getImageData(0, 0, w, h).data;
				};
				const da = get(ia);
				const db = get(ib);
				let sum = 0;
				let changed = 0;
				for (let i = 0; i < da.length; i += 4) {
					const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
					sum += d;
					if (d > 16) changed++;
				}
				return { meanAbsDiff: +(sum / (w * h)).toFixed(2), changedPixelRatio: +(changed / (w * h)).toFixed(4), size: [w, h] };
			},
			[fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')],
		);
	} catch (err) {
		return { error: String(err).slice(0, 160) };
	} finally {
		await ctx.close();
	}
}

// ---------------------------------------------------------------------------
// One run = one URL x one variant
// ---------------------------------------------------------------------------
async function scrollBy(page, cdp, isMobile, px) {
	// Small steps that resemble a user (wheel notches / short swipes). px > 0 scrolls down.
	const vp = page.viewportSize() || { width: 390, height: 844 };
	if (isMobile) {
		// Input.synthesizeScrollGesture is a no-op in headless Chromium, so drag raw touch points.
		const perSwipe = Math.round(vp.height * 0.45);
		const swipes = Math.max(1, Math.round(Math.abs(px) / perSwipe));
		const dy = px / swipes;
		const x = Math.round(vp.width / 2);
		const y0 = dy > 0 ? Math.round(vp.height * 0.75) : Math.round(vp.height * 0.25);
		for (let i = 0; i < swipes; i++) {
			try {
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
				const moves = 12;
				for (let k = 1; k <= moves; k++) {
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y0 - (dy * k) / moves) }] });
					await sleep(16);
				}
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			} catch {
				await page.mouse.wheel(0, dy);
			}
			await sleep(80);
		}
	} else {
		const steps = Math.max(1, Math.round(Math.abs(px) / 100));
		for (let i = 0; i < steps; i++) {
			await page.mouse.wheel(0, Math.round(px / steps));
			await sleep(40);
		}
	}
}

async function runVariant(browser, url, variant, baseDir) {
	const dir = path.join(baseDir, variant);
	fs.mkdirSync(dir, { recursive: true });
	const isMobile = variant === 'mobile';
	// Mobile: iPhone-class UA/DPR/touch, but the full 390x844 CSS viewport (the stock descriptor uses 390x664).
	const ctxOpts = isMobile
		? { ...(devices['iPhone 13'] || {}), viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
		: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
	delete ctxOpts.defaultBrowserType;
	ctxOpts.reducedMotion = variant === 'reduced' ? 'reduce' : 'no-preference';
	ctxOpts.serviceWorkers = 'block';
	ctxOpts.recordHar = { path: path.join(dir, 'network.har'), content: 'omit' };
	if (opts.video && (variant === 'desktop' || variant === 'mobile')) ctxOpts.recordVideo = { dir: path.join(dir, 'video-tmp'), size: ctxOpts.viewport };
	const context = await browser.newContext(ctxOpts);
	await context.addInitScript(pageInstrumentation, { blockWebGL: variant === 'nowebgl', saveShaders: opts.saveShaders });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable', { maxResourceBufferSize: 64 * 1024 * 1024, maxTotalBufferSize: 512 * 1024 * 1024 });
	await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
	const net = {};
	attachNetwork(cdp, net);
	const consoleMsgs = [];
	page.on('console', (m) => consoleMsgs.length < 300 && consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) }));
	page.on('pageerror', (e) => consoleMsgs.length < 300 && consoleMsgs.push({ type: 'pageerror', text: String(e).slice(0, 300) }));

	const result = { url, variant, startedAt: new Date().toISOString(), contextOptions: { viewport: ctxOpts.viewport, deviceScaleFactor: ctxOpts.deviceScaleFactor, isMobile: !!ctxOpts.isMobile, hasTouch: !!ctxOpts.hasTouch, reducedMotion: ctxOpts.reducedMotion } };
	const shots = [];
	let navOk = false;
	const tNav = Date.now();
	try {
		const resp = await page.goto(url, { waitUntil: 'load', timeout: opts.timeout });
		result.httpStatus = resp ? resp.status() : null;
		navOk = !!resp && resp.status() < 400;
		if (!navOk) result.navigationError = `HTTP ${result.httpStatus}`;
	} catch (err) {
		result.navigationError = String(err.message || err).split('\n')[0].slice(0, 300);
	}
	result.loadEventWallMs = Date.now() - tNav;

	if (navOk) {
		await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
		result.networkIdleWallMs = Date.now() - tNav;
		await sleep(opts.settle);
		result.dom = await page.evaluate(probeDom).catch((e) => ({ error: String(e) }));
		if (variant !== 'nowebgl') result.glCaps = await page.evaluate(probeGLCaps).catch((e) => ({ error: String(e) }));
		const shot = async (name) => {
			const p = path.join(dir, `${name}.png`);
			try {
				await page.screenshot({ path: p, timeout: 30000 });
				shots.push({ name, file: path.relative(baseDir, p), scrollY: await page.evaluate(() => scrollY).catch(() => null) });
			} catch (err) {
				shots.push({ name, error: String(err).slice(0, 120) });
			}
		};
		await shot('scroll-00');

		// ---- scripted scroll with tracing ----
		const doTrace = opts.trace && (variant === 'desktop' || variant === 'mobile');
		if (doTrace) {
			try {
				await browser.startTracing(page, { path: path.join(dir, 'trace.json'), categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'blink.user_timing', 'gpu', 'latencyInfo', 'loading'] });
			} catch (err) {
				result.traceError = String(err).slice(0, 200);
			}
		}
		const metricsBefore = await cdp.send('Performance.getMetrics').catch(() => null);
		await page.evaluate(() => window.__cap && window.__cap.mark('scroll-start')).catch(() => {});
		const totalPx = opts.segments * opts.segmentPx;
		for (let s = 1; s <= opts.segments; s++) {
			await scrollBy(page, cdp, isMobile, opts.segmentPx);
			await sleep(1200); // let damped/smoothed scroll settle before the checkpoint
			await shot(`scroll-${String(s).padStart(2, '0')}`);
		}
		await page.evaluate(() => window.__cap && window.__cap.mark('scroll-end')).catch(() => {});
		const metricsAfter = await cdp.send('Performance.getMetrics').catch(() => null);
		if (doTrace && !result.traceError) {
			try {
				await browser.stopTracing();
				result.trace = summarizeTrace(path.join(dir, 'trace.json'));
			} catch (err) {
				result.traceError = String(err).slice(0, 200);
			}
		}
		// ---- reversibility: scroll all the way back up and compare with the first frame ----
		await scrollBy(page, cdp, isMobile, -totalPx - 2000);
		await sleep(2500);
		await shot('return-top');
		result.reversibility = await imageDiff(browser, path.join(dir, 'scroll-00.png'), path.join(dir, 'return-top.png'));

		// ---- keyboard ----
		if (variant === 'desktop' || variant === 'reduced') {
			const focus = [];
			for (let i = 0; i < 12; i++) {
				await page.keyboard.press('Tab');
				await sleep(150);
				focus.push(
					await page
						.evaluate(() => {
							const a = document.activeElement;
							if (!a || a === document.body) return null;
							const s = getComputedStyle(a);
							return { el: a.tagName.toLowerCase() + (a.id ? '#' + a.id : ''), text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 50), focusVisible: a.matches(':focus-visible'), outline: `${s.outlineStyle} ${s.outlineWidth}`, inViewport: (() => { const r = a.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })() };
						})
						.catch(() => null),
				);
			}
			await page.keyboard.press('Escape').catch(() => {});
			await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()).catch(() => {});
			const before = await page.evaluate(() => scrollY).catch(() => null);
			await shot('kbd-before');
			for (const key of ['PageDown', 'Space', 'ArrowDown', 'ArrowDown', 'End']) {
				await page.keyboard.press(key).catch(() => {});
				await sleep(500);
			}
			await sleep(1200);
			await shot('kbd-after');
			const after = await page.evaluate(() => scrollY).catch(() => null);
			result.keyboard = { tabOrder: focus, scrollYBefore: before, scrollYAfterKeys: after, visualChange: await imageDiff(browser, path.join(dir, 'kbd-before.png'), path.join(dir, 'kbd-after.png')) };
		}

		// ---- accessibility tree (ARIA snapshot) ----
		try {
			const aria = await page.locator('body').ariaSnapshot({ timeout: 15000 });
			fs.writeFileSync(path.join(dir, 'aria-snapshot.yml'), aria);
			result.ariaSnapshotLines = aria.split('\n').length;
		} catch (err) {
			result.ariaSnapshotError = String(err).slice(0, 160);
		}

		result.three = await page.evaluate(probeThree).catch((e) => ({ error: String(e) }));
		const pageData = await page.evaluate(collectPage).catch((e) => ({ error: String(e) }));
		if (pageData.shaders) {
			writeJSON(path.join(dir, opts.saveShaders ? 'shaders-full.json' : 'shaders-meta.json'), pageData.shaders);
			delete pageData.shaders;
		}
		writeJSON(path.join(dir, 'frames.json'), { frames: pageData.frames, samples: pageData.samples, marks: pageData.marks });
		result.frameStats = summarizeFrames(pageData.frames || [], pageData.marks || []);
		result.passSamples = (pageData.samples || []).slice(0, 6);
		delete pageData.frames;
		delete pageData.samples;
		result.page = pageData;
		result.cdpMetrics = { beforeScroll: metricsBefore && Object.fromEntries(metricsBefore.metrics.map((m) => [m.name, m.value])), afterScroll: metricsAfter && Object.fromEntries(metricsAfter.metrics.map((m) => [m.name, m.value])) };
		const navStart = net.requests.length ? Math.min(...net.requests.map((r) => r.start)) : null;
		result.network = summarizeNetwork(net.requests, navStart);
		result.bodies = await inspectBodies(cdp, net.requests, dir, opts.saveBodies);
		writeJSON(path.join(dir, 'requests.json'), net.requests);

		// ---- warm-cache reload (same context keeps the HTTP cache) ----
		if (opts.warm && variant === 'desktop') {
			const warm = {};
			attachNetwork(cdp, warm);
			const t1 = Date.now();
			try {
				await page.goto(url, { waitUntil: 'load', timeout: opts.timeout });
				result.warmLoadEventWallMs = Date.now() - t1;
				await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
				await sleep(Math.min(opts.settle, 5000));
				const wp = await page.evaluate(() => ({ paints: Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, +p.startTime.toFixed(1)])), lcp: window.__cap && window.__cap.lcp, nav: performance.getEntriesByType('navigation')[0]?.toJSON() }));
				const ws = warm.requests.length ? Math.min(...warm.requests.map((r) => r.start)) : null;
				result.warm = { paints: wp.paints, lcp: wp.lcp, loadEventEnd: wp.nav && wp.nav.loadEventEnd, network: summarizeNetwork(warm.requests, ws) };
				delete result.warm.network.waterfall;
			} catch (err) {
				result.warmError = String(err).slice(0, 200);
			}
		}
	}

	result.screenshots = shots;
	result.console = consoleMsgs;
	if (!navOk) {
		result.network = summarizeNetwork(net.requests, null);
		writeJSON(path.join(dir, 'requests.json'), net.requests);
	}
	const video = page.video();
	await context.close().catch(() => {});
	if (video) {
		try {
			await video.saveAs(path.join(dir, 'scroll.webm'));
			await video.delete();
			fs.rmSync(path.join(dir, 'video-tmp'), { recursive: true, force: true });
			result.video = 'scroll.webm';
		} catch (err) {
			result.videoError = String(err).slice(0, 160);
		}
	}
	writeJSON(path.join(dir, 'result.json'), result);
	return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
	const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
	const launch = {
		headless: true,
		args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'],
	};
	// Only route through the proxy when at least one target host is not covered by NO_PROXY.
	// (Playwright otherwise forces loopback through the proxy via '<-loopback>'.)
	const noProxyList = noProxy.split(',').map((s) => s.trim()).filter(Boolean);
	const bypassed = (host) => noProxyList.some((p) => !p.includes('/') && (host === p || (p.startsWith('.') && host.endsWith(p)) || (p.startsWith('*.') && host.endsWith(p.slice(1))))) || /^(127\.|localhost$|\[::1\]$)/.test(host);
	const needsProxy = proxy && opts.urls.some((u) => !bypassed(new URL(u).hostname));
	process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
	if (needsProxy) launch.proxy = { server: proxy, bypass: noProxyList.filter((s) => !s.includes('/')).join(',') };
	if (opts.executable) launch.executablePath = opts.executable;
	let browser;
	try {
		browser = await chromium.launch(launch);
	} catch (err) {
		const fallback = findChromium();
		if (!fallback || opts.executable) throw err;
		log('default Chromium failed to launch, falling back to', fallback);
		browser = await chromium.launch({ ...launch, executablePath: fallback });
	}
	const env = {
		capturedAt: new Date().toISOString(),
		node: process.version,
		platform: `${os.platform()} ${os.release()}`,
		cpus: os.cpus().length,
		cpuModel: os.cpus()[0] && os.cpus()[0].model,
		memoryGB: +(os.totalmem() / 2 ** 30).toFixed(1),
		browserVersion: browser.version(),
		playwright: playwrightVersion,
		proxy: launch.proxy ? 'HTTPS_PROXY set (requests tunnelled through it)' : 'direct (no proxy for these hosts)',
		options: { ...opts, outDir: undefined },
		caveats: [
			'Headless Chromium; if the WebGL renderer reports SwiftShader, rendering is CPU-emulated and frame timings are relative only.',
			'Instrumentation wraps WebGL/rAF/addEventListener and adds its own overhead.',
			'Network sizes come from CDP: transfer = encodedDataLength (includes headers), decoded = sum of dataReceived.dataLength.',
		],
	};
	const summary = { env, runs: [] };
	for (const url of opts.urls) {
		const baseDir = path.join(OUT, slug(url));
		fs.mkdirSync(baseDir, { recursive: true });
		const byVariant = {};
		for (const v of opts.variants) {
			log(`${url} :: ${v}`);
			try {
				byVariant[v] = await runVariant(browser, url, v, baseDir);
				log(`  -> ${byVariant[v].navigationError ? 'FAILED: ' + byVariant[v].navigationError : 'ok'}`);
			} catch (err) {
				byVariant[v] = { url, variant: v, fatal: String(err.stack || err).slice(0, 500) };
				log('  -> fatal', err.message);
			}
		}
		// Cross-variant visual comparisons
		const cmp = {};
		if (byVariant.desktop && byVariant.reduced && !byVariant.desktop.navigationError) {
			cmp.reducedMotionVsDesktop = {};
			for (const n of ['scroll-00', 'scroll-01', 'scroll-03']) {
				cmp.reducedMotionVsDesktop[n] = await imageDiff(browser, path.join(baseDir, 'desktop', `${n}.png`), path.join(baseDir, 'reduced', `${n}.png`));
			}
		}
		if (byVariant.desktop && byVariant.nowebgl && !byVariant.desktop.navigationError) {
			cmp.noWebGLVsDesktop = await imageDiff(browser, path.join(baseDir, 'desktop', 'scroll-00.png'), path.join(baseDir, 'nowebgl', 'scroll-00.png'));
		}
		writeJSON(path.join(baseDir, 'comparisons.json'), cmp);
		summary.runs.push({
			url,
			dir: path.relative(OUT, baseDir),
			comparisons: cmp,
			variants: Object.fromEntries(
				Object.entries(byVariant).map(([k, r]) => [
					k,
					{
						navigationError: r.navigationError || r.fatal || null,
						renderer: r.glCaps && (r.glCaps.webgl2 || r.glCaps.webgl) ? (r.glCaps.webgl2 || r.glCaps.webgl).renderer : null,
						requests: r.network && r.network.requests,
						transfer: r.network && r.network.totals.transfer,
						decoded: r.network && r.network.totals.decoded,
						contexts: r.page && r.page.contexts,
						threeRevisions: r.three && r.three.revisions,
						fps: r.frameStats && r.frameStats.all && r.frameStats.all.approxFps,
						dtP95: r.frameStats && r.frameStats.all && r.frameStats.all.dtMs && r.frameStats.all.dtMs.p95,
						drawsP50: r.frameStats && r.frameStats.all && r.frameStats.all.drawsPerFrame && r.frameStats.all.drawsPerFrame.p50,
					},
				]),
			),
		});
	}
	await browser.close();
	writeJSON(path.join(OUT, 'summary.json'), summary);
	log('done ->', path.join(OUT, 'summary.json'));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
