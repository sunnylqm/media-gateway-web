# Immersive home — 敬此刻 / Here’s to now

The public home is a single-screen doorway, not a sequence of marketing panels.
It keeps the existing logo/lockup, one headline, one introduction and the primary
creation and gallery actions. Image creation, background pause and the legal
credit sit along the bottom edge. The authenticated workspace stays unchanged.
The prior coaster, numbered process, feature cards and repeated closing CTA are
not rendered on the home page. Their existing translation keys remain available
to avoid unrelated churn (some process labels are also used by sign-in).

## The temporary scene

A near-black sky, sparse warm starlight and slow, diffuse blue/amber haze. No
streaking stars, flashing points, cursor chase, WebGL, canvas loop or downloaded
background image. Ninety seeded points are painted into three CSS layers; only
layer transforms and the soft haze animate. The random seed is fixed, so changing
language never rearranges the sky. The film-like serif headline is separated
from the sans-serif navigation and readable utility labels. No font is fetched.

Only `src/styles/immersive-home.css` styles the new home classes. Existing
workspace, authentication and Studio styling remains unchanged. The backdrop is
an independent decorative component beneath a persistent contrast scrim, ready
for a future film without moving the foreground layout.

## Viewport and motion

- A `100vh` / `100svh` / `100dvh` minimum height and three-row grid fit the header,
  main copy and footer into normal desktop, phone and landscape viewports.
- Safe-area padding accommodates screen cutouts. Content is NOT absolutely
  positioned or clipped; browser zoom, increased text size and unusually short
  viewports can scroll naturally. There is no `overflow: hidden` on body/root.
- A visible, localized pause/resume control pauses all decorative movement.
- `prefers-reduced-motion: reduce` disables movement from the first render and
  when the OS preference changes; it also prevents the video element/source
  from being mounted. An optional poster or the static sky is used instead.
- Hidden documents pause both CSS layers and video playback; unmount removes
  media/visibility listeners and pauses playback. The skip link, focus ring,
  semantic headings and real text/links are retained.

## Replace the sky with a film later

Set these **build-time** variables in the existing Cloudflare build settings,
then rebuild the same Worker through the existing Git integration:

```env
VITE_HOME_VIDEO_URL=/media/home.mp4
VITE_HOME_POSTER_URL=/media/home-poster.webp
```

Place those files in `public/media/`, or use HTTPS URLs for externally hosted
assets. The examples are not live files and are not configured by default.
Empty values make no video/poster request. HTTPS sources and root-relative paths
are accepted; insecure or invalid URLs fall back to the sky.

Use quiet, loopable footage with a calm area behind the headline. Encode a
mobile-friendly version without an audio track and provide a poster frame;
review brightness behind the text before release. Video is muted, inline and
looped, uses `object-fit: cover`, and fades in only after playback starts. Failed
loading or rejected autoplay leaves the sky visible. User pause holds the frame.
The contrast scrim and motion control work with either background. No controls
for audible playback or a fake video asset have been added.

## Verification

The existing PR workflow still covers application CI, Studio-on/off builds and
both Wrangler dry-run upload paths. Three additional Bun tests cover deterministic
bounded star layers, optional media URL handling and exact localized headline
composition. Existing brand-copy and route-flag tests remain intact.

`scripts/verify-home.mjs` serves the actual `dist` build in isolated Chromium. It
checks both languages at 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 375×667,
320×568 and 844×390 for overflow, logo loading and correct destinations. It also
checks pause/resume, reduced motion, visibility-event handling, language changes,
keyboard skip navigation, no public-home API calls and reachable controls at
320×280 (where vertical reflow is intentionally allowed). Screenshots are saved
as the `immersive-home-browser` CI artifact. This does not test authenticated
billing/generation flows, Safari playback or the future film's quality/bandwidth.

Local markup fixtures can check layout and syntax without Bun, but do not stand
in for that full-app browser run. Check the current commit's CI and actual
`Workers Builds: media-gateway-web` result before merging. Preview upload is not
production promotion. No DNS, domain, routing, API or deployment-target change
is made by this update.

References: [WCAG Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide),
[MDN viewport lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length),
[MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).
