import XCTest
@testable import Natbam

@MainActor
final class NativeAccountSyncTests: XCTestCase {
    private func normalize(_ values: [String: Any]) throws -> [String: Any] { try NativeLogic.shared.normalized(values) }
    func testCloudEnvelopeMustExplicitlyContainValidVersions() throws {
        XCTAssertThrowsError(try NativeCloudSync.decodeVersions([:]))
        XCTAssertThrowsError(try NativeCloudSync.decodeVersions(["versions": "invalid"]))
        XCTAssertTrue(try NativeCloudSync.decodeVersions(["versions": []]).isEmpty)
        let version: [String: Any] = ["revision": String(repeating: "a", count: 32), "updatedAt": "2026-11-08T00:00:00.000Z", "data": ["shift_active_group": "C"]]
        XCTAssertEqual(try NativeCloudSync.decodeVersions(["versions": [version]]).count, 1)
        XCTAssertThrowsError(try NativeCloudSync.decodeVersions(["versions": [version, version]]))
        var invalid = version; invalid["revision"] = "not-a-revision"
        XCTAssertThrowsError(try NativeCloudSync.decodeVersion(invalid))
        invalid = version; invalid["data"] = ["unexpected": "value"]
        XCTAssertThrowsError(try NativeCloudSync.decodeVersion(invalid))
    }
    func testWriteReadbackAppliesRemoteAdditionsWithoutTreatingThemAsLocalDeletions() throws {
        let before = try normalize(["shift_day_memos": ["2026-11-08": "이 기기 메모"]])
        let written = try normalize(["shift_day_memos": ["2026-11-08": "이 기기 메모", "2026-11-09": "다른 기기 메모"]])
        let result = try NativeCloudSync.mergeAfterWrite(before: before, current: before, written: written)
        XCTAssertTrue(result.conflicts.isEmpty)
        XCTAssertTrue(NativeLogic.shared.equal(result.data, written))
        let following = try NativeCloudSync.mergeAfterWrite(before: written, current: result.data, written: written)
        XCTAssertEqual((following.data["shift_day_memos"] as? [String: String])?["2026-11-09"], "다른 기기 메모")
    }
    func testWriteReadbackPreservesIndependentEditsMadeWhileRequestWasInFlight() throws {
        let before = try normalize(["shift_day_memos": ["2026-11-08": "메모"]])
        let current = try normalize(["shift_day_memos": ["2026-11-08": "저장 중 고친 메모"]])
        let written = try normalize(["shift_day_memos": ["2026-11-08": "메모", "2026-11-09": "다른 기기 메모"]])
        let result = try NativeCloudSync.mergeAfterWrite(before: before, current: current, written: written)
        XCTAssertTrue(result.conflicts.isEmpty)
        let memos = result.data["shift_day_memos"] as? [String: String]
        XCTAssertEqual(memos?["2026-11-08"], "저장 중 고친 메모")
        XCTAssertEqual(memos?["2026-11-09"], "다른 기기 메모")
        XCTAssertFalse(NativeLogic.shared.equal(result.data, written))
    }
    func testConcurrentSameFieldEditRequiresExplicitChoice() throws {
        let before = try normalize(["shift_day_memos": ["2026-11-08": "처음"]])
        let current = try normalize(["shift_day_memos": ["2026-11-08": "기기 변경"]])
        let written = try normalize(["shift_day_memos": ["2026-11-08": "계정 선택"]])
        let result = try NativeCloudSync.mergeAfterWrite(before: before, current: current, written: written)
        XCTAssertEqual(result.conflicts, ["shift_day_memos.2026-11-08"])
        XCTAssertEqual((result.data["shift_day_memos"] as? [String: String])?["2026-11-08"], "기기 변경")
    }
}
