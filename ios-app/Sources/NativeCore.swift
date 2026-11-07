import SwiftUI
import JavaScriptCore
import UniformTypeIdentifiers
import UserNotifications

enum NativeDates {
    static var calendar: Calendar { ShiftPlanner.korea }
    static func key(_ date: Date) -> String {
        let f = DateFormatter(); f.calendar = calendar; f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
    static func date(_ key: String) -> Date? { ShiftPlanner.date(key) }
    static func monthTitle(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = NativeL10n.locale; formatter.calendar = calendar; formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("yyyyMMMM")
        return formatter.string(from: date)
    }
    static func money(_ value: Double) -> String { NativeL10n.won(value) }
}

enum NativeColors {
    static let blue = Color(red: 0.19, green: 0.49, blue: 0.95)
    static let background = Color(uiColor: .systemGroupedBackground)
}
struct NativeCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { VStack(alignment: .leading, spacing: 16) { content }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 24)) }
}

/// Offline, bundled business rules shared with the web version. No HTML, DOM or remote script execution.
@MainActor final class NativeLogic {
    static let shared = NativeLogic()
    private let context: JSContext
    private(set) var lastError: String?
    init(bundle: Bundle = .main) {
        context = JSContext()!
        context.exceptionHandler = { [weak self] _, error in self?.lastError = error?.toString() }
        context.evaluateScript("var window = globalThis;")
        for name in ["account-data-core", "planner-core", "payroll-estimate", "payroll-sms", "holiday-work-pay-core", "day-scheduler-core", "day-memos-core", "day-entry-core", "google-sync-core", "salary-challenge", "bus-routes", "bus-stop-locations", "bus-factory-locations", "bus-location-core", "weather-forecast"] {
            if let url = bundle.url(forResource: name, withExtension: "js"), let source = try? String(contentsOf: url, encoding: .utf8) { context.evaluateScript(source, withSourceURL: url) }
        }
        context.evaluateScript("""
        function nativeBusSchedule(date){ return ShiftBusRoutes.forDate(date); }
        function nativeBusPlaces(){ return BusStopLocations.points; }
        function nativeBusFactories(){ return BusFactoryLocations.points; }
        function nativeBusSearch(routes,q){ return BusLocationCore.searchRoutes(routes,q,BusStopLocations.points); }
        function nativeBusRecommend(routes,period,point,selected,radius){ return BusLocationCore.recommend(routes,period,point,BusStopLocations.points,{selectedPlace:selected||null,radius:radius||null}); }
        """)
    }
    func call(_ name: String, args: [Any] = []) -> Any? {
        lastError = nil; context.exception = nil
        var value = context.globalObject
        for part in name.split(separator: ".") { value = value?.objectForKeyedSubscript(String(part)) }
        guard let value, !value.isUndefined, !value.isNull else { lastError = "계산 모듈을 불러오지 못했어요."; return nil }
        let result = value.call(withArguments: args)
        guard context.exception == nil else { return nil }
        return result?.toObject()
    }
    func normalized(_ value: [String: Any]) throws -> [String: Any] {
        guard let result = call("AccountDataCore.normalize", args: [value]) as? [String: Any] else { throw NativeFailure(lastError ?? "저장할 기록을 확인해 주세요.") }
        return result
    }
    func meaningful(_ value: [String: Any]) -> Bool { call("AccountDataCore.meaningful", args: [value]) as? Bool ?? false }
    func equal(_ a: [String: Any], _ b: [String: Any]) -> Bool { call("AccountDataCore.equal", args: [a, b]) as? Bool ?? false }
}

struct NativeFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { NativeL10n.text(message) }
}

