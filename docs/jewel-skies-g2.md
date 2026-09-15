# G2: layered jewel-color skies

## Scope

Implements the first two steps of the approved plan: richer light/color and
bounded structural composition. WebGPU/compute precomputation is deliberately
not added before real-device measurements justify another backend. The home
copy, layout, optional video interface, backend and deployment settings remain
unchanged. The existing G1 source files remain byte-for-byte unchanged.

## Versioned routing

- Ordinary `/` loads G2. A recipe is selected once per document, before the
  renderer loads, and retained through locale changes, pause, SPA remount and
  context restoration. A new complete page load gets new entropy.
- `/?seed=g2-0000002a` selects a reproducible G2 world; adding `&sky=halo`
  fixes the family. Only four allowlisted families and eight hexadecimal digits
  are accepted. URL text is never inserted into GLSL.
- Existing `g1-xxxxxxxx` seeds and canonical `/?sky=halo` style URLs retain G1.
  `/?engine=g1` selects the original random landing behavior.
- Local tab history avoids consecutive seed/family repetition where storage is
  available. Storage failure cannot block rendering. Only appearance is saved;
  there is no analytics or generation-service request. Shared URL query strings
  naturally reach the hosting service with the page request.
- The same versioned seed recreates parameters/structure, not a guarantee of
  identical pixels across drivers. G2 has its own recipe and shader code.

## Grammar, color and light

One primary structure is accompanied by one spatially limited, subordinate
filament and a near dust veil. Family-specific density fields use broken shells,
cliff ridges, staggered pillars or folded ribbons, not four simultaneous heroes.
The recipe bounds focal region, roll, thickness, secondary energy and smooth
camera travel. Density counterbalances thickness. Portrait rendering shifts the
subject's framing instead of stretching or merely cropping the landscape.

Five coordinated hue families assign distinct body/rim/filament/local-light
roles. Colors are generated in OKLCH and chroma-reduced at fixed hue/lightness
until they fit linear sRGB. This finite search is not the complete CSS MINDE
algorithm. All lighting is evaluated in linear RGB; the material roles remain
spatially coherent. A bounded local light and a directional shadow sample give
thin material a different response from dense dust. This is procedural artwork,
not astrophysical radiative-transfer reconstruction.

## HDR pipeline and fallbacks

On a successfully allocated `RGBA16F` target:

1. Integrate the volume into linear HDR plus transmittance.
2. Upsample and add depth-attenuated stars in the same linear HDR scene target.
3. Soft-threshold high radiance, then blur two scales separately.
4. Combine modest bloom, apply a shared max-channel shoulder and sRGB transfer.
5. Leave the existing foreground contrast scrim and all text outside WebGL.

This is internal HDR processing; it does not require an HDR monitor. Both
`EXT_color_buffer_float` and actual framebuffer completeness/allocation are
checked. If unavailable, use scaled-linear RGBA8 targets, turn off bloom and
accept reduced precision. No WebGL or initialization failure falls back to the
existing CSS sky. Neither path blocks the primary action.

At most 2 million main pixels, DPR 1.6, 180,000 volume pixels, 40 integration
samples, 18,000 static-upload stars and a 1 MiB 3D noise texture. Lower quality
reduces the volume budget as well as the main target. HDR has ten draws per frame;
RGBA8 has four. One nonblocking GPU fence prevents piling up queued frames.
About 30fps is a scheduling target, not a hardware guarantee. Pause/hidden state
stop scheduling, a resize may redraw one frozen frame, and context recovery
rebuilds all textures/programs/targets. Disposal deletes owned GPU resources.

## Validation

`g2.test.ts` checks 4,096 bounded recipes, color conversion, selection, seed replay,
star variation, camera continuity, pixel budgets and G1 source hashes.
`verify-g2.mjs` reads the actual final default framebuffer, not an intermediate
HDR target: twelve desktop seeds, four mobile layouts, four-second motion,
clipping bounds, replay, pause, context loss and capability/storage fallbacks.
The deterministic test clock and pixel reads do not enter production.

The original G1 browser assertions remain unchanged. `run-legacy-sky.mjs` only
retargets their bare homepage navigation to the supported `?engine=g1` URL;
explicit G1 seeds/canonical URLs already route correctly. CI runs four G1 suites
and the new G2 suite in parallel after the shared application build and both
Studio-flag Wrangler preflights. Assertions are not disabled to accept G2.

Image metrics reject obvious failure modes, not judge universal beauty. Native
shader experiments are not full-browser validation. Safari, phone GPU frame rate,
power consumption and future supplied video require real-device testing.

## Primary implementation references

- W3C CSS Color 4: https://www.w3.org/TR/css-color-4/
- Oklab definition: https://bottosson.github.io/posts/oklab/
- Khronos float targets: https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/
- Volume integration background: https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-39-volume-rendering-techniques
