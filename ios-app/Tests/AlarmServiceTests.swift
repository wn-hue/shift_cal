import XCTest
import AlarmKit
@testable import Natbam

@MainActor
private final class FakeBackend: AlarmBackend {
    var ids: Set<UUID> = []
    var scheduledIDs: [UUID] = []
    var cancelled: [UUID] = []
    var failNextSchedule = false
    var capacity = Int.max
    func currentIDs() throws -> Set<UUID> { ids }
    func cancel(id: UUID) throws { cancelled.append(id); ids.remove(id) }
    func schedule(id: UUID, plan: PlannedAlarm) async throws {
        if failNextSchedule {
            failNextSchedule = false
            throw NSError(domain: "Test", code: 1)
        }
        if !ids.contains(id) && ids.count >= capacity { throw AlarmManager.AlarmError.maximumLimitReached }
        scheduledIDs.append(id)
        ids.insert(id)
    }
}

final class AlarmServiceTests: XCTestCase {
    private func plan(_ key: String, seconds: Double = 3600) -> PlannedAlarm {
        PlannedAlarm(key: key, title: "근무", date: Date(timeIntervalSince1970: seconds))
    }

    @MainActor
    func testWeekendTimeChangeReplacesOnlyItsAlarmsAndPersists() async throws {
        let backend = FakeBackend()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let service = AlarmService(defaults: defaults, backend: backend)
        let start = ShiftPlanner.date("2026-10-23")!
        let snapshot = ShiftSnapshot(group: "C", days: [
            ShiftDay(date: "2026-10-23", type: "DAY", origType: nil),
            ShiftDay(date: "2026-10-24", type: "DAY", origType: nil)])
        var preferences = AlarmPreferences()
        preferences.enabled = true
        preferences.setSeparateWeekendHolidays(true)
        try await service.reconcile(ShiftPlanner.plans(snapshot, preferences: preferences, now: start))
        let weekdayID = service.records["2026-10-23"]!.id
        let weekendID = service.records["2026-10-24"]!.id
        preferences.weekendDayMinutes = 420
        let wanted = ShiftPlanner.plans(snapshot, preferences: preferences, now: start)
        try await service.reconcile(wanted)
        XCTAssertEqual(backend.cancelled, [weekendID])
        XCTAssertEqual(service.records["2026-10-23"]?.id, weekdayID)
        XCTAssertEqual(backend.ids.count, 2)
        try await AlarmService(defaults: defaults, backend: backend).reconcile(wanted)
        XCTAssertEqual(backend.scheduledIDs.count, 3, "Restart does not add another alarm")
        XCTAssertEqual(try service.scheduled(), wanted)
    }

    @MainActor
    func testRepeatAndProcessRestartDoNotDuplicate() async throws {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let backend = FakeBackend()
        let service = AlarmService(defaults: defaults, backend: backend)
        let wanted = [plan("2026-10-02:06")]
        try await service.reconcile(wanted)
        try await service.reconcile(wanted)
        try await AlarmService(defaults: defaults, backend: backend).reconcile(wanted)
        XCTAssertEqual(backend.scheduledIDs.count, 1)
        XCTAssertEqual(try service.scheduled(), wanted)
    }

    @MainActor
    func testNightChangeAndLeaveDeleteOldAlarms() async throws {
        let backend = FakeBackend()
        let service = AlarmService(defaults: UserDefaults(suiteName: UUID().uuidString)!, backend: backend)
        try await service.reconcile([plan("day")])
        let old = backend.scheduledIDs.first!
        try await service.reconcile([plan("night", seconds: 7200)])
        XCTAssertEqual(backend.cancelled, [old])
        XCTAssertEqual(backend.ids.count, 1)
        try await service.reconcile([])
        XCTAssertTrue(backend.ids.isEmpty)
        XCTAssertTrue(try service.scheduled().isEmpty)
    }

    @MainActor
    func testFailedScheduleRetriesSameIDAndDoesNotClaimSuccess() async throws {
        let backend = FakeBackend()
        backend.failNextSchedule = true
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let service = AlarmService(defaults: defaults, backend: backend)
        do {
            try await service.reconcile([plan("day")])
            XCTFail("Expected scheduling failure")
        } catch { }
        XCTAssertTrue(try service.scheduled().isEmpty)
        let pending = service.records["day"]!.id
        try await AlarmService(defaults: defaults, backend: backend).reconcile([plan("day")])
        XCTAssertEqual(backend.scheduledIDs, [pending])
    }

