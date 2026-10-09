//! "Data streams" particle field behind the gvitolo.me hero.
//!
//! Particles follow a drifting Perlin flow field, swirl around the pointer, and are rasterized into an RGBA
//! buffer with fading trails. Everything (simulation and pixels) happens here; JavaScript only copies the
//! finished buffer to a canvas with `putImageData`. No wasm-bindgen: plain C-ABI exports.

use std::f32::consts::TAU;
use std::ptr::addr_of_mut;

const MAX_DIM: u32 = 1600;
/// Per-frame trail decay: 236/256 ≈ 0.92, so a trail fades out over roughly half a second.
const FADE: u32 = 236;
const POINTER_RADIUS: f32 = 110.0;
const TEAL: [f32; 3] = [45.0, 212.0, 191.0];
const VIOLET: [f32; 3] = [129.0, 140.0, 248.0];

struct Particle {
    x: f32,
    y: f32,
    px: f32,
    py: f32,
    speed: f32,
    hue: f32,
    life: f32,
}

struct Field {
    w: u32,
    h: u32,
    pixels: Vec<u8>,
    particles: Vec<Particle>,
    t: f32,
    rng: Rng,
    perm: [u8; 512],
}

/// xorshift32: tiny and deterministic for a given seed.
struct Rng(u32);

impl Rng {
    fn next(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x >> 8) as f32 / (1u32 << 24) as f32
    }
}

static mut STATE: Option<Field> = None;

fn state() -> Option<&'static mut Field> {
    // Safety: WebAssembly here is single-threaded and the exports are never re-entered.
    unsafe { (*addr_of_mut!(STATE)).as_mut() }
}

fn fade(t: f32) -> f32 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn grad(hash: u8, x: f32, y: f32) -> f32 {
    match hash & 7 {
        0 => x + y,
        1 => -x + y,
        2 => x - y,
        3 => -x - y,
        4 => x,
        5 => -x,
        6 => y,
        _ => -y,
    }
}

/// Classic 2D Perlin noise, roughly in [-0.7, 0.7].
fn noise(perm: &[u8; 512], x: f32, y: f32) -> f32 {
    let (x0, y0) = (x.floor(), y.floor());
    let (xf, yf) = (x - x0, y - y0);
    let xi = (x0 as i32 & 255) as usize;
    let yi = (y0 as i32 & 255) as usize;
    let a = perm[xi] as usize + yi;
    let b = perm[xi + 1] as usize + yi;
    let (u, v) = (fade(xf), fade(yf));
    let top = lerp(grad(perm[a], xf, yf), grad(perm[b], xf - 1.0, yf), u);
    let bottom = lerp(grad(perm[a + 1], xf, yf - 1.0), grad(perm[b + 1], xf - 1.0, yf - 1.0), u);
    lerp(top, bottom, v)
}

fn spawn(rng: &mut Rng, w: f32, h: f32, life: f32) -> Particle {
    let (x, y) = (rng.next() * w, rng.next() * h);
    Particle { x, y, px: x, py: y, speed: 0.5 + rng.next() * 1.1, hue: rng.next(), life }
}

/// Saturating additive plot, so overlapping streams glow brighter.
fn plot(pixels: &mut [u8], w: u32, h: u32, x: f32, y: f32, c: [f32; 3]) {
    if x < 0.0 || y < 0.0 || x >= w as f32 || y >= h as f32 {
        return;
    }
    let i = ((y as u32 * w + x as u32) * 4) as usize;
    for k in 0..3 {
        pixels[i + k] = pixels[i + k].saturating_add(c[k] as u8);
    }
}

