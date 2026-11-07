import SwiftUI

/// Exports only this app's shift events to its owned calendar. It never imports external events.
@MainActor final class NativeCalendarExportModel: ObservableObject {
    @Published var busy = false
    @Published var message: String?
    @Published var error: String?
    @Published var completed = 0
    @Published var total = 0
    @Published var skipped: [String] = []

    static func dates(in month: Date) -> [Date] {
        let c = NativeDates.calendar
        guard let first = c.date(from: c.dateComponents([.year, .month], from: month)), let count = c.range(of: .day, in: .month, for: first)?.count else { return [] }
        return (0..<count).compactMap { c.date(byAdding: .day, value: $0, to: first) }
    }
    static func title(date: Date, group: String, store: NativeStore) -> String {
        let key = NativeDates.key(date), shift = NativeShift.day(date, group: group, store: store)
        let override = store.object("shift_overrides_" + group)[key] as? String
        let base = NativeShift.baseType(date, group: group)
        let original = shift.origType ?? (override == "FORCED_OFF" ? base : "")
        let originalLabel = original == "NIGHT" ? "야간" : original == "DAY" ? "주간" : ""
        let label: String
        switch shift.type {
        case "NO_OT": label = original == "NIGHT" ? "야간" : "주간"
        case "SPECIAL_DAY_NO_OT": label = "주특 잔업X"
        case "SPECIAL_NIGHT_NO_OT": label = "야특 잔업X"
        case "UNPAID_OFF": label = "무급 휴무"
        case "UNPAID_HALF_PRE": label = "무급 반차(전)"
        case "UNPAID_HALF_POST": label = "무급 반차(후)"
        default: label = NativeShift.label(shift.type)
        }
        var result = group + "조 " + label
        if !originalLabel.isEmpty && shift.type != "NO_OT" { result += " · " + originalLabel }
        if override == nil && !NativeShift.shutdowns.contains(key) && (base == "OFF" || NativeShift.holidayName(date) == nil) {
            let anchor = NativeDates.date("2026-09-09")!, target = NativeDates.calendar.startOfDay(for: date)
            var distance = NativeDates.calendar.dateComponents([.day], from: anchor, to: target).day ?? 0
            for key in NativeShift.shutdowns {
                guard let closed = NativeDates.date(key) else { continue }
                if target >= anchor && closed >= anchor && closed < target { distance -= 1 }
                else if target < anchor && closed >= target && closed < anchor { distance += 1 }
            }
            let index = ((distance + (["C": 0, "B": 4, "A": 8][group] ?? 0)) % 12 + 12) % 12
            let day = index < 4 ? index + 1 : index < 6 ? index - 3 : index < 10 ? index - 5 : index - 9
            result += " \(day)일차"
        }
        let suffix: String?
        switch shift.type {
        case "NO_OT", "HALF_POST", "UNPAID_HALF_POST": suffix = "O.T해제"
        case "HALF_PRE", "UNPAID_HALF_PRE": suffix = "잔업 2.5h"
        case "SPECIAL_DAY_NO_OT", "SPECIAL_NIGHT_NO_OT": suffix = "잔업X"
        default: suffix = nil
        }
        if let suffix { result += " · " + suffix }
        return result
    }
    static func desired(date: Date, group: String, id: String, store: NativeStore) -> [String: Any] {
        let key = NativeDates.key(date), shift = NativeShift.day(date, group: group, store: store)
        let override = store.object("shift_overrides_" + group)[key] as? String ?? "BASE"
        let memo = store.object("shift_day_memos")[key] as? String ?? ""
        let color: Any = NativeLogic.shared.call("GoogleSyncCore.colorId", args: [["type": shift.type, "origType": shift.origType as Any? ?? NSNull()]]) ?? NSNull()
        return ["id": id, "summary": title(date: date, group: group, store: store), "description": "Shift_cal 근무 일정\n메모:\n" + memo,
                "colorId": color, "start": ["date": key], "end": ["date": NativeDates.key(NativeDates.calendar.date(byAdding: .day, value: 1, to: date)!)],
                "extendedProperties": ["private": ["app": "shift_cal_v2", "group": group, "kind": "shift", "originDate": key, "override": override]]]
    }
    private func api(_ action: String, _ body: [String: Any]) async throws -> [String: Any] {
        try await NativeAPI.shared.request(path: "/api/google-calendar?action=" + action, method: "POST", body: body)
    }
    private func state(_ store: NativeStore, key: String) -> [String: Any] {
        guard let value = store.preferences[key], let bytes = value.data(using: .utf8), let state = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return ["outboundOnlyVersion": 1, "groups": [String: Any]()] }
        return state
    }
    private func save(_ state: [String: Any], key: String, store: NativeStore) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: state), let text = String(data: bytes, encoding: .utf8) else { return }
        store.setPreference(key, text)
    }
    func send(month: Date, store: NativeStore, account: NativeAccount) async {
        guard !busy, account.calendarExportReady, account.calendarConnected else { error = "계정 기록과 Google 캘린더 연결을 먼저 확인해 주세요."; return }
        busy = true; error = nil; message = "보낼 근무표와 연결 상태를 확인하고 있어요."; completed = 0; total = 0; skipped = []
        defer { busy = false }
        let group = store.group, snapshot = store.data
        var wrote = 0
        do {
            let status = try await NativeAPI.shared.request(path: "/api/google-calendar?action=status")
            guard status["connected"] as? Bool == true, status["calendarConnected"] as? Bool == true, let user = status["user"] as? [String: Any], let userID = user["id"] as? String, store.owner == userID else { throw NativeFailure("Google 캘린더 계정과 현재 기록의 계정이 같아야 해요. 설정에서 연결을 확인해 주세요.") }
            func current() -> Bool { account.calendarExportReady && account.calendarConnected && store.group == group && store.owner == userID && NativeLogic.shared.equal(snapshot, store.data) }
            guard current() else { throw NativeFailure("계정이나 기록이 변경됐어요. 내용을 확인한 뒤 다시 보내 주세요.") }
            let stateKey = "shift_google_sync_v2_" + userID
            var root = state(store, key: stateKey)
            root["outboundOnlyVersion"] = 1
            var groups = root["groups"] as? [String: Any] ?? [:]
            var settings = groups[group] as? [String: Any] ?? [:]
            var records = settings["records"] as? [String: [String: Any]] ?? [:]
            var excluded = settings["excluded"] as? [String: Any] ?? [:]
            var calendarBody: [String: Any] = ["group": group]
            if let existing = settings["calendarId"] as? String, !existing.isEmpty { calendarBody["calendarId"] = existing }
            let calendarResponse = try await api("calendar", calendarBody)
            guard current(), let calendar = calendarResponse["calendar"] as? [String: Any], let calendarID = calendar["id"] as? String else { throw NativeFailure("캘린더 연결을 확인하지 못했어요. 다시 시도해 주세요.") }
            if settings["calendarId"] as? String != calendarID { records = [:]; excluded = [:] }
            settings["calendarId"] = calendarID; settings["enabled"] = true; settings["records"] = records; settings["excluded"] = excluded
            func persist() { settings["records"] = records; groups[group] = settings; root["groups"] = groups; save(root, key: stateKey, store: store) }
            persist()
            let dates = Self.dates(in: month)
            guard let first = dates.first, let last = dates.last else { throw NativeFailure("보낼 날짜를 확인해 주세요.") }
            let start = NativeDates.key(first), end = NativeDates.key(NativeDates.calendar.date(byAdding: .day, value: 1, to: last)!)
            let known = records.filter { $0.key >= start && $0.key < end }.compactMap { $0.value["id"] as? String }
            message = "앱에서 만든 Google 근무표를 확인하고 있어요."
            let response = try await api("read", ["group": group, "calendarId": calendarID, "start": start, "end": end, "knownIds": Array(Set(known)).sorted()])
            guard current() else { throw NativeFailure("기록이 변경됐어요. 다시 보내면 최신 내용을 반영해요.") }
            var byDate: [String: [[String: Any]]] = [:]
            for event in response["items"] as? [[String: Any]] ?? [] {
                if let key = NativeLogic.shared.call("GoogleSyncCore.origin", args: [event]) as? String, key >= start && key < end { byDate[key, default: []].append(event) }
            }
            var operations: [(key: String, value: [String: Any], body: [String: Any])] = []
            var unchanged = 0
            for date in dates {
                let key = NativeDates.key(date)
                if (excluded[key] as? Bool == true) || (excluded[key] as? Int ?? 0) != 0 { skipped.append(key + " · 이전에 제외한 날짜"); continue }
                let matches = byDate[key] ?? [], live = matches.filter { $0["status"] as? String != "cancelled" }
                if live.count > 1 { skipped.append(key + " · 중복 일정"); continue }
                let remote = live.first ?? matches.first { ($0["id"] as? String) == (records[key]?["id"] as? String) } ?? matches.first
                let replace = remote != nil || records[key] != nil
                let fallbackID = "sc2" + group.lowercased() + key.replacingOccurrences(of: "-", with: "") + (replace ? "r" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(16) : "")
                let id = remote?["status"] as? String != "cancelled" ? remote?["id"] as? String ?? fallbackID : fallbackID
                let desired = Self.desired(date: date, group: group, id: id, store: store)
                let local: [String: Any] = ["override": store.object("shift_overrides_" + group)[key] as? String ?? "BASE", "memo": store.object("shift_day_memos")[key] as? String ?? ""]
                let action = NativeLogic.shared.call("GoogleSyncCore.planOutbound", args: [remote as Any? ?? NSNull(), desired]) as? String ?? "blocked"
                if action == "blocked" { skipped.append(key + " · 반복 일정"); continue }
                if action == "adopt", let remote { records[key] = record(remote, local: local); unchanged += 1; continue }
                var op: [String: Any] = ["type": action, "id": id]
                if action == "color" { op["colorId"] = desired["colorId"] } else { op["event"] = desired }
                if let remote, remote["status"] as? String != "cancelled" {
                    guard let etag = remote["etag"] as? String, !etag.isEmpty else { skipped.append(key + " · 변경 확인 정보 없음"); continue }
                    op["etag"] = etag
                }
                operations.append((key, local, op))
            }
            persist(); total = operations.count
            for index in stride(from: 0, to: operations.count, by: 10) {
                guard current() else { throw NativeFailure("기록이 변경되어 보내기를 멈췄어요. 최신 내용을 확인한 뒤 다시 보내 주세요.") }
                let batch = Array(operations[index..<min(index + 10, operations.count)])
                message = "근무표를 보내고 있어요. \(completed)/\(total)"
                let result = try await api("write", ["group": group, "calendarId": calendarID, "operations": batch.map(\.body)])
                guard current() else { throw NativeFailure("계정이나 기록이 변경됐어요. 보낸 결과를 확인한 뒤 다시 시도해 주세요.") }
                var failures: [String] = [], responded: Set<String> = []
                for row in result["results"] as? [[String: Any]] ?? [] {
                    guard let id = row["id"] as? String, let sent = batch.first(where: { $0.body["id"] as? String == id }) else { continue }
                    responded.insert(id)
                    if row["ok"] as? Bool == true, let event = row["event"] as? [String: Any] { records[sent.key] = record(event, local: sent.value); completed += 1; wrote += 1 }
                    else { failures.append(row["message"] as? String ?? "다른 곳에서 일정이 변경됐어요. 최신 상태를 다시 확인해 주세요.") }
                }
                persist()
                if responded.count != batch.count { failures.append("일부 일정의 응답을 확인하지 못했어요. 다시 보내면 기존 일정을 확인한 뒤 이어서 처리해요.") }
                if !failures.isEmpty { throw NativeFailure(failures.joined(separator: "\n")) }
            }
            settings["lastSync"] = ISO8601DateFormatter().string(from: Date()); persist()
            message = "\(NativeDates.monthTitle(month)) \(group)조 보내기 완료 · \(wrote)개 반영, \(unchanged)개 동일" + (skipped.isEmpty ? "" : " · \(skipped.count)개 제외")
        } catch { self.error = (wrote > 0 ? "\(wrote)개를 반영한 뒤 멈췄어요. " : "") + error.localizedDescription; message = nil }
    }
    private func record(_ remote: [String: Any], local: [String: Any]) -> [String: Any] {
        var value: [String: Any] = ["local": local]
        value["id"] = remote["id"]; value["etag"] = remote["etag"]
        value["signature"] = NativeLogic.shared.call("GoogleSyncCore.signature", args: [remote])
        return value
    }
}

