# mypub.ai visual identity

## Approved copy

- Brand lockup: **mypub.ai / 好故事，值得更多人品尝。**
- Creation entry: **把你喜欢的故事，酿成短片。**
- English: “Good stories deserve to be savored.” / “Brew a story you love into a short film.”

The beer mug and play button are a metaphor for brewing and sharing stories.
The public site does not advertise alcohol, invent user counts, imply automatic
social publishing, or claim an operational API without checking it. The coaster
is decorative brand art, not a screenshot of functionality.

## Assets and tokens

`public/brand/mypub-mark.svg` is the editable vector master, adapted from the
approved beer/play direction. `Brand` renders the wordmark and slogan as real,
localizable text rather than a raster image. Small/compact contexts retain an
accessible name. Favicons are supplied as SVG and a 16/32px ICO; the Apple touch
icon is an opaque 180px PNG. Asset queries invalidate the previous brand icons.

`src/styles/brand.css` follows the existing layout stylesheet. The palette is
malt gold (#EDAD35), cream (#FCF8EF), and ink (#172126). Accent text uses dark
amber (#88500F), not yellow on white. Primary button text uses ink on gold.
Semantic error/success states are not globally recolored. No remote font,
additional runtime dependency, or external artwork request is introduced.

Brand translations are typed in `src/i18n/brand.ts` and composed with the existing
dictionaries. Language preferences retain their existing storage key. Browser
title and description metadata update when the language changes.

## Route and deployment boundaries

- `/` is now a public introduction, with no gateway requests of its own.
- `/app` retains the authenticated overview and adds a small creation entry.
- Existing image, video, gallery, billing, login, and administrator routes remain.
- The primary creation link uses `/app/video` while guided Studio is disabled and
  `/app/create` only when the existing build-time flag enables it. This does not
  change the Studio prototype boundary or enable unfinished server features.
- Authentication, billing, generation, preferences, APIs, and domain bindings are
  unchanged. Existing domains are not redirected, removed, or replaced.
- Production still follows the existing Git integration. This PR does not deploy
  to another provider or modify `.openai/hosting.json`.

## Verification

Three Bun unit tests cover approved copy, locale-key parity, and flag-safe entry
routing. The existing PR workflow runs `bun run ci` and builds with Studio both
disabled and enabled.

Local checks during preparation: TypeScript/TSX syntax for changed source files;
12 static home layout checks (Chinese/English at 320, 375, 390, 768, 1024, and
1440px); no horizontal overflow or missing logo in those fixtures. Four primary
foreground/background pairs were calculated above 4.5:1 (minimum 5.11:1).
These are targeted checks, **not** a claim of whole-site accessibility compliance.

Local fixtures render the new Home markup with router and icon stubs; they are
not full application E2E tests. This container has no Bun and cannot install the
project dependencies, so full typecheck/lint/tests/build results must come from
the repository CI, not from the static previews.

Before merging, review the CI checks and smoke-test sign-in/verification, image
and video forms, billing, mobile navigation, and Studio's existing prototype
notice. Confirm both language settings and existing hostnames after deployment.
