import XCTest
@testable import Natbam

@MainActor
final class NativePayrollTests: XCTestCase {
    private func date(_ key: String) -> Date { NativeDates.date(key)! }
    private func leave(_ hire: String, year: Int = 2026, asOf: String, overrides: [String: Any] = [:], extra: [String: Any] = [:]) -> NativeLeaveMetrics.Result {
        NativeLeaveMetrics.calculate(config: ["hireDate": hire].merging(extra) { _, new in new }, overrides: overrides, year: year, asOf: date(asOf))
    }
    func testMonthlyLeaveDueDatesAndLeapAnniversaryMatchExistingRules() {
        XCTAssertEqual(leave("2026-06-16", asOf: "2026-07-15").total, 0)
        XCTAssertEqual(leave("2026-06-16", asOf: "2026-07-16").total, 1)
        XCTAssertEqual(leave("2026-06-16", asOf: "2026-10-16").total, 4)
        XCTAssertEqual(leave("2026-01-31", asOf: "2026-02-28").monthlyGenerated, 0)
        XCTAssertEqual(leave("2026-01-31", asOf: "2026-03-01").monthlyGenerated, 1)
        XCTAssertEqual(leave("2024-02-29", year: 2025, asOf: "2025-02-28").monthlyGenerated, 11)
        XCTAssertEqual(leave("2024-02-29", year: 2025, asOf: "2025-03-01").total, 12.6)
        XCTAssertEqual(leave("2026-06-16", year: 2027, asOf: "2026-10-16").total, 0)
        XCTAssertEqual(leave("2026-06-16", asOf: "2027-02-01").total, 6)
    }
    func testLeaveCarryExpiresWithoutLosingPreviouslyUsedDays() {
        let overrides: [String: Any] = ["2025-08-01": "LEAVE", "2025-09-01": "HALF_PRE", "2025-09-02": "HALF_POST", "2026-01-10": "LEAVE", "2026-03-02": "HALF_POST", "2026-03-03": "HALF_PRE"]
        let january = leave("2025-06-16", asOf: "2026-01-16", overrides: overrides)
        XCTAssertEqual(january.automatic, 13.2, accuracy: 0.001)
        XCTAssertEqual(january.used, 2)
        let anniversary = leave("2025-06-16", asOf: "2026-06-16", overrides: overrides)
        XCTAssertEqual(anniversary.automatic, 10.2, accuracy: 0.001)
        XCTAssertEqual(anniversary.remaining, 8.2, accuracy: 0.001)
        XCTAssertEqual(leave("2025-12-16", asOf: "2026-01-16").total, 1.7, accuracy: 0.001)
        XCTAssertEqual(leave("2015-06-16", asOf: "2026-10-16").total, 19)
        XCTAssertEqual(leave("1990-01-01", asOf: "2026-10-16").total, 25)
    }
    func testLegacyZeroRecoveryHonorsExplicitManualZero() {
        let legacy = leave("2026-06-16", asOf: "2026-10-16", extra: ["leaveByYear": ["2026": 0]])
        XCTAssertEqual(legacy.total, 4)
        XCTAssertFalse(legacy.manual)
        let explicit = leave("2026-06-16", asOf: "2026-10-16", extra: ["leaveByYear": ["2026": 0], "leaveManualYears": ["2026": true]])
        XCTAssertEqual(explicit.total, 0)
        XCTAssertTrue(explicit.manual)
        XCTAssertEqual(leave("2015-06-16", asOf: "2026-10-16", extra: ["leaveByYear": ["2026": 0]]).total, 0)
    }
    func testWageInputRemovesLeadingZeroAndRejectsOutOfRangeAmount() {
        XCTAssertEqual(NativePayroll.cleanAmount("00012000"), "12000")
        XCTAssertEqual(NativePayroll.cleanAmount("70,000원"), "70000")
        XCTAssertEqual(NativePayroll.cleanAmount(""), "")
        XCTAssertNil(NativePayroll.amount("0", positive: true))
        XCTAssertNil(NativePayroll.amount("1000000001"))
        XCTAssertNil(NativePayroll.amount(NativePayroll.cleanAmount("-70,000")))
        XCTAssertNil(NativePayroll.amount(NativePayroll.cleanAmount("12.50")))
        XCTAssertNil(NativePayroll.amount(NativePayroll.cleanAmount("10000000000")))
        XCTAssertEqual(NativePayroll.amount("1000000000"), 1_000_000_000)
    }
    func testBundledDeductionsPreserveAgreedReferencesAndPersonalZero() throws {
        let standard = try XCTUnwrap(NativeLogic.shared.call("PayrollEstimate.estimate", args: [5781870]) as? [String: Any])
        XCTAssertEqual(NativePayroll.number(standard["total"]), 1045860)
        XCTAssertEqual(NativePayroll.number(standard["net"]), 4736010)
        let parts = try XCTUnwrap(NativeLogic.shared.call("PayrollEstimate.estimatePayments", args: [["regular": 5781870, "bonus": 1224725, "support": 0]]) as? [String: Any])
        XCTAssertEqual(NativePayroll.number(parts["total"]), 1075430)
        XCTAssertEqual(NativePayroll.number(parts["net"]), 5931165)
        let zero = try XCTUnwrap(NativeLogic.shared.call("PayrollEstimate.estimate", args: [5781870, ["rate": 0]]) as? [String: Any])
        XCTAssertEqual(NativePayroll.number(zero["total"]), 0)
    }
    func testTaxOnlyImportCannotReplaceWagesOrStoreRawStatement() throws {
        let raw = "지급내역\n기본시급 99,999\n직책수당 900,000\n지급 합계 1,000,000\n공제내역\n소득세 90,000\n지방소득세 10,000\n공제 합계 100,000"
        let parsed = try XCTUnwrap(NativeLogic.shared.call("PayrollSMS.parse", args: [raw, ["kind": "salary", "taxOnly": true]]) as? [String: Any])
        XCTAssertTrue((parsed["wages"] as? [String: Any])?.isEmpty == true)
        let profile = try XCTUnwrap(parsed["profile"] as? [String: Any])
        let minimal = try XCTUnwrap(NativeLogic.shared.call("PayrollEstimate.minimalProfile", args: [profile]) as? [String: Any])
        XCTAssertEqual(Set(minimal.keys), ["rate"])
        XCTAssertEqual(NativePayroll.number(minimal["rate"]), 0.1, accuracy: 0.000001)
    }
    func testNativeSnapshotCountsAndHolidayPayUseActualWorkAndCrew() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: file) }
        let store = NativeStore(file: file)
        store.data["shift_active_group"] = "C"
        store.data["shift_salary_config_master"] = ["hireDate": "2015-06-16", "baseHourly": 10000, "ordinaryHourly": 15000, "baseHours": 209, "dutyPay": 0, "holidayBonus": 60000, "holidayWorkPay": ["C": ["2026-02-17": 50000], "A": ["2026-02-17": 90000]]]
        store.data["shift_overrides_C"] = ["2026-02-17": "SPECIAL_DAY"]
        let march = NativePayroll.snapshot(month: date("2026-03-01"), store: store)
        XCTAssertEqual(march.start, "2026-02-16")
        XCTAssertEqual(march.end, "2026-03-15")
        XCTAssertEqual(march.holidayPay, 50000)
        XCTAssertEqual(march.gross, march.rows.reduce(0) { $0 + $1.1 }, accuracy: 0.001)
        XCTAssertEqual(march.gross, march.net + march.deductions)
        XCTAssertEqual(NativePayroll.snapshot(month: date("2026-02-01"), store: store).holidayPay, 0)
        let beforePreview = store.data
        let preview = NativePayroll.payChange(date: date("2026-02-17"), group: "C", override: "LEAVE", store: store)
        XCTAssertTrue(NativeLogic.shared.equal(beforePreview, store.data), "Preview must not save a hypothetical shift")
        store.data["shift_overrides_C"] = ["2026-02-17": "LEAVE"]
        let withoutHolidayWork = NativePayroll.snapshot(month: date("2026-03-01"), store: store)
        XCTAssertEqual(withoutHolidayWork.holidayPay, 0)
        XCTAssertEqual(preview, withoutHolidayWork.gross - march.gross)
        XCTAssertLessThan(preview, -50000, "Removing holiday work must remove both shift pay and its recorded holiday allowance")
        store.data["shift_overrides_C"] = ["2026-02-17": "SPECIAL_DAY"]
        var config = store.config
        config["holidayWorkPay"] = ["C": ["2026-02-17": 0]]
        store.data["shift_salary_config_master"] = config
        XCTAssertEqual(NativePayroll.snapshot(month: date("2026-03-01"), store: store).holidayPay, 0)
    }
    func testManualHourlyChangePreservesOtherFieldsUpdatedBySync() throws {
        let remote: [String: Any] = ["baseHourly": 11000, "ordinaryHourly": 16500, "hireDate": "2016-05-01", "seniorityPayOverride": 60000,
            "dutyPay": 90000, "fixedAllowances": ["qualification": 20000, "job": 0, "family": 70000, "duty": 0, "legacy": 0]]
        let updated = try NativeWageUpdate.config(current: remote, baseHourly: 0)
        XCTAssertEqual(NativePayroll.number(updated["baseHourly"]), 0)
        XCTAssertEqual(NativePayroll.number(updated["ordinaryHourly"]), 16500)
        XCTAssertEqual(NativePayroll.number(updated["seniorityPayOverride"]), 60000)
        XCTAssertEqual(NativePayroll.number(updated["dutyPay"]), 90000)
        XCTAssertTrue(NativeLogic.shared.equal(updated["fixedAllowances"] as! [String: Any], remote["fixedAllowances"] as! [String: Any]))
    }
    func testChangingOneAllowancePreservesRemoteCategoriesAndLegacyPay() throws {
        let legacy = try NativeWageUpdate.config(current: ["dutyPay": 50000], allowances: ["family": 70000])
        XCTAssertEqual((legacy["fixedAllowances"] as? [String: Int])?["legacy"], 50000)
        XCTAssertEqual(NativePayroll.number(legacy["dutyPay"]), 120000)
        var remote = legacy
        remote["fixedAllowances"] = ["qualification": 40000, "job": 30000, "family": 70000, "duty": 10000, "legacy": 50000]
        remote["dutyPay"] = 200000
        let updated = try NativeWageUpdate.config(current: remote, allowances: ["family": 0])
        let fixed = updated["fixedAllowances"] as! [String: Int]
        XCTAssertEqual(fixed["qualification"], 40000)
        XCTAssertEqual(fixed["job"], 30000)
        XCTAssertEqual(fixed["duty"], 10000)
        XCTAssertEqual(fixed["family"], 0)
        XCTAssertEqual(NativePayroll.number(updated["dutyPay"]), 130000)
    }
    func testWagePersistenceFailureKeepsSavedRecordsAndAllowsRetry() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent("records.json")
        let store = NativeStore(file: file)
        try store.adopt(["shift_salary_config_master": ["baseHourly": 11000, "ordinaryHourly": 16500], "shift_payroll_sms_reference_v1": ["rate": 0.12]], owner: "test-account", parents: [], synced: true)
        let before = store.data
        let update = try NativeWageUpdate.config(current: store.config, baseHourly: 0)
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true)
        XCTAssertThrowsError(try NativeWageUpdate.commit(store: store, config: update))
        XCTAssertTrue(NativeLogic.shared.equal(store.data, before))
        XCTAssertNotNil(store.error)
        try FileManager.default.removeItem(at: file)
        try NativeWageUpdate.commit(store: store, config: update)
        let restored = NativeStore(file: file)
        XCTAssertEqual(NativePayroll.number(restored.config["baseHourly"]), 0)
        XCTAssertEqual(NativePayroll.number(restored.config["ordinaryHourly"]), 16500)
        XCTAssertEqual(NativePayroll.number(restored.object("shift_payroll_sms_reference_v1")["rate"]), 0.12, accuracy: 0.000001)
        XCTAssertEqual(restored.owner, "test-account")
    }

}
