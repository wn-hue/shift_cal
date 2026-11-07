import WebKit

/// One-time, read-only migration from the two origins used by earlier app builds.
/// The invisible page has content JavaScript disabled; cookies and auth tokens are never read.
@MainActor final class NativeMigration: NSObject, WKNavigationDelegate {
    static let accountKeys = ["shift_salary_config_master", "shift_active_group", "shift_day_memos", "shift_day_memo_items_v1", "shift_day_stickers", "shift_day_events", "shift_overrides_A", "shift_overrides_B", "shift_overrides_C", "shift_payroll_sms_reference_v1", "shift_bonus_sms_reference_v1"]
    static let preferenceKeys: Set<String> = ["shift_onboarding_v1", "shift_today_menu_cache_v1", "shift_today_menu_cache_v2", "shift_bus_favorites_v1", "shift_bus_my_shift_v1", "shift_bus_factory_v1", "shift_community_lab_v1", "shift_weather_city", "shift_live_links_v2", "shift_live_links"]
    static let storageScript = """
    (() => {
      const keys = ['shift_salary_config_master','shift_active_group','shift_day_memos','shift_day_memo_items_v1','shift_day_stickers','shift_day_events','shift_overrides_A','shift_overrides_B','shift_overrides_C','shift_payroll_sms_reference_v1','shift_bonus_sms_reference_v1','shift_account_owner_v1','shift_onboarding_v1','shift_today_menu_cache_v1','shift_today_menu_cache_v2','shift_bus_favorites_v1','shift_bus_my_shift_v1','shift_bus_factory_v1','shift_community_lab_v1','shift_weather_city','shift_live_links_v2','shift_live_links'];
      const result = {};
      for (const key of keys) { const value = localStorage.getItem(key); if (value !== null) result[key] = value; }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (/^(shift_display_[a-z]+|shift_google_sync_v2_[A-Za-z0-9:_-]+)$/.test(key) && !/(token|credential|session|subscription)/i.test(key)) result[key] = localStorage.getItem(key);
      }
      return result;
    })()
    """
    private var web: WKWebView?
    private var expectedOrigin: URL?
    private var completion: CheckedContinuation<[String: String], Error>?
    private var timeout: Task<Void, Never>?

    static func knownOrigins(displayNames: [String], configuredOrigin: String?) -> [URL] {
        let production = "https://20261104.xyz", legacy = "https://h-lyart-ten.vercel.app"
        // Match the exact home-selection rule of the previous WebApp implementation.
        let candidates = configuredOrigin == production ? [production, legacy] : [legacy, production]
        return candidates.compactMap(URL.init(string:)).filter { origin in
            guard let host = origin.host else { return false }
            return displayNames.contains { $0 == host || host.hasSuffix("." + $0) }
        }
    }
    func existingRecords() async throws -> [String: String] {
        let records = await WKWebsiteDataStore.default().dataRecords(ofTypes: [WKWebsiteDataTypeLocalStorage])
        let origins = Self.knownOrigins(displayNames: records.map(\.displayName), configuredOrigin: Bundle.main.object(forInfoDictionaryKey: "WorkRoutineOrigin") as? String)
        // Prefer the origin used by this app configuration. Never merge two independently edited calendars.
        for origin in origins {
            let values = try await read(origin: origin)
            if !values.isEmpty { return values }
        }
        return [:]
    }
    private func read(origin: URL) async throws -> [String: String] {
        expectedOrigin = origin
        return try await withCheckedThrowingContinuation { continuation in
            completion = continuation
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .default()
            configuration.defaultWebpagePreferences.allowsContentJavaScript = false
            web = WKWebView(frame: .zero, configuration: configuration)
            web?.navigationDelegate = self
            web?.load(URLRequest(url: origin.appendingPathComponent("ios-support.html")))
            timeout = Task { [weak self] in
                try? await Task.sleep(for: .seconds(15))
                guard !Task.isCancelled else { return }
                self?.finish(.failure(NativeFailure("이전 앱의 기록을 확인하지 못했어요. 인터넷에 연결하고 다시 시도해 주세요. 기존 기록은 지우지 않았어요.")))
            }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        decisionHandler(url?.host == expectedOrigin?.host && url?.scheme == "https" && (url?.port == nil || url?.port == 443) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard web === webView, webView.url?.host == expectedOrigin?.host else { return }
        // App-initiated evaluation remains permitted when page content scripts are disabled.
        webView.evaluateJavaScript(Self.storageScript) { [weak self, weak webView] value, error in
            guard let self, let webView, self.web === webView else { return }
            if let error { self.finish(.failure(error)) }
            else if let values = value as? [String: String] { self.finish(.success(values)) }
            else { self.finish(.failure(NativeFailure("이전 앱의 기록을 읽지 못했어요. 기존 기록은 그대로 있어요."))) }
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { if web === webView { finish(.failure(error)) } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if web === webView { finish(.failure(error)) } }
    private func finish(_ result: Result<[String: String], Error>) {
        guard let continuation = completion else { return }
        completion = nil; timeout?.cancel(); timeout = nil
        web?.stopLoading(); web?.navigationDelegate = nil; web = nil
        continuation.resume(with: result)
    }
    static func preferences(from values: [String: String]) -> [String: String] {
        values.filter { preferenceKeys.contains($0.key) || ($0.key.range(of: "^(shift_display_[a-z]+|shift_google_sync_v2_[A-Za-z0-9:_-]+)$", options: .regularExpression) != nil && $0.key.range(of: "token|credential|session|subscription", options: [.regularExpression, .caseInsensitive]) == nil) }
    }
    static func onboardingComplete(values: [String: String], records: [String: Any]) -> Bool {
        let state = values["shift_onboarding_v1"].flatMap { $0.data(using: .utf8) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let status = state?["status"] as? String
        if status == "complete" || status == "existing" { return true }
        if status == "in_progress" {
            let config = records["shift_salary_config_master"] as? [String: Any] ?? [:]
            let hire = config["hireDate"] as? String ?? ""
            let group = records["shift_active_group"] as? String ?? ""
            return NativeDates.date(hire) != nil && hire >= "1900-01-01" && hire <= NativeDates.key(Date()) && ["A", "B", "C"].contains(group) && ((config["baseHourly"] as? NSNumber)?.doubleValue ?? 0) > 0 && ((config["ordinaryHourly"] as? NSNumber)?.doubleValue ?? 0) > 0
        }
        if ["A", "B", "C"].contains(values["shift_active_group"] ?? "") || NativeLogic.shared.meaningful(records) { return true }
        return ["shift_today_menu_cache_v1", "shift_today_menu_cache_v2", "shift_bus_favorites_v1", "shift_weather_city", "shift_account_owner_v1", "shift_display_theme", "shift_display_shape", "shift_display_memos", "shift_display_holidays", "shift_display_adjacent"].contains { values[$0] != nil }
    }
    static func apply(_ values: [String: String], to store: NativeStore) throws {
        guard !values.isEmpty else { try store.markMigrationChecked(); return }
        // Decode only account keys here. Local-only service preferences are retained separately.
        var raw: [String: Any] = [:]
        for key in accountKeys {
            guard let value = values[key] else { continue }
            raw[key] = key == "shift_active_group" ? value : try JSONSerialization.jsonObject(with: Data(value.utf8), options: [.fragmentsAllowed])
        }
        let records = try NativeLogic.shared.normalized(raw)
        try store.importRecords(records, preferences: preferences(from: values), owner: values["shift_account_owner_v1"], onboardingComplete: onboardingComplete(values: values, records: records))
    }
}
