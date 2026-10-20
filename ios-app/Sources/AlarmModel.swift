import AlarmKit
import SwiftUI

@MainActor
final class AlarmModel: ObservableObject {
    @Published private(set) var preferences: AlarmPreferences
    @Published private(set) var snapshot: ShiftSnapshot?
    @Published private(set) var lastSync: Date?
    @Published private(set) var scheduled: [PlannedAlarm] = []
    @Published var error: String?
    @Published private(set) var busy = false
    @Published var showingSettings = false
    private let service: AlarmService
    private let defaults: UserDefaults
    private var running = false
    private var needsRefresh = false
    private var testPlan: PlannedAlarm?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        service = AlarmService(defaults: defaults)
        preferences = defaults.data(forKey: "natbam.preferences").flatMap { try? JSONDecoder().decode(AlarmPreferences.self, from: $0) } ?? AlarmPreferences()
        snapshot = defaults.data(forKey: "natbam.snapshot").flatMap { try? JSONDecoder().decode(ShiftSnapshot.self, from: $0) }
        lastSync = defaults.object(forKey: "natbam.lastSync") as? Date
        testPlan = service.records["test"]?.plan
    }
    func receive(_ value: ShiftSnapshot) {
        guard value.validated() else { return }
        snapshot = value
        lastSync = Date()
        defaults.set(try? JSONEncoder().encode(value), forKey: "natbam.snapshot")
        defaults.set(lastSync, forKey: "natbam.lastSync")
        refresh()
    }
    func change(_ edit: (inout AlarmPreferences) -> Void) {
        edit(&preferences)
        defaults.set(try? JSONEncoder().encode(preferences), forKey: "natbam.preferences")
        refresh()
    }
    func enable(_ value: Bool) async {
        if value {
            guard snapshot?.validated() == true else {
                error = "먼저 인터넷에 연결해 달력을 열어 주세요. 오늘부터 30일의 근무표를 확인한 뒤 알람을 켤 수 있어요."
                return
            }
            guard await authorize() else { return }
        }
        change { $0.enabled = value }
    }
    private func authorize() async -> Bool {
        do {
            let state = try await AlarmManager.shared.requestAuthorization()
            guard state == .authorized else {
                error = "아이폰 설정 → 앱 → 낮밤 테스트에서 알람을 허용해 주세요."
                return false
            }
            return true
        } catch { self.error = "알람 권한을 확인하지 못했어요. \(error.localizedDescription)"; return false }
    }
    func test() async {
        guard await authorize() else { return }
        testPlan = PlannedAlarm(key: "test", title: "낮밤 테스트 알람", date: Date().addingTimeInterval(60))
        refresh()
    }
    func stopTest() { testPlan = nil; refresh() }
    func refresh() {
        needsRefresh = true
        guard !running else { return }
        running = true
        busy = true
        Task {
            defer { running = false; busy = false }
            // Serialize all changes. If a shift changes while scheduling awaits the
            // daemon, reconcile once more against the latest snapshot before finishing.
            repeat {
                needsRefresh = false
                var desired = snapshot.map { ShiftPlanner.plans($0, preferences: preferences) } ?? []
                if let testPlan, testPlan.date > Date() { desired.append(testPlan) }
                do {
                    if !desired.isEmpty && AlarmManager.shared.authorizationState != .authorized {
                        throw AlarmFailure.permission
                    }
                    try await service.reconcile(desired)
                    scheduled = try service.scheduled().filter { $0.date > Date() }
                    error = nil
                } catch {
                    scheduled = (try? service.scheduled().filter { $0.date > Date() }) ?? []
                    self.error = "알람 예약을 완료하지 못했어요. \(error.localizedDescription)"
                }
            } while needsRefresh
        }
    }
}
private enum AlarmFailure: LocalizedError {
    case permission
    var errorDescription: String? { "설정에서 낮밤 테스트의 알람 권한을 확인해 주세요." }
}