@MainActor final class NativeStore: ObservableObject {
    @Published var data: [String: Any] = [:]
    @Published var onboardingComplete = false
    @Published var error: String?
    @Published private(set) var changeID = UUID()
    @Published var preferences: [String: String] = [:] { didSet { NativeL10n.configure(preferences[NativeLanguage.preferenceKey]) } }
    private(set) var owner: String?
    private(set) var baseline: [String: Any]?
    private(set) var parents: [String] = []
    private(set) var migrationChecked = false
    private var accountCaches: [String: Any] = [:]
    private var persistenceBlocked = false
    private var deletionEpochs: [String: Double] = [:]
    private let file: URL
    var didSave: (() -> Void)?
    var isNewInstallation: Bool { !FileManager.default.fileExists(atPath: file.path) }
    init(file: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        #if DEBUG && targetEnvironment(simulator)
        let testID = ProcessInfo.processInfo.environment["NATIVE_UI_TEST_STORE"].flatMap(UUID.init(uuidString:))
        self.file = file ?? support.appendingPathComponent(testID.map { "NativeUITests/" + $0.uuidString + ".json" } ?? "WorkRoutine/native-records-v1.json")
        #else
        self.file = file ?? support.appendingPathComponent("WorkRoutine/native-records-v1.json")
        #endif
        if FileManager.default.fileExists(atPath: self.file.path) {
            do {
                let bytes = try Data(contentsOf: self.file)
                guard let saved = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], saved["version"] as? Int == 1, let records = saved["data"] as? [String: Any] else { throw NativeFailure("저장 파일을 읽지 못했어요. 기존 파일은 그대로 보관하고 있어요.") }
                data = try NativeLogic.shared.normalized(records)
                onboardingComplete = saved["onboardingComplete"] as? Bool ?? false
                owner = saved["owner"] as? String; baseline = saved["baseline"] as? [String: Any]
                parents = saved["parents"] as? [String] ?? []; preferences = saved["preferences"] as? [String: String] ?? [:]
                accountCaches = saved["accountCaches"] as? [String: Any] ?? [:]
                deletionEpochs = saved["deletionEpochs"] as? [String: Double] ?? [:]
                migrationChecked = saved["migrationChecked"] as? Bool ?? false
            } catch { self.error = error.localizedDescription; persistenceBlocked = true }
        } else { data = (try? NativeLogic.shared.normalized([:])) ?? [:] }
        NativeL10n.configure(preferences[NativeLanguage.preferenceKey])
    }
    var group: String {
        get { data["shift_active_group"] as? String ?? "C" }
        set { guard ["A", "B", "C"].contains(newValue) else { return }; data["shift_active_group"] = newValue; save() }
    }
    var config: [String: Any] { object("shift_salary_config_master") }
    func object(_ key: String) -> [String: Any] { data[key] as? [String: Any] ?? [:] }
    func setObject(_ key: String, _ value: [String: Any]) { data[key] = value; save() }
    func updateConfig(_ changes: [String: Any]) { data["shift_salary_config_master"] = config.merging(changes) { _, new in new }; save() }
    func completeOnboarding() { onboardingComplete = true; save() }
    func setPreference(_ key: String, _ value: String) { preferences[key] = value; save() }
    @discardableResult func save(notify: Bool = true) -> Bool {
        guard !persistenceBlocked else { error = "기존 저장 파일을 읽지 못해 새 내용으로 덮어쓰지 않았어요. 백업 파일 복원을 먼저 진행해 주세요."; return false }
        do {
            data = try NativeLogic.shared.normalized(data)
            var document: [String: Any] = ["version": 1, "data": data, "preferences": preferences, "onboardingComplete": onboardingComplete, "migrationChecked": migrationChecked, "parents": parents, "accountCaches": accountCaches, "deletionEpochs": deletionEpochs]
            document["owner"] = owner; document["baseline"] = baseline
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys]).write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
            changeID = UUID(); if notify { didSave?() }; return true
        } catch { self.error = "기록을 저장하지 못했어요. " + error.localizedDescription; return false }
    }
    private func transaction(_ change: () -> Void) throws {
        let before = (data, preferences, owner, baseline, parents, onboardingComplete, migrationChecked, accountCaches, deletionEpochs)
        change()
        guard save(notify: false) else {
            (data, preferences, owner, baseline, parents, onboardingComplete, migrationChecked, accountCaches, deletionEpochs) = before
            throw NativeFailure(error ?? "기록을 저장하지 못했어요.")
        }
    }
    func adopt(_ records: [String: Any], owner: String?, parents: [String], synced: Bool) throws {
        let normalized = try NativeLogic.shared.normalized(records)
        let preserveOnboarding = self.owner == owner && baseline != nil
        let previousOnboarding = onboardingComplete
        try transaction {
            cacheCurrent(); data = normalized; self.owner = owner; self.parents = parents
            baseline = synced ? normalized : nil
            onboardingComplete = preserveOnboarding ? previousOnboarding : NativeLogic.shared.meaningful(normalized)
        }
    }
    func switchAccount(to id: String) throws {
        guard owner != id && (owner != nil || accountCaches[id] != nil || !NativeLogic.shared.meaningful(data)) else { return }
        try transaction {
            cacheCurrent()
            data = accountCaches[id] as? [String: Any] ?? (try? NativeLogic.shared.normalized([:])) ?? [:]
            owner = id; baseline = nil; parents = []
            onboardingComplete = NativeLogic.shared.meaningful(data)
        }
    }
    func markSynced(_ records: [String: Any], revision: String, owner: String) throws {
        let normalized = try NativeLogic.shared.normalized(records)
        try transaction { baseline = normalized; parents = [revision]; self.owner = owner }
    }
    func cacheCurrent() { if NativeLogic.shared.meaningful(data) { accountCaches[owner ?? "__guest"] = data } }
    func disconnect() throws {
        try transaction {
            cacheCurrent(); owner = nil; baseline = nil; parents = []
            data = accountCaches["__guest"] as? [String: Any] ?? (try? NativeLogic.shared.normalized([:])) ?? [:]
            onboardingComplete = NativeLogic.shared.meaningful(data)
        }
    }
    func applyDeletion(owner id: String, epoch: Double) throws {
        guard epoch > 0, epoch > (deletionEpochs[id] ?? 0) else { return }
        try transaction {
            accountCaches.removeValue(forKey: id)
            if owner == id { data = (try? NativeLogic.shared.normalized([:])) ?? [:]; baseline = nil; parents = []; owner = nil; onboardingComplete = false }
            deletionEpochs[id] = epoch
        }
    }
    func importRecords(_ records: [String: Any], preferences: [String: String] = [:], owner: String? = nil, onboardingComplete: Bool? = nil) throws {
        let normalized = try NativeLogic.shared.normalized(records)
        if persistenceBlocked {
            try FileManager.default.copyItem(at: file, to: file.deletingLastPathComponent().appendingPathComponent("unreadable-" + UUID().uuidString + ".json"))
            persistenceBlocked = false
        }
        try transaction {
            cacheCurrent(); data = normalized; self.owner = owner; parents = []; baseline = nil
            self.onboardingComplete = onboardingComplete ?? NativeLogic.shared.meaningful(normalized)
            self.preferences.merge(preferences) { _, new in new }; migrationChecked = true
        }
    }
    func markMigrationChecked() throws { try transaction { migrationChecked = true } }
    private func backupObject(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 6_000_000, let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw NativeFailure("근무 루틴 백업 파일을 선택해 주세요.") }
        return object
    }
    static func allowedBackupKey(_ key: String) -> Bool {
        key.range(of: "^shift_[a-zA-Z0-9_.:@-]{1,180}$", options: .regularExpression) != nil && key.range(of: "token|credential|session|subscription", options: [.regularExpression, .caseInsensitive]) == nil
    }
    func decodeBackup(_ bytes: Data) throws -> [String: Any] {
        let object = try backupObject(bytes)
        if object["values"] != nil {
            guard object["version"] as? Int == 1, let values = object["values"] as? [String: String], values.count <= 2000, values.keys.allSatisfy(Self.allowedBackupKey) else { throw NativeFailure("지원하는 근무 루틴 백업 파일인지 확인해 주세요.") }
            let keys = Set((try NativeLogic.shared.normalized([:])).keys)
            guard values.keys.contains(where: { keys.contains($0) }) else { throw NativeFailure("이 파일에는 가져올 근무 기록이 없어요.") }
            var records: [String: Any] = [:]
            for key in keys { if let text = values[key] { records[key] = key == "shift_active_group" ? text : (try JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])) } }
            return try NativeLogic.shared.normalized(records)
        }
        if object["data"] != nil {
            guard object["version"] as? Int == 1, let records = object["data"] as? [String: Any] else { throw NativeFailure("지원하는 백업 파일 버전인지 확인해 주세요.") }
            return try NativeLogic.shared.normalized(records)
        }
        guard !object.isEmpty else { throw NativeFailure("백업 파일이 비어 있어요.") }
        return try NativeLogic.shared.normalized(object)
    }
    func backupPreferences(_ bytes: Data) throws -> [String: String] {
        _ = try decodeBackup(bytes)
        let object = try backupObject(bytes)
        let keys = Set((try NativeLogic.shared.normalized([:])).keys)
        let values = object["values"] as? [String: String] ?? object["preferences"] as? [String: String] ?? [:]
        return values.filter { Self.allowedBackupKey($0.key) && !keys.contains($0.key) && !$0.key.hasPrefix("shift_account_") }
    }
    func backup() throws -> Data {
        let records = try NativeLogic.shared.normalized(data)
        var values = preferences.filter { Self.allowedBackupKey($0.key) && !$0.key.hasPrefix("shift_account_") }
        values["shift_onboarding_v1"] = onboardingComplete ? "{\"status\":\"complete\",\"step\":2}" : "{\"status\":\"in_progress\",\"step\":0}"
        for (key, value) in records where !(value is NSNull) {
            values[key] = key == "shift_active_group" ? value as? String : String(data: try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys]), encoding: .utf8)
        }
        return try JSONSerialization.data(withJSONObject: ["version": 1, "exportedAt": ISO8601DateFormatter().string(from: Date()), "values": values], options: [.prettyPrinted, .sortedKeys])
    }
}

struct NativeBackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
