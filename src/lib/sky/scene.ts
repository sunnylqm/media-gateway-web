import { getSkyPreset, type SkyPreset } from './presets';

export const STAR_STRIDE = 8;
export const STAR_COUNT = 24000;
export const FLIGHT_PERIOD = 64;
export const NOISE_SIZE = 64;

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Finite 3D positions, not directions on an infinitely distant sky sphere.
// Most stars are distant; sparse nearby stars reveal translation parallax.
export function createStars(count = STAR_COUNT): Float32Array {
  const stars = new Float32Array(count * STAR_STRIDE);
  const random = seededRandom(20260915);
  for (let i = 0; i < count; i++) {
    const group = random();
    const depth =
      group < 0.012
        ? 6 + random() * 18
        : group < 0.12
          ? 24 + random() * 56
          : 80 + random() * 220;
    const offset = i * STAR_STRIDE;
    stars[offset] = (random() * 2 - 1) * depth * 1.9;
    stars[offset + 1] = (random() * 2 - 1) * depth * 1.35;
    stars[offset + 2] = depth;
    const temperature = random();
    stars[offset + 3] = temperature < 0.35 ? 0.68 + temperature * 0.7 : 1;
    stars[offset + 4] =
      temperature < 0.35
        ? 0.8 + temperature * 0.5
        : 0.92 - (temperature - 0.35) * 0.23;
    stars[offset + 5] =
      temperature < 0.35 ? 1 : 0.82 - (temperature - 0.35) * 0.48;
    const magnitude = random() ** 6;
    stars[offset + 6] = 0.1 + magnitude * 0.96;
    stars[offset + 7] = 2.8 + magnitude * 16;
  }
  return stars;
}

// A tileable 1 MiB volume replaces hundreds of ALU-heavy hashes per pixel.
// RGB noise channels provide independent domain-warp fields; no network asset.
export function createNoiseVolume(): Uint8Array {
  const random = seededRandom(3324);
  const noise = new Uint8Array(NOISE_SIZE ** 3 * 4);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(random() * 256);
  return noise;
}

// All routes are closed and differentiable; different travel directions and
// periods change the viewpoint, never the density field's time coordinate.
export function cameraPosition(
  time: number,
  preset: SkyPreset = getSkyPreset(),
): Float32Array {
  const phase = ((time % preset.period) / preset.period) * Math.PI * 2;
  const [x, y, z] = preset.travel;
  return new Float32Array([
    x * Math.sin(phase),
    y * Math.sin(phase * 2),
    -11 + z * Math.sin(phase) + 1.8 * (Math.cos(phase) - 1),
  ]);
}

export function cameraMatrix(
  time: number,
  preset: SkyPreset = getSkyPreset(),
): Float32Array {
  const phase = ((time % preset.period) / preset.period) * Math.PI * 2;
  const direction = Math.sign(preset.travel[0]);
  const yaw = Math.sin(phase) * 0.055 * direction;
  const pitch = Math.sin(phase * 2) * 0.018;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return new Float32Array([
    cy,
    0,
    -sy,
    sy * sp,
    cp,
    cy * sp,
    sy * cp,
    -sp,
    cy * cp,
  ]);
}

// Area limits include Retina displays; quality reductions never change time.
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
