import XCTest
@testable import ShiftCalAlarms

@MainActor
private final class FakeBackend: AlarmBackend {
    var ids: Set<UUID> = []
    var scheduledIDs: [UUID] = []
    var cancelled: [UUID] = []
    var failNextSchedule = false
    func currentIDs() throws -> Set<UUID> { ids }
    func cancel(id: UUID) throws { cancelled.append(id); ids.remove(id) }
    func schedule(id: UUID, plan: PlannedAlarm) async throws {
        if failNextSchedule {
            failNextSchedule = false
            throw NSError(domain: "Test", code: 1)
        }
        scheduledIDs.append(id)
        ids.insert(id)
    }
}

final class AlarmServiceTests: XCTestCase {
    private func plan(_ key: String, seconds: Double = 3600) -> PlannedAlarm {
        PlannedAlarm(key: key, title: "근무", date: Date(timeIntervalSince1970: seconds))
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
}
