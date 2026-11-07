import XCTest
@testable import Natbam

@MainActor
final class NativeStoreTests: XCTestCase {
    private func folder() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    private func records(_ text: String) -> [String: Any] { ["shift_day_memos": ["2026-11-08": text]] }
    func testUnreadableExistingFileIsNeverReplacedByDefaultSave() throws {
        let directory = try folder(); defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("records.json"), original = Data("unreadable existing records".utf8)
        try original.write(to: file)
        let store = NativeStore(file: file)
        XCTAssertNotNil(store.error)
        store.data = records("새 기록")
        XCTAssertFalse(store.save())
        XCTAssertEqual(try Data(contentsOf: file), original)
    }
    func testFailedAdoptionAndAccountSwitchRollBackWorkingRecordsAndOwner() throws {
        let directory = try folder(); defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("records.json")
        let store = NativeStore(file: file)
        try store.adopt(records("A계정 기록"), owner: "account-a", parents: [String(repeating: "a", count: 32)], synced: true)
        let old = store.data
        // A directory at the file URL makes the atomic file replacement fail.
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true)
        XCTAssertThrowsError(try store.adopt(records("실패할 기록"), owner: "account-b", parents: [], synced: false))
        XCTAssertEqual(store.owner, "account-a")
        XCTAssertTrue(NativeLogic.shared.equal(store.data, old))
        XCTAssertThrowsError(try store.switchAccount(to: "account-b"))
        XCTAssertEqual(store.owner, "account-a")
        XCTAssertTrue(NativeLogic.shared.equal(store.data, old))
    }
    func testAccountCachesKeepUnsyncedRecordsSeparateAcrossSwitchesAndRestart() throws {
        let directory = try folder(); defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("records.json")
        let store = NativeStore(file: file)
        try store.adopt(records("A계정 수정"), owner: "account-a", parents: [], synced: false)
        try store.switchAccount(to: "account-b")
        XCTAssertFalse(NativeLogic.shared.meaningful(store.data))
        try store.adopt(records("B계정 수정"), owner: "account-b", parents: [], synced: false)
        try store.switchAccount(to: "account-a")
        XCTAssertEqual(store.object("shift_day_memos")["2026-11-08"] as? String, "A계정 수정")
        let reloaded = NativeStore(file: file)
        try reloaded.switchAccount(to: "account-b")
        XCTAssertEqual(reloaded.object("shift_day_memos")["2026-11-08"] as? String, "B계정 수정")
        XCTAssertNil(reloaded.baseline)
    }
    func testReturningAccountRestoresItsUnsyncedCacheWhileKeepingGuestRecords() throws {
        let directory = try folder(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = NativeStore(file: directory.appendingPathComponent("records.json"))
        try store.adopt(records("계정 없는 기록"), owner: nil, parents: [], synced: false)
        try store.adopt(records("A계정 미전송 기록"), owner: "account-a", parents: [], synced: false)
        try store.disconnect()
        XCTAssertEqual(store.object("shift_day_memos")["2026-11-08"] as? String, "계정 없는 기록")
        try store.switchAccount(to: "account-a")
        XCTAssertEqual(store.object("shift_day_memos")["2026-11-08"] as? String, "A계정 미전송 기록")
        try store.disconnect()
        XCTAssertEqual(store.object("shift_day_memos")["2026-11-08"] as? String, "계정 없는 기록")
    }
    func testDeletedAccountCacheCannotReturnAfterSwitchingBack() throws {
        let directory = try folder(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = NativeStore(file: directory.appendingPathComponent("records.json"))
        try store.adopt(records("삭제할 기록"), owner: "account-a", parents: [], synced: false)
        try store.switchAccount(to: "account-b")
        try store.applyDeletion(owner: "account-a", epoch: 1_799_999_999_000)
        try store.switchAccount(to: "account-a")
        XCTAssertFalse(NativeLogic.shared.meaningful(store.data))
        XCTAssertNil(store.baseline)
    }
    func testSyncDoesNotFinishInProgressNativeOnboarding() throws {
        let directory = try folder(); defer { try? FileManager.default.removeItem(at: directory) }
        let store = NativeStore(file: directory.appendingPathComponent("records.json"))
        try store.adopt([:], owner: "new-account", parents: [], synced: true)
        XCTAssertFalse(store.onboardingComplete)
        store.updateConfig(["hireDate": "2026-11-01"])
        let partial = store.data
        try store.adopt(partial, owner: "new-account", parents: [String(repeating: "b", count: 32)], synced: true)
        XCTAssertFalse(store.onboardingComplete, "Saving a hire date to the cloud must not skip wage onboarding")
        store.completeOnboarding()
        try store.adopt(partial, owner: "new-account", parents: [String(repeating: "c", count: 32)], synced: true)
        XCTAssertTrue(store.onboardingComplete)
    }

}