    @MainActor
    func testClearingAlsoRemovesOrphansAndCanRecoverMissingFutureAlarm() async throws {
        let backend = FakeBackend()
        let service = AlarmService(defaults: UserDefaults(suiteName: UUID().uuidString)!, backend: backend)
        try await service.reconcile([plan("day")])
        let id = backend.scheduledIDs.first!
        backend.ids.remove(id)
        try await service.reconcile([plan("day")])
        XCTAssertEqual(backend.scheduledIDs, [id, id])
        backend.ids.insert(UUID())
        try service.clear()
        XCTAssertTrue(backend.ids.isEmpty)
        XCTAssertTrue(service.records.isEmpty)
    }
    @MainActor
    func testBreakRoundChangesReplaceOnlyBreaksAndDisablingKeepsWakeAlarm() async throws {
        let backend = FakeBackend()
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let service = AlarmService(defaults: defaults, backend: backend)
        let start = ShiftPlanner.date("2026-10-20")!
        let snapshot = ShiftSnapshot(group: "C", days: [ShiftDay(date: "2026-10-20", type: "DAY", origType: nil)])
        var prefs = AlarmPreferences(); prefs.enabled = true; prefs.breaksEnabled = true
        try await service.reconcile(ShiftPlanner.plans(snapshot, preferences: prefs, now: start))
        let wake = service.records["2026-10-20"]!.id
        XCTAssertEqual(backend.ids.count, 5)
        prefs.dayBreakRound = 2
        let changed = ShiftPlanner.plans(snapshot, preferences: prefs, now: start)
        try await service.reconcile(changed)
        XCTAssertEqual(service.records["2026-10-20"]?.id, wake)
        XCTAssertEqual(backend.ids.count, 5)
        XCTAssertEqual(backend.cancelled.count, 4)
        try await AlarmService(defaults: defaults, backend: backend).reconcile(changed)
        XCTAssertEqual(backend.scheduledIDs.count, 9, "Restart must not duplicate wake or break alarms")
        prefs.breaksEnabled = false
        try await service.reconcile(ShiftPlanner.plans(snapshot, preferences: prefs, now: start))
        XCTAssertEqual(backend.ids, [wake])
    }

    @MainActor
    func testCapacityKeepsNearestAlarmsAndReportsUnscheduledPlans() async throws {
        let backend = FakeBackend(); backend.capacity = 2
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let service = AlarmService(defaults: defaults, backend: backend)
        let first = plan("first", seconds: 100)
        let second = plan("second", seconds: 200)
        let third = plan("third", seconds: 300)
        let result = try await service.reconcile([third, first, second])
        XCTAssertTrue(result.capacityReached)
        XCTAssertEqual(result.scheduled, [first, second])
        XCTAssertEqual(result.deferred, [third])
        XCTAssertEqual(backend.ids.count, 2)
        XCTAssertEqual(try service.scheduled(), [first, second])
        let repeatResult = try await AlarmService(defaults: defaults, backend: backend).reconcile([first, second, third])
        XCTAssertEqual(repeatResult.deferred, [third])
        XCTAssertEqual(backend.scheduledIDs.count, 2, "A full device must not create duplicate alarms on refresh")
    }

    @MainActor
    func testNearTermAlarmReplacesDistantAlarmAtCapacityAndRefillsWhenRoomReturns() async throws {
        let backend = FakeBackend(); backend.capacity = 2
        let service = AlarmService(defaults: UserDefaults(suiteName: UUID().uuidString)!, backend: backend)
        let near = plan("test", seconds: 100)
        let middle = plan("middle", seconds: 200)
        let far = plan("far", seconds: 300)
        try await service.reconcile([middle, far])
        let farID = service.records[far.key]!.id
        let result = try await service.reconcile([far, middle, near])
        XCTAssertEqual(result.scheduled, [near, middle])
        XCTAssertEqual(result.deferred, [far])
        XCTAssertEqual(backend.cancelled, [farID])
        XCTAssertTrue(result.capacityReached)
        let refilled = try await service.reconcile([middle, far])
        XCTAssertEqual(refilled.scheduled, [middle, far])
        XCTAssertTrue(refilled.deferred.isEmpty)
        XCTAssertFalse(refilled.capacityReached)
    }

    @MainActor
    func testZeroAvailableCapacityDoesNotClaimAnyAlarmScheduled() async throws {
        let backend = FakeBackend(); backend.capacity = 0
        let service = AlarmService(defaults: UserDefaults(suiteName: UUID().uuidString)!, backend: backend)
        let result = try await service.reconcile([plan("first"), plan("second")])
        XCTAssertTrue(result.capacityReached)
        XCTAssertTrue(result.scheduled.isEmpty)
        XCTAssertEqual(result.deferred.count, 2)
        XCTAssertTrue(try service.scheduled().isEmpty)
    }

    @MainActor
    func testDisablingAlsoCancelsUntrackedAlarmAfterLostLocalRecords() async throws {
        let backend = FakeBackend()
        let orphan = UUID(); backend.ids.insert(orphan)
        let service = AlarmService(defaults: UserDefaults(suiteName: UUID().uuidString)!, backend: backend)
        let result = try await service.reconcile([])
        XCTAssertEqual(backend.cancelled, [orphan])
        XCTAssertTrue(backend.ids.isEmpty)
        XCTAssertTrue(result.scheduled.isEmpty)
    }

}
