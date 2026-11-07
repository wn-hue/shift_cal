import XCTest
import UserNotifications
import Combine
@testable import Natbam

@MainActor
private final class FakeReminderBackend: NativeReminderBackend {
    var authorization: UNAuthorizationStatus = .authorized
    var requests: [String: UNNotificationRequest] = [:]
    var added: [String] = []
    var removed: [String] = []
    var failNextAdd = false
    var dropNextAdd = false
    var suspendNextAdd = false
    private var suspension: CheckedContinuation<Void, Never>?
    private var suspensionObserver: CheckedContinuation<Void, Never>?
    func authorizationStatus() async -> UNAuthorizationStatus { authorization }
    func requestAuthorization() async throws -> Bool { authorization = .authorized; return true }
    func pendingRequests() async -> [UNNotificationRequest] { Array(requests.values) }
    func removePending(_ identifiers: [String]) { for identifier in identifiers { requests.removeValue(forKey: identifier) }; removed += identifiers }
    func add(_ request: UNNotificationRequest) async throws {
        if failNextAdd { failNextAdd = false; throw NSError(domain: "ReminderTest", code: 1) }
        if suspendNextAdd {
            suspendNextAdd = false
            await withCheckedContinuation { continuation in
                suspension = continuation
                suspensionObserver?.resume(); suspensionObserver = nil
            }
        }
        added.append(request.identifier)
        if dropNextAdd { dropNextAdd = false; return }
        requests[request.identifier] = request
    }
    func waitForSuspension() async {
        if suspension != nil { return }
        await withCheckedContinuation { suspensionObserver = $0 }
    }
    func resume() { suspension?.resume(); suspension = nil }
}

