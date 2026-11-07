import XCTest
import CryptoKit
@testable import Natbam

@MainActor
final class NativeCalendarTests: XCTestCase {
    private func date(_ key: String) -> Date { NativeDates.date(key)! }
    private func event(start: String, end: String, allDay: Bool = false, frequency: String? = nil, until: String? = nil) -> [String: Any] {
        var value: [String: Any] = ["title": "병원 예약", "start": start, "end": end, "allDay": allDay, "location": "서울", "notes": "", "reminder": 0]
        if let frequency { value["repeat"] = ["frequency": frequency, "until": until as Any? ?? NSNull()] }
        return value
    }
    func testEntireSupportedRotationMatchesOriginalJavaScript() {
        // SHA-256 fixtures produced by executing index.html's unchanged getBaseShift in JavaScriptCore,
        // for every date from 2025-01-01 through 2027-12-31, including all 18 paused shutdown dates.
        let expected = ["A": "f19a16846fac339333856e5e22346af6d59318dde91f4bf9b7495572bf8e29ea", "B": "ae2c0feafc75e1799b8a9877385ddba87e80377ef1c966d7a6ba5314b184cec3", "C": "671d627392d47bed8e2a6cbf691531aadf9e94a32b3aa695cc291a28a6869a0e"]
        for group in ["A", "B", "C"] {
            var value = "", cursor = date("2025-01-01")
            while cursor < date("2028-01-01") {
                value.append(NativeShift.baseType(cursor, group: group).first!)
                cursor = NativeDates.calendar.date(byAdding: .day, value: 1, to: cursor)!
            }
            XCTAssertEqual(SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined(), expected[group], group)
        }
    }
    func testHolidayOverridesAndAutomaticHalfPostOvertime() {
        for group in ["A", "B", "C"] {
            let christmas = date("2026-12-25")
            let base = NativeShift.baseType(christmas, group: group)
            let automatic = NativeShift.day(christmas, group: group, override: nil)
            XCTAssertEqual(automatic.type, base == "OFF" ? "OFF" : "SPECIAL_" + base)
            XCTAssertEqual(automatic.isHoliday, true)
            XCTAssertEqual(NativeShift.day(christmas, group: group, override: "DAY").type, "DAY")
        }
        for type in ["HALF_POST", "UNPAID_HALF_POST", "HALF_LEAVE", "UNPAID_HALF"] {
            XCTAssertFalse(NativeShift.hasOT(NativeShift.day(date("2026-09-09"), group: "C", override: type)))
        }
        XCTAssertTrue(NativeShift.hasOT(NativeShift.day(date("2026-09-09"), group: "C", override: "HALF_PRE")))
    }
    func testMonthlyAndYearlyRecurrenceSkipInvalidCalendarDates() {
        let monthly = event(start: "2026-01-31T09:00", end: "2026-01-31T10:00", frequency: "monthly")
        XCTAssertNil(NativeDayEvents.occurrence(monthly, on: date("2026-02-28")))
        XCTAssertNil(NativeDayEvents.occurrence(monthly, on: date("2026-03-01")))
        XCTAssertEqual(NativeDayEvents.occurrence(monthly, on: date("2026-03-31"))?["start"] as? String, "2026-03-31T09:00")
        let yearly = event(start: "2024-02-29T09:00", end: "2024-02-29T10:00", frequency: "yearly")
        XCTAssertNil(NativeDayEvents.occurrence(yearly, on: date("2025-02-28")))
        XCTAssertEqual(NativeDayEvents.occurrence(yearly, on: date("2028-02-29"))?["start"] as? String, "2028-02-29T09:00")
    }
    func testRecurringUntilInclusiveAndMultiDayEnds() {
        let weekly = event(start: "2026-11-08T23:00", end: "2026-11-09T02:00", frequency: "weekly", until: "2026-11-15")
        XCTAssertEqual(NativeDayEvents.occurrence(weekly, on: date("2026-11-16"))?["start"] as? String, "2026-11-15T23:00")
        XCTAssertNil(NativeDayEvents.occurrence(weekly, on: date("2026-11-22")))
        let midnight = event(start: "2026-11-08T23:00", end: "2026-11-09T00:00")
        XCTAssertNil(NativeDayEvents.occurrence(midnight, on: date("2026-11-09")))
        let allDay = event(start: "2026-11-08T00:00", end: "2026-11-09T00:00", allDay: true)
        XCTAssertNotNil(NativeDayEvents.occurrence(allDay, on: date("2026-11-09")))
        XCTAssertNil(NativeDayEvents.occurrence(allDay, on: date("2026-11-10")))
    }
    func testMultipleMemosLinkedRecurringEventAndMorningReminder() throws {
        let store = NativeStore(file: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json"))
        store.data["shift_day_memo_items_v1"] = ["2026-11-08": ["memo-1": "병원 예약", "memo-2": "장보기"]]
        store.data["shift_day_memos"] = ["2026-11-08": "병원 예약\n\n장보기"]
        var repeated = event(start: "2026-11-08T00:00", end: "2026-11-08T00:00", allDay: true, frequency: "daily", until: "2026-11-10")
        repeated["memoId"] = "memo-1"
        store.data["shift_day_events"] = ["2026-11-08": ["event-1": repeated]]
        let first = NativeDayEvents.entries(on: date("2026-11-08"), store: store)
        XCTAssertEqual(first.count, 2, "Linked event must not duplicate its memo")
        XCTAssertEqual(NativeDayEvents.entries(on: date("2026-11-09"), store: store).count, 1)
        let plans = NativeDayEvents.reminderPlans(store: store, now: date("2026-11-08"))
        XCTAssertEqual(plans.count, 3)
        XCTAssertEqual(plans.map { NativeDates.calendar.component(.hour, from: $0.date) }, [9, 9, 9])
        XCTAssertEqual(Set(plans.map(\.key)).count, 3)
        XCTAssertNoThrow(try NativeLogic.shared.normalized(store.data))
    }
    func testCalendarExportKeepsRepeatButExcludesOtherMonthsAndPrivateMemos() {
        let store = NativeStore(file: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json"))
        store.data["shift_day_events"] = ["2026-11-08": ["this-month": event(start: "2026-11-08T09:00", end: "2026-11-08T10:00", frequency: "weekly")], "2027-01-01": ["future": event(start: "2027-01-01T09:00", end: "2027-01-01T10:00")]]
        store.data["shift_day_memos"] = ["2026-11-08": "첫 줄\r\n둘째 줄\r셋째 줄"]
        let plain = NativeDayEvents.ics(store: store, month: date("2026-11-01"), includeMemos: false)
        XCTAssertFalse(plain.contains("병원 예약"))
        let complete = NativeDayEvents.ics(store: store, month: date("2026-11-01"), includeMemos: true)
        XCTAssertTrue(complete.contains("RRULE:FREQ=WEEKLY"))
        XCTAssertTrue(complete.contains("this-month"))
        XCTAssertFalse(complete.contains("future"))
        XCTAssertTrue(complete.contains("DTSTAMP:"))
        XCTAssertTrue(complete.replacingOccurrences(of: "\r\n ", with: "").contains("첫 줄\\n둘째 줄\\n셋째 줄"))
        XCTAssertTrue(complete.components(separatedBy: "\r\n").allSatisfy { $0.utf8.count <= 75 })
    }
}
