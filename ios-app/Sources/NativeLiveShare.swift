import SwiftUI

/// Existing links may be refreshed automatically; only create() can publish a new link.
@MainActor final class NativeLiveShare: ObservableObject {
    static let shared = NativeLiveShare()
    static let preferenceKey = "shift_live_links_v2"
    @Published private(set) var busy = false
    @Published private(set) var message: String?
    @Published private(set) var error: String?
    @Published private(set) var activeOwner: String?
    private var queued: Task<Void, Never>?
    private var needsAnotherRefresh = false
    private var forceNextRefresh = false
    private var lastPublished: [String: String] = [:]
    private weak var latestStore: NativeStore?
    private weak var latestAccount: NativeAccount?

    static func monthKey(_ date: Date) -> String { String(NativeDates.key(date).prefix(7)) }
    static func recordKey(month: Date, group: String) -> String { group + "/" + monthKey(month) }
    static func validID(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
    static func validKey(_ value: String) -> Bool { value.range(of: "^[ABC]/20[0-9]{2}-(0[1-9]|1[0-2])$", options: .regularExpression) != nil }
    static func registry(_ store: NativeStore) -> [String: [String: String]] {
        guard let text = store.preferences[preferenceKey], let bytes = text.data(using: .utf8), let raw = try? JSONDecoder().decode([String: [String: String]].self, from: bytes) else { return [:] }
        return raw.mapValues { $0.filter { validKey($0.key) && validID($0.value) } }
    }
    static func link(month: Date, group: String, store: NativeStore, account: NativeAccount) -> URL? {
        guard account.connected, let owner = account.accountID, store.owner == owner,
              let id = registry(store)[owner]?[recordKey(month: month, group: group)] else { return nil }
        return url(id)
    }
    static func url(_ id: String) -> URL? {
        guard validID(id), var components = URLComponents(url: NativeAPI.shared.base.appendingPathComponent("shared-schedule.html"), resolvingAgainstBaseURL: false) else { return nil }
        components.fragment = "live=" + id
        return components.url
    }
    static func snapshot(month: Date, group: String, store: NativeStore) throws -> [String: Any] {
        guard ["A", "B", "C"].contains(group) else { throw NativeFailure("공유할 근무조를 확인해 주세요.") }
        let key = monthKey(month)
        guard validKey(group + "/" + key) else { throw NativeFailure("공유할 월을 확인해 주세요.") }
        let days = NativeCalendarExportModel.dates(in: month).map { ["type": NativeShift.day($0, group: group, store: store).type] }
        guard (28...31).contains(days.count) else { throw NativeFailure("공유할 근무표 날짜를 확인해 주세요.") }
        return ["group": group, "month": key, "days": days]
    }
    private func fingerprint(_ payload: [String: Any]) -> String {
        let types = (payload["days"] as? [[String: String]] ?? []).map { $0["type"] ?? "" }.joined(separator: ",")
        return (payload["group"] as? String ?? "") + "/" + (payload["month"] as? String ?? "") + ":" + types
    }
    private func saveLinks(_ links: [String: String], owner: String, store: NativeStore) throws {
        var all = Self.registry(store); all[owner] = links
        let bytes = try JSONEncoder().encode(all)
        guard let text = String(data: bytes, encoding: .utf8) else { throw NativeFailure("공유 링크를 저장하지 못했어요.") }
        store.preferences[Self.preferenceKey] = text
        guard store.save() else { throw NativeFailure("공유 상태는 서버에 반영됐지만 이 기기에 링크를 저장하지 못했어요. " + (store.error ?? "")) }
    }
    private func request(method: String, id: String?, payload: [String: Any]? = nil) async throws -> [String: Any] {
        if let id, !Self.validID(id) { throw NativeFailure("공유 링크를 확인해 주세요.") }
        return try await NativeAPI.shared.request(path: "/api/live-schedule" + (id.map { "?id=" + $0 } ?? ""), method: method, body: payload)
    }
    private func canPublish(owner: String, store: NativeStore, account: NativeAccount) -> Bool {
        account.canPublishRecords && account.accountID == owner && store.owner == owner
    }
    private func finish(store: NativeStore, account: NativeAccount) {
        busy = false
        if needsAnotherRefresh {
            needsAnotherRefresh = false
            let force = forceNextRefresh; forceNextRefresh = false
            queue(store: latestStore ?? store, account: latestAccount ?? account, force: force)
        }
    }

    func create(month: Date, group: String, store: NativeStore, account: NativeAccount) async {
        guard !busy, let owner = account.accountID, canPublish(owner: owner, store: store, account: account) else { error = "계정 기록을 먼저 동기화한 다음 공유해 주세요."; return }
        queued?.cancel(); busy = true; activeOwner = owner; error = nil; message = "선택한 달의 공유 링크를 준비하고 있어요."
        defer { finish(store: store, account: account) }
        do {
            let payload = try Self.snapshot(month: month, group: group, store: store), key = Self.recordKey(month: month, group: group)
            var links = Self.registry(store)[owner] ?? [:]
            let old = links[key]
            let result: [String: Any]
            do { result = try await request(method: "POST", id: old, payload: payload) }
            catch let failure as NativeHTTPError where old != nil && [403, 404].contains(failure.status) {
                guard canPublish(owner: owner, store: store, account: account) else { throw NativeFailure("계정이 변경됐어요. 현재 계정에서 다시 확인해 주세요.") }
                links.removeValue(forKey: key); try saveLinks(links, owner: owner, store: store)
                result = try await request(method: "POST", id: nil, payload: payload)
            }
            guard let id = result["id"] as? String, Self.validID(id) else { throw NativeFailure("공유 링크 응답을 확인하지 못했어요. 다시 시도해 주세요.") }
            // Keep the returned reference under its original account even if the account changed in flight.
            var latest = Self.registry(store)[owner] ?? [:]; latest[key] = id
            try saveLinks(latest, owner: owner, store: store)
            lastPublished[owner + "/" + key + "/" + id] = fingerprint(payload)
            guard canPublish(owner: owner, store: store, account: account) else { message = nil; return }
            message = old == nil ? "공유 링크를 만들었어요. 아래에서 링크를 보내 주세요." : "같은 링크에 최신 근무표를 반영했어요."
            if let current = try? Self.snapshot(month: month, group: group, store: store), fingerprint(current) != fingerprint(payload) { needsAnotherRefresh = true }
        } catch { self.error = error.localizedDescription; message = nil }
    }

    func stop(month: Date, group: String, store: NativeStore, account: NativeAccount) async {
        guard !busy, account.connected, let owner = account.accountID, store.owner == owner else { error = "공유한 계정으로 로그인해 주세요."; return }
        queued?.cancel(); busy = true; activeOwner = owner; error = nil; message = "공유를 종료하고 있어요."
        defer { finish(store: store, account: account) }
        let key = Self.recordKey(month: month, group: group)
        guard let id = Self.registry(store)[owner]?[key] else { message = "이 달은 공유 중이 아니에요."; return }
        do {
            do { let result = try await request(method: "DELETE", id: id); guard result["ok"] as? Bool == true else { throw NativeFailure("공유 종료를 확인하지 못했어요. 다시 시도해 주세요.") } }
            catch let failure as NativeHTTPError where failure.status == 404 { }
            var links = Self.registry(store)[owner] ?? [:]
            if links[key] == id { links.removeValue(forKey: key); try saveLinks(links, owner: owner, store: store) }
            lastPublished.removeValue(forKey: owner + "/" + key + "/" + id)
            message = "공유를 종료했어요. 이전 링크는 사용할 수 없어요."
        } catch { self.error = error.localizedDescription; message = nil }
    }

    /// Call on record changes and when the app becomes active. This method never creates a link.
    func queue(store: NativeStore, account: NativeAccount, force: Bool = false) {
        latestStore = store; latestAccount = account
        guard let owner = account.accountID, canPublish(owner: owner, store: store, account: account),
              !(Self.registry(store)[owner] ?? [:]).isEmpty else { queued?.cancel(); return }
        if busy { needsAnotherRefresh = true; forceNextRefresh = forceNextRefresh || force; return }
        queued?.cancel()
        queued = Task { [weak self, weak store, weak account] in
            do { try await Task.sleep(for: .milliseconds(800)) } catch { return }
            guard let self, let store, let account, !Task.isCancelled else { return }
            await refresh(store: store, account: account, force: force)
        }
    }
    func refresh(store: NativeStore, account: NativeAccount, force: Bool = false) async {
        guard !busy, let owner = account.accountID, canPublish(owner: owner, store: store, account: account) else { return }
        let group = store.group
        let links = (Self.registry(store)[owner] ?? [:]).filter { $0.key.hasPrefix(group + "/") }
        guard !links.isEmpty else { return }
        busy = true; activeOwner = owner
        defer { finish(store: store, account: account) }
        var updated = 0
        do {
            for (key, id) in links.sorted(by: { $0.key < $1.key }) {
                guard canPublish(owner: owner, store: store, account: account), store.group == group,
                      Self.registry(store)[owner]?[key] == id else { return }
                let monthText = String(key.dropFirst(2))
                guard let month = NativeDates.date(monthText + "-01") else { continue }
                let payload = try Self.snapshot(month: month, group: group, store: store)
                let signature = fingerprint(payload), cacheKey = owner + "/" + key + "/" + id
                if !force && lastPublished[cacheKey] == signature { continue }
                do {
                    let result = try await request(method: "POST", id: id, payload: payload)
                    guard result["id"] as? String == id else { throw NativeFailure("공유 갱신 결과를 확인하지 못했어요.") }
                    lastPublished[cacheKey] = signature; updated += 1
                } catch let failure as NativeHTTPError where [403, 404].contains(failure.status) {
                    // A revoked/missing link is forgotten. Auto-refresh must never replace it with a new link.
                    var remaining = Self.registry(store)[owner] ?? [:]
                    if remaining[key] == id { remaining.removeValue(forKey: key); try saveLinks(remaining, owner: owner, store: store) }
                    lastPublished.removeValue(forKey: cacheKey)
                }
            }
            if updated > 0 && canPublish(owner: owner, store: store, account: account) { message = "공유 근무표 \(updated)개를 최신 상태로 갱신했어요."; error = nil }
        } catch { if account.accountID == owner { self.error = "공유 갱신 실패 · " + error.localizedDescription } }
    }
}

struct NativeLiveShareView: View {
    let month: Date
    let group: String
    @EnvironmentObject private var store: NativeStore
    @EnvironmentObject private var account: NativeAccount
    @ObservedObject private var live = NativeLiveShare.shared
    @State private var stopping = false
    @State private var copied = false
    private var link: URL? { NativeLiveShare.link(month: month, group: group, store: store, account: account) }
    private var statusBelongsToAccount: Bool { live.activeOwner == account.accountID }
    var body: some View {
        List {
            Section {
                Label("근무 변경이 같은 링크에 반영돼요", systemImage: "link").font(.headline).padding(.vertical, 7)
                LabeledContent("공유할 근무표", value: "\(NativeDates.monthTitle(month)) · \(group)조")
                Text("선택한 조·월의 근무만 공유해요. 링크를 가진 사람은 볼 수 있어요. 급여와 메모는 포함하지 않아요.").font(.subheadline).foregroundStyle(.secondary)
                Text("이 앱이 열려 있고 계정 기록을 사용할 수 있을 때 변경 내용을 반영해요.").font(.caption).foregroundStyle(.secondary)
            }
            Section {
                if account.canPublishRecords {
                    Button { Task { await live.create(month: month, group: group, store: store, account: account) } } label: {
                        HStack { Label(link == nil ? "공유 링크 만들기" : "같은 링크에 최신 근무표 반영", systemImage: "link"); Spacer(); if live.busy { ProgressView() } }
                    }.disabled(live.busy)
                } else {
                    Text(NativeL10n.text(account.connected ? "설정에서 사용할 계정 기록을 선택하거나 동기화를 마친 다음 공유해 주세요." : "설정에서 Google 또는 Apple 계정으로 로그인하면 링크를 공유할 수 있어요.")).font(.subheadline).foregroundStyle(.secondary)
                }
                if let link {
                    ShareLink(item: link, subject: Text("근무 루틴 근무표"), message: Text("\(NativeDates.monthTitle(month)) \(group)조 근무표")) { Label("링크 공유", systemImage: "square.and.arrow.up") }
                    Button { UIPasteboard.general.url = link; copied = true } label: { Label(copied ? "링크를 복사했어요" : "링크 복사", systemImage: copied ? "checkmark" : "doc.on.doc") }
                    Link(destination: link) { Label("공유 근무표 확인", systemImage: "arrow.up.right.square") }
                    Text(link.absoluteString).font(.caption2).foregroundStyle(.secondary).textSelection(.enabled)
                }
            }
            if statusBelongsToAccount, let message = live.message { Section { Label(NativeL10n.text(message), systemImage: live.busy ? "arrow.triangle.2.circlepath" : "checkmark.circle").font(.subheadline).foregroundStyle(live.busy ? Color.secondary : Color.green) } }
            if statusBelongsToAccount, let error = live.error { Section { Label(NativeL10n.text(error), systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red) } }
            Section {
                DisclosureGroup("공유할 근무 미리보기") {
                    ForEach(NativeCalendarExportModel.dates(in: month), id: \.self) { date in
                        let day = NativeShift.day(date, group: group, store: store)
                        LabeledContent(NativeServiceDates.label(NativeDates.key(date)), value: NativeShift.label(day.type)).font(.subheadline)
                    }
                }
            }
            if link != nil { Section { Button("이 달 공유 끄기", role: .destructive) { stopping = true }.disabled(live.busy) } footer: { Text("공유를 끄면 이전 링크를 가진 사람도 근무표를 볼 수 없어요.") } }
        }
        .navigationTitle("링크로 근무표 공유")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("이 달의 공유를 종료할까요? 이전 링크는 더 이상 사용할 수 없어요.", isPresented: $stopping, titleVisibility: .visible) {
            Button("공유 종료", role: .destructive) { Task { await live.stop(month: month, group: group, store: store, account: account) } }
            Button("취소", role: .cancel) {}
        }
        .onChange(of: link) { _, _ in copied = false }
    }
}
