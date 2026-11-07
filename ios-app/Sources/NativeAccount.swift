import SwiftUI
import AuthenticationServices
import CryptoKit
import Security

@MainActor protocol NativeAccountTransport: AnyObject {
    var base: URL { get }
    var csrf: String? { get set }
    func request(path: String, method: String, body: [String: Any]?, bearer: String?) async throws -> [String: Any]
    func webSessionCookies(bearer: String) async throws -> [HTTPCookie]
    func installSessionCookies(_ cookies: [HTTPCookie])
    func clearCookies()
}

@MainActor final class NativeAPI: NativeAccountTransport {
    static let shared = NativeAPI()
    let base = URL(string: "https://20261104.xyz")!
    var csrf: String?
    private let client: URLSession
    init() {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 35
        configuration.httpCookieStorage = .shared
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        client = URLSession(configuration: configuration)
    }
    func request(path: String, method: String = "GET", body: [String: Any]? = nil, bearer: String? = nil) async throws -> [String: Any] {
        guard path.hasPrefix("/"), let url = URL(string: path, relativeTo: base)?.absoluteURL, url.host == base.host, url.scheme == "https" else { throw NativeFailure("연결할 주소를 확인해 주세요.") }
        var request = URLRequest(url: url); request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(base.absoluteString, forHTTPHeaderField: "Origin")
            request.setValue(csrf ?? "", forHTTPHeaderField: "X-Shift-CSRF")
            request.httpBody = try JSONSerialization.data(withJSONObject: body ?? [:])
        }
        if let bearer { request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization"); request.httpShouldHandleCookies = false }
        let (bytes, response) = try await client.data(for: request)
        return try decode(bytes, response: response)
    }
    private func decode(_ bytes: Data, response: URLResponse) throws -> [String: Any] {
        guard bytes.count < 8_000_000, let response = response as? HTTPURLResponse else { throw NativeFailure("서버 응답을 확인하지 못했어요.") }
        guard let object = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else { throw NativeFailure("서버 응답을 읽지 못했어요. 기기의 기록은 그대로 보관해요.") }
        guard (200..<300).contains(response.statusCode) else { throw NativeHTTPError(status: response.statusCode, code: object["error"] as? String ?? "", message: object["message"] as? String ?? "연결하지 못했어요. 잠시 후 다시 시도해 주세요.") }
        return object
    }
    // Stage authentication cookies until the account's generation is checked.
    // A delayed response from an old login must never reinstall that session.
    func webSessionCookies(bearer: String) async throws -> [HTTPCookie] {
        let url = URL(string: "/api/native-account?action=web-session", relativeTo: base)!.absoluteURL
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpShouldHandleCookies = false
        request.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(base.absoluteString, forHTTPHeaderField: "Origin")
        request.httpBody = Data("{}".utf8)
        let (bytes, response) = try await client.data(for: request)
        let result = try decode(bytes, response: response)
        guard result["ok"] as? Bool == true, let http = response as? HTTPURLResponse else { throw NativeFailure("로그인 연결을 확인하지 못했어요.") }
        let fields = Dictionary(uniqueKeysWithValues: http.allHeaderFields.map { (String(describing: $0.key), String(describing: $0.value)) })
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: fields, for: base)
        guard cookies.contains(where: { ["__Host-shiftcal-google", "__Host-shiftcal-apple"].contains($0.name) && !$0.value.isEmpty && ($0.expiresDate ?? .distantFuture) > Date() }) else { throw NativeFailure("로그인 연결을 확인하지 못했어요. 다시 연결해 주세요.") }
        return cookies
    }
    func installSessionCookies(_ cookies: [HTTPCookie]) {
        for cookie in HTTPCookieStorage.shared.cookies(for: base) ?? [] where cookie.name.hasPrefix("__Host-shiftcal-") { HTTPCookieStorage.shared.deleteCookie(cookie) }
        for cookie in cookies where cookie.name.hasPrefix("__Host-shiftcal-") { HTTPCookieStorage.shared.setCookie(cookie) }
    }
    func clearCookies() { installSessionCookies([]); csrf = nil }
}
struct NativeHTTPError: LocalizedError {
    let status: Int; let code: String; let message: String
    var errorDescription: String? { NativeL10n.text(message) }
}

