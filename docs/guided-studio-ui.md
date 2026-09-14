# Guided Studio UI (P1b)

This consumes the draft API from `sunnylqm/media-gateway#6`. The backend PR is
merged and its full CI passed. This frontend change does not add LLM calls,
shot planning, media generation, quotes, rendering or publication.

## Enable

The frontend is opt-in at **build time**:

```env
VITE_STUDIO_ENABLED=true
```

The API gateway independently needs its merged P1a implementation deployed with:

```env
GATEWAY_STUDIO_ENABLED=true
```

Rebuild the frontend after changing its flag. The tenant sidebar then shows
Inspiration Studio / 灵感工坊 at `/app/create`. Existing `/app/video`, image,
admin, billing and provider-native request behavior is unchanged. With the UI
flag off, no entry is added and no Studio API requests are made. The public
client flag is not authorization: the backend still validates user sessions,
CSRF and workspace ownership. A missing discovery endpoint is explained as an
unavailable API rather than silently replaced with fake local projects.

Production remains the existing Cloudflare Pages Git integration. Do not deploy
through OpenAI Sites, GitHub Pages or a manual upload. This PR does not push main
or enable the flags in production.

## Experience

`/app/create` is an immersive creation page, with an explicit route back to the
normal workspace. It validates `/v1/auth/me` before reading any drafts. On window
focus it revalidates the session, temporarily dropping the previous account's
view; a new identity gets fresh component state and its own retry-key scope.

Users can prefer a genre, browse the initial 70/30 mixture, switch between
familiar and original views, hide cards, reshuffle and pick a transformation.
Genre affects ranking, not strict filtering. Route views filter the received
cards by their actual origin; archetypes are never relabelled as work scenes.
Current server copy is Chinese, marked `lang="zh-CN"`; UI controls are English
and Chinese through a feature-local, key-checked dictionary driven by the
existing LocaleProvider. No translation or LLM personalization is claimed.

A create saves only after an explicit click. The project page retrieves the
stored pending question; accepting an option saves its ID, then asks for the
next turn using the returned version. Successfully acknowledged choices remain
visible if that second request fails. No requests target media or billing APIs.
The prompt-language explanation shows the stored choice value and a short
editorial teaching note, not a fabricated prompt or generated storyboard.

`/app/create/projects/:id` restores a draft. `?revision=N` opens read-only history.
History does not roll back the current project and cannot submit an answer.
Forking pins the exact viewed `source_version`, retains source lineage, and
starts empty choices as defined by P1a; this limitation is shown before the user
confirms. GET responses have no completion flag, so after a reload the Continue
button asks the server; the client never guesses completion from a fixed quiz
length. `guide_complete` is labelled a creative brief, not a finished film.

A plain-text creative brief can be copied on request. There is deliberately no
one-click submission of that brief to a video model, and no publication toggle.

## State, retries and privacy

ProjectController owns a monotonic request epoch, an AbortController and a
synchronous mutation guard. StrictMode cleanup, abandoned requests and old
responses cannot overwrite a later view. Duplicate clicks cannot submit two
choices. A 409 blocks further choices until the user reloads; the UI never
replays an old full snapshot over a newer revision. Historical views use a
separate controller instance.

The shared `src/api.ts` remains responsible for credentialed requests, CSRF and
its one safe CSRF-token-refresh retry. The Studio client has no token storage or
provider credential access. It sends only the P1a endpoint fields.

Create/fork retry tickets survive refresh in sessionStorage, scoped to API origin
and authenticated user ID. Only command IDs, transformation/source-version
metadata and the retry key are stored, not story prose, prompts, account email
or session credentials. An identical uncertain retry reuses its key. A different
intent gets a new key and a confirmed success clears only its own ticket.
Storage denial falls back to per-page memory. The server remains authoritative;
leaving the page does not cancel an already accepted request or publish a draft.

Recent drafts are paginated independently of discovery, use the returned opaque
cursor and deduplicate overlapping pages. The UI has no delete/archive control
because P1a does not offer that API.

## Verification

```sh
bun install --frozen-lockfile
bun run ci
VITE_STUDIO_ENABLED=false bun run build
VITE_STUDIO_ENABLED=true bun run build
```

The new read-only PR workflow runs those checks without deployment credentials.
On a failure it can attach a formatting diff for diagnosis; it does not commit,
push or approve anything.

The pure protocol/controller tests use node:test without mocks or DOM globals,
and can run with Bun or with TypeScript output under Node. They cover endpoint
shapes, opaque cursors, source revision pins, replay-key isolation/recovery,
blocked storage, completion semantics, late results, simultaneous clicks,
read-only history, version conflicts, pagination and bilingual labels.

Manual browser acceptance with the feature enabled:

1. Pick a seed and operation, answer all turns, reload and resume. Verify no
   generation request or public media record is created.
2. Open the draft in two tabs; cause a stale choice, and verify the conflict
   requires a refresh rather than overwriting the other decision.
3. Drop the response to create/choice, then retry. Confirm the same project or
   selection is returned. A failed next-turn must retain the saved choice.
4. Read an earlier revision and fork it; check parent ID/version and empty
   choices. Invalid or cross-account IDs must not display another draft.
5. Check 375px and desktop widths, keyboard-only operation, visible focus,
   reduced motion, Chinese source content in the English UI, copy failures,
   missing API, expired session and project quota errors.

A real-browser end-to-end pass and production-provider checks are separate from
these pure tests. No paid provider is needed for this phase.

Next: durable planning tasks and a bounded LLM adapter, then accepted story/shot
plans. Media execution must remain a separately quoted and authorized phase.
