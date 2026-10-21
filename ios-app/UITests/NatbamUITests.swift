import XCTest

final class NatbamUITests: XCTestCase {
    func testAlarmSettingsAndTestScheduling() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--alarm-settings"]
        app.launch()
        XCTAssertTrue(app.navigationBars["근무 알람"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.switches["shiftAlarmToggle"].exists)
        let test = app.buttons["testAlarmButton"]
        XCTAssertTrue(test.exists)
        // Permission belongs to iOS, not the web page. Handle both English/Korean simulator language.
        addUIInterruptionMonitor(withDescription: "Alarm permission") { alert in
            for title in ["Allow", "허용"] where alert.buttons[title].exists { alert.buttons[title].tap(); return true }
            return false
        }
        test.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.firstMatch.waitForExistence(timeout: 3) {
            let alert = springboard.alerts.firstMatch
            if alert.buttons["Allow"].exists { alert.buttons["Allow"].tap() }
            else if alert.buttons["허용"].exists { alert.buttons["허용"].tap() }
        }
        // iOS 27 simulator may deny without presenting the permission prompt.
        // Exercise the actual Settings fallback; never fake authorization.
        if !app.buttons["테스트 알람 취소"].waitForExistence(timeout: 3) {
            let settingsButton = app.buttons["아이폰 설정 열기"]
            if !settingsButton.isHittable { app.swipeUp() }
            XCTAssertTrue(settingsButton.waitForExistence(timeout: 5))
            settingsButton.tap()
            let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
            let permission = settings.switches.matching(NSPredicate(format: "label CONTAINS[c] 'Alarm' OR label CONTAINS '알람'")).firstMatch
            if !permission.waitForExistence(timeout: 3) {
                // Some simulator versions open the root Settings page instead.
                let apps = settings.buttons["com.apple.settings.apps"]
                for _ in 0..<5 where !apps.isHittable { settings.swipeUp() }
                if apps.exists { apps.tap() }
                let entry = settings.buttons["com.wnhue.natbam.test"]
                if entry.waitForExistence(timeout: 5) { entry.tap() }
            }
            XCTAssertTrue(permission.waitForExistence(timeout: 10), settings.debugDescription)
            if permission.value as? String == "0" { permission.tap() }
            app.activate()
            if !test.isHittable { app.swipeDown() }
            test.tap()
        }
        XCTAssertTrue(app.buttons["테스트 알람 취소"].waitForExistence(timeout: 15))
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["테스트 알람 취소"].tap()
        XCTAssertTrue(app.buttons["testAlarmButton"].exists)
        app.buttons["완료"].tap()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
    }
    func testScheduledAlarmSurvivesRelaunchAndAlertsInBackground() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--alarm-settings"]
        app.launch()
        XCTAssertTrue(app.buttons["testAlarmButton"].waitForExistence(timeout: 20))
        app.buttons["testAlarmButton"].tap()
        XCTAssertTrue(app.buttons["테스트 알람 취소"].waitForExistence(timeout: 15))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["테스트 알람 취소"].waitForExistence(timeout: 20), "Scheduled alarm must survive process restart")
        XCUIDevice.shared.press(.home)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alarm = springboard.staticTexts["교대 루틴 테스트 알람"].firstMatch
        XCTAssertTrue(alarm.waitForExistence(timeout: 70), "AlarmKit must present the scheduled alarm while app is backgrounded")
        let attachment = XCTAttachment(screenshot: springboard.screenshot()); attachment.lifetime = .keepAlways
        add(attachment)
        app.activate()
        let cancel = app.buttons["테스트 알람 취소"]
        if cancel.exists { cancel.tap() }
    }

}