enum NativeCredential {
    private static var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Bundle.main.bundleIdentifier ?? "com.wnhue.workroutine", kSecAttrAccount as String: "native-account-v1"] }
    static func read() -> String? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func write(_ value: String?) throws {
        guard let value else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeFailure("로그인 정보를 지우지 못했어요. 다시 로그아웃해 주세요.") }
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { guard SecItemAdd(query.merging(attributes) { _, n in n } as CFDictionary, nil) == errSecSuccess else { throw NativeFailure("로그인 정보를 안전하게 저장하지 못했어요.") } }
        else if status != errSecSuccess { throw NativeFailure("로그인 정보를 안전하게 저장하지 못했어요.") }
    }
}

struct NativeCloudVersion: Identifiable {
    var id: String { revision }
    let revision: String; let updatedAt: String; let data: [String: Any]
    var dateLabel: String {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let parsed = parser.date(from: updatedAt) ?? ISO8601DateFormatter().date(from: updatedAt)
        guard let parsed else { return NativeL10n.text("날짜 확인 필요") }
        let formatter = DateFormatter(); formatter.locale = NativeL10n.locale; formatter.timeZone = NativeDates.calendar.timeZone; formatter.dateFormat = "yyyy.MM.dd HH:mm"
        return formatter.string(from: parsed)
    }
}

@MainActor enum NativeCloudSync {
    static func decodeVersion(_ object: [String: Any]) throws -> NativeCloudVersion {
        guard let revision = object["revision"] as? String, revision.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
              let updatedAt = object["updatedAt"] as? String, !updatedAt.isEmpty,
              let data = object["data"] as? [String: Any] else { throw NativeFailure("계정 저장 기록의 형식을 확인하지 못했어요.") }
        return NativeCloudVersion(revision: revision, updatedAt: updatedAt, data: try NativeLogic.shared.normalized(data))
    }
    static func decodeVersions(_ object: [String: Any]) throws -> [NativeCloudVersion] {
        guard let records = object["versions"] as? [[String: Any]], records.count <= 16 else { throw NativeFailure("계정 저장 기록을 읽지 못했어요. 기기 기록은 그대로 보관해요.") }
        let versions = try records.map(decodeVersion)
        guard Set(versions.map(\.revision)).count == versions.count else { throw NativeFailure("중복된 계정 저장 기록을 확인해 주세요.") }
        return versions
    }
    static func mergeAfterWrite(before: [String: Any], current: [String: Any], written: [String: Any]) throws -> (data: [String: Any], conflicts: [String]) {
        guard let merged = NativeLogic.shared.call("AccountDataCore.merge", args: [before, current, written]) as? [String: Any],
              let data = merged["data"] as? [String: Any], let conflicts = merged["conflicts"] as? [String] else { throw NativeFailure("저장하는 동안 바뀐 내용을 확인하지 못했어요.") }
        return (try NativeLogic.shared.normalized(data), conflicts)
    }
}

