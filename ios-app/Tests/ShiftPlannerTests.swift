import XCTest
@testable import Natbam

final class ShiftPlannerTests: XCTestCase {
    let now = ShiftPlanner.date("2026-10-20")!
    func testTypesAndHalfDayPolicy() {
        for type in ["DAY", "SPECIAL_DAY", "SPECIAL_DAY_NO_OT"] {
            XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: type, origType: nil), includeHalf: false), false)
        }
        for type in ["NIGHT", "SPECIAL_NIGHT", "SPECIAL_NIGHT_NO_OT"] {
            XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: type, origType: nil), includeHalf: false), true)
        }
        for type in ["OFF", "LEAVE", "UNPAID_OFF"] {
            XCTAssertNil(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: type, origType: "NIGHT"), includeHalf: true))
        }
        for type in ["HALF_PRE", "HALF_POST", "UNPAID_HALF_PRE", "UNPAID_HALF_POST"] {
            let day = ShiftDay(date: "2026-10-20", type: type, origType: "NIGHT")
            XCTAssertNil(ShiftPlanner.isNight(day, includeHalf: false))
            XCTAssertEqual(ShiftPlanner.isNight(day, includeHalf: true), true)
        }
        XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: "NO_OT", origType: "NIGHT"), includeHalf: false), true)
    }
    func testClockDatesExpiryAndDisabled() {
        let snapshot = ShiftSnapshot(group: "C", days: [
            ShiftDay(date: "2026-10-20", type: "DAY", origType: nil),
            ShiftDay(date: "2026-10-21", type: "NIGHT", origType: nil),
            ShiftDay(date: "2026-11-19", type: "DAY", origType: nil)])
        var prefs = AlarmPreferences(); prefs.enabled = true
        prefs.dayMinutes = 5 * 60 + 10; prefs.nightMinutes = 17 * 60 + 45
        let plans = ShiftPlanner.plans(snapshot, preferences: prefs, now: now)
        XCTAssertEqual(plans.count, 2)
        XCTAssertEqual(plans[0].date, now.addingTimeInterval(310 * 60))
        XCTAssertEqual(plans[1].date, now.addingTimeInterval((24 * 60 + 1065) * 60))
        XCTAssertEqual(plans[1].title, "C조 야간 근무 알람")
        XCTAssertEqual(ShiftPlanner.plans(snapshot, preferences: prefs, now: plans[0].date).count, 1)
        prefs.enabled = false
        XCTAssertTrue(ShiftPlanner.plans(snapshot, preferences: prefs, now: now).isEmpty)
    }
    func testSnapshotRejectsDuplicatesUnknownTypesAndWrongRange() {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.timeZone = ShiftPlanner.korea.timeZone
        let days = (0..<30).map { i in ShiftDay(date: formatter.string(from: now.addingTimeInterval(Double(i * 86400))), type: "DAY", origType: nil) }
        XCTAssertTrue(ShiftSnapshot(group: "A", days: days).validated(now: now))
        XCTAssertFalse(ShiftSnapshot(group: "D", days: days).validated(now: now))
        XCTAssertFalse(ShiftSnapshot(group: "A", days: Array(days.dropFirst())).validated(now: now))
        XCTAssertFalse(ShiftSnapshot(group: "A", days: Array(repeating: days[0], count: 30)).validated(now: now))
        var invalid = days; invalid[0] = ShiftDay(date: "2026-10-20", type: "UNKNOWN", origType: nil)
        XCTAssertFalse(ShiftSnapshot(group: "A", days: invalid).validated(now: now))
        XCTAssertNil(ShiftPlanner.date("2026-02-30"))
    }
}
