import XCTest
@testable import Natbam

@MainActor
private final class AccountFixtureAPI: NativeAccountTransport {
    let base = URL(string: "https://fixture.invalid")!
    var csrf: String?
    var calls: [String] = []
    var cookiesInstalled = 0
    var accountID = "google-user-a"
    var records: [[String: Any]] = []
    var readFailure = false
    var writeHandler: (([String: Any]) async throws -> [String: Any])?
    var readHandler: (() async throws -> [String: Any])?
    var statusHandler: (() async throws -> [String: Any])?
    var logoutHandler: (() async throws -> [String: Any])?
    var cookieHandler: (() async throws -> [HTTPCookie])?
    func request(path: String, method: String, body: [String: Any]?, bearer: String?) async throws -> [String: Any] {
        calls.append(path)
        if path.contains("apple-account") { return ["configured": false] }
        let action = URLComponents(string: "https://fixture.invalid" + path)?.queryItems?.first(where: { $0.name == "action" })?.value
        switch action {
        case "status":
            if let statusHandler { return try await statusHandler() }
            return ["connected": true, "cloudConnected": true, "calendarConnected": false, "provider": "google", "csrf": "fixture-csrf", "user": ["id": accountID, "email": "fixture@example.invalid"]]
        case "cloud-read":
            if readFailure { throw URLError(.notConnectedToInternet) }
            return try await readHandler?() ?? ["versions": records]
        case "cloud-write":
            guard let body else { throw NativeFailure("Missing test payload") }
            if let writeHandler { return try await writeHandler(body) }
            return ["revision": body["revision"]!, "updatedAt": "2026-11-08T00:00:00.000Z", "data": body["data"]!]
        case "logout": return try await logoutHandler?() ?? ["ok": true]
        default: throw NativeFailure("Unexpected fixture request: " + path)
        }
    }
    func webSessionCookies(bearer: String) async throws -> [HTTPCookie] { try await cookieHandler?() ?? [] }
    func installSessionCookies(_ cookies: [HTTPCookie]) { cookiesInstalled += 1 }
    func clearCookies() { csrf = nil }
}

