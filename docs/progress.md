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

## Compatibility notes

The route structure remains `/app/*` for tenants and `/admin/*` for administrators. API paths and response types remain unchanged, so the standalone console can be introduced without migrating backend data.
