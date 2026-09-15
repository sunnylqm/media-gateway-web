# Guided Studio: confirmed video batches (P2c)

## Scope and dependencies

This increment connects the current project view to the backend P2a/P2b contracts, including backend PR #10 (`3d48d95a92056c1fa4cad320e0a33d91b0cb966e`). Frontend baseline: `7c9ba5656a697396485f247b53bb23d87f840cbc`. It does not change the free-form workbench, server code, billing policy, Bun version, dependencies, lockfile or production deployment configuration.

The path is: adopt a text plan → choose a model/settings → request a saved quote → review the maximum customer charge → explicitly confirm → inspect batch receipts and original clips. A completed batch is **not** an assembled movie. No reference media, visual continuity guarantee, editing, composition, automated retakes, batch cancellation, or publication is implemented here.

## Contracts

All requests use the existing account-bound Studio transport, browser session and CSRF implementation. The transport's existing retry of an explicitly rejected CSRF request remains unchanged; no new automatic mutation retry is introduced.

| Request | Purpose | Side effects |
| --- | --- | --- |
| GET `/v1/studio/production/execution` | Read availability and charge/consent semantics | Read only |
| GET `/v1/models?omit=notes` | List candidate model forms | Read only |
| POST `/v1/studio/production/quotes` | Persist an offer for the adopted revision | Quote metadata only; no media or hold |
| GET `/v1/studio/production/quotes/{id}` | Recover the offer and, if used, its run ID | Read only |
| POST `/v1/studio/production/runs` | Confirm the exact offer/version/amount | Admits real model work and reserves wallet funds |
| GET `/v1/studio/production/runs/{id}` | Read actual states/charges | Read only |
| GET `/v1/studio/production/projects/{id}/runs` | Latest twenty batches | Read only, not complete history |
| GET `/v1/generations/{id}/artifacts` | Retrieve one completed shot's files after a click | Read only, never a retake |

Candidates are only locally filtered for a video generate operation and integer duration. This is not a capability guarantee: the server checks its worker template and current contract when quoting. No model is selected automatically. Visual settings reuse `PlaygroundParameter`; free-text prompt/URL/credential fields are not offered in this beginner flow. Duration is compiled by the server. `n` is forced to one when the model declares it. Changing displayed settings invalidates the old quote’s confirmation until another quote is obtained. Defaults and booleans remain typed; invalid values are not silently coerced.

Only `price_kind=maximum_charge`, explicit confirmation semantics, and the supported `text_only` mode enable spending. The P2a estimate fingerprint is never sent as authorization. Prices are shown in the currency carried by the receipt, without exchange-rate conversion (the existing wallet's hundredth-unit convention). Generated and edit durations are displayed separately.

Quote validation verifies project/version/model/currency, safe integer amounts, per-shot totals, distinct identifiers and expiry shape. Run validation verifies receipt identity, charge caps, distinct generation IDs and aggregate state. Missing `final_amount` remains unknown, never zero. Runtime parsing is a compatibility guard, not a substitute for server authorization.

## Consent, concurrency and recovery

`ProductionController` belongs to one mounted account/project. Its mutation lock is synchronous. An epoch and AbortController fence old responses on revalidation, route change, disposal and StrictMode cleanup. Same-account revalidation retains creative settings, but spending consent is reset. Historical project views never mount production controls.

`ProductionJournal` is independent of the existing creation/fork and text-planning journals. Its sessionStorage namespace includes gateway, user and project. It stores quote IDs and bounded request settings/IDs for recovery, not story text, compiled prompts, API keys or reusable UI consent. The original confirmation body is saved solely to replay the same request after another explicit recovery confirmation. Failure to save a ticket prevents the POST; unreadable storage makes production read-only. This deliberately differs from optional storage for unpaid draft editing.

Before a POST, persist its exact body and idempotency key. Loading, focus restoration and polling **only read**. An uncertain quote can be retried only by a click with its original body/key. An uncertain confirmation keeps the original authorization tuple; GET of a used quote recovers its original run. Otherwise another explicit consent permits retry with the same body/key. No receipt is acknowledged before runtime validation and account/epoch checks. There is no “discard and buy again” action for an unresolved confirmation.

Explicit gateway refusals such as insufficient funds, expired quote or changed project do not count as successful batches. A quote-used/idempotency conflict is reconciled by reads rather than assumed unsubmitted. Configuration and actual expiry are ultimately enforced by the server; the browser clock is only an early guard.

Visible active runs are polled serially every three seconds, with the next interval scheduled after the previous read settles. Hidden pages pause polls. Read failure/terminal items stop polling. `blocked_unknown` blocks new batches; if other clips in that batch are still active, those statuses can continue to update. Refresh does not change a generation or release a hold.

The server remains authoritative about account capabilities, tenant membership, current versions, balance, quotas and transaction atomicity. Current P2b uses live operator profiles during execution: operators must not change/retire active bindings or profiles mid-batch. This UI does not repair that backend limitation.

## Results and privacy

Results are queried only for completed generation IDs returned by the run. Media URLs allow HTTPS or same-gateway `/media/` paths (HTTP only for localhost development); credentials, `data:`, `javascript:` and protocol-relative URLs are rejected. Clips do not autoplay. On identity revalidation the video source is removed. Failure to read a file is not reported as generation failure and does not trigger another paid call.

No share endpoint is called. “Not published to the plaza” is not a claim of encrypted/private media hosting: URLs retain the gateway's current access policy. No final export or permanent asset retention is promised. Raw provider error messages are not rendered.

## Enablement and rollback

Frontend: existing `VITE_STUDIO_ENABLED=true`, followed by a normal repository Git-integrated build. Backend: deploy P2b and enable `GATEWAY_STUDIO_ENABLED`, `GATEWAY_STUDIO_EXECUTION_ENABLED` and `GATEWAY_ENFORCE_CREDIT` as documented in the backend. No online configuration is changed by this PR.

Disabled/missing execution APIs do not disable draft or text-planning functions. Disabling new execution does not cancel existing jobs. Original clip cancellation remains available through the gateway's existing generation controls, not this new panel.

## Verification

Local isolated tests use the same TypeScript sources transpiled with the installed compiler, mapping Bun's `test` entry point to Node's test runner. This exercises behavior but does not substitute for full React typechecking, repository lint, production builds or a real backend/LLM/video run. `bun run ci` and `bun run build` were attempted locally; Bun is absent. Full checks run in the repository's unchanged CI, with both Studio feature-flag variants. No real provider calls or production user data are used.

Browser acceptance (mock responses only):

1. On an adopted project, select a model, request a quote, inspect generated/edit durations and prompt. Verify no `/runs` POST before the separate unchecked consent control and button.
2. Confirm once and double-click; observe one body/key and one receipt. Verify a refresh issues only GETs. Exercise 402, 409 expiry/configuration changes and 422 unsupported settings.
3. Lose the confirmation response, reload, then return a used quote. Recover its run without any POST. With an offered quote, only an explicit recovery click may repeat the exact request.
4. Switch browser focus/identity and projects during requests. Old responses must not acknowledge tickets or render into the new account. Historical `?revision=` views have no production panel.
5. Test queued, partial, cancelled and unknown submissions; unknown never becomes a retryable failure. Missing charge remains unknown. Completed jobs require a click to load media.
6. Inspect keyboard navigation, labels, focus, consent reset and narrow-screen cards. Test hidden-page polling, slow GETs, corrupt/unavailable sessionStorage and invalid media URLs.

Run and deployment verification results belong in the PR description. GitHub Actions success is separate from Cloudflare's deployment check; neither alone proves creative quality or a production end-to-end flow.
