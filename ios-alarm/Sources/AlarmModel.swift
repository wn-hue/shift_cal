import AlarmKit
import BackgroundTasks
import Combine
import EventKit
import SwiftUI

@MainActor
final class AlarmModel: ObservableObject {
    static let shared = AlarmModel()
    static let refreshIdentifier = "com.wnhue.shiftcal.alarms.refresh"
    private let store = EKEventStore()
    private let alarms = AlarmService()
    private let defaults = UserDefaults.standard
    @Published var calendars: [EKCalendar] = []
    @Published var scheduled: [PlannedAlarm] = []
    @Published var busy = false
    @Published var message = "캘린더를 선택하고 자동 알람을 켜 주세요."
    @Published var lastRefresh: Date?
    @Published var backgroundNote = ""
    @Published private(set) var enabled: Bool
    @Published private(set) var calendarID: String
    @Published private(set) var includeHalf: Bool
    private var needsRefresh = false
    private var observer: NSObjectProtocol?
    private var scheduleObserver: NSObjectProtocol?
    @Published private(set) var useBuiltIn: Bool

    var calendarGranted: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }
    var alarmGranted: Bool { AlarmManager.shared.authorizationState == .authorized }

    private init() {
        useBuiltIn = defaults.object(forKey: "shiftCal.useBuiltIn") as? Bool ?? true
        enabled = defaults.bool(forKey: "shiftCal.enabled")
        calendarID = defaults.string(forKey: "shiftCal.calendarID") ?? ""
        includeHalf = defaults.bool(forKey: "shiftCal.includeHalf")
        lastRefresh = defaults.object(forKey: "shiftCal.lastRefresh") as? Date
        observer = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in _ = await self?.refresh() }
        }
        scheduleObserver = NotificationCenter.default.addObserver(forName: ScheduleStore.changed, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in _ = await self?.refresh() }
        }
    }

    func setSource(builtIn: Bool) async {
        useBuiltIn = builtIn
        defaults.set(builtIn, forKey: "shiftCal.useBuiltIn")
        _ = await refresh()
    }

    func loadCalendars() {
        calendars = calendarGranted ? store.calendars(for: .event).sorted { $0.title < $1.title } : []
    }

    func requestCalendar() async {
        do {
            guard try await store.requestFullAccessToEvents() else {
                message = "캘린더 접근을 허용해야 근무표를 읽을 수 있습니다. 설정에서 허용해 주세요."
                return
            }
            store.reset()
            loadCalendars()
            message = "Shift_cal 근무 캘린더를 선택해 주세요."
        } catch { message = "캘린더 연결 실패: \(error.localizedDescription)" }
    }

    func selectCalendar(_ id: String) async {
        calendarID = id
        defaults.set(id, forKey: "shiftCal.calendarID")
        _ = await refresh()
    }

    func setIncludeHalf(_ value: Bool) async {
        includeHalf = value
        defaults.set(value, forKey: "shiftCal.includeHalf")
        _ = await refresh()
    }

    func setEnabled(_ value: Bool) async {
        if value {
            guard useBuiltIn || (calendarGranted && store.calendar(withIdentifier: calendarID) != nil) else {
                message = "먼저 캘린더 읽기를 허용하고 근무 캘린더를 선택해 주세요."
                return
            }
            do {
                guard try await AlarmManager.shared.requestAuthorization() == .authorized else {
                    message = "알람 권한이 꺼져 있습니다. iPhone 설정에서 이 앱의 알람을 허용해 주세요."
                    return
                }
            } catch { message = "알람 권한 확인 실패: \(error.localizedDescription)"; return }
        }
        enabled = value
        defaults.set(value, forKey: "shiftCal.enabled")
        _ = await refresh()
    }

    @discardableResult
    func refresh() async -> Bool {
        if busy { needsRefresh = true; return false }
        busy = true
        defer { busy = false }
        var succeeded = false
        repeat {
            needsRefresh = false
            loadCalendars()
            do {
                if !enabled {
                    if alarmGranted { try alarms.clear() }
                    scheduled = []
                    message = "자동 알람 꺼짐 · 알람을 켜면 앞으로 30일을 예약합니다."
                    succeeded = true
                } else if !alarmGranted {
                    scheduled = []
                    message = "알람 권한이 꺼져 있어 알람이 울리지 않습니다. 설정에서 허용해 주세요."
                    succeeded = false
                } else if useBuiltIn {
                    let now = Date()
                    let plans = ShiftPlanner.plans(events: ScheduleStore.shared.events(now: now), now: now, includeHalf: includeHalf)
                    try await alarms.reconcile(plans)
                    scheduled = try alarms.scheduled()
                    lastRefresh = now
                    defaults.set(now, forKey: "shiftCal.lastRefresh")
                    message = scheduled.isEmpty ? "앞으로 30일에 예약할 근무가 없습니다." : "\(ScheduleStore.shared.group)조 · \(scheduled.count)개 알람 예약 완료"
                    succeeded = true
                } else if !calendarGranted {
                    try alarms.clear()
                    scheduled = []
                    message = "캘린더 권한이 꺼져 기존 예약을 해제했습니다. 다시 허용해 주세요."
                    succeeded = false
                } else if let calendar = store.calendar(withIdentifier: calendarID) {
                    let now = Date()
                    let end = ShiftPlanner.korea.date(byAdding: .day, value: 30, to: ShiftPlanner.korea.startOfDay(for: now))!
                    let predicate = store.predicateForEvents(withStart: ShiftPlanner.korea.startOfDay(for: now), end: end, calendars: [calendar])
                    let events = store.events(matching: predicate).map {
                        // EventKit represents floating all-day dates in the event's
                        // timezone (or device timezone). Preserve that date before
                        // converting the work alarm to a fixed Korea timestamp.
                        var sourceCalendar = Calendar(identifier: .gregorian)
                        sourceCalendar.timeZone = $0.timeZone ?? .current
                        let components = sourceCalendar.dateComponents([.year, .month, .day], from: $0.startDate)
                        let start = ShiftPlanner.korea.date(from: components) ?? $0.startDate!
                        return ShiftEvent(title: $0.title ?? "", notes: $0.notes ?? "", start: start, allDay: $0.isAllDay)
                    }
                    let plans = ShiftPlanner.plans(events: events, now: now, includeHalf: includeHalf)
                    try await alarms.reconcile(plans)
                    scheduled = try alarms.scheduled()
                    lastRefresh = now
                    defaults.set(now, forKey: "shiftCal.lastRefresh")
                    message = scheduled.isEmpty ? "예약할 근무가 없습니다. Google 근무표가 이 캘린더에 동기화됐는지 확인해 주세요." : "\(scheduled.count)개 근무 알람 예약 완료"
                    succeeded = true
                } else {
                    try alarms.clear()
                    scheduled = []
                    message = "선택한 캘린더를 찾을 수 없어 예약을 해제했습니다. 근무 캘린더를 다시 선택해 주세요."
                    succeeded = false
                }
            } catch {
                scheduled = (try? alarms.scheduled()) ?? []
                message = "갱신을 완료하지 못했습니다. 현재 예약 \(scheduled.count)개. 다시 갱신해 주세요.\n\(error.localizedDescription)"
                succeeded = false
            }
            if Task.isCancelled { break }
        } while needsRefresh
        scheduleBackgroundRefresh()
        return succeeded
    }

    func scheduleBackgroundRefresh() {
        guard enabled else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.refreshIdentifier)
            return
        }
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 3600)
        do {
            try BGTaskScheduler.shared.submit(request)
            backgroundNote = "백그라운드 갱신을 요청했습니다. 실행 시점은 iOS가 결정합니다."
        } catch {
            backgroundNote = "백그라운드 갱신을 요청할 수 없습니다. 근무 변경 후 앱을 열어 갱신해 주세요."
        }
    }

    func testAlarm() async {
        guard enabled, alarmGranted, !busy else {
            message = "먼저 자동 알람을 켜고 알람 권한을 허용해 주세요."
            return
        }
        busy = true
        defer { busy = false }
        do {
            let backend = SystemAlarmBackend()
            let id = UUID(uuidString: "6E290FF0-3E30-4B1A-91FA-1F9886F03480")!
            if try backend.currentIDs().contains(id) { try backend.cancel(id: id) }
            let plan = PlannedAlarm(key: "test", title: "교대근무 테스트 알람", date: Date(timeIntervalSinceNow: 60))
            try await backend.schedule(id: id, plan: plan)
            message = "1분 뒤 테스트 알람을 예약했습니다. iPhone을 잠근 뒤 소리가 울리는지 확인하세요."
        } catch { message = "테스트 알람 예약 실패: \(error.localizedDescription)" }
    }
}
