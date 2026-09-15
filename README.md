# Media Gateway Web

The standalone React console for [`media-gateway`](https://github.com/sunnylqm/media-gateway), rebuilt with Vite and shadcn/ui primitives. It preserves the tenant and administrator workflows while allowing the UI and Go API to be deployed independently.

## Run locally

```bash
cp .env.example .env
bun install
bun run dev
```

The default Vite proxy forwards API and media requests to `http://127.0.0.1:8080`. To call a remote gateway directly, set `VITE_GATEWAY_URL` and disable the proxy. The gateway must include the frontend origin in `GATEWAY_CORS_ORIGINS`.

```env
VITE_GATEWAY_URL=https://api.example.com
VITE_GATEWAY_PROXY=false
```

## Deployment

Production is hosted by the Cloudflare Worker `media-gateway-web`, using
**Workers Builds Git integration**, not Cloudflare Pages. The browser app is a
static Vite build; `wrangler.jsonc` points Workers Static Assets to `./dist` and
sets `not_found_handling` to `single-page-application` so navigation to nested
routes such as `/app/video` serves the React application.

In the existing Worker's **Settings > Build**, use:

| Setting | Value |
| --- | --- |
| Root directory | Repository root (the directory containing `package.json` and `wrangler.jsonc`) |
| Build command | `bun run build` |
| Production deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |

Workers Builds installs dependencies before running the build. Keep the existing
build-time environment variables, especially `VITE_GATEWAY_URL` and
`VITE_STUDIO_ENABLED`; the Wrangler configuration does not replace those values.
There is no Worker `main` script: `src/main.tsx` is browser code, not a Worker
entry point. The compiled `dist/index.html` must exist before either upload
command runs. `.openai/hosting.json` is not Wrangler deployment configuration.

A push to `main` builds and deploys production. Non-production branch builds
upload preview versions without promoting them to production. Check both the
application CI and `Workers Builds: media-gateway-web` for the exact commit;
a passing build alone is not proof of a successful Cloudflare upload.

The PR workflow builds with Studio disabled and enabled, checks that
`dist/index.html` exists, and runs both deployment paths without publishing:

```bash
bun run ci
bun run build
npx --yes wrangler@4 deploy --dry-run
npx --yes wrangler@4 versions upload --dry-run
```

These dry runs do not require Cloudflare deployment credentials and do not test
account permissions, live domain routing, or backend connectivity. The actual
Workers Builds result and preview smoke test remain required. Do not replace a
preview command with `wrangler deploy`, which would promote code to production.

Custom domains and existing hostnames remain managed on the existing Worker;
this configuration does not declare or clear routes or change the domain
bindings. `keep_vars: true` retains dashboard-managed runtime variables. No
redirect to `mypub.ai` is added, and this configuration does not itself bind the
new domain. OpenAI Sites, GitHub Pages, and manual Wrangler uploads are not part
of this repository's production release path.

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[SPA static assets](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

## Features

- Tenant sign-in, email verification, job history, artifacts, and API-key management.
- A generation composer built from each model's published request form: start and end frames, multi-reference images, video, and audio, parameter controls that follow the declared shape, and the gateway's own price estimate.
- Administrator sign-in, overview, accounts, tenant status, model/binding configuration, billing, and generation audit views.
- Credentialed cross-origin sessions with CSRF tokens retained only in the active browser tab.
- Responsive console shell using shadcn/ui-compatible primitives and Radix accessibility behavior.
- English and Simplified Chinese throughout, chosen from the browser's own languages and switchable from the sign-in page or the profile menu.

## Commands

```bash
bun run dev
bun run build
bun run lint
```

## Language

The console ships English (`en`) and Simplified Chinese (`zh`). A first visit follows the browser's language list; the choice made from the toggle on the sign-in page or from `Language` in the profile menu is kept in `localStorage` and also sets `<html lang>`, dates, numbers, and currency.

To add a locale, copy `src/i18n/zh.ts`, translate every entry, and register it in `dictionaries` and `locales` in `src/i18n/index.tsx`. `src/i18n/en.ts` is the key set every other locale is typed against, so a missing translation fails `bun run build`. Vocabulary that comes from the gateway rather than from this app — job statuses, media roles, request-form parameter names — is translated in `src/i18n/terms.ts`, where an unknown term keeps the value the API returned.

See [progress.md](docs/progress.md) for the migration record and [architecture.md](docs/architecture.md) for integration details.
