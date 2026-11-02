# Deploying {{NAME}}

wrangler runs through `npx` at the version pinned in `.github/workflows/deploy.yml`, so the deploy works the same whether or not the project has a `package.json`.

CI {{#BUILD_COMMAND}}builds the site with `{{BUILD_COMMAND}}` and {{/BUILD_COMMAND}}deploys `{{DIST_DIR}}/` to the Cloudflare Pages project `{{CF_PROJECT}}` ({{SITE_URL}}) once every check has passed on `main` (`.github/workflows/deploy.yml`, called from `ci.yml`). Only `main`'s newest commit is deployed, so an older run cannot roll the site back. A deploy can also be started by hand from the Actions tab ("Deploy", *Run workflow*); it refuses a commit whose CI has not passed.

After uploading, `scripts/check-live.mjs` fetches the live page and fails unless it is byte-for-byte the built one: Cloudflare features such as email obfuscation, Rocket Loader or Web Analytics rewrite pages and inject scripts. Turn those off for the zone (or add the page they break to the check's list after review).

## One-time setup

1. `{{DIST_DIR}}/` holds only what is published, with `index.html` at its top. {{^BUILD_COMMAND}}Without a build step, keep the pages in that folder (never deploy the repository root: it holds `.git`, docs and workflows); the deploy refuses dotfiles, source maps and `node_modules` in it.{{/BUILD_COMMAND}}{{#BUILD_COMMAND}}The deploy refuses dotfiles, source maps and `node_modules` in it.{{/BUILD_COMMAND}} Add every page the site has to `PAGES` in `scripts/check-live.mjs`.
2. Create a Cloudflare API token with only **Account → Cloudflare Pages → Edit**.
3. Add the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`: `gh secret set CLOUDFLARE_API_TOKEN` (it prompts, so the value stays out of the shell history).
4. The first deploy creates the Direct Upload project `{{CF_PROJECT}}`. Attach the custom domain in the Cloudflare dashboard (Pages → `{{CF_PROJECT}}` → Custom domains).
5. If the site was deployed by Cloudflare's Git integration before, move the custom domain over and turn off that project's automatic deployments, so only CI deploys.

## Headers

Security and cache headers live in a `_headers` file at the top of `{{DIST_DIR}}/` (with Vite, put it in `public/` so the build copies it). A strict starting point:

```
/*
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Check them on the live site with `curl -sI {{SITE_URL}}/`.
