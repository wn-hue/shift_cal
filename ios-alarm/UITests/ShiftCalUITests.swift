import XCTest

final class ShiftCalUITests: XCTestCase {
    @MainActor
    func testCalendarEditPersistsAndAlarmScreenOpens() throws {
        let app=XCUIApplication();app.launch()
        XCTAssertTrue(app.staticTexts["Shift_cal"].waitForExistence(timeout:10))
        app.segmentedControls["group-picker"].buttons["C조"].tap()
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"Asia/Seoul")!
        let c=calendar.dateComponents([.year,.month,.day],from:Date())
        let key=String(format:"%04d-%02d-%02d",c.year!,c.month!,c.day!)
        let day=app.buttons["day-\(key)"];XCTAssertTrue(day.exists);day.tap()
        let picker=app.buttons["shift-editor"]
        if picker.exists { picker.tap() } else { app.otherElements["shift-editor"].tap() }
        app.buttons["연차"].tap()
        let memo=app.descendants(matching:.any)["memo-editor"].firstMatch
        XCTAssertTrue(memo.exists);memo.tap();memo.typeText("iOS 확인 메모")
        app.buttons["save-shift"].tap()
        XCTAssertEqual(app.staticTexts["today-shift"].label,"연차")
        app.terminate();app.launch()
        XCTAssertTrue(app.staticTexts["today-shift"].waitForExistence(timeout:10))
        XCTAssertEqual(app.staticTexts["today-shift"].label,"연차")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@", "iOS 확인 메모")).firstMatch.exists)
        let screen=XCTAttachment(screenshot:app.screenshot());screen.name="근무표";screen.lifetime = .keepAlways;add(screen)
        app.tabBars.buttons["알람"].tap()
        XCTAssertTrue(app.switches["automatic-alarms"].waitForExistence(timeout:5))
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["backup-schedule"].waitForExistence(timeout:5))
    }
}
