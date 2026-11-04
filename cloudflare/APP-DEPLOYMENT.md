# Cloudflare application deployment

Public app: https://work-routine.shift-cal.workers.dev

## Active architecture

- Cloudflare Worker `work-routine` serves the app and public assets using `wrangler.app.jsonc`.
- The Worker forwards the explicit API allowlist to the existing Vercel production service. It validates the browser Origin before forwarding mutations, preserves HttpOnly cookies and CSRF checks, and disables caching of API responses.
- **Vercel remains the active account/data service.** Its source data, environment secrets, existing OAuth callback URLs and production URL are retained. Both app addresses therefore use the same live server records, rather than diverging databases.
- The D1 database recorded in DATA-COPY-RESULT.json is a verified snapshot, not the active writer in this release. Do not point a production Worker at that older snapshot without a fresh, verified cutover.
- This release deploys the app to Cloudflare; it does not remove the Vercel backend dependency.

## Existing users

The new origin's first visit opens the migration screen before normal app initialization can create default settings. Users can copy data from the existing origin in a separate window, or save a JSON file from the original app and import it at the new address. Source data is never deleted. Import preserves existing destination keys unless the user explicitly selects replacement, and rolls back local writes on failure.

Only app-prefixed local keys are transferred; credential/session/subscription keys are excluded. Original HttpOnly identity cookies are transferred separately as an encrypted five-minute ticket bound to a client verifier/state. Neither cookie values nor account tokens are written to JavaScript storage by that exchange. Login reuses the registered Vercel OAuth callback and returns a similarly verifier-bound ticket to the fixed Cloudflare return page; no arbitrary return URL is accepted.

An installed PWA or native WKWebView can have storage separate from Safari. Such users must export from the original installed app's own storage context, or use their existing account backup. Native URLs have not been changed. Permissions and web-push registrations are origin-specific and may need to be granted at the new address.

## Operations

`npm run cloudflare:deploy` builds the public allowlist and deploys the production app configuration. `npm run cloudflare:staging:deploy` is the separate read-only API/D1 experiment. Keep `.migration-private/`, environment files, server code and native source out of the static asset build.

Source data transfer and native login regression tests run with `node scripts/test-origin-transfer.cjs` and `node scripts/test-live-native.cjs`. Browser verification uses `scripts/test-cloudflare-app-browser.cjs` with Playwright available: isolated WebKit/Chromium contexts, source→target data preservation, first-visit gating, mobile layout, shared API availability, origin guards, private-file exclusions and the real OAuth authorization redirect. A human provider consent/login is not automated.