@MainActor
final class NativeAccountFlowTests: XCTestCase {
    private var directory: URL!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }
    private func store() -> NativeStore { NativeStore(file: directory.appendingPathComponent("records.json")) }
    private func data(_ text: String, day: String = "2026-11-08") throws -> [String: Any] {
        try NativeLogic.shared.normalized(["shift_active_group": "C", "shift_day_memos": [day: text], "shift_overrides_C": [day: "SPECIAL_DAY"]])
    }
    private func version(_ value: [String: Any], revision: String = String(repeating: "a", count: 32)) -> [String: Any] {
        ["revision": revision, "updatedAt": "2026-11-08T00:00:00.000Z", "data": value]
    }
    private func account(_ api: AccountFixtureAPI, _ store: NativeStore) -> NativeAccount {
        let account = NativeAccount(api: api, credential: "synthetic-test-bearer", persistCredential: { _ in })
        account.attach(store); return account
    }
    func testBrowserCompatibleSnapshotRestoresWithoutUploadingOrOverwritingIt() async throws {
        let api = AccountFixtureAPI(), store = store(), browserRecords = try data("브라우저에서 쓴 메모")
        api.records = [version(browserRecords)]
        let account = account(api, store)
        await account.refresh(); await account.synchronize()
        XCTAssertTrue(account.connected && account.cloudConnected && account.canPublishRecords)
        XCTAssertTrue(NativeLogic.shared.equal(store.data, browserRecords))
        XCTAssertEqual(store.owner, api.accountID)
        XCTAssertFalse(api.calls.contains(where: { $0.contains("cloud-write") }))
        XCTAssertTrue(NativeLogic.shared.equal(NativeStore(file: directory.appendingPathComponent("records.json")).data, browserRecords))
    }
    func testGuestRecordsRequireChoiceBeforeReplacingWithCloudRecords() async throws {
        let api = AccountFixtureAPI(), store = store(), local = try data("이 기기 메모")
        try store.adopt(local, owner: nil, parents: [], synced: false)
        api.records = [version(try data("계정 메모"))]
        let account = account(api, store)
        await account.refresh(); await account.synchronize()
        XCTAssertTrue(account.choosingRecords)
        XCTAssertFalse(account.canPublishRecords)
        XCTAssertTrue(NativeLogic.shared.equal(store.data, local))
        XCTAssertFalse(api.calls.contains(where: { $0.contains("cloud-write") }))
        await account.logout()
    }
    func testOfflineReadKeepsExistingRecords() async throws {
        let api = AccountFixtureAPI(), store = store(), local = try data("오프라인 기록")
        try store.adopt(local, owner: api.accountID, parents: [], synced: false)
        api.readFailure = true
        let account = account(api, store)
        await account.refresh(); await account.synchronize()
        XCTAssertNotNil(account.error)
        XCTAssertTrue(NativeLogic.shared.equal(store.data, local))
        XCTAssertFalse(account.canPublishRecords)
    }
    func testDelayedReadAfterLogoutCannotRestoreOldAccountRecords() async throws {
        let api = AccountFixtureAPI(), store = store()
        let account = account(api, store)
        await account.refresh()
        var resume: CheckedContinuation<[String: Any], Error>?
        api.readHandler = { try await withCheckedThrowingContinuation { resume = $0 } }
        let task = Task { await account.synchronize() }
        while resume == nil { await Task.yield() }
        await account.logout()
        resume?.resume(returning: ["versions": [version(try data("이전 계정 기록"))]])
        await task.value
        XCTAssertFalse(account.connected)
        XCTAssertNil(store.owner)
        XCTAssertFalse(NativeLogic.shared.meaningful(store.data))
        XCTAssertFalse(api.calls.contains(where: { $0.contains("cloud-write") }))
    }
    func testAccountSwitchNeverUploadsPreviousAccountsRecords() async throws {
        let api = AccountFixtureAPI(), store = store()
        let previous = try data("A계정 전용")
        try store.adopt(previous, owner: "google-user-a", parents: [], synced: false)
        api.accountID = "google-user-b"; api.records = [version(try data("B계정 전용"))]
        let account = account(api, store)
        await account.refresh(); await account.synchronize()
        XCTAssertEqual(store.owner, "google-user-b")
        XCTAssertEqual(store.object("shift_day_memos")["2026-11-08"] as? String, "B계정 전용")
        XCTAssertFalse(api.calls.contains(where: { $0.contains("cloud-write") }))
        try store.switchAccount(to: "google-user-a")
        XCTAssertTrue(NativeLogic.shared.equal(store.data, previous))
    }
    func testStaleCloudWriteFailsWithoutReplacingLocalRecords() async throws {
        let api = AccountFixtureAPI(), store = store(), initial = try data("처음")
        try store.adopt(initial, owner: api.accountID, parents: [String(repeating: "a", count: 32)], synced: true)
        api.records = [version(initial)]
        let account = account(api, store)
        await account.refresh(); await account.synchronize()
        let local = try data("기기에서 고친 메모")
        store.data = local
        api.writeHandler = { _ in throw NativeHTTPError(status: 412, code: "CLOUD_CONFLICT", message: "fixture conflict") }
        await account.synchronize()
        XCTAssertTrue(NativeLogic.shared.equal(store.data, local))
        XCTAssertFalse(account.canPublishRecords)
        XCTAssertNotNil(account.error)
        await account.logout()
    }
    func testOldSyncFinishingDuringLogoutCannotUnlockOrRestartSync() async throws {
        let api = AccountFixtureAPI(), store = store(), account = account(api, store)
        await account.refresh()
        var read: CheckedContinuation<[String: Any], Error>?
        var logout: CheckedContinuation<[String: Any], Error>?
        api.readHandler = { try await withCheckedThrowingContinuation { read = $0 } }
        api.logoutHandler = { try await withCheckedThrowingContinuation { logout = $0 } }
        let syncing = Task { await account.synchronize() }
        while read == nil { await Task.yield() }
        let loggingOut = Task { await account.logout() }
        while logout == nil { await Task.yield() }
        read?.resume(returning: ["versions": [version(try data("이전 계정 기록"))]])
        await syncing.value
        XCTAssertTrue(account.busy, "Only the pending logout may release busy state")
        let calls = api.calls.count
        await account.synchronize(whileBusy: true)
        await account.refresh()
        XCTAssertEqual(api.calls.count, calls, "No new account work may start during logout")
        logout?.resume(returning: ["ok": true]); await loggingOut.value
        XCTAssertFalse(account.busy); XCTAssertFalse(account.connected)
        XCTAssertNil(store.owner); XCTAssertFalse(NativeLogic.shared.meaningful(store.data))
    }
    func testOldSyncCannotReleaseNewAccountsBusyState() async throws {
        let api = AccountFixtureAPI(), store = store(), account = account(api, store)
        await account.refresh()
        var oldRead: CheckedContinuation<[String: Any], Error>?
        api.readHandler = { try await withCheckedThrowingContinuation { oldRead = $0 } }
        let oldSync = Task { await account.synchronize() }
        while oldRead == nil { await Task.yield() }
        await account.logout()
        // Model a newly authenticated cookie session after logout.
        api.accountID = "google-user-b"; await account.refresh()
        var newRead: CheckedContinuation<[String: Any], Error>?
        api.readHandler = { try await withCheckedThrowingContinuation { newRead = $0 } }
        let newSync = Task { await account.synchronize() }
        while newRead == nil { await Task.yield() }
        oldRead?.resume(returning: ["versions": [version(try data("A계정 기록"))]])
        await oldSync.value
        XCTAssertTrue(account.busy, "An old operation must not unlock the new account's request")
        newRead?.resume(returning: ["versions": [version(try data("B계정 기록"))]])
        await newSync.value
        XCTAssertFalse(account.busy); XCTAssertEqual(store.owner, "google-user-b")
        XCTAssertEqual(store.object("shift_day_memos")["2026-11-08"] as? String, "B계정 기록")
    }
    func testDelayedSessionCookiesCannotReinstallAfterLogout() async throws {
        let api = AccountFixtureAPI(), store = store(), account = account(api, store)
        await account.refresh()
        let installed = api.cookiesInstalled
        var cookies: CheckedContinuation<[HTTPCookie], Error>?
        api.cookieHandler = { try await withCheckedThrowingContinuation { cookies = $0 } }
        let refresh = Task { await account.refresh() }
        while cookies == nil { await Task.yield() }
        await account.logout()
        cookies?.resume(returning: []); await refresh.value
        XCTAssertEqual(api.cookiesInstalled, installed)
        XCTAssertFalse(account.connected); XCTAssertFalse(account.busy)
        XCTAssertNil(store.owner)
    }
    func testDelayedRefreshFailureDoesNotOverridePendingLogout() async throws {
        let api = AccountFixtureAPI(), store = store(), account = account(api, store)
        await account.refresh()
        var status: CheckedContinuation<[String: Any], Error>?
        var logout: CheckedContinuation<[String: Any], Error>?
        api.statusHandler = { try await withCheckedThrowingContinuation { status = $0 } }
        api.logoutHandler = { try await withCheckedThrowingContinuation { logout = $0 } }
        let refresh = Task { await account.refresh() }
        while status == nil { await Task.yield() }
        let loggingOut = Task { await account.logout() }
        while logout == nil { await Task.yield() }
        status?.resume(throwing: NativeHTTPError(status: 401, code: "RECONNECT", message: "expired old request"))
        await refresh.value
        XCTAssertTrue(account.busy); XCTAssertNil(account.error)
        logout?.resume(returning: ["ok": true]); await loggingOut.value
        XCTAssertFalse(account.busy); XCTAssertFalse(account.connected)
        XCTAssertEqual(account.message, "로그아웃했어요. 계정에 저장한 기록은 남아 있어요.")
    }
    func testCredentialDeletionFailureReleasesBusyAndInvalidatesOldRead() async throws {
        let api = AccountFixtureAPI(), store = store(), local = try data("기기에 보관한 기록")
        try store.adopt(local, owner: api.accountID, parents: [], synced: false)
        var failDeletion = true
        let account = NativeAccount(api: api, credential: "synthetic-test-bearer", persistCredential: { value in
            if value == nil && failDeletion { throw NativeFailure("fixture keychain failure") }
        })
        account.attach(store); await account.refresh()
        var read: CheckedContinuation<[String: Any], Error>?
        api.readHandler = { try await withCheckedThrowingContinuation { read = $0 } }
        let syncing = Task { await account.synchronize() }
        while read == nil { await Task.yield() }
        await account.logout()
        XCTAssertFalse(account.busy); XCTAssertTrue(account.connected); XCTAssertNotNil(account.error)
        read?.resume(returning: ["versions": [version(try data("늦게 온 계정 기록"))]])
        await syncing.value
        XCTAssertTrue(NativeLogic.shared.equal(store.data, local))
        failDeletion = false; await account.logout()
        XCTAssertFalse(account.busy); XCTAssertFalse(account.connected); XCTAssertNil(store.owner)
    }
    func testNetworkLogoutFailureStillClearsLocalSessionAndBusy() async throws {
        let api = AccountFixtureAPI(), store = store(), account = account(api, store)
        await account.refresh()
        api.logoutHandler = { throw URLError(.notConnectedToInternet) }
        await account.logout()
        XCTAssertFalse(account.busy); XCTAssertFalse(account.connected)
        XCTAssertNil(store.owner); XCTAssertNil(api.csrf)
    }

}