struct NativeCalendarExportView: View {
    @EnvironmentObject private var store: NativeStore
    @EnvironmentObject private var account: NativeAccount
    @StateObject private var model = NativeCalendarExportModel()
    @State private var month: Date
    @State private var preview = false
    init(month: Date = Date()) { _month = State(initialValue: month) }
    var body: some View {
        List {
            Section {
                Label("Google 캘린더에 근무표 보내기", systemImage: "calendar.badge.plus").font(.headline).padding(.vertical, 8)
                Text("선택한 달의 근무표와 메모를 ‘근무 루틴 \(store.group)조’ 캘린더에 보내요. 야간근무는 시작일의 종일 일정으로 표시해요.").font(.subheadline).foregroundStyle(.secondary)
                Text("앱에서 만든 근무 일정만 반영해요. 보내기 버튼을 눌러야 Google 캘린더가 갱신돼요.").font(.caption).foregroundStyle(.secondary)
            }
            Section("보낼 근무표") {
                HStack {
                    Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 40, height: 40) }.accessibilityLabel("이전 달")
                    Spacer(); Text(NativeDates.monthTitle(month)).font(.headline); Spacer()
                    Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 40, height: 40) }.accessibilityLabel("다음 달")
                }.buttonStyle(.plain).disabled(model.busy)
                LabeledContent("근무조", value: store.group + "조")
                DisclosureGroup("\(NativeCalendarExportModel.dates(in: month).count)일 미리보기", isExpanded: $preview) {
                    ForEach(NativeCalendarExportModel.dates(in: month), id: \.self) { date in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(NativeServiceDates.label(NativeDates.key(date))).font(.caption).foregroundStyle(.secondary)
                            Text(NativeCalendarExportModel.title(date: date, group: store.group, store: store)).font(.subheadline)
                            if let memo = store.object("shift_day_memos")[NativeDates.key(date)] as? String, !memo.isEmpty { Text(memo).font(.caption).foregroundStyle(.secondary).lineLimit(3) }
                        }.padding(.vertical, 4)
                    }
                }
            }
            Section {
                if !account.connected || account.provider != "google" || !account.calendarConnected {
                    Button { Task { await account.login(calendar: true) } } label: { Label("Google 캘린더 연결", systemImage: "link") }.disabled(account.busy || model.busy)
                    Text("Google Drive 계정 저장과 캘린더 보내기 권한을 함께 연결해요.").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(account.userName).font(.caption).foregroundStyle(.secondary)
                    if !account.calendarExportReady { Text("설정에서 계정 기록을 동기화하거나 사용할 기록을 선택한 다음 보내 주세요.").font(.caption).foregroundStyle(.secondary) }
                    Button { Task { await model.send(month: month, store: store, account: account) } } label: {
                        HStack { Label(model.busy ? "근무표 보내는 중…" : "선택한 달 근무표 보내기", systemImage: "arrow.up.doc"); Spacer(); if model.busy { ProgressView() } }
                    }.disabled(model.busy || !account.calendarExportReady || account.busy)
                }
            }
            if let message = model.message { Section { Label(NativeL10n.text(message), systemImage: model.busy ? "arrow.triangle.2.circlepath" : "checkmark.circle").font(.subheadline).foregroundStyle(model.busy ? Color.secondary : Color.green) } }
            if let error = model.error { Section { Label(NativeL10n.text(error), systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red); Text("다시 보내면 최신 Google 일정을 읽고 이미 처리된 날짜부터 확인해요.").font(.caption).foregroundStyle(.secondary) } }
            if !model.skipped.isEmpty { Section("제외한 날짜") { ForEach(model.skipped, id: \.self) { Text($0).font(.caption) }; Text("중복·반복 일정은 Google 캘린더에서 확인해 주세요. 기존에 제외한 날짜 설정은 유지해요.").font(.caption).foregroundStyle(.secondary) } }
        }
        .navigationTitle("근무표 보내기")
        .navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(model.busy)
    }
    private func move(_ offset: Int) { month = NativeDates.calendar.date(byAdding: .month, value: offset, to: month) ?? month; model.message = nil; model.error = nil; model.skipped = [] }
}