final class NativeReminderTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func plan(_ key: String, seconds: Double = 3600, title: String = "내 메모") -> PlannedAlarm {
        PlannedAlarm(key: key, title: title, date: now.addingTimeInterval(seconds))
    }

    @MainActor
    func testFailedAddIsVisibleAndIdenticalPlanCanRetry() async {
        let backend = FakeReminderBackend(); backend.failNextAdd = true
        let reminders = NativeReminders(backend: backend, retryDelays: [], now: { self.now })
        await reminders.update([plan("one")])
        XCTAssertNotNil(reminders.error)
        XCTAssertEqual(reminders.scheduledCount, 0)
        XCTAssertEqual(reminders.deferredCount, 1)
        await reminders.retry()
        XCTAssertNil(reminders.error)
        XCTAssertEqual(reminders.scheduledCount, 1)
        XCTAssertEqual(reminders.deferredCount, 0)
        XCTAssertEqual(backend.added, ["routine.memo.one"])
    }

    @MainActor
    func testAcceptedButMissingNotificationIsNotReportedAsScheduled() async {
        let backend = FakeReminderBackend(); backend.dropNextAdd = true
        let reminders = NativeReminders(backend: backend, retryDelays: [], now: { self.now })
        await reminders.update([plan("one")])
        XCTAssertNotNil(reminders.error)
        XCTAssertEqual(reminders.scheduledCount, 0)
        await reminders.update([plan("one")])
        XCTAssertNil(reminders.error)
        XCTAssertEqual(reminders.scheduledCount, 1)
    }

    @MainActor
    func testTransientFailureAutomaticallyRetries() async {
        let backend = FakeReminderBackend(); backend.failNextAdd = true
        let reminders = NativeReminders(backend: backend, retryDelays: [.milliseconds(10)], now: { self.now })
        let recovered = expectation(description: "The retry registers the reminder")
        let observation = reminders.$busy.combineLatest(reminders.$scheduledCount, reminders.$error)
            .filter { !$0.0 && $0.1 == 1 && $0.2 == nil }.prefix(1).sink { _ in recovered.fulfill() }
        await reminders.update([plan("one")])
        XCTAssertNotNil(reminders.error)
        await fulfillment(of: [recovered], timeout: 2)
        XCTAssertEqual(backend.added, ["routine.memo.one"])
        observation.cancel()
    }

    @MainActor
    func testRepeatedUpdateDoesNotRecreateUnchangedRemindersAndRepairsMissingOne() async {
        let backend = FakeReminderBackend()
        let reminders = NativeReminders(backend: backend, retryDelays: [], now: { self.now })
        await reminders.update([plan("one")])
        await reminders.update([plan("one")], requestPermission: true)
        XCTAssertEqual(backend.added.count, 1)
        XCTAssertTrue(backend.removed.isEmpty)
        backend.requests.removeAll()
        await reminders.update([plan("one")])
        XCTAssertEqual(backend.added.count, 2)
        XCTAssertEqual(reminders.scheduledCount, 1)
    }

    @MainActor
    func testDeletionDuringInflightAddCannotResurrectReminder() async {
        let backend = FakeReminderBackend(); backend.suspendNextAdd = true
        let reminders = NativeReminders(backend: backend, retryDelays: [], now: { self.now })
        let initial = Task { await reminders.update([plan("deleted")]) }
        await backend.waitForSuspension()
        let deletion = Task { await reminders.update([]) }
        // Let the second main-actor caller enqueue its desired state while add awaits.
        for _ in 0..<5 { await Task.yield() }
        backend.resume()
        await initial.value; await deletion.value
        XCTAssertTrue(backend.requests.isEmpty)
        XCTAssertEqual(reminders.scheduledCount, 0)
        XCTAssertEqual(reminders.deferredCount, 0)
        XCTAssertNil(reminders.error)
        XCTAssertFalse(reminders.busy)
    }

    @MainActor
    func testChangedTimeRemovesOldAlarmEvenIfReplacementFailsAndPreservesOtherFeatures() async {
        let backend = FakeReminderBackend()
        let other = UNNotificationRequest(identifier: "routine.lab.caffeine", content: UNMutableNotificationContent(), trigger: nil)
        backend.requests[other.identifier] = other
        let reminders = NativeReminders(backend: backend, retryDelays: [], now: { self.now })
        await reminders.update([plan("one")])
        backend.failNextAdd = true
        await reminders.update([plan("one", seconds: 7200)])
        XCTAssertNotNil(reminders.error)
        XCTAssertNil(backend.requests["routine.memo.one"])
        XCTAssertNotNil(backend.requests[other.identifier])
        await reminders.retry()
        XCTAssertNil(reminders.error)
        XCTAssertEqual(reminders.scheduledThrough, now.addingTimeInterval(7200))
    }

    @MainActor
    func testPermissionDenialIsVisibleAndClearsAfterGrant() async {
        let backend = FakeReminderBackend(); backend.authorization = .denied
        let reminders = NativeReminders(backend: backend, retryDelays: [], now: { self.now })
        await reminders.update([plan("one")])
        XCTAssertNotNil(reminders.error)
        XCTAssertEqual(reminders.scheduledCount, 0)
        XCTAssertEqual(reminders.deferredCount, 1)
        backend.authorization = .authorized
        await reminders.update([plan("one")])
        XCTAssertNil(reminders.error)
        XCTAssertEqual(reminders.scheduledCount, 1)
    }

    @MainActor
    func testCapacityKeepsNearestAndReportsRemainingWithoutChangingUserTitle() async {
        let backend = FakeReminderBackend()
        let reminders = NativeReminders(backend: backend, capacity: 2, retryDelays: [], now: { self.now })
        await reminders.update([plan("far", seconds: 9000), plan("near", seconds: 1000, title: "Personal note 메모"), plan("middle", seconds: 2000)])
        XCTAssertEqual(Set(backend.requests.keys), ["routine.memo.near", "routine.memo.middle"])
        XCTAssertEqual(backend.requests["routine.memo.near"]?.content.title, "Personal note 메모")
        XCTAssertEqual(reminders.scheduledCount, 2)
        XCTAssertEqual(reminders.deferredCount, 1)
        XCTAssertEqual(reminders.scheduledThrough, now.addingTimeInterval(2000))
        XCTAssertNil(reminders.error)
        await reminders.update([plan("middle", seconds: 2000), plan("far", seconds: 9000)])
        XCTAssertEqual(Set(backend.requests.keys), ["routine.memo.middle", "routine.memo.far"])
        XCTAssertEqual(reminders.deferredCount, 0)
    }
}
