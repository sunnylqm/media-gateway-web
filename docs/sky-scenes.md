# Four skies, one visit

This extends `nebula-flight.md`. The approved copy, one-screen foreground,
video/poster configuration, business routes and deployment remain unchanged.

| Review URL | Scene | Structure and camera |
| --- | --- | --- |
| `/?sky=cliffs` | 琥珀云岸 / Amber Cliffs | Existing gold/cyan cloud walls; forward/right dolly; 64 s loop |
| `/?sky=halo` | 蓝色星环 / Blue Halo | Inclined, broken luminous shell; cyan/pink rims; forward/left, 58 s |
| `/?sky=pillars` | 绯紫尘柱 / Violet Pillars | Three tapered dust columns at different depths; rising/right, 70 s |
| `/?sky=veil` | 银蓝星河 / Silver Veil | Broad curling filaments, separated near/far sheets; forward/left, 60 s |

These are original artistic scenes, not scientific reconstructions. Visual
references include NASA/Webb's [Southern Ring](https://science.nasa.gov/asset/webb/southern-ring-nebula-nircam-image/),
[Pillars of Creation](https://science.nasa.gov/asset/webb/pillars-of-creation-nircam-and-miri-composite-image/)
and the Cosmic Cliffs references in `nebula-flight.md`. No NASA photography,
logo, external texture, or claim of endorsement is included.

## Selection contract

On the first sky load of a document, choose one of four scenes uniformly. When
sessionStorage is available, exclude the previous random scene in that tab and
choose uniformly among the other three. A full reload chooses again. Module
state holds the choice across language changes, pauses, reduced-motion changes,
SPA navigation away/back, and WebGL context loss/recovery. There is no timed
slideshow or in-page random switch.

Only one allowlisted `sky` query value can explicitly pick a review scene.
Unknown values fall back to normal selection. Review URLs do not change the
previous-random-scene history. Blocked storage cannot stop rendering; in that
case random selection still works but a reload may repeat. Storage contains
only a scene ID, not a visitor identifier. The tab history follows the browser's
sessionStorage behavior, including copied tab state when a tab has an opener.

## Rendering

One selected density function is compiled into the existing WebGL2 volume
shader. Preprocessing removes the other three branches. There is still one
canvas, one 1 MiB noise texture, one star buffer and the same three rendering
passes, not four simultaneously running renderers. Density stays fixed in world
space; camera translation creates motion and parallax. Each route is closed and
smooth at the loop boundary. This is not a performance-equivalence claim:
geometry complexity varies, especially for pillars.

Existing pixel budgets, adaptive resolution, GPU fence, pausing, reduced motion,
resource disposal and CSS fallback remain. Reduced motion freezes the chosen
scene; unavailable WebGL uses the common CSS fallback, not four GPU effects.
Configured video still takes precedence, and no placeholder video is requested.

## Regression coverage

`presets.test.ts` covers all four initial selection buckets, no immediate repeat,
invalid samples/history, explicit/unknown review URLs, blocked storage, and
visible/continuous camera paths for each scene.

`verify-sky-presets.mjs` exercises the actual Vite build: all four shaders,
non-black GPU pixels, broad image change across four animation seconds, pairwise
scene differences, desktop/mobile Chinese/English layouts, and stable selection
through pause, reduced motion, language and context recovery. It also checks
reload non-repetition, invalid query fallback and disabled tab storage.
Screenshots and coarse-pixel reports are uploaded with the existing browser
artifacts. Deterministic animation time is a rendering test, not a real-device
FPS or energy measurement. Existing homepage and flight checks remain enabled.

Safari, actual device GPU performance, and future uploaded video need separate
testing. This change does not merge or promote the PR, alter DNS, or remove old
domains.
