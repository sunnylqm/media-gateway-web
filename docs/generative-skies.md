# Generative skies: variation inside an art-directed grammar

This supersedes the four-finished-scenes description in `sky-scenes.md`.
The four approved compositions remain as **grammars**, not the entire image pool.
A new document receives a seed and generates a concrete, stable world on-device.
No AI service, image download, background worker, or new runtime dependency is used.

## What is generated

The seed controls focal offset, anisotropic scale, small inclination, the sampled
region of the 3D noise field, ridge irregularity, shell/ribbon/pillar thickness,
filament curvature, a coordinated shadow/rim palette, star positions, and camera
period/travel. These are geometry and lighting changes, not a CSS hue filter.
The generated values are compiled once into the selected WebGL2 density branch;
the world remains fixed while the camera moves through it.

## Constraints, not unbounded randomness

- Transform about the approved right-side focal region (11, 2, 23). Horizontal
  offset is at most 1.25 scene units; vertical offset 0.8; inclination 0.075 rad.
  The existing foreground scrim, layout and clear action labels are unchanged.
- Preserve the silhouette grammar: cliffs, open shell, three separated pillars,
  or two layered ribbons. Scale changes remain within 10%, thickness within 14%,
  and irregularity within 10%. Do not interpolate unrelated topologies blindly.
- Shadow and rim colors interpolate together along a curated palette pair for
  each grammar. There are no independent random RGB channels or global hue spins.
- Thickness and extinction are coupled: density times thickness remains between
  0.975 and 1.025. Fullness inversely adjusts exposure; more intricate boundaries
  receive less rim gain. This limits combinations that turn into bright fog.
- Camera reach follows scene scale, with small period variation; the original
  closed differentiable path and gentle orientation remain. Camera never enters
  the bounded cloud sampling volume. Pause freezes the same scene and time.

These are explicit parameter constraints and sample-tested compositions, not an
AI aesthetic judge or a proof that every possible seed is equally beautiful.
There is no runtime image-scoring/readPixels loop or unbounded rejection search.

## Seed, stability and old links

- Bare `/`: choose a grammar, generate a fresh unsigned 32-bit seed. Keep the last
  family/seed in sessionStorage only to avoid immediate repeats when available.
  Storage access can fail without blocking rendering. Seeds describe artwork,
  not a user or device; nothing is sent to a server.
- `/?sky=halo`: the original approved Blue Halo, unchanged neutral parameters.
- `/?sky=halo&seed=g1-0000002a`: generate and reproduce a Halo variation.
- `/?seed=g1-0000002a`: both grammar and variation are derived from the seed.
- Accept only `g1-` plus eight hex digits. Invalid/unknown-version tokens are
  ignored; query text is never embedded into GLSL. `g1-00000000` is valid.
- The recipe is cached once per document. Locale changes, reduced motion, GPU
  recovery and SPA remounts do not reroll. There is no timed slideshow or live
  parameter mutation. A full reload of a seed link reproduces its initial world.
- Canvas `data-scene` and `data-seed` identify the current recipe for inspection.
  The UI remains uncluttered; no seed panel or additional slogan is added.
- `g1` identifies this recipe algorithm. Future breaking generator revisions must
  retain the old implementation for old links or explicitly document migration.
  Deterministic recipes do not imply bit-identical pixels on different GPUs.

## Cost and compatibility

One active canvas, one generated shader branch, the same 1 MiB noise texture,
24,000 points, three drawing passes, pixel budgets, dynamic quality and GPU fence.
Only star buffer data and small recipe constants vary. There is no per-frame CPU
regeneration. GPU initialization fallback, cleanup and video precedence remain.
No backend, authentication, billing, route, domain or Workers configuration changes.

References: [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
and [getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

## Verification

Pure tests exercise 4,096 recipes across all grammars, coupled bounds, deterministic
geometry/color/star generation, valid/invalid seeds, review links, storage failure,
fresh visits and camera closure. Browser tests inspect the actual Vite/WebGL build:
12 generated desktop samples, four English phone samples, within-grammar image
variation, seed replay, four-second broad-area motion, pause, language/motion
preferences and context recovery. Existing canonical scene tests remain in place.
Screenshots and JSON results are stored under `home-browser-results/generated`.
Browser checks use SwiftShader and a test-only clock, not a real-device benchmark.
Safari, real-device energy usage and exhaustive all-seed artistic review are not
claimed. Inspect generated contact sheets as well as automated numerical checks.
