import XCTest
@testable import ShiftCalAlarms

final class ScheduleTests: XCTestCase {
    struct FixtureType: Decodable { let type:String;let label:String }
    struct Fixtures: Decodable { let start:String;let types:[String:FixtureType];let groups:[String:String] }
    func testEveryWebDateMatchesNativeEngine() throws {
        let url=Bundle(for:Self.self).url(forResource:"WebScheduleFixtures",withExtension:"json")!
        let fixture=try JSONDecoder().decode(Fixtures.self,from:Data(contentsOf:url))
        XCTAssertEqual(fixture.groups.values.reduce(0){$0+$1.count},3285)
        let engine=ScheduleEngine(rules:.bundled),start=ScheduleEngine.date(fixture.start)!
        for (group,sequence) in fixture.groups {
            for (offset,code) in sequence.enumerated() {
                let date=ShiftPlanner.korea.date(byAdding:.day,value:offset,to:start)!
                let day=engine.day(date,group:group),expected=fixture.types[String(code)]!
                XCTAssertEqual(day.type.rawValue,expected.type,"\(group) \(day.key)")
                XCTAssertEqual(day.label,expected.label,"\(group) \(day.key)")
            }
        }
    }
    @MainActor
    func testChangesAreGroupScopedPersistAndRestore() throws {
        let defaults=UserDefaults(suiteName:UUID().uuidString)!
        let store=ScheduleStore(defaults:defaults)
        let date=ScheduleEngine.date("2026-10-07")!
        store.setGroup("C");store.update(date,type:.leave,memo:"병원")
        XCTAssertEqual(store.day(date).type,.leave)
        store.setGroup("A");XCTAssertFalse(store.day(date).changed)
        store.update(date,type:.specialNight,memo:"대체 근무")
        let backup=try store.backupData()
        let second=ScheduleStore(defaults:defaults)
        XCTAssertEqual(second.group,"A");XCTAssertEqual(second.day(date).memo,"대체 근무")
        second.setGroup("C");XCTAssertEqual(second.day(date).memo,"병원")
        try second.restore(backup);XCTAssertEqual(second.group,"A")
        second.update(date,type:nil,memo:"");XCTAssertFalse(second.day(date).changed)
    }
    @MainActor
    func testInvalidRestoreDoesNotModifyData() throws {
        let store=ScheduleStore(defaults:UserDefaults(suiteName:UUID().uuidString)!)
        let before=try store.backupData()
        XCTAssertThrowsError(try store.restore(Data("{}".utf8)))
        let bad=ScheduleBackup(version:1,group:"C",overrides:["C:2026-02-30":.leave],memos:[:])
        XCTAssertThrowsError(try store.restore(JSONEncoder().encode(bad)))
        let original=try JSONDecoder().decode(ScheduleBackup.self,from:before)
        XCTAssertEqual(store.group,original.group);XCTAssertEqual(store.overrides,original.overrides)
        XCTAssertNil(ScheduleEngine.date("2026-02-30"))
    }
    @MainActor
    func testBuiltInScheduleAlarmsAndCalendarExportUseEdits() throws {
        let store=ScheduleStore(defaults:UserDefaults(suiteName:UUID().uuidString)!)
        let date=ScheduleEngine.date("2026-10-07")!
        let now=ScheduleEngine.date("2026-10-06")!
        store.update(date,type:.night,memo:"메모, 줄바꿈\n다음 줄")
        let plans=ShiftPlanner.plans(events:store.events(now:now),now:now)
        XCTAssertTrue(plans.contains{$0.date==ShiftPlanner.korea.date(bySettingHour:18,minute:30,second:0,of:date)!})
        store.update(date,type:.leave,memo:"")
        XCTAssertFalse(ShiftPlanner.plans(events:store.events(now:now),now:now).contains{ShiftPlanner.korea.isDate($0.date,inSameDayAs:date)})
        let ics=store.calendarText(for:date)
        XCTAssertTrue(ics.contains("SUMMARY:C조 연차"))
        XCTAssertTrue(ics.contains("DTEND;VALUE=DATE:20261008"))
        for line in ics.components(separatedBy:"\r\n") { XCTAssertLessThanOrEqual(line.utf8.count,75) }
    }
}
