# Photographic WebGL sky

This revision supersedes the CSS-only background described in immersive-home.md.
The public homepage keeps the single-screen layout, the approved bilingual
brand lockup, creation/gallery/image routes and future video slot. The footer
encouragement and its English counterpart are removed; no replacement is added.

## Visual direction

A photographic, procedural Milky Way: a diagonal band of unresolved starlight,
a dark, branching dust lane, restrained emission pockets and thousands of
magnitude-weighted star cores. Cooler outer clouds meet a warmer central region.
The view pans slowly as a single celestial scene; subtle scintillation provides
small-scale motion. There is no tunnel, mouse chasing, strobe or rapid zoom.
This is art-directed procedural imagery, not a measured sky catalogue.

## Rendering

Native WebGL2 / GLSL ES 3.00, loaded on demand. Three draws per rendered frame:

1. Galaxy diffuse light, fractal detail and dust extinction into an RGBA8 target.
2. Upscale the diffuse target to the canvas.
3. Draw 36,000 deterministic star directions as additive point sprites, with
   neutral/cool/warm colors, a magnitude-biased size distribution, soft halos
   and restrained diffraction on bright stars.

The same camera matrix transforms the galaxy and stars so they do not slide
independently. Clouds stay spatially stable rather than boiling like smoke.
No outside textures, runtime dependencies, remote fonts or API calls are added.
WebGPU is not required. This scene does not need compute shaders, and using a
single WebGL2 renderer avoids maintaining two rendering backends.

Canvas area is capped at 3 million pixels and DPR at 1.75. Diffuse rendering is
capped at 620,000 pixels. A 30fps frame budget and sustained-slow-frame resolution
reduction bound background work. These are budgets, not a guaranteed frame rate.
Actual device performance must be checked on representative phones and laptops.

## Lifecycle and accessibility

- Pause freezes GPU time and cancels requestAnimationFrame; resume does not jump.
- Page visibility and reduced-motion preferences use the existing shared hook.
- Reduced motion draws a still frame; resizing that frame remains supported.
- CSS stars remain the initial/no-WebGL fallback and pause behind a ready canvas.
- Context loss reveals fallback. Restoration recreates programs, buffers and
  framebuffer resources; navigation/unmount deletes all resources and listeners.
- Shader/allocation failure cannot block the homepage or its primary links.
- Future video retains its existing precedence and controls; a playing video
  stops sky animation. Static posters and failed-video fallback remain intact.
- The scrim protects text separately from the background; no body scroll lock.

## Verification

Pure tests cover deterministic star directions, framebuffer bounds, camera
rotation and removed copy. The existing full-app Chromium smoke script now
requires successful shader compilation, nonblack GPU pixels and changing
rendered frames. It also checks pause/resume, reduced motion, visibility,
context loss/restoration, no-WebGL fallback, the 16 bilingual viewport cases,
keyboard access and extreme-short-viewport reflow. CI uses SwiftShader for GPU
API correctness; this is not a hardware performance benchmark or Safari test.

The deployment configuration, DNS, domains, application authentication,
billing and generation flows are unchanged.
