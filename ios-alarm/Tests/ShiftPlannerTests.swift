import XCTest
@testable import ShiftCalAlarms

final class ShiftPlannerTests: XCTestCase {
    private let notes = "Shift_cal 근무 일정\n메모:\n"
    private func date(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
    private func event(_ title: String, day: String = "2026-10-02T00:00:00+09:00", notes: String? = nil, allDay: Bool = true) -> ShiftEvent {
        ShiftEvent(title: title, notes: notes ?? self.notes, start: date(day), allDay: allDay)
    }

    func testDayNightAndSpecialUseStartDateInKorea() {
        let now = date("2026-10-01T00:00:00+09:00")
        for title in ["A조 주간 1일차", "B조 주특", "C조 주간 특근", "A조 주간 · O.T해제"] {
            let result = ShiftPlanner.plans(events: [event(title)], now: now)
            XCTAssertEqual(result.map(\.date), [date("2026-10-02T06:30:00+09:00")])
        }
        for title in ["C조 야간 4일차", "A조 야특", "B조 야간 특근", "C조 야간 · O.T해제"] {
            let result = ShiftPlanner.plans(events: [event(title)], now: now)
            XCTAssertEqual(result.map(\.date), [date("2026-10-02T18:30:00+09:00")])
        }
    }

    func testLeaveOffUnknownPersonalAndTimedEventsDoNotRing() {
        let now = date("2026-10-01T00:00:00+09:00")
        let excluded = ["A조 연차 · 야간", "A조 휴무", "B조 무급 휴무 · 주간", "C조 무급 · 야간", "A조 야간 약속", "회의", "A조 주간업무"]
        for title in excluded {
            XCTAssertTrue(ShiftPlanner.plans(events: [event(title)], now: now).isEmpty, title)
        }
        XCTAssertTrue(ShiftPlanner.plans(events: [event("A조 주간", notes: "개인 메모")], now: now).isEmpty)
        XCTAssertTrue(ShiftPlanner.plans(events: [event("A조 주간", allDay: false)], now: now).isEmpty)
    }

    func testHalfDaysRequireOptInAndOriginalShift() {
        let now = date("2026-10-01T00:00:00+09:00")
        for prefix in ["반차(전)", "반차(후)", "무급 반차(전)", "무급 반차(후)"] {
            let item = event("C조 \(prefix) · 야간 · O.T해제")
            XCTAssertTrue(ShiftPlanner.plans(events: [item], now: now).isEmpty)
            XCTAssertEqual(ShiftPlanner.plans(events: [item], now: now, includeHalf: true).first?.date, date("2026-10-02T18:30:00+09:00"))
        }
        XCTAssertTrue(ShiftPlanner.plans(events: [event("A조 반차(전)")], now: now, includeHalf: true).isEmpty)
    }

    func testPastAlarmsAreNotRecreatedAndOnlyThirtyDaysAreReserved() {
        let now = date("2026-10-02T06:30:00+09:00")
        XCTAssertTrue(ShiftPlanner.plans(events: [event("A조 주간")], now: now).isEmpty)
        XCTAssertEqual(ShiftPlanner.plans(events: [event("A조 야간")], now: now).count, 1)
        XCTAssertTrue(ShiftPlanner.plans(events: [event("A조 야간", day: "2026-11-01T00:00:00+09:00")], now: now).isEmpty)
    }

    func testDeduplicationAndWorkChangeProduceNewDesiredSet() {
        let now = date("2026-10-01T00:00:00+09:00")
        let day = event("A조 주간")
        XCTAssertEqual(ShiftPlanner.plans(events: [day, day], now: now).count, 1)
        let night = ShiftPlanner.plans(events: [event("A조 야특")], now: now)
        XCTAssertNotEqual(night.first?.key, ShiftPlanner.plans(events: [day], now: now).first?.key)
        XCTAssertTrue(ShiftPlanner.plans(events: [event("A조 연차 · 주간")], now: now).isEmpty)
        XCTAssertTrue(ShiftPlanner.plans(events: [], now: now).isEmpty)
    }

    func testCalendarProviderNewlineNormalization() {
        let now = date("2026-10-01T00:00:00+09:00")
        for notes in ["Shift_cal 근무 일정\n메모:", "Shift_cal 근무 일정\r\n메모:\r\n메모 내용"] {
            XCTAssertEqual(ShiftPlanner.plans(events: [event("A조 주간", notes: notes)], now: now).count, 1)
        }
    }
}
