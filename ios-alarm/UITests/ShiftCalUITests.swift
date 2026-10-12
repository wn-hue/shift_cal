import XCTest

final class ShiftCalUITests: XCTestCase {
    @MainActor
    func testCalendarEditPersistsAndAlarmScreenOpens() throws {
        let app=XCUIApplication();app.launch()
        XCTAssertTrue(app.staticTexts["Shift_cal"].waitForExistence(timeout:10))
        app.buttons["open-menu"].tap();app.buttons["menu-group-settings"].tap()
        app.buttons["group-C"].tap();app.buttons["close-menu"].tap()
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"Asia/Seoul")!
        let c=calendar.dateComponents([.year,.month,.day],from:Date())
        let key=String(format:"%04d-%02d-%02d",c.year!,c.month!,c.day!)
        let day=app.buttons["day-\(key)"];XCTAssertTrue(day.exists);day.tap()
        app.buttons["shift-LEAVE"].tap()
        app.buttons["editor-tab-1"].tap()
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
        app.tabBars.buttons["내 근무"].tap()
        let backup=app.buttons["backup-schedule"]
        for _ in 0..<5 { if backup.isHittable { break };app.swipeUp() }
        XCTAssertTrue(backup.isHittable)
        app.buttons["앱 환경"].tap()
        XCTAssertTrue(app.navigationBars["앱 환경"].waitForExistence(timeout:5))
    }
    @MainActor
    func testSupportAndPrivacyAreAvailableInApp() throws {
        let app = XCUIApplication(); app.launch()
        app.tabBars.buttons["내 근무"].tap()
        app.buttons["앱 환경"].tap()
        let support = app.buttons["도움말 및 문의"]
        for _ in 0..<5 { if support.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(support.isHittable); support.tap()
        XCTAssertTrue(app.staticTexts["shiftcalander7@gmail.com"].waitForExistence(timeout:5))
        let screen = XCTAttachment(screenshot: app.screenshot()); screen.name = "지원 안내"; screen.lifetime = .keepAlways; add(screen)
        app.navigationBars.buttons.firstMatch.tap()
        let privacy = app.buttons["개인정보 처리방침"]
        for _ in 0..<3 { if privacy.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(privacy.isHittable); privacy.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format:"label CONTAINS %@", "시행일: 2026-10-12")).firstMatch.waitForExistence(timeout:5))
        let policyScreen = XCTAttachment(screenshot: app.screenshot()); policyScreen.name = "개인정보 처리방침"; policyScreen.lifetime = .keepAlways; add(policyScreen)
    }

    @MainActor
    func testGroupSwitchAndSharedImagePreview() throws {
        let app=XCUIApplication();app.launch()
        app.buttons["open-menu"].tap();app.buttons["menu-group-settings"].tap();app.buttons["group-B"].tap();app.buttons["close-menu"].tap()
        XCTAssertFalse(app.buttons["choose-group"].exists)
        let calendarScreen=XCTAttachment(screenshot:app.screenshot());calendarScreen.name="새 근무표";calendarScreen.lifetime = .keepAlways;add(calendarScreen)
        app.tabBars.buttons["공유"].tap()
        XCTAssertTrue(app.buttons["share-image"].waitForExistence(timeout:5))
        let shareScreen=XCTAttachment(screenshot:app.screenshot());shareScreen.name="공유 탭";shareScreen.lifetime = .keepAlways;add(shareScreen)
        app.buttons["share-image"].tap()
        XCTAssertTrue(app.images["share-preview"].waitForExistence(timeout:10))
        app.buttons["닫기"].tap()
        app.tabBars.buttons["근무표"].tap()
        app.buttons["open-menu"].tap();app.buttons["menu-group-settings"].tap();app.buttons["group-C"].tap();app.buttons["close-menu"].tap()
        let formatter=DateFormatter();formatter.dateFormat="yyyy-MM-dd";formatter.timeZone=TimeZone(identifier:"Asia/Seoul")
        app.buttons["day-"+formatter.string(from:Date())].tap()
        XCTAssertTrue(app.buttons["shift-DAY"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["shift-NIGHT"].exists)
        let editorScreen=XCTAttachment(screenshot:app.screenshot());editorScreen.name="근무 변경";editorScreen.lifetime = .keepAlways;add(editorScreen)
        app.buttons["shift-NIGHT"].tap();app.buttons["취소"].tap()
    }

    @MainActor
    func testVisibleLoginAndExternalCalendarMenu() throws {
        let app=XCUIApplication();app.launch()
        app.tabBars.buttons["내 근무"].tap()
        let login=app.buttons.matching(NSPredicate(format:"label CONTAINS %@","로그인 및 동기화")).firstMatch
        XCTAssertTrue(login.waitForExistence(timeout:10));login.tap()
        XCTAssertTrue(app.buttons["Google로 로그인"].waitForExistence(timeout:5))
        XCTAssertTrue(app.buttons["Apple로 로그인"].exists)
        app.buttons["닫기"].tap()
        app.buttons["iCloud · Google 일정 표시"].tap()
        XCTAssertTrue(app.buttons["캘린더 접근 허용"].waitForExistence(timeout:5))
        XCTAssertTrue(app.navigationBars["내 캘린더"].exists)
    }
}
