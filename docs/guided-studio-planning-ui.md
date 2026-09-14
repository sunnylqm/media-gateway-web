# Guided Studio text planning UI (P1d)

## Scope and dependency

This increment connects the P1b draft UI to the P1c API merged in
sunnylqm/media-gateway#7. It is stacked on media-gateway-web#3, revision
`d533ddac38427df640214b88a34ea2e7b173732a`, because that UI PR was still open
when development started. Merge #3 first, then retarget/rebase this increment
onto main; do not merge the increment into the feature branch to deploy it.

The backend contract was read from `internal/httpapi/studio_planning.go`,
`internal/studioplan/types.go`, and the atomic acceptance implementation after
#7 was merged. Server confirmation, version checks, quotas, and tenant ownership
remain authoritative.

This release produces and adopts **text proposals**. It does not submit video or
image jobs, spend tenant funds, select video models, merge clips, or publish.
No runtime dependencies or lockfile changes. Bun remains `latest`, as requested.
The CI branch filter additionally covers the P1b branch so a stacked PR is tested.

## Interaction

After completing the existing choice guide, the current project shows a planning
panel. On first entry or reload it reads `/v1/studio/planning` and the project's
saved tasks. Disabled/older gateways keep the draft experience usable.

A new proposal requires an unchecked consent control naming the input version.
The adjacent copy explains that the creative brief goes to a configured external
text model, costs are operator-funded, and no video is generated. Only the
`operator_funded` contract with required confirmation and a profile is authorized
by this UI. Unknown future billing modes are read-only, not silently accepted.

GET project responses do not carry `guide_complete`. The UI does not infer
completion from a fixed question count. New submission is available after the
server has confirmed completion through the existing guide action, or when the
current snapshot already contains an adopted plan, and never with a pending turn.
After reopening a complete draft without a plan, “Continue the guide” confirms
completion; opening or refreshing the planning panel never writes a guide turn.
Existing proposals can be resumed independently of that completion signal.

Queued/running tasks get serial three-second GET polling. Hidden tabs do not issue
polls, terminal tasks stop polling, and a read error stops it until an explicit
refresh or session revalidation. There are no fabricated percent-complete bars.
A queued task does not imply the independent backend worker is online.

Users can inspect story goal, obstacle, decision, outcome, causal beats, and shot
cards. Per-shot prompt drafts show the choice/fact bindings from **the proposal's
own input snapshot**, never from a newer project's choices. Unbound segments are
labelled system additions. Text is rendered as React text, not raw HTML or model
links. Shot copy is explicit and never submits anything to a generation endpoint.
Edit and generation durations are separately labelled planning budgets; neither
is a verified model setting or a price quote. Unknown usage is not displayed as
zero. Structural validation is not a creative-quality or rights guarantee.

Adoption requires a separate explicit confirmation. Only a ready proposal whose
input version matches the displayed current project can be adopted. The response
is a task receipt, **not a project**. The UI keeps that receipt and re-reads the
project instead of fabricating a new snapshot; a subsequent GET failure does not
undo a successful adoption. Older proposals remain readable, not applicable.
Historical project views render only their own saved plan and mount no planning
controller, do not query live tasks, and expose no planning writes.

Cancellation is a two-click action. It can cancel queued/running tasks or discard
a ready proposal. Copy explicitly says it cannot undo upstream computation or
imply zero provider cost. Accepted/stale/failed tasks have no cancel action.

## Request and recovery contracts

| Action | Endpoint / body |
| --- | --- |
| Capabilities | GET `/v1/studio/planning` |
| Project tasks | GET `/v1/studio/planning/projects/{id}/tasks` |
| One task | GET `/v1/studio/planning/tasks/{id}` |
| Enqueue | POST `/v1/studio/planning/tasks`; project_id, expected_version, confirm_text_generation:true; Idempotency-Key |
| Adopt | POST `/v1/studio/planning/tasks/{id}/accept`; expected_version = original input_version |
| Cancel | POST `/v1/studio/planning/tasks/{id}/cancel`; `{}` |

All calls go through the same account-bound StudioSessionController transport and
existing API/CSRF client. Identity refresh pauses this controller, aborts in-flight
requests, and keeps mounted selection state. After the same identity is verified,
only reads resume. Switching identity replaces the subtree and journal namespace.

A PlanningJournal is independent of draft create/fork commands. Each unresolved
submission retains exactly its original body and idempotency key, scoped by
gateway, account, and project. Session storage contains only IDs, version,
confirmation, and a key; never story/prompt content, model credentials, or email.
Blocked storage falls back to memory (no cross-page durability guarantee).

Uncertain POSTs are **not automatically replayed**. The recovery action asks for
explicit confirmation and replays the original version with the original key.
This can deliver an original request that never arrived, but cannot silently use
a fresh key. A newer version cannot replace an unresolved original command.
Definitive P1c validation/version/quota/pending errors acknowledge an unused key;
auth errors, disabled APIs, transport errors, and unknown responses do not prove
an earlier request was absent and retain it. Same-session storage clear/expiry,
a new browser/device, or operator retention can limit this protection; the
server's active-task guard is not permanent cross-device deduplication.

Controller epochs and synchronous mutation locks prevent late reads, double
clicks, request chains abandoned at account refresh, or StrictMode cleanup from
accepting stale responses. Conflicts and failed reads require refresh before
new actions, except for the explicit same-command recovery path. Ready proposals
are not paid retries: a new text call always requires a fresh user request.

## Enablement

Existing frontend build flag: `VITE_STUDIO_ENABLED=true`.
Backend: deploy #7, enable both Studio and planning flags, configure the text
model, and start its separate same-machine SQLite worker as documented by the
backend. This PR neither changes those environment variables nor starts a worker.
Cloudflare Git integration remains the production target; build success is not
proof of Cloudflare deployment success.

## Verification

Pure TypeScript protocol/controller/journal tests run with the existing test
runner. They cover disabled and unknown billing contracts, explicit confirmations,
recovery keys, null lists, queue polling, stale responses, conflicts, adoption
receipts, cancellation, account/project isolation and safe proposal rendering.
Full CI must pass the original lockfile installation, type/lint/unit checks, and
both feature-flag build variants. No real LLM credentials are needed for tests.

Browser acceptance checklist (mock API; not a live LLM quality test):

- Opening/reloading the panel performs only reads. Disabled API and HTTP 404 do
  not break existing draft controls.
- Complete the guide, explicitly confirm one task, move queued → running → ready,
  inspect provenance, explicitly adopt, and observe the server's new version.
- Simulate lost enqueue response, reload, and confirm recovery with the same key;
  a new draft version must not silently replace the original body.
- Display a stale proposal; the adopt action is absent. Historical views issue no
  live planning reads or planning mutations.
- Cancel a task after confirmation; verify the `{}` body and no automatic retry.
- Switch windows during consent/editing; preserve state for the same account,
  block work during verification, and remove the previous account after a switch.
- Inspect narrow/mobile layout and keyboard operation, switch UI language, and
  verify model-provided text/HTML-like input is inert.

Record actual CI and browser outcomes in the PR, distinguishing mock browser
checks, real backend integration, and paid-provider quality tests.
