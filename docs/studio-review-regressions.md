# Studio PR #3 review regressions

These changes address the focus-revalidation and lazy-route review findings.
They do not enable Studio, submit media jobs, change deployment configuration,
or pin Bun. `bun-version: latest` is deliberately retained.

## Identity revalidation

`StudioSessionController` owns the identity lifecycle, separately from the
replace-on-load `useStudioResource` used for discovery. Focus verification keeps
the old identity in memory, so the keyed `StudioSession` is not unmounted for
an unchanged account. The wrapper is hidden and inert until identity succeeds;
on transient failure local selections remain mounted but inaccessible until a
successful retry. A 401/403 or malformed identity clears the old subtree.

All Studio requests use transport bound to the account that mounted the page.
Starting revalidation synchronously closes this transport, aborts in-flight
requests and invalidates their response epoch. Late results cannot acknowledge
retry keys or start the next write. An abort does not promise that a previously
submitted mutation was rolled back: retain existing idempotency keys and reload
or retry when a result could not be confirmed. Server authentication and tenant
checks remain the authority; the client gate is not an authorization mechanism.

## Lazy route failure

An eagerly imported `StudioRouteBoundary` surrounds the existing Suspense only
on `/app/create/*`. Its localized fallback uses global styles, not Studio's
chunk or CSS. Users can reload the document or navigate back to `/app`.
There is no automatic reload loop and no raw error shown in the page. React
caches a rejected lazy import, so recovery uses document reload rather than
merely resetting the boundary around the same rejected promise.

## Validation

`session.test.ts` covers same-account retention, synchronous request blocking,
account changes, transient and authentication failures, malformed identities,
stale responses, cancellation, StrictMode cleanup and existing request options.
Run `bun run ci` and builds with `VITE_STUDIO_ENABLED=false` and `true`.
The existing read-only PR workflow retains its enabled build for three days as
`studio-ui-build`, permitting browser testing without publishing another site.

Browser regression checklist (use mocked API responses, not paid providers):

- Select a seed and transformation, blur/focus the window and delay `/v1/auth/me`.
  Controls are unavailable during verification; the same selection returns.
- Type a historical revision or select a fork transformation. Repeat focus and
  verify those local values are not reset.
- Fail revalidation with a network error; retry with the same identity and
  verify local values survive. Return 401/403 or a different identity and check
  old account content is removed, not reused in the new session.
- Interrupt a pending Studio request while checking identity. No follow-up write
  may start through the old client; an uncertain saved choice is recoverable.
- Block the `GuidedStudio-*.js` chunk. Verify the localized fallback appears,
  Back to workspace still navigates, and Reload retries the document.
- Verify normal navigation, initial Suspense loading and both feature-flag
  builds remain functional. Cloudflare deployment status is checked separately.
