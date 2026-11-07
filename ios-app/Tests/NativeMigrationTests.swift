import XCTest
import JavaScriptCore
@testable import Natbam

@MainActor
final class NativeMigrationTests: XCTestCase {
    private func withStore(_ run: (NativeStore) throws -> Void) throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("migration-" + UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: file) }
        try run(NativeStore(file: file))
    }
    func testBothKnownOriginsFollowPreviousAppConfiguration() {
        let names = ["20261104.xyz", "h-lyart-ten.vercel.app", "unrelated.example"]
        XCTAssertEqual(NativeMigration.knownOrigins(displayNames: names, configuredOrigin: "https://20261104.xyz").map(\.host), ["20261104.xyz", "h-lyart-ten.vercel.app"])
        XCTAssertEqual(NativeMigration.knownOrigins(displayNames: names, configuredOrigin: nil).map(\.host), ["h-lyart-ten.vercel.app", "20261104.xyz"])
        XCTAssertTrue(NativeMigration.knownOrigins(displayNames: ["20261104.xyz.invalid"], configuredOrigin: nil).isEmpty)
        XCTAssertEqual(NativeMigration.knownOrigins(displayNames: ["20261104.xyz"], configuredOrigin: nil).count, 1)
    }
    func testStorageReadPreservesServiceStateWithoutCopyingAuthSecrets() throws {
        let values = ["shift_active_group": "B", "shift_bus_favorites_v1": "[\"route-1\"]", "shift_bus_my_shift_v1": "off", "shift_bus_factory_v1": "4", "shift_today_menu_cache_v2": "{}", "shift_community_lab_v1": "{\"posts\":[]}", "shift_display_memos": "false", "shift_google_sync_v2_123": "{\"groups\":{}}", "shift_live_links_v2": "{}", "shift_weather_city": "서울", "shift_account_owner_v1": "123", "shift_account_token": "secret", "shift_session": "secret", "unrelated": "private"]
        let context = JSContext()!
        context.setObject(values, forKeyedSubscript: "saved" as NSString)
        context.evaluateScript("const localStorage={length:Object.keys(saved).length,key:i=>Object.keys(saved)[i],getItem:k=>Object.hasOwn(saved,k)?saved[k]:null};")
        let copied = try XCTUnwrap(context.evaluateScript(NativeMigration.storageScript)?.toDictionary() as? [String: String])
        XCTAssertNil(copied["shift_account_token"]); XCTAssertNil(copied["shift_session"]); XCTAssertNil(copied["unrelated"])
        for key in values.keys where key != "shift_account_token" && key != "shift_session" && key != "unrelated" { XCTAssertEqual(copied[key], values[key], key) }
        let preferences = NativeMigration.preferences(from: copied)
        XCTAssertNil(preferences["shift_active_group"]); XCTAssertNil(preferences["shift_account_owner_v1"])
        XCTAssertEqual(preferences["shift_community_lab_v1"], values["shift_community_lab_v1"])
    }
    func testIncompleteOnboardingKeepsDraftAndLinkedMemoIDs() throws {
        try withStore { store in
            let values = ["shift_active_group": "C", "shift_salary_config_master": "{\"hireDate\":\"2025-01-01\",\"baseHours\":209}", "shift_onboarding_v1": "{\"status\":\"in_progress\",\"step\":1}", "shift_overrides_C": "{\"2026-11-09\":\"HALF_LEAVE\"}", "shift_day_memos": "{\"2026-11-09\":\"병원 예약\\n\\n장보기\"}", "shift_day_memo_items_v1": "{\"2026-11-09\":{\"memo-1\":\"병원 예약\",\"memo-2\":\"장보기\"}}", "shift_bus_factory_v1": "4", "shift_bus_my_shift_v1": "off", "shift_community_lab_v1": "{\"posts\":[],\"decisions\":{}}", "shift_account_owner_v1": "123"]
            try NativeMigration.apply(values, to: store)
            XCTAssertFalse(store.onboardingComplete)
            XCTAssertTrue(store.migrationChecked)
            XCTAssertEqual(store.group, "C")
            XCTAssertEqual(store.owner, "123")
            XCTAssertEqual(store.object("shift_overrides_C")["2026-11-09"] as? String, "HALF_POST")
            XCTAssertEqual((store.object("shift_day_memo_items_v1")["2026-11-09"] as? [String: String])?.count, 2)
            XCTAssertEqual(store.preferences["shift_bus_factory_v1"], "4")
            XCTAssertEqual(store.preferences["shift_bus_my_shift_v1"], "off")
            XCTAssertEqual(store.preferences["shift_community_lab_v1"], values["shift_community_lab_v1"])
        }
    }
    func testCompletedGroupOnlyAndReadyInProgressOnboarding() throws {
        try withStore { store in
            try NativeMigration.apply(["shift_active_group": "B", "shift_onboarding_v1": "{\"status\":\"complete\"}"], to: store)
            XCTAssertTrue(store.onboardingComplete)
            XCTAssertEqual(store.group, "B")
        }
        try withStore { store in
            try NativeMigration.apply(["shift_active_group": "A", "shift_salary_config_master": "{\"hireDate\":\"2025-01-01\",\"baseHourly\":10000,\"ordinaryHourly\":15000}", "shift_onboarding_v1": "{\"status\":\"in_progress\",\"step\":2}"], to: store)
            XCTAssertTrue(store.onboardingComplete)
        }
    }
    func testPreferencesOnlyMigrationAndMalformedDataDoNotLoseDraft() throws {
        try withStore { store in
            try NativeMigration.apply(["shift_bus_favorites_v1": "[\"route-1\"]", "shift_community_lab_v1": "{\"posts\":[]}"], to: store)
            XCTAssertTrue(store.onboardingComplete, "Previous onboarding considers an existing favorite list an existing user")
            XCTAssertEqual(store.preferences["shift_bus_favorites_v1"], "[\"route-1\"]")
            store.data["shift_day_memos"] = ["2026-11-09": "보관할 기록"]
            XCTAssertTrue(store.save())
            let before = store.data
            XCTAssertThrowsError(try NativeMigration.apply(["shift_overrides_C": "not JSON"], to: store))
            XCTAssertTrue(NativeLogic.shared.equal(before, store.data))
        }
    }
    func testOriginalBackupFormatLoadsButUnrelatedAndCredentialFilesAreRejected() throws {
        try withStore { store in
            let valid = try JSONSerialization.data(withJSONObject: ["version": 1, "exportedAt": "2026-11-08T00:00:00Z", "values": ["shift_active_group": "B", "shift_day_memos": "{\"2026-11-09\":\"메모\"}", "shift_bus_factory_v1": "2"]])
            let records = try store.decodeBackup(valid)
            XCTAssertEqual(records["shift_active_group"] as? String, "B")
            XCTAssertEqual((records["shift_day_memos"] as? [String: String])?["2026-11-09"], "메모")
            for malformed in ["{\"values\":{}}", "{\"version\":2,\"values\":{\"shift_active_group\":\"B\"}}", "{\"version\":1,\"values\":{\"unrelated\":\"abc\"}}", "{\"version\":1,\"values\":{\"shift_token\":\"secret\",\"shift_active_group\":\"B\"}}", "{\"data\":{}}"] {
                XCTAssertThrowsError(try store.decodeBackup(Data(malformed.utf8)), malformed)
            }
        }
    }
}
