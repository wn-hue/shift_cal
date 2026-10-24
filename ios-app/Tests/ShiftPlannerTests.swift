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

    func testWeekendAndSubstituteHolidayTimesFollowWorkDate() {
        let start = ShiftPlanner.date("2026-02-27")!
        let snapshot = ShiftSnapshot(group: "A", days: [
            ShiftDay(date: "2026-02-27", type: "DAY", origType: nil, isHoliday: false),
            ShiftDay(date: "2026-02-28", type: "DAY", origType: nil, isHoliday: false),
            ShiftDay(date: "2026-03-01", type: "NIGHT", origType: nil, isHoliday: true),
            ShiftDay(date: "2026-03-02", type: "DAY", origType: nil, isHoliday: true),
            // Special work on an ordinary Tuesday still uses the weekday clock.
            ShiftDay(date: "2026-03-03", type: "SPECIAL_NIGHT", origType: nil, isHoliday: false),
            ShiftDay(date: "2026-03-04", type: "NO_OT", origType: "DAY", isHoliday: true),
            ShiftDay(date: "2026-03-05", type: "HALF_POST", origType: "NIGHT", isHoliday: true),
            ShiftDay(date: "2026-03-06", type: "OFF", origType: nil, isHoliday: true),
            ShiftDay(date: "2026-03-07", type: "LEAVE", origType: "DAY", isHoliday: false),
            ShiftDay(date: "2026-03-08", type: "UNPAID_OFF", origType: "NIGHT", isHoliday: false)])
        var preferences = AlarmPreferences()
        preferences.enabled = true
        preferences.dayMinutes = 330
        preferences.nightMinutes = 1050
        preferences.setSeparateWeekendHolidays(true)
        preferences.weekendDayMinutes = 420
        preferences.weekendNightMinutes = 1140
        var plans = ShiftPlanner.plans(snapshot, preferences: preferences, now: start)
        XCTAssertEqual(plans.map(\.key), Array(snapshot.days.prefix(6)).map(\.date))
        XCTAssertEqual(plans.map { ShiftPlanner.korea.component(.hour, from: $0.date) }, [5, 7, 19, 7, 17, 7])
        XCTAssertEqual(plans[2].date, ShiftPlanner.date("2026-03-01")!.addingTimeInterval(1140 * 60))
        XCTAssertTrue(plans[3].title.contains("주말·공휴일"))
        XCTAssertTrue(plans[4].title.contains("평일"))
        preferences.includeHalf = true
        plans = ShiftPlanner.plans(snapshot, preferences: preferences, now: start)
        XCTAssertEqual(plans.count, 7)
        XCTAssertEqual(plans.last?.date, ShiftPlanner.date("2026-03-05")!.addingTimeInterval(1140 * 60))
        preferences.setSeparateWeekendHolidays(false)
        plans = ShiftPlanner.plans(snapshot, preferences: preferences, now: start)
        XCTAssertEqual(plans.map { ShiftPlanner.korea.component(.hour, from: $0.date) }, [5, 5, 17, 5, 17, 5, 17])
        XCTAssertFalse(plans[3].title.contains("주말·공휴일"))
    }

    func testLegacyPreferencesAndSnapshotsKeepExistingAlarms() throws {
        let old = Data(#"{"enabled":true,"dayMinutes":310,"nightMinutes":1065,"includeHalf":true}"#.utf8)
        var preferences = try JSONDecoder().decode(AlarmPreferences.self, from: old)
        XCTAssertTrue(preferences.enabled)
        XCTAssertTrue(preferences.includeHalf)
        XCTAssertFalse(preferences.separateWeekendHolidays)
        XCTAssertEqual(preferences.minutes(night: false, weekendOrHoliday: true), 310)
        preferences.setSeparateWeekendHolidays(true)
        XCTAssertEqual(preferences.weekendDayMinutes, 310)
        XCTAssertEqual(preferences.weekendNightMinutes, 1065)
        preferences.weekendDayMinutes = 440
        preferences.weekendNightMinutes = 1160
        let saved = try JSONEncoder().encode(preferences)
        preferences = try JSONDecoder().decode(AlarmPreferences.self, from: saved)
        XCTAssertTrue(preferences.separateWeekendHolidays)
        XCTAssertEqual(preferences.minutes(night: false, weekendOrHoliday: true), 440)
        XCTAssertEqual(preferences.minutes(night: true, weekendOrHoliday: true), 1160)
        preferences.setSeparateWeekendHolidays(false)
        preferences.dayMinutes = 300
        preferences.setSeparateWeekendHolidays(true)
        XCTAssertEqual(preferences.weekendDayMinutes, 440, "Toggling must retain a custom weekend time")
        let oldSnapshot = Data(#"{"group":"C","days":[{"date":"2026-10-24","type":"DAY"}]}"#.utf8)
        let snapshot = try JSONDecoder().decode(ShiftSnapshot.self, from: oldSnapshot)
        XCTAssertNil(snapshot.days[0].isHoliday)
        XCTAssertEqual(ShiftPlanner.plans(snapshot, preferences: preferences, now: now).first?.date,
                       ShiftPlanner.date("2026-10-24")!.addingTimeInterval(440 * 60))
    }
}
