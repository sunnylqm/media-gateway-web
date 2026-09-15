export const STAR_STRIDE = 8;
export const STAR_COUNT = 36000;

// Deterministic, magnitude-biased stars in galactic coordinates. Most are faint;
// the plane is denser, rather than evenly spaced confetti across the viewport.
export function createStars(count = STAR_COUNT): Float32Array {
  const stars = new Float32Array(count * STAR_STRIDE);
  let seed = 20260915;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const norm = Math.hypot(-0.58, 0.81, -0.03);
  const n = [-0.58 / norm, 0.81 / norm, -0.03 / norm];
  const length = Math.hypot(0.81, 0.58);
  const t = [0.81 / length, 0.58 / length, 0];
  const f = [t[1] * n[2], -t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
  for (let i = 0; i < count; i++) {
    const longitude = (random() * 2 - 1) * Math.PI;
    const gaussian =
      Math.sqrt(-2 * Math.log(Math.max(random(), 1e-7))) *
      Math.cos(random() * 2 * Math.PI);
    const latitude =
      random() < 0.66
        ? Math.max(-0.55, Math.min(0.55, gaussian * 0.095))
        : Math.asin(random() * 2 - 1);
    const c = Math.cos(latitude);
    const offset = i * STAR_STRIDE;
    for (let k = 0; k < 3; k++) {
      stars[offset + k] =
        t[k] * Math.sin(longitude) * c +
        n[k] * Math.sin(latitude) +
        f[k] * Math.cos(longitude) * c;
    }
    const temperature = random();
    // Approximate photographic color temperatures, with mostly neutral cores.
    stars[offset + 3] = temperature < 0.35 ? 0.68 + temperature * 0.7 : 1;
    stars[offset + 4] =
      temperature < 0.35
        ? 0.8 + temperature * 0.5
        : 0.92 - (temperature - 0.35) * 0.23;
    stars[offset + 5] =
      temperature < 0.35 ? 1 : 0.82 - (temperature - 0.35) * 0.48;
    const magnitude = Math.pow(random(), 5);
    stars[offset + 6] = 0.16 + magnitude * 0.93;
    stars[offset + 7] = 3.2 + magnitude * 12;
  }
  return stars;
}

// Bound framebuffer area as well as DPR: a large Retina monitor must not
// accidentally allocate tens of millions of pixels for a background.
export function renderSize(
  width: number,
  height: number,
  dpr: number,
  quality = 1,
) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const ratio =
    Math.min(Math.max(1, dpr), 1.75, Math.sqrt(3000000 / (w * h))) * quality;
  return {
    width: Math.max(1, Math.floor(w * ratio)),
    height: Math.max(1, Math.floor(h * ratio)),
    ratio,
  };
}

export function cameraMatrix(time: number): Float32Array {
  const yaw = Math.sin(time * 0.022) * 0.15;
  const pitch = Math.sin(time * 0.017) * 0.035;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Column-major camera-to-world rotation, shared by clouds and star vertices.
  return new Float32Array([
    cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp,
  ]);
}
