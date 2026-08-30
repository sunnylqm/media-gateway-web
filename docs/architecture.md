# Architecture

## Runtime boundary

The browser application is a static Vite build. `VITE_GATEWAY_URL` selects the Go API origin at build time. Requests always use `credentials: include`, enabling the gateway's HttpOnly session cookies on allowed origins.

## Cross-origin authentication

The gateway validates the exact request origin from `GATEWAY_CORS_ORIGINS`, allows credentials, and handles preflight requests. Login, verification, and authenticated session responses expose `X-CSRF-Token`; the browser keeps it in `sessionStorage` and sends it on mutations. If another tab replaces the session, a rejected mutation carries the newly validated token and the client retries it once. Same-origin deployments continue to read the existing non-HttpOnly CSRF cookie.

For a cross-site production deployment, serve both origins over HTTPS and enable `GATEWAY_SECURE_COOKIES=true`. Prefer sibling subdomains under the same registrable domain so modern browser cookie policies treat them as the same site.

## UI structure

- `src/pages`: tenant and administrator route controllers.
- `src/components`: shared application shells and domain views.
- `src/components/ui`: shadcn/ui-compatible accessible primitives.
- `src/api.ts`: typed request, credential, CSRF, and error handling.
- `src/types.ts`: API contracts shared throughout the console.
- `src/i18n`: locale state, message dictionaries, and the gateway vocabulary map.

## Localization

`LocaleProvider` holds the active locale in React state and in module state, because `src/format.ts` and `src/api.ts` translate outside the component tree. `src/i18n/en.ts` defines the key set; every other dictionary is typed as `Record<MessageKey, string>`, so an untranslated key is a build error rather than an English string in a Chinese console. Dates, byte sizes, and currency follow the same locale through `Intl`.
