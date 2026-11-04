# Vercel → Cloudflare: copy only

Scope: copy this project's Vercel Blob JSON documents into a fresh, private D1 database. Keep all source objects, credentials, deployments and application routing intact. Do not deploy a Worker bound to this copy or send notifications from copied subscriptions.

## Execute

1. Authorize the existing Vercel `go1945` project `h` and the intended Cloudflare account. A phone can approve `wrangler login --device --browser=false`. Generate expiring links only while the user is available.
2. Resolve the production project's actual Blob store and credential securely. List variable names/IDs first, then obtain only the needed source storage credential. Do not print values, object names, account documents or backup bodies.
3. Export with `scripts/cloudflare-object-migration.cjs export`. This is a read-only operation. Require a stable inventory around the copy and verify every copied document's version. Retry boundedly if live writers change the inventory. A copy is not an atomic global snapshot of an actively written source.
4. Create a new D1 database with a distinct dated name and record its account and database ID privately. Use a separate copy configuration; keep the application's Worker configuration unbound to this copy.
5. Apply `cloudflare/migrations/0001_objects.sql`. Confirm the target contains zero objects before importing. Prepare the private SQL file with `prepare PRIVATE_BACKUP`; never import into a populated database.
6. Import SQL with the selected account/database and `--remote`. Capture CLI output in private files so errors cannot expose document bodies or SQL literals.
7. Export `path,body,version,content_type,updated_at` from D1 into a mode-0600 file. Run `verify PRIVATE_BACKUP PRIVATE_D1_ROWS`. Require matching object counts, original paths, exact content hashes and versions before reporting success.
8. Keep a private receipt with the source project/store, target account/database, export time range, counts, aggregate digest and verification result. Report only the count, verification result and snapshot time to the user.

The live Vercel service can receive further updates after the copy. Those later updates require another copy or a separately implemented synchronization/cutover. Device-local browser/app data and Google Drive account backups are outside Vercel Blob and remain where they are.

## Current status

Completed on 2026-11-04: 5 documents / 24,196 UTF-8 bytes copied into the private `work-routine-copy-20261104` D1 database. Remote query verification confirmed exact hashes, versions, content types and timestamps. A second stable source snapshot matched the copy, confirming Vercel originals remained intact. The temporary local source credential was removed.

See `DATA-COPY-RESULT.json` for the receipt and `data-copy.jsonc` for the isolated database target. No Worker was deployed, production routing was unchanged, and continuous synchronization is not enabled. Private source/target snapshots and import logs remain under the Git-ignored, mode-0700 `.migration-private/` directory; individual private files are mode 0600.