@MainActor final class NativeAccount: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var connected = false
    @Published var cloudConnected = false
    @Published var configuredApple = false
    @Published var calendarConnected = false
    @Published var userName = ""
    @Published var csrf: String?
    @Published var provider = "google"
    @Published var busy = false
    @Published var message = "Google Drive에 저장하면 다른 기기에서도 이어 쓸 수 있어요."
    @Published var error: String?
    @Published var choosingRecords = false
    @Published var versions: [NativeCloudVersion] = []
    private var userID = ""
    private var deletionBlocked = false
    private var token: String?
    private let api: any NativeAccountTransport
    private let persistCredential: (String?) throws -> Void
    private var authSession: ASWebAuthenticationSession?
    private weak var store: NativeStore?
    private var syncTask: Task<Void, Never>?
    private var generation = 0
    private var readyToSave = false
    private var needsAnotherSync = false
    private var endingSession = false
    private var busyOwner: UUID?
    override init() {
        api = NativeAPI.shared; persistCredential = NativeCredential.write; token = NativeCredential.read()
        super.init()
    }
    init(api: any NativeAccountTransport, credential: String?, persistCredential: @escaping (String?) throws -> Void) {
        self.api = api; self.token = credential; self.persistCredential = persistCredential
        super.init()
    }
    var accountID: String? { connected && !userID.isEmpty ? userID : nil }
    var canPublishRecords: Bool { connected && cloudConnected && readyToSave && !choosingRecords && !deletionBlocked && !endingSession && store?.owner == userID }
    var calendarExportReady: Bool { canPublishRecords && provider == "google" }
    func attach(_ store: NativeStore) { self.store = store; store.didSave = { [weak self] in self?.changed() } }
    // Only the operation that acquired the busy state may release it. Logout
    // supersedes in-flight work; its delayed completion must not unlock a new login.
    private func beginBusy() -> UUID {
        let owner = UUID(); busyOwner = owner; busy = true; return owner
    }
    private func finishBusy(_ owner: UUID) {
        guard busyOwner == owner else { return }
        busyOwner = nil; busy = false
        if !endingSession && needsAnotherSync { needsAnotherSync = false; changed() }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
    func refresh() async {
        guard !endingSession else { return }
        var current = generation
        do {
            // Read deletion metadata before establishing the cookie session: an erased
            // account may reject web-session while status still identifies the erasure.
            let status = try await rpc("status")
            guard current == generation else { return }
            do { try applyStatus(status) }
            catch { current = generation; throw error }
            current = generation
            if connected, let sessionToken = token {
                let appliedGeneration = generation
                let cookies = try await api.webSessionCookies(bearer: sessionToken)
                guard appliedGeneration == generation, token == sessionToken, !endingSession else { return }
                api.installSessionCookies(cookies)
            }
        } catch {
            guard current == generation, !endingSession else { return }
            if let failure = error as? NativeHTTPError, failure.status == 401 {
                readyToSave = false; connected = false; cloudConnected = false; calendarConnected = false
                api.clearCookies()
            }
            message = "기기에 저장한 기록은 그대로 있어요. 연결 후 다시 동기화해 주세요."; self.error = error.localizedDescription
        }
        if let apple = try? await api.request(path: "/api/apple-account?action=status", method: "GET", body: nil, bearer: nil) { configuredApple = apple["configured"] as? Bool ?? false }
    }
    private func applyStatus(_ state: [String: Any]) throws {
        guard let isConnected = state["connected"] as? Bool,
              let statusProvider = state["provider"] as? String, ["google", "apple"].contains(statusProvider) else { throw NativeFailure("계정 연결 상태를 확인하지 못했어요.") }
        let user = state["user"] as? [String: Any]
        let nextID = user?["id"] as? String ?? ""
        if isConnected && (nextID.isEmpty || state["csrf"] as? String == nil) { throw NativeFailure("로그인 정보를 확인하지 못했어요. 다시 연결해 주세요.") }
        if nextID != userID || statusProvider != provider {
            generation += 1; readyToSave = false; choosingRecords = false; versions = []
        }
        connected = isConnected
        cloudConnected = isConnected && state["cloudConnected"] as? Bool == true
        calendarConnected = isConnected && state["calendarConnected"] as? Bool == true
        provider = statusProvider
        userName = user?["email"] as? String ?? ""; userID = nextID
        csrf = state["csrf"] as? String; api.csrf = csrf
        deletionBlocked = state["deletionPending"] as? Bool == true || state["deletionCheckUnavailable"] as? Bool == true
        if !deletionBlocked, let epoch = state["deletionEpoch"] as? Double, epoch.isFinite, epoch > 0, epoch.rounded(.towardZero) == epoch,
           let id = isConnected ? user?["id"] as? String : (provider == "apple" ? state["deletedAccount"] as? String : nil) {
            try store?.applyDeletion(owner: id, epoch: epoch)
        }
        if connected && !deletionBlocked { try store?.switchAccount(to: userID) }
        if deletionBlocked || !connected || !cloudConnected { readyToSave = false }
        if deletionBlocked { message = "계정 삭제 상태를 확인하고 있어요. 기록을 자동으로 올리지 않아요." }
    }
    func login(apple: Bool = false, calendar: Bool = false) async {
        guard authSession == nil, !busy, !endingSession else { return }
        let operation = beginBusy()
        defer { finishBusy(operation) }
        do {
            let verifier = try Self.random(), state = try Self.random()
            let url = NativeOAuth.loginURL(base: api.base, apple: apple, calendar: calendar, state: state, verifier: verifier)
            let callback: URL = try await withCheckedThrowingContinuation { continuation in
                let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "shiftcal") { [weak self] callback, failure in
                    Task { @MainActor in
                        if self?.busyOwner == operation { self?.authSession = nil }
                        if let failure { continuation.resume(throwing: failure) }
                        else if let callback { continuation.resume(returning: callback) }
                        else { continuation.resume(throwing: NativeFailure("로그인을 완료하지 못했어요.")) }
                    }
                }
                session.presentationContextProvider = self; self.authSession = session
                if !session.start() { self.authSession = nil; continuation.resume(throwing: NativeFailure("로그인 창을 열지 못했어요.")) }
            }
            guard busyOwner == operation, !endingSession else { return }
            let ticket = try NativeOAuth.ticket(from: callback, expectedState: state)
            let response = try await api.request(path: "/api/native-account?action=exchange", method: "POST", body: ["ticket": ticket, "state": state, "verifier": verifier], bearer: nil)
            guard busyOwner == operation, !endingSession else { return }
            guard let value = response["token"] as? String else { throw NativeFailure("로그인 응답을 확인하지 못했어요.") }
            api.clearCookies(); try persistCredential(value); token = value; generation += 1; readyToSave = false
            await refresh()
            if connected, token == value, busyOwner == operation, !endingSession { await synchronize(whileBusy: true) }
        } catch let failure as ASWebAuthenticationSessionError where failure.code == .canceledLogin { }
        catch NativeOAuthFailure.cancelled { }
        catch { if busyOwner == operation { self.error = error.localizedDescription } }
    }
    private static func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw NativeFailure("안전한 로그인 요청을 준비하지 못했어요. 다시 시도해 주세요.") }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
    private func rpc(_ action: String, body: [String: Any] = [:]) async throws -> [String: Any] {
        if let token { return try await api.request(path: "/api/native-account?action=" + action, method: "POST", body: body, bearer: token) }
        return try await api.request(path: "/api/account?action=" + action, method: action == "status" ? "GET" : "POST", body: body, bearer: nil)
    }
    private func changed() {
        guard connected, cloudConnected, readyToSave, !choosingRecords, !deletionBlocked, !endingSession, store?.owner == userID else { return }
        if busy { needsAnotherSync = true; return }
        syncTask?.cancel(); message = "이 기기에 저장했어요. 계정에도 곧 저장해요."
        syncTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }; await self?.synchronize()
        }
    }
    func synchronize(whileBusy: Bool = false) async {
        guard let store, (!busy || whileBusy), !choosingRecords, !endingSession else { return }
        let operation = whileBusy ? nil : beginBusy()
        defer { if let operation { finishBusy(operation) } }
        let sessionGeneration = generation
        do {
            let state = try await rpc("status")
            guard sessionGeneration == generation else { return }
            try applyStatus(state)
            guard sessionGeneration == generation, connected, cloudConnected, !deletionBlocked else { return }
            let result = try await rpc("cloud-read")
            guard sessionGeneration == generation else { return }
            versions = try NativeCloudSync.decodeVersions(result)
            let local = try NativeLogic.shared.normalized(store.data)
            if versions.count > 1 { choosingRecords = true; readyToSave = false; message = "다른 기기에서 바꾼 기록이 있어요. 이어 쓸 기록을 선택해 주세요."; return }
            if let remote = versions.first {
                if NativeLogic.shared.equal(local, remote.data) || !NativeLogic.shared.meaningful(local) {
                    try store.adopt(remote.data, owner: userID, parents: [remote.revision], synced: true)
                } else if store.owner == userID, let baseline = store.baseline,
                          let merge = NativeLogic.shared.call("AccountDataCore.merge", args: [baseline, local, remote.data]) as? [String: Any],
                          (merge["conflicts"] as? [String] ?? ["unknown"]).isEmpty,
                          let merged = merge["data"] as? [String: Any] {
                    if NativeLogic.shared.equal(merged, remote.data) { try store.adopt(merged, owner: userID, parents: [remote.revision], synced: true) }
                    else { try await push(merged, parents: [remote.revision], generation: sessionGeneration) }
                } else { choosingRecords = true; readyToSave = false; message = "기기와 계정의 기록이 달라요. 이어 쓸 기록을 골라 주세요."; return }
            } else if NativeLogic.shared.meaningful(local) {
                if store.owner == userID && readyToSave { try await push(local, parents: [], generation: sessionGeneration) }
                else { choosingRecords = true; message = "이 기기의 기록을 계정에 저장할까요?"; return }
            } else { try store.adopt(local, owner: userID, parents: [], synced: true) }
            guard sessionGeneration == generation, !choosingRecords, !endingSession else { return }
            readyToSave = true
            if let baseline = store.baseline, !NativeLogic.shared.equal(store.data, baseline) {
                needsAnotherSync = true; message = "저장하는 동안 바꾼 내용도 곧 저장해요."
            } else { message = "계정과 기기의 기록이 같아요." }
        } catch {
            guard sessionGeneration == generation else { return }
            self.error = error.localizedDescription; message = "기기의 기록은 그대로 보관했어요. 다시 동기화해 주세요."
            if let failure = error as? NativeHTTPError {
                if failure.status == 401 { readyToSave = false; connected = false; cloudConnected = false; calendarConnected = false }
                if failure.code == "CLOUD_CONFLICT" { readyToSave = false; choosingRecords = false; versions = []; message = "다른 기기의 저장 내용이 바뀌었어요. 지금 동기화를 눌러 다시 확인해 주세요." }
            }
        }
    }
    private func push(_ records: [String: Any], parents: [String], generation current: Int, before: [String: Any]? = nil) async throws {
        guard let store else { return }
        let revision = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let normalized = try NativeLogic.shared.normalized(records)
        let localAtStart = try NativeLogic.shared.normalized(before ?? store.data)
        let result = try await rpc("cloud-write", body: ["revision": revision, "parents": parents, "data": normalized])
        guard current == generation else { return }
        let written = try NativeCloudSync.decodeVersion(result)
        guard written.revision == revision, NativeLogic.shared.equal(written.data, normalized) else { throw NativeFailure("계정 저장 결과를 확인하지 못했어요. 다시 동기화해 주세요.") }
        // Apply remote additions as well as edits made during this request. Setting
        // only the baseline would turn those remote additions into local deletions.
        let merged = try NativeCloudSync.mergeAfterWrite(before: localAtStart, current: store.data, written: written.data)
        if !merged.conflicts.isEmpty {
            versions = [written]; choosingRecords = true; readyToSave = false
            message = "저장하는 동안 같은 내용이 바뀌었어요. 이어 쓸 기록을 골라 주세요."
            return
        }
        try store.adopt(merged.data, owner: userID, parents: [written.revision], synced: false)
        try store.markSynced(written.data, revision: written.revision, owner: userID)
        needsAnotherSync = !NativeLogic.shared.equal(merged.data, written.data)
    }
    func choose(_ version: NativeCloudVersion?) async {
        guard let store, connected, !busy, !deletionBlocked, !endingSession else { return }
        let operation = beginBusy()
        defer { finishBusy(operation) }
        let current = generation, expectedID = userID, localAtChoice = store.data
        do {
            let status = try await rpc("status")
            guard current == generation else { return }
            try applyStatus(status)
            guard current == generation, connected, cloudConnected, userID == expectedID, !deletionBlocked else { return }
            let records = version?.data ?? localAtChoice
            choosingRecords = false
            // Even a single selected cloud record must be written with its current
            // parents so another device's intervening edit cannot be overwritten.
            try await push(records, parents: versions.map(\.revision), generation: current, before: localAtChoice)
            guard current == generation, !choosingRecords else { return }
            readyToSave = true; message = "선택한 기록으로 이어 쓸게요."
        } catch {
            guard current == generation else { return }
            self.error = error.localizedDescription
            if let failure = error as? NativeHTTPError, failure.code == "CLOUD_CONFLICT" {
                choosingRecords = false; readyToSave = false; versions = []
                message = "계정 기록이 다시 바뀌었어요. 지금 동기화를 눌러 최신 기록을 확인해 주세요."
            } else { choosingRecords = true }
        }
    }
    func logout() async {
        guard !endingSession else { return }
        let operation = beginBusy(); endingSession = true
        defer { endingSession = false; finishBusy(operation) }
        generation += 1; syncTask?.cancel(); readyToSave = false; choosingRecords = false; needsAnotherSync = false; versions = []
        authSession?.cancel(); authSession = nil
        do {
            try persistCredential(nil)
            do { try store?.disconnect() }
            catch { try? persistCredential(token); throw error }
        } catch { self.error = error.localizedDescription; return }
        _ = try? await api.request(path: "/api/account?action=logout", method: "POST", body: nil, bearer: nil)
        token = nil; api.clearCookies()
        connected = false; cloudConnected = false; calendarConnected = false; userName = ""; userID = ""; message = "로그아웃했어요. 계정에 저장한 기록은 남아 있어요."
    }
    func deleteAccount() async {
        guard connected, !busy, !endingSession else { return }
        let operation = beginBusy(), current = generation
        readyToSave = false; syncTask?.cancel(); defer { finishBusy(operation) }
        do {
            let id = userID, result = try await rpc("cloud-delete")
            guard current == generation, !endingSession else { return }
            guard result["ok"] as? Bool == true, let epoch = result["deletionEpoch"] as? Double,
                  epoch.isFinite, epoch > 0, epoch.rounded(.towardZero) == epoch else { throw NativeFailure("삭제 완료를 확인하지 못했어요. 다시 시도해 주세요.") }
            try store?.applyDeletion(owner: id, epoch: epoch)
            await logout(); message = "계정과 계정에 저장한 기록을 삭제했어요."
        } catch { if current == generation { self.error = error.localizedDescription; message = "삭제를 완료하지 못했어요. 다시 시도해 주세요." } }
    }
}

