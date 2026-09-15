# Nebula flight: a moving vista, not a nearly stationary sky

This supersedes the infinite-distance sphere / 36,000 directions described in
`realistic-sky.md`. The home copy, single-screen layout, reduced-motion behavior,
optional video, business routes and deployment configuration are unchanged.

## NASA visual references

- [Webb's Cosmic Cliffs (NIRCam)](https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-image/): blue cavities, copper/gold illuminated dust rims, irregular ridges, fine stars. Image credit: NASA, ESA, CSA, STScI.
- [Exploring the Cosmic Cliffs in 3D](https://science.nasa.gov/asset/webb/exploring-the-cosmic-cliffs-in-3d/): flying around overlapping structures rather than merely enlarging a photograph. Visualization: AstroViz Project, NASA's Universe of Learning.
- [Pillars of Creation visualization](https://svs.gsfc.nasa.gov/14616/): separation and occlusion of structures at different depths.

These are research / art-direction references, not assets bundled into the app.
The shader, noise and star positions are original procedural artwork. There is
no NASA logo, implied endorsement, imported NASA photography, measured star
catalogue or scientifically reconstructed 3D volume. Apparent movement comes
from a cinematic camera; it does not depict rapid physical evolution of a nebula.

## What changed

The previous camera only rotated an infinitely distant star sphere by a small
angle. The replacement translates through a finite 3D scene. Stars at 6–24,
24–80 and 80–300 scene units respond differently to the same dolly motion.
Nearby dust veils overlap a more distant illuminated wall. The 64-second camera
path closes with continuous velocity: no cut, reset, particle spawning or
texture scrolling. Nebula noise remains fixed in world space, not animated into
boiling clouds. The first four seconds already reveal translation and depth.

The nebula pass integrates 36 front-to-back samples through a bounded volume,
with fractal density, a directional shadow sample and warm/cool edge lighting.
A deterministic 64-cubed RGBA8 noise texture (1 MiB) supplies hardware-filtered
noise without network requests. Transmittance is retained in the low-resolution
pass alpha and used to attenuate distant stars. Star extinction is an artistic
depth approximation, not per-star volumetric ray integration.

Sharp point stars render independently, with restrained six-direction diffraction
on the brightest points. No star streaks, forced mouse motion, camera shake or
flashes are added. Text and controls never move with the camera.

## Resource and motion budgets

- At most 3 million main framebuffer pixels, DPR capped at 1.75.
- Volume pass at most 240,000 pixels, with up to 36 integration samples and early
  termination; lower than the previous 620,000-pixel diffuse-sky budget.
- 24,000 stars, uploaded once; no per-frame CPU star loop.
- Approximately 30fps scheduling target, with adaptive resolution reduction.
  These are budgets and targets, not guarantees on phones or integrated GPUs.
- Pause and visibility changes stop the renderer, reduced motion draws a still
  frame, and context recovery recreates the noise texture as well as programs,
  buffers and framebuffer. Disposal releases the new texture too.

## Verification

`scene.test.ts` covers reproducibility, depth distribution, bounded memory,
visible camera travel, parallax ratios, loop continuity, rotation matrices and
the continued removal of the old footer encouragement.

The existing full-app browser checks remain. `verify-nebula-flight.mjs` additionally
runs the real compiled application with a deterministic animation clock, averages
GPU pixels into coarse blocks (so twinkling stars alone cannot pass), and compares
frames four animation seconds apart. It requires broad-area image change and
exports an eight-second screenshot sequence plus a JSON motion report. A
controlled clock validates rendering, not actual browser frame rate. Production
has no test clock or debugging interface.

Real-device frame rate, energy usage, Safari rendering and future supplied video
still require device testing. No deployment target, domain or backend is changed.
