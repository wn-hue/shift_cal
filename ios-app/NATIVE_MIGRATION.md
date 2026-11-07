# Native iPhone app — version 1.0, build 3 uploaded

On 2026-11-08, the signed build 3 was uploaded to App Store Connect. Apple reported
that the uploaded package was processing. Public App Store review has not been
submitted, and the upload is not physical-iPhone or live-account verification.

The `WorkRoutine` production scheme uses `WORK_ROUTINE_NATIVE`. Its five main tabs,
onboarding, day/memo editors, payroll, leave/wage settings, account management,
bus, meals, lost-and-found, weather, parking and experimental tools render
with SwiftUI. Production excludes the old `WebApp.swift`, `AccountLogin.swift`
and `Bridge.js`. The original `Natbam` project is retained for the older test app.

## Data and calculation compatibility

`NativeStore` persists the existing account schema in the app's Application
Support directory, with atomic writes, protected files, account-specific caches,
deletion epochs and rollback on persistence failure. Unreadable existing files
are never replaced by a default save. Explicit backup recovery preserves the
unreadable file before replacement. Account credentials stay in Keychain.

The unchanged, bundled JavaScript business rules run offline in JavaScriptCore.
This is shared calculation code, not a rendered web page or downloaded script.
Run `python3 scripts/native-resources.py --check` to verify parity with the web
source, or omit `--check` after intentionally updating a shared rule.

A hidden WKWebView is used once to read the previous **same-bundle** iOS app's
origin-local storage. It loads only the support document with page scripts
disabled, reads allowlisted records/preferences, and never deletes the old store
or copies authentication secrets. Both known old origins are recognized.
Safari/PWA data and a different test-app bundle are isolated by iOS; those users
must use the same Google account or import their existing JSON backup. An
unsuccessful migration is shown before onboarding; it does not silently erase
or overwrite native records.

Google Drive/Apple account storage use the existing backend, with explicit
conflict choices and three-way merging. A delayed network response cannot
replace changes made while saving. Google Calendar exports only this app's
shifts, retaining ETags and conflict exclusions; it does not import external
events. Google Calendar is refreshed only when the user presses the export
button; local edits are not automatically sent. Public live links contain only
shift types, not pay or memos, and new links require an explicit action. Existing
live links refresh while the app is running and the account records are ready,
for the currently selected shift group only. They do not refresh in the background.

## Native behavior

- Shift changes save on close; an unsaved memo closes without a confirmation and
  is discarded. Memo save closes once. No medium-size intermediary sheet.
- Existing wage settings save valid changes as edited/on close; blank amounts
  become zero. First-use wage entry remains a sequential wizard.
- AlarmKit retains wake/rest/meal settings. Local schedule notifications and
  caffeine reminders use UserNotifications. Unrelated notifications are retained.
  AlarmKit capacity is handled without assuming a fixed OS limit: closest alarms
  take priority, and the UI shows unscheduled alarms and the last scheduled time.
  Memo notifications use serialized reconciliation, remove cancelled/changed
  reminders, verify accepted requests, expose failures, and retry transient errors
  twice before requiring another refresh. The nearest 60 memo notifications are
  selected; remaining reminders are shown as pending and refreshed when the app opens.
- Meals cache downloaded menus; bus route data and calculations are bundled.
- Parking now includes native opt-in, reports, APNs registration/token renewal,
  opt-out and notification navigation. Reporting requires participation/notifications,
  weekdays 06:50–07:30 Korea time and a recent location within 1 km of headquarters/
  factory 1. Location is checked only when reporting and is not stored by the app
  server. The server validates time/location, stores an anonymous participation
  record, and sends full-parking alerts through APNs. These paths are implemented
  but remain unavailable until the server's APNs provider credentials are configured.
  The exported App Store package has the production APNs entitlement. The UI reports
  preparation status while disabled. Lookup remains
  available and distinguishes loading, failures and no recent reports.
- Display, haptics, system light/dark appearance, native sharing and JSON backup
  are available in settings. Native display language supports Korean, English,
  Japanese and Simplified Chinese. User-authored text and source menu/stop names
  remain unchanged; payroll amounts remain Korean won. Localized layout and
  accessibility checks are part of simulator verification.

## Verification and release gates

The production XCTest target covers rotations for every A/B/C date in 2025–2027,
payroll/leave parity, half-days and holiday work, recurrence/ICS, migration,
account merge/isolation/deletion and weather. New regression coverage exercises
AlarmKit capacity, orphan cleanup, notification race/failure/retry handling,
localization and native parking paths. Native UI tests run a fresh,
isolated simulator record file: onboarding, memo save, tabs, wage clearing,
service sheets and relaunch. No live account writes, posts, votes or calendar
exports are performed by these tests.

The final simulator run passed all **87 tests (86 unit tests and 1 UI flow)** with
**0 runtime warnings** on iPhone 17e / iOS 27.0. The UI flow verifies onboarding,
memo entry and keyboard dismissal, tabs, wage editing, service sheets, language
changes and relaunch. The previous memo keyboard-accessory frame warning no longer
appears after moving its dismissal control into the form header.

Build-3 evidence and artifacts:

- Tests: `/tmp/work-routine-build3-verified.xcresult`
- Archive: `output/ios-native-build3/WorkRoutine-verified.xcarchive`
- Exported IPA: `output/ios-native-build3/Verified-AppStore/WorkRoutine.ipa`
- Upload log: `/tmp/work-routine-build3-upload.log` (`Upload succeeded`,
  `EXPORT SUCCEEDED`, package processing)
- App Store screenshot candidates: 6 PNGs in
  `output/ios-native-build3/app-store-screenshots/`, exported after a second UI
  flow passed on iPhone 18 Pro Max (101 seconds). Final dimensions/visual review
  and registration in App Store Connect remain separate from capture.

The exported package's production APNs and Sign in with Apple entitlements were
verified. Server provider keys and the Apple Services ID/key configuration remain
unset. Earlier build-2 evidence stays under `output/ios-native`; it is not the
current build-3 package. Do not describe simulator results as physical-iPhone
validation or successful real-account record restoration.

Before public review, verify on an actual iPhone: an upgrade with real local
records, OAuth login/Drive restore/delete, AlarmKit delivery while locked,
foreground/background memo notifications, APNs opt-in/delivery/opt-out,
keyboard/sheet gestures and haptics.
Apple sign-in server/portal configuration, review contacts and App Store Connect
screenshot registration remain separate release gates. The captured simulator
screenshots require final dimensions/visual review and do not validate actual-device delivery.
APNs credentials (`PARKING_APNS_KEY_ID`, `PARKING_APNS_TEAM_ID`,
`PARKING_APNS_PRIVATE_KEY`, `PARKING_APNS_TOPIC`) are a deployment gate, not missing
client implementation. Until configured, native reporting/remote alerts remain
disabled and must not be described as live or tested successfully. Confirm that
App Store Connect finishes processing build 3 before installing it through
TestFlight. App Store review remains unsubmitted. Website/backend deployment and
live-account delivery checks are tracked separately from this successful build upload.
