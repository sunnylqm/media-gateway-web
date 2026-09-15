# mypub.ai visual identity

## Brand voice — 2026-09-15

The approved lockups are **mypub.ai / 敬此刻** and **mypub.ai / Here’s to now**.
Neither tagline has terminal punctuation. Keep the English curly apostrophe.

The idea is a quiet toast to the present: notice something, feel something,
make something. The beer mug carries the pub reference; the prose does not need
to keep explaining it. Favor concrete images, space, and an invitation to begin
rather than sales claims, productivity slogans, or repeated brewing metaphors.

Chinese and English share an intention, not a word-for-word translation.
The homepage mentions a story once in its introduction, alongside light and
memory; it is not an instruction to invent an original story or a claim that
every creation must be narrative. Give different surfaces different jobs:

| Surface | 中文 | English |
| --- | --- | --- |
| Logo | 敬此刻 | Here’s to now |
| Home heading | 把心动，留在画面里。 | Make something of what moves you. |
| Home introduction | 一束光，一段回忆，一个念念不忘的故事。从打动你的地方开始。 | A glimpse of light. A memory. A story that stays with you. Start there. |
| Creation entry | 此刻，想表达什么？ | What’s on your mind? |
| Sign-in introduction | 你看见的，自有不同。 | Only you see it this way. |
| Sign-in encouragement | 不必想好全部，先开始。 | You don’t need the whole picture to begin. |
| Closing | 下一帧，由你。 | The next frame is yours. |
| Closing support | 不必等一个特别的日子。 | No special occasion needed. |

Retain literal functional labels: **开始创作 / Start creating**, **创作短片 /
Create a short film**, **创作图像 / Create an image**, and **浏览作品 / Explore
the gallery**. The homepage eyebrow names the product: **AI 影像创作 / AI image
& video studio**. Do not make payment, authentication, error, navigation, or
prototype-boundary messages poetic at the expense of clarity.

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
dictionaries. The creation entry has its own `entry.eyebrow` and `entry.title`
keys instead of repeating the homepage headline. Language preferences retain
their existing storage key. Browser title and description metadata update when
the language changes. Initial HTML and Open Graph metadata use matching English
copy before JavaScript runs.

## Route and deployment boundaries

- `/` is a public introduction, with no gateway requests of its own.
- `/app` retains the authenticated overview and adds a small creation entry.
- Existing image, video, gallery, billing, login, and administrator routes remain.
- The primary creation link uses `/app/video` while guided Studio is disabled and
  `/app/create` only when the existing build-time flag enables it. This does not
  change the Studio prototype boundary or enable unfinished server features.
- Authentication, billing, generation, preferences, APIs, and domain bindings are
  unchanged. Existing domains are not redirected, removed, or replaced.
- Production still follows the existing Git integration. This copy revision does
  not alter `wrangler.jsonc`, CI, `.openai/hosting.json`, or the deployment target.

## Verification

Six Bun unit tests cover exact bilingual lockups, distinct surface headings,
restrained story mentions, locale-key parity, initial HTML metadata, and
flag-safe entry routing. The existing PR workflow runs `bun run ci`, builds with
Studio disabled and enabled, and runs both Wrangler deployment dry-run paths
against each build. Check results for the current commit; an older success is
not validation of this revision.

The initial visual implementation had 12 static home layout checks (Chinese and
English at 320, 375, 390, 768, 1024, and 1440px), with no horizontal overflow or
missing logo in those fixtures. Four primary foreground/background pairs were
calculated above 4.5:1 (minimum 5.11:1). These are historical targeted checks,
**not** new screenshots of the revised copy or whole-site accessibility testing.
The initial fixtures used router/icon stubs, not the complete application.

The copy-revision container has Node/TypeScript but no Bun or network access to
install project dependencies. Local syntax and copy assertions are limited
checks; full project lint/tests/builds must be verified in repository CI. The
Cloudflare Workers Builds check separately confirms preview upload, not a
promotion to production.

Before merging, review the current CI and preview. Check both languages on
mobile and desktop, then smoke-test sign-in/verification, image and video forms,
billing, mobile navigation, and Studio's existing prototype notice. Confirm
existing hostnames after deployment.
