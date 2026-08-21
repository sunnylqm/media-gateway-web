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

## Features

- Tenant sign-in, email verification, job history, artifacts, and API-key management.
- A generation composer built from each model's published request form: start and end frames, multi-reference images, video, and audio, parameter controls that follow the declared shape, and the gateway's own price estimate.
- Administrator sign-in, overview, accounts, tenant status, model/binding configuration, billing, and generation audit views.
- Credentialed cross-origin sessions with CSRF tokens retained only in the active browser tab.
- Responsive console shell using shadcn/ui-compatible primitives and Radix accessibility behavior.

## Commands

```bash
bun run dev
bun run build
bun run lint
```

See [progress.md](docs/progress.md) for the migration record and [architecture.md](docs/architecture.md) for integration details.
