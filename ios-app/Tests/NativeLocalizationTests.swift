import XCTest
@testable import Natbam

@MainActor final class NativeLocalizationTests: XCTestCase {
    private var previousLanguage: String?
    override func setUp() {
        previousLanguage = UserDefaults.standard.string(forKey: NativeLanguage.preferenceKey)
    }
    override func tearDown() {
        UserDefaults.standard.set(previousLanguage, forKey: NativeLanguage.preferenceKey)
    }

    func testSupportedWebPreferenceAndUnknownFallback() {
        XCTAssertEqual(NativeLanguage.resolve("en"), .en)
        XCTAssertEqual(NativeLanguage.resolve("ja"), .ja)
        XCTAssertEqual(NativeLanguage.resolve("zh").bundleCode, "zh-Hans")
        XCTAssertEqual(NativeLanguage.resolve("unsupported"), .ko)
        XCTAssertEqual(NativeLanguage.resolve(nil), .ko)
    }

    func testBundledTranslationsAndUserTextPreservation() {
        XCTAssertEqual(NativeL10n.text("앱 언어", language: .en), "App language")
        XCTAssertEqual(NativeL10n.text("앱 언어", language: .ja), "アプリの言語")
        XCTAssertEqual(NativeL10n.text("앱 언어", language: .zh), "应用语言")
        XCTAssertEqual(NativeL10n.text("앱 언어", language: .ko), "앱 언어")
        let personalNote = "11/8 가족과 식사 — my own words"
        for language in NativeLanguage.allCases {
            XCTAssertEqual(NativeL10n.text(personalNote, language: language), personalNote)
        }
    }

    func testLanguageSurvivesStoreReloadAndBackupWithoutChangingRecords() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("records.json")
        let store = NativeStore(file: url)
        try store.adopt(NativeLogic.shared.normalized(["shift_day_memos": ["2026-11-08": "Keep this original note"]]), owner: nil, parents: [], synced: false)
        let before = store.data
        store.setPreference(NativeLanguage.preferenceKey, "ja")
        XCTAssertEqual(NativeL10n.language, .ja)
        let reloaded = NativeStore(file: url)
        XCTAssertEqual(reloaded.preferences[NativeLanguage.preferenceKey], "ja")
        XCTAssertEqual(NativeL10n.language, .ja)
        XCTAssertTrue(NativeLogic.shared.equal(before, reloaded.data))
        let backup = try reloaded.backup()
        XCTAssertEqual(try reloaded.backupPreferences(backup)[NativeLanguage.preferenceKey], "ja")
    }

    func testLocalizedFormattingKeepsKoreanMoneyAndCalendarRules() {
        let date = NativeDates.date("2026-11-08")!
        NativeL10n.configure("en")
        XCTAssertEqual(NativeL10n.group("C"), "Team C")
        XCTAssertEqual(NativeL10n.won(11050), "₩11,050")
        XCTAssertEqual(NativeL10n.weekday(0), "Sun")
        XCTAssertEqual(NativeDates.key(date), "2026-11-08")
        XCTAssertEqual(NativeDates.calendar.timeZone.identifier, "Asia/Seoul")
        XCTAssertEqual(NativeL10n.format("%@ · %d분 전", "Lunch", 10), "Lunch · 10 min before")
    }
}
