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
    @MainActor
    func testSupportAndPrivacyAreAvailableInApp() throws {
        let app = XCUIApplication(); app.launch()
        app.tabBars.buttons["설정"].tap()
        let support = app.buttons["도움말 및 문의"]
        for _ in 0..<5 { if support.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(support.isHittable); support.tap()
        XCTAssertTrue(app.staticTexts["shiftcalander7@gmail.com"].waitForExistence(timeout:5))
        let screen = XCTAttachment(screenshot: app.screenshot()); screen.name = "지원 안내"; screen.lifetime = .keepAlways; add(screen)
        app.navigationBars.buttons.firstMatch.tap()
        let privacy = app.buttons["개인정보 처리방침"]
        for _ in 0..<3 { if privacy.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(privacy.isHittable); privacy.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@", "시행일: 2026-10-07")).firstMatch.waitForExistence(timeout:5))
        let policyScreen = XCTAttachment(screenshot: app.screenshot()); policyScreen.name = "개인정보 처리방침"; policyScreen.lifetime = .keepAlways; add(policyScreen)
    }

}
