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

Production is hosted by the Cloudflare Pages project `media-gateway-web`. Its
Git integration builds and deploys every push to `main`; no separate publish
command is required. A release is complete when the GitHub check
`Workers Builds: media-gateway-web` succeeds for the pushed commit.

OpenAI Sites, GitHub Pages, and direct Wrangler uploads are not part of this
repository's production release path.

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
