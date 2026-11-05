import XCTest
@testable import Natbam

final class ShiftPlannerTests: XCTestCase {
    let now = ShiftPlanner.date("2026-10-20")!
    func testTypesAndHalfDayPolicy() {
        for type in ["DAY", "SPECIAL_DAY", "SPECIAL_DAY_NO_OT"] {
            XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: type, origType: nil)), false)
        }
        for type in ["NIGHT", "SPECIAL_NIGHT", "SPECIAL_NIGHT_NO_OT"] {
            XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: type, origType: nil)), true)
        }
        for type in ["OFF", "LEAVE", "UNPAID_OFF"] {
            XCTAssertNil(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: type, origType: "NIGHT")))
        }
        for type in ["HALF_PRE", "HALF_POST", "HALF_LEAVE", "UNPAID_HALF_PRE", "UNPAID_HALF_POST", "UNPAID_HALF"] {
            let day = ShiftDay(date: "2026-10-20", type: type, origType: "NIGHT")
            XCTAssertEqual(ShiftPlanner.isNight(day), true)
            XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: day.date, type: type, origType: "DAY")), false)
        }
        XCTAssertEqual(ShiftPlanner.isNight(ShiftDay(date: "2026-10-20", type: "NO_OT", origType: "NIGHT")), true)
    }

    func testRetiredHalfDaySwitchCannotSuppressHalfDayAlarms() throws {
        for legacyValue in ["true", "false"] {
            let saved = Data("{\"enabled\":true,\"dayMinutes\":375,\"nightMinutes\":1110,\"includeHalf\":\(legacyValue)}".utf8)
            let preferences = try JSONDecoder().decode(AlarmPreferences.self, from: saved)
            let snapshot = ShiftSnapshot(group: "C", days: [
                ShiftDay(date: "2026-10-20", type: "HALF_PRE", origType: "DAY"),
                ShiftDay(date: "2026-10-21", type: "HALF_POST", origType: "NIGHT"),
                ShiftDay(date: "2026-10-22", type: "UNPAID_HALF_PRE", origType: "SPECIAL_DAY"),
                ShiftDay(date: "2026-10-23", type: "UNPAID_HALF_POST", origType: "SPECIAL_NIGHT"),
                ShiftDay(date: "2026-10-24", type: "OFF", origType: "DAY"),
                ShiftDay(date: "2026-10-25", type: "LEAVE", origType: "NIGHT")])
            let plans = ShiftPlanner.plans(snapshot, preferences: preferences, now: now)
            XCTAssertEqual(plans.count, 4)
            XCTAssertEqual(plans.map { ShiftPlanner.korea.component(.hour, from: $0.date) }, [6, 18, 6, 18])
            XCTAssertEqual(plans.map { ShiftPlanner.korea.component(.minute, from: $0.date) }, [15, 30, 15, 30])
            let resaved = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences)) as? [String: Any]
            XCTAssertNil(resaved?["includeHalf"])
        }
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
        XCTAssertEqual(plans.map(\.key), Array(snapshot.days.prefix(7)).map(\.date))
        XCTAssertEqual(plans.map { ShiftPlanner.korea.component(.hour, from: $0.date) }, [5, 7, 19, 7, 17, 7, 19])
        XCTAssertEqual(plans[2].date, ShiftPlanner.date("2026-03-01")!.addingTimeInterval(1140 * 60))
        XCTAssertTrue(plans[3].title.contains("주말·공휴일"))
        XCTAssertTrue(plans[4].title.contains("평일"))
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
    func testBreakTimesMatchCompanyTableAndUseFiveMinuteLead() {
        XCTAssertEqual(ShiftPlanner.breaks(night: false, round: 1).map(\.timeLabel), ["10:25", "11:55", "15:25", "17:25"])
        XCTAssertEqual(ShiftPlanner.breaks(night: false, round: 2).map(\.timeLabel), ["10:40", "12:45", "15:40", "17:55"])
        XCTAssertEqual(ShiftPlanner.breaks(night: true, round: 1).map(\.timeLabel), ["22:55", "다음 날 01:15", "다음 날 04:25", "다음 날 06:25"])
        XCTAssertEqual(ShiftPlanner.breaks(night: true, round: 2).map(\.timeLabel), ["23:15", "다음 날 01:55", "다음 날 04:45", "다음 날 06:45"])
        XCTAssertTrue(ShiftPlanner.breaks(night: false, round: 0).isEmpty)
    }

    func testBreakAlarmsAreIndependentOfWakeAlarmsAndKeepUniqueKeys() throws {
        let snapshot = ShiftSnapshot(group: "C", days: [
            ShiftDay(date: "2026-10-20", type: "DAY", origType: nil),
            ShiftDay(date: "2026-10-21", type: "NIGHT", origType: nil),
            ShiftDay(date: "2026-10-22", type: "OFF", origType: "DAY"),
            ShiftDay(date: "2026-10-23", type: "LEAVE", origType: "NIGHT"),
            ShiftDay(date: "2026-10-24", type: "UNPAID_OFF", origType: "DAY")])
        var prefs = AlarmPreferences()
        XCTAssertTrue(ShiftPlanner.plans(snapshot, preferences: prefs, now: now).isEmpty)
        prefs.breaksEnabled = true
        prefs.dayBreakRound = 2
        prefs.nightBreakRound = 1
        var plans = ShiftPlanner.plans(snapshot, preferences: prefs, now: now)
        XCTAssertEqual(plans.count, 8)
        XCTAssertEqual(plans[0].date, ShiftPlanner.date("2026-10-20")!.addingTimeInterval((10 * 60 + 40) * 60))
        XCTAssertEqual(plans.last?.date, ShiftPlanner.date("2026-10-22")!.addingTimeInterval((6 * 60 + 25) * 60))
        XCTAssertEqual(Set(plans.map(\.key)).count, plans.count)
        prefs.enabled = true
        plans = ShiftPlanner.plans(snapshot, preferences: prefs, now: now)
        XCTAssertEqual(plans.count, 10)
        XCTAssertTrue(plans.contains { $0.key == "2026-10-20" })
        prefs.breaksEnabled = false
        XCTAssertEqual(ShiftPlanner.plans(snapshot, preferences: prefs, now: now).count, 2)
        let legacy = try JSONDecoder().decode(AlarmPreferences.self, from: Data(#"{"enabled":true,"dayMinutes":375,"nightMinutes":1110}"#.utf8))
        XCTAssertFalse(legacy.breaksEnabled)
        XCTAssertEqual(legacy.dayMinutes, 375)
        let saved = try JSONDecoder().decode(AlarmPreferences.self, from: JSONEncoder().encode(prefs))
        XCTAssertEqual(saved.dayBreakRound, 2)
    }

    func testPreviousNightBreaksSurviveMidnightAndExcludeExpiredTimes() {
        var prefs = AlarmPreferences()
        prefs.breaksEnabled = true
        let midnight = ShiftPlanner.date("2026-10-21")!
        let snapshot = ShiftSnapshot(group: "A", days: [ShiftDay(date: "2026-10-21", type: "OFF", origType: nil)],
            previousDay: ShiftDay(date: "2026-10-20", type: "NIGHT", origType: nil))
        let plans = ShiftPlanner.plans(snapshot, preferences: prefs, now: midnight)
        XCTAssertEqual(plans.count, 3)
        XCTAssertEqual(plans[0].date, midnight.addingTimeInterval(75 * 60))
        XCTAssertEqual(ShiftPlanner.plans(snapshot, preferences: prefs, now: plans[0].date).count, 2)
        XCTAssertTrue(plans.allSatisfy { $0.key.hasPrefix("2026-10-20:break:") })
        let off = ShiftSnapshot(group: "A", days: snapshot.days, previousDay: ShiftDay(date: "2026-10-20", type: "LEAVE", origType: "NIGHT"))
        XCTAssertTrue(ShiftPlanner.plans(off, preferences: prefs, now: midnight).isEmpty)
    }

    func testBreaksFollowHalfDayAndSpecialShiftAndStayWithinHorizon() {
        var prefs = AlarmPreferences(); prefs.breaksEnabled = true
        for type in ["HALF_PRE", "HALF_POST", "UNPAID_HALF_PRE", "UNPAID_HALF_POST", "NO_OT"] {
            let snapshot = ShiftSnapshot(group: "B", days: [ShiftDay(date: "2026-10-20", type: type, origType: "NIGHT")])
            XCTAssertEqual(ShiftPlanner.plans(snapshot, preferences: prefs, now: now).count, 4)
        }
        let end = ShiftPlanner.date("2026-11-19")!
        let snapshot = ShiftSnapshot(group: "B", days: [
            ShiftDay(date: "2026-11-18", type: "SPECIAL_NIGHT", origType: nil),
            ShiftDay(date: "2026-11-19", type: "SPECIAL_DAY", origType: nil)])
        let plans = ShiftPlanner.plans(snapshot, preferences: prefs, now: now)
        XCTAssertEqual(plans.count, 1)
        XCTAssertTrue(plans.allSatisfy { $0.date < end })
    }

}