/// (Re)creates the field for a `width` x `height` buffer and returns a pointer to its RGBA pixels.
#[no_mangle]
pub extern "C" fn init(width: u32, height: u32, seed: u32) -> *mut u8 {
    let (w, h) = (width.clamp(1, MAX_DIM), height.clamp(1, MAX_DIM));
    let mut rng = Rng(seed | 1);

    let mut perm = [0u8; 512];
    let mut base: [u8; 256] = core::array::from_fn(|i| i as u8);
    for i in (1..256).rev() {
        let j = (rng.next() * (i + 1) as f32) as usize;
        base.swap(i, j.min(i));
    }
    for i in 0..512 {
        perm[i] = base[i & 255];
    }

    let n = (w * h / 150).clamp(500, 4000) as usize;
    let particles = (0..n).map(|_| { let life = rng.next(); spawn(&mut rng, w as f32, h as f32, life) }).collect();

    let mut pixels = vec![0u8; (w * h * 4) as usize];
    pixels.chunks_exact_mut(4).for_each(|p| p[3] = 255);

    let field = Field { w, h, pixels, particles, t: 0.0, rng, perm };
    unsafe { *addr_of_mut!(STATE) = Some(field) };
    state().map_or(core::ptr::null_mut(), |f| f.pixels.as_mut_ptr())
}

/// Advances the simulation by `dt_ms` and redraws the buffer. Pointer coordinates are in buffer pixels.
#[no_mangle]
pub extern "C" fn step(dt_ms: f32, pointer_x: f32, pointer_y: f32, pointer_active: u32) {
    let Some(Field { w, h, pixels, particles, t, rng, perm }) = state() else { return };
    let (w, h) = (*w, *h);
    let f = dt_ms.clamp(0.0, 50.0) / 16.67;

    for p in pixels.chunks_exact_mut(4) {
        for c in &mut p[..3] {
            *c = ((*c as u32 * FADE) >> 8) as u8;
        }
    }

    let (wf, hf) = (w as f32, h as f32);
    for p in particles.iter_mut() {
        p.px = p.x;
        p.py = p.y;

        let angle = noise(perm, p.x * 0.0045 + *t * 0.00004, p.y * 0.0045 + *t * 0.00008) * TAU * 1.6;
        let (mut vx, mut vy) = (angle.cos() * p.speed, angle.sin() * p.speed);

        if pointer_active != 0 {
            let (dx, dy) = (p.x - pointer_x, p.y - pointer_y);
            let d = (dx * dx + dy * dy).sqrt();
            if d > 0.5 && d < POINTER_RADIUS {
                let k = 1.0 - d / POINTER_RADIUS;
                let (nx, ny) = (dx / d, dy / d);
                // Swirl around the pointer (perpendicular) plus a gentle push away from it.
                vx += (-ny * 2.2 + nx * 0.8) * k;
                vy += (nx * 2.2 + ny * 0.8) * k;
            }
        }

        p.x += vx * f;
        p.y += vy * f;
        p.life -= 0.0025 * f;

        if p.life <= 0.0 || p.x < 0.0 || p.y < 0.0 || p.x >= wf || p.y >= hf {
            *p = spawn(rng, wf, hf, 1.0);
            continue;
        }

        let intensity = 0.55 * smoothstep(0.0, 0.15, p.life) * smoothstep(0.0, 0.15, 1.0 - p.life);
        let base = if p.hue < 0.62 { TEAL } else { VIOLET };
        let c = [base[0] * intensity, base[1] * intensity, base[2] * intensity];

        let (dx, dy) = (p.x - p.px, p.y - p.py);
        let steps = dx.abs().max(dy.abs()).ceil().clamp(1.0, 4.0);
        for s in 1..=steps as u32 {
            let k = s as f32 / steps;
            plot(pixels, w, h, p.px + dx * k, p.py + dy * k, c);
        }
    }

    *t += dt_ms;
}

#[no_mangle]
pub extern "C" fn buffer_ptr() -> *const u8 {
    state().map_or(core::ptr::null(), |f| f.pixels.as_ptr())
}

#[no_mangle]
pub extern "C" fn buffer_len() -> u32 {
    state().map_or(0, |f| f.pixels.len() as u32)
}

#[no_mangle]
pub extern "C" fn particle_count() -> u32 {
    state().map_or(0, |f| f.particles.len() as u32)
}