struct NativeAccountView: View {
    @EnvironmentObject var account: NativeAccount
    @State private var deleting = false
    var body: some View {
        List {
            Section {
                Label(account.connected ? account.userName : NativeL10n.text("기록을 안전하게 보관해요"), systemImage: "person.crop.circle")
                Text(NativeL10n.text(account.message)).font(.subheadline).foregroundStyle(.secondary)
                if account.busy { ProgressView() }
                if !account.connected || !account.cloudConnected {
                    Button("Google로 로그인하고 저장하기") { Task { await account.login() } }.disabled(account.busy)
                    if account.configuredApple { Button("Apple로 계속하기") { Task { await account.login(apple: true) } }.disabled(account.busy) }
                    else { Text("Apple 로그인은 현재 사용할 수 없어요. 계정 없이도 이 기기에 기록을 저장할 수 있어요.").font(.caption).foregroundStyle(.secondary) }
                }
                if account.connected {
                    Button("지금 동기화") { Task { await account.synchronize() } }.disabled(account.busy || !account.cloudConnected)
                    Button("로그아웃") { Task { await account.logout() } }.disabled(account.busy)
                }
            } footer: { Text("근무표·메모·급여·연차 설정을 계정에 저장해요. Google의 다른 파일은 읽지 않아요.") }
            if account.choosingRecords {
                Section("어떤 기록으로 이어 쓸까요?") {
                    ForEach(account.versions) { version in
                        Button("계정 기록 불러오기 · " + version.dateLabel) { Task { await account.choose(version) } }
                    }
                    Button("이 기기의 기록을 계정에 저장") { Task { await account.choose(nil) } }
                    Text("선택하기 전까지 기록을 자동으로 덮어쓰지 않아요.").font(.caption).foregroundStyle(.secondary)
                }.disabled(account.busy)
            }
            if account.connected {
                Section { Button("계정 삭제", role: .destructive) { deleting = true }.disabled(account.busy) }
            }
        }.navigationTitle("내 계정")
        .task { await account.refresh() }
        .confirmationDialog("계정과 저장한 기록을 삭제할까요?", isPresented: $deleting, titleVisibility: .visible) {
            Button("계정 삭제", role: .destructive) { Task { await account.deleteAccount() } }
        } message: { Text("계정에 저장한 근무표·메모·설정, 본인이 쓴 분실물 글과 공유 링크를 삭제해요. 외부로 내보낸 파일과 Google 캘린더 일정은 별도로 남아요.") }
        .alert("확인해 주세요", isPresented: Binding(get: { account.error != nil }, set: { if !$0 { account.error = nil } })) { Button("확인") { account.error = nil } } message: { Text(NativeL10n.text(account.error ?? "")) }
    }
}
