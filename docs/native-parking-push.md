# Native parking reports and full alerts

The SwiftUI screen reads the existing `/api/parking` service. The same first-party,
signed anonymous cookie owns reports and notification participation. Google login
is not required. The Cloudflare `/api/parking` proxy still reaches the existing
Vercel backend; configure its secrets there until that backend is moved.

## What is implemented

- One switch controls both reporting and receiving full alerts. OFF removes the
  owner's subscription; a report without an active subscription is rejected.
- Reports require weekdays 06:50–07:30 Korea time, a location measured within the
  last 60 seconds, accuracy no worse than 300 m, and distance within 1 km of the
  existing Korea Circuit headquarters / plant 1 coordinates. Server-side checks
  apply to both web and native requests. The 1 km radius already includes the
  agreed GPS margin; accuracy does not extend the boundary.
- GPS is requested only when reporting and is never stored. As with ordinary web
  geolocation, coordinates/accuracy supplied by a modified client cannot be
  cryptographically verified; this is not an anti-spoofing guarantee.
- Five full reports in ten minutes trigger the existing once-per-day full alert.
  Native and Web Push recipients use the same event and recipient registry.
- Native tokens are refreshed on launch/foreground after prior opt-in. Changing
  tokens replace the old registration; a token cannot activate multiple owners.
  If notification permission is revoked, the next foreground disables participation.
- Native notifications contain only a public full-parking message, `route: parking`
  and an expiry. They contain no account identity, GPS, shifts or personal records.
  Tapping one opens the parking screen through the shared notification delegate.
- Delivery uses bounded concurrent batches, atomic leases, retry backoff and
  expired-token cleanup. An unsubscribe is checked again before sending. A send
  already accepted by APNs cannot be recalled by turning the switch off.

## Server configuration required before enabling iPhone participation

Set these **server-only** secrets on the backend handling `/api/parking`:

| Variable | Value |
| --- | --- |
| `PARKING_APNS_KEY_ID` | Apple APNs signing key ID |
| `PARKING_APNS_TEAM_ID` | Apple developer team ID |
| `PARKING_APNS_PRIVATE_KEY` | APNs `.p8` key contents (literal newlines or escaped `\n`) |
| `PARKING_APNS_TOPIC` | `com.wnhue.workroutine` |

Enable Push Notifications for the production bundle ID in Apple Developer and
refresh its signing profile. Keep the `.p8` key out of source, screenshots, logs,
client bundles and this document. There is no APNs credential supplied by the app.

`aps-environment` and `WorkRoutineAPNSEnvironment` must agree: development builds
use the sandbox APNs host; distribution builds use production. The production
project's build settings select the appropriate environment.

If server configuration is missing/invalid, `nativeAvailable` is false and
`native-subscribe` returns 503. The app shows parking status and a preparation
message; it does **not** claim an active alert subscription. Syntactically valid
credentials still require a real APNs/device delivery check to prove validity.
Existing web subscriptions continue to use the VAPID configuration.

## Verification

Run `node scripts/test-parking.cjs` and `node scripts/test-parking-native.cjs`.
They use synthetic keys, mocked HTTP/2 and isolated storage; no live vote,
subscription or notification is sent. Cases include time/GPS boundaries, privacy,
JWT signature/refresh, APNs environment/topic/expiry/errors, participation,
renewals, concurrent batches, opt-out, and provider retry behavior.

`NativeParkingTests` covers native response validation and compatibility with an
older backend. Simulator builds cover integration, but cannot prove APNs delivery.
After configuring the Apple capability and server key, use a physical device to
verify permission, token registration, a controlled test alert and cold/warm tap
routing. Do not post fake full votes to the shared production parking board.
