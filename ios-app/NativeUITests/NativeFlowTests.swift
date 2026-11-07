import XCTest

final class NativeFlowTests: XCTestCase {
    func testOnboardingNativeTabsMemoAndRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchEnvironment["NATIVE_UI_TEST_STORE"] = UUID().uuidString
        app.launch()
        XCTAssertTrue(app.buttons["다음"].waitForExistence(timeout: 20), app.debugDescription)
        app.buttons["다음"].tap()
        XCTAssertTrue(app.buttons["C조"].waitForExistence(timeout: 5))
        app.buttons["C조"].tap()
        tap(app.buttons["다음"], app: app)
        tap(app.buttons["시급·수당 입력하기"], app: app)
        let basic = app.textFields["baseHourly"]
        XCTAssertTrue(basic.waitForExistence(timeout: 5)); basic.tap(); basic.typeText("11050")
        tap(app.buttons["wageNext"], app: app)
        let ordinary = app.textFields["ordinaryHourly"]
        XCTAssertTrue(ordinary.waitForExistence(timeout: 5)); ordinary.tap(); ordinary.typeText("14482")
        tap(app.buttons["wageNext"], app: app)
        tap(app.buttons["wageNext"], app: app)
        XCTAssertTrue(app.staticTexts["입력한 내용을 확인해 주세요"].waitForExistence(timeout: 5))
        tap(app.buttons["wageNext"], app: app)
        let calendar = app.tabBars.buttons["캘린더"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertEqual(app.webViews.count, 0, "Main screen must render natively")
        screenshot(app, name: "01-native-calendar")
        app.buttons["오늘 메모 작성"].tap()
        let memo = app.textViews["메모 내용"]
        XCTAssertTrue(memo.waitForExistence(timeout: 5)); memo.tap(); memo.typeText("SwiftUI 메모 저장 확인")
        tap(app.buttons["키보드 닫기"], app: app)
        memo.tap(); memo.typeText(" 다시 입력")
        app.buttons["저장"].tap()
        XCTAssertTrue(calendar.waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["새 메모"].exists)
        app.tabBars.buttons["조별 근무"].tap()
        XCTAssertEqual(app.webViews.count, 0)
        screenshot(app, name: "02-native-groups")
        app.tabBars.buttons["급여"].tap()
        XCTAssertTrue(app.staticTexts["이번 달 예상 급여"].waitForExistence(timeout: 5), app.debugDescription)
        screenshot(app, name: "03-native-payroll")
        app.tabBars.buttons["전체"].tap()
        XCTAssertTrue(app.navigationBars["근무 루틴"].waitForExistence(timeout: 5))
        screenshot(app, name: "04-native-menu")
        tap(app.buttons["native.menu.wage"], app: app)
        XCTAssertTrue(app.textFields["baseHourly"].waitForExistence(timeout: 5))
        app.textFields["baseHourly"].coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        app.textFields["baseHourly"].typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 5))
        // XCTest can expose an empty SwiftUI text field as either empty text or its placeholder.
        let clearedValue = app.textFields["baseHourly"].value as? String
        XCTAssertTrue(clearedValue == "" || clearedValue == "0", "Field must be empty before closing: \(clearedValue ?? "missing")")
        app.buttons["완료"].firstMatch.tap()
        tap(app.buttons["native.menu.wage"], app: app)
        XCTAssertTrue(app.textFields["baseHourly"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["baseHourly"].value as? String, "0", "Cleared wage must persist as zero when closing")
        app.buttons["완료"].firstMatch.tap()
        for (key, title) in [("leave", "연차 설정"), ("bus", "통근버스"), ("lost", "분실물 찾기"), ("parking", "주차장")] {
            tap(app.buttons["native.menu." + key], app: app)
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 8), app.debugDescription)
            XCTAssertEqual(app.webViews.count, 0)
            app.buttons["닫기"].firstMatch.tap()
        }
        app.terminate(); app.launch()
        XCTAssertTrue(app.tabBars.buttons["캘린더"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.navigationBars["근무 루틴 시작하기"].exists, "Completed onboarding must not flash or reopen")
        app.tabBars.buttons["전체"].tap()
        tap(app.buttons["native.settings"], app: app)
        tap(app.buttons["native.language"], app: app)
        tap(app.buttons["English"], app: app)
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5), app.debugDescription)
        screenshot(app, name: "05-native-language-english")
        app.terminate(); app.launch()
        XCTAssertTrue(app.tabBars.buttons["Calendar"].waitForExistence(timeout: 15), "Language must survive relaunch")
        app.tabBars.buttons["All"].tap()
        XCTAssertTrue(app.staticTexts["Hourly pay & allowances"].waitForExistence(timeout: 5), app.debugDescription)
        screenshot(app, name: "06-native-menu-english")
    }
    private func tap(_ element: XCUIElement, app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 8), app.debugDescription)
        for _ in 0..<5 where !element.isHittable { app.swipeUp() }
        element.tap()
    }
    private func screenshot(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
