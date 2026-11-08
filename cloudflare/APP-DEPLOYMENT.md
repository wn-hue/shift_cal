# Cloudflare application deployment

Primary custom domain: https://20261104.xyz

Existing Cloudflare address retained: https://work-routine.shift-cal.workers.dev

## Active architecture

- Cloudflare Worker `work-routine` serves the app and public assets using `wrangler.app.jsonc`.
- The Worker forwards the explicit API allowlist to the existing Vercel production service. It validates the browser Origin before forwarding mutations, preserves HttpOnly cookies and CSRF checks, and disables caching of API responses.
- Vercel runs the existing API handlers and retains the login, push and session credentials. Its handlers read and write the same private D1 database for the iPhone app, PWA and legacy domain.
- `wrangler.d1.jsonc` deploys the dedicated D1 bridge. The production API connects over HTTPS with `SHIFT_D1_BRIDGE_URL` and the server-only `SHIFT_D1_BRIDGE_SECRET`. Every bridge operation is authenticated and excluded from caches.
- The D1 database recorded in DATA-COPY-RESULT.json is the historical copy. The production `work-routine-data` database is separate. Vercel Blob is retained as a migration backup.

For a cutover, keep the new bridge gated until the original production API has stopped accepting Blob writes. Drain in-flight writes, export and verify a fresh snapshot, then insert the activation row only after the D1 paths, bodies and versions match. During the gate, reads can use Blob and writes return a retryable error. After activation, a missing record or unavailable D1 returns the corresponding error. Restore only from a reconciled snapshot that preserves newer writes and account deletions.

## Public reads at the custom domain

`work-routine-public-reads` runs in front of `work-routine` on the three routes in `wrangler.public-reads.jsonc`. It serves the prepared meal menu from the active D1 database and handles public place searches and exchange rates. The existing app Worker handles other methods and queries, including meal-keyword actions, and takes over if a dependency fails or the prepared menu is more than two hours old.

The GitHub Actions workflow checks the fixed menu PDF source hourly, reuses the parsed menu when the source returns HTTP 304, and publishes a single versioned snapshot in D1. Only the designated workflow on the default branch can publish. Vote history continues to use the existing record and its optimistic write protection.

Run `node scripts/test-cloudflare-public-reads.cjs` before deploying with `wrangler deploy --config wrangler.public-reads.jsonc`. Confirm that each migrated read returns `X-Work-Routine-Backend: cloudflare` on `20261104.xyz`. To roll back, remove only the three routes for `work-routine-public-reads` and pause the menu workflow. Leave the custom domain and D1 records in place.

## Existing users

The custom domain first shows a public app introduction with privacy/terms links; users choose to start or import before normal app initialization can create default settings. The existing workers.dev origin continues to open the migration screen on a first visit. Only the existing Vercel origin is offered for data import; no users used the intermediate workers.dev address before the custom domain, so there is no workers.dev data import choice. Users can copy existing Vercel data in a separate window, or save a JSON file from the original app and import it at the new address. Source data is never deleted. Import preserves existing destination keys unless the user explicitly selects replacement, and rolls back local writes on failure.

Only app-prefixed local keys are transferred; credential/session/subscription keys are excluded. Original HttpOnly identity cookies are transferred separately as an encrypted five-minute ticket bound to a client verifier/state. Neither cookie values nor account tokens are written to JavaScript storage by that exchange. Google login first visits the existing backend. The production variable `GOOGLE_OAUTH_REDIRECT_ORIGIN=https://20261104.xyz` moves authorization and callback to the verified custom domain before issuing the flow cookie. Apple login retains its existing Vercel callback. Both return verifier-bound tickets to an exact trusted app origin, including existing addresses; no arbitrary return URL is accepted. Production Google OAuth now uses the verified custom domain; the old Google callback and old authorized domain have been removed after relay regression checks.

An installed PWA or native WKWebView can have storage separate from Safari. Such users must export from the original installed app's own storage context, or use their existing account backup. Native URLs have not been changed. Permissions and web-push registrations are origin-specific and may need to be granted at the new address.

## Operations

`npm run cloudflare:deploy` builds the public allowlist and deploys the production app configuration. `npm run cloudflare:staging:deploy` is the separate read-only API/D1 experiment. Keep `.migration-private/`, environment files, server code and native source out of the static asset build.

Custom-domain OAuth routing/target binding tests run with `node scripts/test-custom-domain.cjs`. Source data transfer and native login regression tests run with `node scripts/test-origin-transfer.cjs` and `node scripts/test-live-native.cjs`. Browser verification uses `scripts/test-cloudflare-app-browser.cjs` with Playwright available: isolated WebKit/Chromium contexts, source→target data preservation, first-visit gating, mobile layout, shared API availability, origin guards, private-file exclusions and the real OAuth authorization redirect. A human provider consent/login is not automated.

New-user startup is classified synchronously by `onboarding-state.js` before app defaults can be written. A critical visibility gate prevents the calendar from painting while the setup scripts load. The onboarding dialog opens at DOMContentLoaded rather than waiting for images and other load-event resources; returning users and imported Vercel settings retain their existing flow.
