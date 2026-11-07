import XCTest
@testable import Natbam

final class NativeParkingTests: XCTestCase {
    private func response() -> [String: Any] {
        ["status": "full", "open": true, "mine": "full", "counts": ["free": 0, "busy": 1, "full": 5], "updatedAt": 1_793_600_000_000.0, "subscribed": true, "subscriptionKind": "apns", "nativeAvailable": true]
    }
    func testValidSnapshotPreservesParticipationAndCounts() throws {
        let snapshot = try NativeParkingSnapshot.decode(response())
        XCTAssertEqual(snapshot.status, "full"); XCTAssertEqual(snapshot.counts["full"], 5)
        XCTAssertTrue(snapshot.subscribed); XCTAssertEqual(snapshot.subscriptionKind, "apns"); XCTAssertEqual(snapshot.nativeAvailable, true)
    }
    func testLegacyBackendDoesNotPretendNativePushIsAvailable() throws {
        var value = response(); value.removeValue(forKey: "nativeAvailable"); value.removeValue(forKey: "subscriptionKind")
        let snapshot = try NativeParkingSnapshot.decode(value)
        XCTAssertNil(snapshot.nativeAvailable); XCTAssertNil(snapshot.subscriptionKind)
    }
    func testInvalidSnapshotCannotReplaceSuccessfulResult() {
        for key in ["status", "counts", "updatedAt"] {
            var value = response(); value.removeValue(forKey: key)
            XCTAssertThrowsError(try NativeParkingSnapshot.decode(value))
        }
        var value = response(); value["status"] = "bogus"; XCTAssertThrowsError(try NativeParkingSnapshot.decode(value))
        value = response(); value["counts"] = ["free": -1, "busy": 1, "full": 5]; XCTAssertThrowsError(try NativeParkingSnapshot.decode(value))
        value = response(); value["updatedAt"] = 0; XCTAssertThrowsError(try NativeParkingSnapshot.decode(value))
    }
}
