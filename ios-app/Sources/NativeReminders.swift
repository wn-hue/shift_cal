import Foundation
import Combine
import UserNotifications

@MainActor
protocol NativeReminderBackend {
    func authorizationStatus() async -> UNAuthorizationStatus
    func requestAuthorization() async throws -> Bool
    func pendingRequests() async -> [UNNotificationRequest]
    func removePending(_ identifiers: [String])
    func add(_ request: UNNotificationRequest) async throws
}

@MainActor
private final class SystemNativeReminderBackend: NativeReminderBackend {
    private let center = UNUserNotificationCenter.current()
    func authorizationStatus() async -> UNAuthorizationStatus { await center.notificationSettings().authorizationStatus }
    func requestAuthorization() async throws -> Bool { try await center.requestAuthorization(options: [.alert, .sound, .badge]) }
    func pendingRequests() async -> [UNNotificationRequest] { await center.pendingNotificationRequests() }
    func removePending(_ identifiers: [String]) { center.removePendingNotificationRequests(withIdentifiers: identifiers) }
    func add(_ request: UNNotificationRequest) async throws { try await center.add(request) }
}

/// Reconcile only this app's memo reminders. A single worker drains the latest
/// desired state, so an in-flight add can never resurrect a deleted reminder.
@MainActor
final class NativeReminders: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = NativeReminders()
    static let identifierPrefix = "routine.memo."
    private static let fingerprintKey = "routineMemoFingerprint"
    @Published private(set) var error: String?
    @Published private(set) var busy = false
    @Published private(set) var scheduledCount = 0
    @Published private(set) var deferredCount = 0
    @Published private(set) var scheduledThrough: Date?
    private let backend: NativeReminderBackend
    private let now: () -> Date
    private let retryDelays: [Duration]
    private let capacity: Int
    private var plans: [PlannedAlarm] = []
    private var requestPermission = false
    private var revision = 0
    private var retryAttempt = 0
    private var retryable = false
    private var worker: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?

    init(backend: NativeReminderBackend? = nil, capacity: Int = 60, retryDelays: [Duration] = [.seconds(2), .seconds(8)], now: @escaping () -> Date = Date.init) {
        self.backend = backend ?? SystemNativeReminderBackend()
        self.capacity = max(1, capacity)
        self.retryDelays = retryDelays
        self.now = now
        super.init()
        if backend == nil { UNUserNotificationCenter.current().delegate = self }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.notification.request.content.userInfo["route"] as? String == "parking" {
            Task { @MainActor in NativeParkingNavigation.shared.open = true }
        }
        completionHandler()
    }

    func update(_ plans: [PlannedAlarm], requestPermission: Bool = false) async {
        retryTask?.cancel(); retryTask = nil; retryAttempt = 0
        self.plans = plans
        self.requestPermission = self.requestPermission || requestPermission
        await enqueue()
    }

    func retry() async { await update(plans, requestPermission: true) }

    private func enqueue() async {
        revision += 1
        if worker == nil { worker = Task { await drain() } }
        await worker?.value
    }

    private func drain() async {
        busy = true
        var completedRevision: Int
        repeat {
            completedRevision = revision
            let permission = requestPermission
            requestPermission = false
            await reconcile(plans, requestPermission: permission, revision: completedRevision)
        } while completedRevision != revision
        busy = false
        worker = nil
        if retryable && retryAttempt < retryDelays.count {
            let delay = retryDelays[retryAttempt]
            retryAttempt += 1
            retryTask = Task { [weak self] in
                do { try await Task.sleep(for: delay) } catch { return }
                guard !Task.isCancelled else { return }
                await self?.enqueue()
            }
        }
    }

    private func reconcile(_ plans: [PlannedAlarm], requestPermission: Bool, revision current: Int) async {
        retryable = false
        let currentDate = now()
        var unique: [String: PlannedAlarm] = [:]
        for plan in plans where plan.date > currentDate { unique[plan.key] = plan }
        let future: [PlannedAlarm] = unique.values.sorted { lhs, rhs in
            if lhs.date == rhs.date { return lhs.key < rhs.key }
            return lhs.date < rhs.date
        }
        let selected: [PlannedAlarm] = Array(future.prefix(capacity))
        let requests: [UNNotificationRequest] = selected.map { Self.request($0) }
        var wanted: [String: UNNotificationRequest] = [:]
        for request in requests { wanted[request.identifier] = request }
        let allPending: [UNNotificationRequest] = await backend.pendingRequests()
        var existing: [UNNotificationRequest] = allPending.filter { $0.identifier.hasPrefix(Self.identifierPrefix) }
        guard current == revision else { return }
        // Remove cancelled and changed times before any potentially failing add.
        // Leave unrelated reminders (for example caffeine) untouched.
        let outdated = existing.filter { old in
            guard let new = wanted[old.identifier] else { return true }
            return !Self.matches(old, new)
        }.map(\.identifier)
        backend.removePending(outdated)
        existing.removeAll { outdated.contains($0.identifier) }
        if selected.isEmpty {
            scheduledCount = 0; deferredCount = 0; scheduledThrough = nil; error = nil
            return
        }
        var authorization = await backend.authorizationStatus()
        guard current == revision else { return }
        do {
            if requestPermission && authorization == .notDetermined {
                _ = try await backend.requestAuthorization()
                authorization = await backend.authorizationStatus()
            }
            guard current == revision else { return }
            guard [.authorized, .provisional, .ephemeral].contains(authorization) else {
                scheduledCount = 0; deferredCount = future.count; scheduledThrough = nil
                error = NativeL10n.text("메모는 저장됐지만 알림 권한이 꺼져 있어요. 아이폰 설정에서 알림을 허용해 주세요.")
                return
            }
            let existingIDs = Set(existing.map(\.identifier))
            for request in requests where !existingIDs.contains(request.identifier) {
                guard current == revision else { return }
                try await backend.add(request)
                // If another update arrived during add, the serial next pass
                // removes/replaces it before any caller finishes awaiting update.
                guard current == revision else { return }
            }
            let accepted = await backend.pendingRequests()
            guard current == revision else { return }
            setCoverage(selected: selected, futureCount: future.count, requests: requests, accepted: accepted)
            if scheduledCount < selected.count {
                error = NativeL10n.text("메모는 저장됐지만 일부 알림을 예약하지 못했어요. 다시 시도해 주세요.")
                retryable = true
            } else { error = nil }
        } catch {
            let accepted = await backend.pendingRequests()
            guard current == revision else { return }
            setCoverage(selected: selected, futureCount: future.count, requests: requests, accepted: accepted)
            self.error = NativeL10n.text("메모는 저장됐지만 일부 알림을 예약하지 못했어요. 다시 시도해 주세요.")
            retryable = true
        }
    }

    private func setCoverage(selected: [PlannedAlarm], futureCount: Int, requests: [UNNotificationRequest], accepted: [UNNotificationRequest]) {
        let verified = Dictionary(accepted.map { ($0.identifier, $0) }, uniquingKeysWith: { _, latest in latest })
        let scheduled = zip(selected, requests).compactMap { plan, request -> PlannedAlarm? in
            guard let actual = verified[request.identifier], Self.matches(actual, request) else { return nil }
            return plan
        }
        scheduledCount = scheduled.count
        deferredCount = max(0, futureCount - scheduled.count)
        scheduledThrough = scheduled.last?.date
    }

    private static func matches(_ lhs: UNNotificationRequest, _ rhs: UNNotificationRequest) -> Bool {
        guard let lhsFingerprint = lhs.content.userInfo[fingerprintKey] as? String,
              let rhsFingerprint = rhs.content.userInfo[fingerprintKey] as? String else { return false }
        return lhsFingerprint == rhsFingerprint
    }

    private static func request(_ plan: PlannedAlarm) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        // The title belongs to the user and must never be translated.
        content.title = plan.title
        content.body = NativeL10n.text("등록한 일정이 곧 시작돼요.")
        content.sound = .default
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let fingerprint = (try? encoder.encode(plan).base64EncodedString()) ?? plan.key
        content.userInfo = [fingerprintKey: fingerprint + "|" + content.body]
        var components = NativeDates.calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: plan.date)
        components.timeZone = NativeDates.calendar.timeZone
        return UNNotificationRequest(identifier: identifierPrefix + plan.key, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false))
    }
}
