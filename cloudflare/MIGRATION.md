# Cloudflare migration: staged, without a client-origin change

The existing production origin is https://h-lyart-ten.vercel.app. Do not redirect users or change the native app URL during the backend migration. Local browser/app settings belong to that origin.

## Prepared environment

- Worker reuses all 11 current API handlers through a bounded Fetch/Node response adapter.
- Private JSON documents move to D1 with their original paths and bodies; optimistic write versions are preserved.
- Public assets are built with a strict allowlist. Server code, backups, environment files, Git history and native source are not published.
- `MIGRATION_READ_ONLY=true` is the default. Both API mutations/login and storage writes are blocked in staging.
- Existing Vercel production remains the active service until verification and data copy complete.

## Credentials and identities

Authorize Cloudflare with Wrangler OAuth and authorize the Vercel connection for the existing go1945 team. Configure runtime secrets securely through platform settings or protected CLI input; never put them in Git, logs, URLs or chat.

For approval from a phone, use `wrangler login --device --browser=false`; a localhost browser callback cannot complete on the phone. Generate the short-lived device code and Vercel team approval link only when the user is ready. On 2026-11-04 both accounts were authorized for a copy-only operation: 5 source documents were copied and verified in a separate private D1 database. See DATA-COPY.md and DATA-COPY-RESULT.json. No Worker has been deployed and production routing is unchanged. Retain the Vercel originals as explicitly requested by the user; cutover steps below are future work.

Preserve APP_URL, Google client ID/secret, Apple client ID/team/key, GOOGLE_CALENDAR_SESSION_SECRET and PARKING_VAPID keys for the initial same-origin backend cutover. The session secret also derives existing board/voter identities; replacing it without an explicit identity migration orphans users' associations. Keep private Apple keys on the server only.

Do not insert dummy storage credentials. Apple/live-link configuration accepts the D1 backend without requiring a Vercel Blob token. The original Blob token is needed only for private export/rollback.

## Build and validate

1. Install the reviewed pinned dependencies, then run `npm run cloudflare:build`. Use `npm run cloudflare:check` for the bundle dry run and `npm run cloudflare:test` while the local Worker is running.
2. Create a distinct D1 staging database and replace the unconfigured database ID in wrangler.jsonc. Do not reuse another application's database.
3. Apply cloudflare/migrations/0001_objects.sql to staging.
4. Run the dry-run bundle and local API/D1 tests; run browser flows against the Worker.
5. Deploy the read-only staging Worker. Verify all routes, authentication setup, native session exchange, same-origin cookies, account restoration, push delivery and actual CPU limits before routing users to it.
6. PDF parsing is CPU-heavy. Measure it on Workers Free before cutover; if it exceeds the CPU budget, precompute shared meal JSON in a build/update job or retain that one upstream endpoint temporarily. Do not assume local timing proves the free production runtime is sufficient.

## Data transfer and write cutover

1. Inventory and privately export every existing Blob JSON document. Use `node scripts/cloudflare-object-migration.cjs export` with the source token configured privately. Backups are mode 0600 under .migration-private/, a Git-ignored directory.
2. Test import into a fresh staging database and verify original object paths, exact body hashes and write versions. In addition, test representative account restore, board ownership, block/report history, voting and existing live-share URLs. Never send test push notifications to copied real device subscriptions.
3. Before the final snapshot, route old-origin mutations to a controlled read-only window (or pause old writers through an equivalent reversible gate). Drain in-flight functions/background jobs. The export command rejects individual concurrent updates but is not a global snapshot, so a write pause is still required for a lossless cutover.
4. Export the final source snapshot and generate an INSERT-only SQL file with `prepare PRIVATE_BACKUP`. Require an empty new production database; do not overwrite any existing target records.
5. Import privately and query `SELECT path,body,version,content_type,updated_at FROM objects` to a private JSON file. Run `verify PRIVATE_BACKUP PRIVATE_D1_ROWS`. A count/hash/version/metadata mismatch blocks cutover.
6. Route old-origin /api requests to the verified Worker, preserving URL/query, method, cookies, Origin/CSRF, redirects and multiple Set-Cookie headers. Set MIGRATION_READ_ONLY=false only after the data and functional checks pass. Keep one authoritative writer; do not let both databases diverge.
7. Monitor errors and account restore. Retain the original backup and rollback deployment. If the new database has received writes, reconcile those writes before rolling back; changing routing alone would lose them.
8. Keep the original Vercel data and rollback service. Retiring source credentials or handlers requires a separately authorized retirement plan after old clients, shared links and data equivalence are confirmed.

## Frontend URL migration is separate

A workers.dev/custom-domain frontend cannot see localStorage from vercel.app. Do not automatically redirect or advertise it as a replacement until origin-to-origin backup/restore is implemented for Safari, installed PWA and native WKWebView separately. Existing device data must be read at the old origin before changing the native app URL. Keep the old origin accessible to returning users.
