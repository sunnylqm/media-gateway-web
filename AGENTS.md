# Deployment

- Production is the Cloudflare Pages project `media-gateway-web`, connected to this GitHub repository through Git integration.
- Pushing `main` triggers the production build and deployment automatically. Do not publish this repository through OpenAI Sites, GitHub Pages, or a manual Wrangler upload unless the user explicitly changes the deployment target.
- Before pushing, run `bun run ci` and `bun run build`. After pushing, verify the GitHub check named `Workers Builds: media-gateway-web` completes successfully.
- `.openai/hosting.json` is build metadata used by the existing Vite plugin; it is not the production deployment configuration and must not contain an OpenAI Sites `project_id`.
