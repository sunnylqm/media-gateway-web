# Migration progress

## 2026-08-19

- [x] Audited the embedded Rsbuild/React console and all tenant/admin routes.
- [x] Identified the API surface, cookie sessions, and CSRF flow used by the original UI.
- [x] Created a standalone Vite + React + TypeScript project.
- [x] Added shadcn/ui project metadata and accessible UI primitives.
- [x] Migrated tenant login, verification, generations, artifacts, model forms, and API-key management.
- [x] Migrated administrator login, overview, users, tenants, models, bindings, billing, and audit views.
- [x] Added environment-based gateway URL configuration and a local Vite proxy.
- [x] Updated the client for credentialed CORS and cross-origin CSRF response headers.
- [x] Installed dependencies and passed TypeScript plus the Vite production build.
- [ ] Publish the standalone Git repository to `sunnylqm` on GitHub. Blocked because `gh` is authenticated as `wuqingCap`, which cannot create repositories for `sunnylqm`; the local SSH identity is already `sunnylqm` and the target remote is preconfigured.

## 2026-08-22

- [x] Rebuilt the tenant generation composer around the published request form, laid out like the reference console: two mode tabs, a prompt with its own character counter, first and last frame cards, a multi-reference pool for images, video, and audio, parameter tiles, and one full-width create button carrying the price.
- [x] Moved reference files onto `POST /v1/assets`, so a job carries `asset://` references instead of inline data URLs and is no longer bounded by the 2 MB JSON body limit.
- [x] Rendered declared parameters as the control their shape implies: chips for short enumerations and booleans, a slider for bounded integers, inputs otherwise.
- [x] Showed the gateway's own quote in the composer footer, recomputed from the model's billing rates as parameters change.
- [x] Kept the polled model catalog identical between reloads so an open composer is never reset under the person using it.

### Provisional values

Per-media reference ceilings — nine images, three videos, three audio clips, fifteen seconds of timed media — are hard-coded in `referenceLimits` because `request_form` does not publish them. Video and audio length is measured in the browser so the counters can show `1/3 (2s/15s)`. Publishing `max_items` per media entry from the gateway would let these come from the model's own profile.

The reference console's output count (one, two, or four clips) and its generation groups have no gateway API behind them, so neither control is shown.

## Compatibility notes

The route structure remains `/app/*` for tenants and `/admin/*` for administrators. API paths and response types remain unchanged, so the standalone console can be introduced without migrating backend data.
