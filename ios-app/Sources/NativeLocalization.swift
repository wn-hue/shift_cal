import Foundation

/// Presentation only. Stored notes, menu names, stop names and business rules stay unchanged.
enum NativeLanguage: String, CaseIterable, Identifiable {
    case ko, en, zh, ja
    var id: String { rawValue }
    var name: String { switch self { case .ko: "한국어"; case .en: "English"; case .zh: "简体中文"; case .ja: "日本語" } }
    var bundleCode: String { self == .zh ? "zh-Hans" : rawValue }
    var locale: Locale { Locale(identifier: self == .ko ? "ko_KR" : self == .zh ? "zh_Hans" : self == .ja ? "ja_JP" : "en_US") }
    static let preferenceKey = "shift_display_language"
    static func resolve(_ value: String?) -> Self { Self(rawValue: value ?? "") ?? .ko }
}

enum NativeL10n {
    static var language: NativeLanguage { NativeLanguage.resolve(UserDefaults.standard.string(forKey: NativeLanguage.preferenceKey)) }
    static var locale: Locale { language.locale }
    static func configure(_ preference: String?) { UserDefaults.standard.set(NativeLanguage.resolve(preference).rawValue, forKey: NativeLanguage.preferenceKey) }
    static func text(_ source: String, language: NativeLanguage? = nil, bundle: Bundle = .main) -> String {
        let selected = language ?? self.language
        guard let path = bundle.path(forResource: selected.bundleCode, ofType: "lproj"), let localized = Bundle(path: path) else { return source }
        return localized.localizedString(forKey: source, value: source, table: "Localizable")
    }
    static func format(_ source: String, _ arguments: CVarArg...) -> String { String(format: text(source), locale: locale, arguments: arguments) }
    static func group(_ group: String) -> String { format("%@조", group) }
    static func days(_ value: String) -> String { format("%@일", value) }
    static func weekday(_ sundayBasedIndex: Int) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        let symbols = formatter.shortStandaloneWeekdaySymbols ?? []
        return symbols.indices.contains(sundayBasedIndex) ? symbols[sundayBasedIndex] : ""
    }
    static func won(_ value: Double) -> String {
        let amount = Int(value.rounded(.towardZero)).formatted(.number.locale(locale))
        return language == .ko ? amount + "원" : "₩" + amount
    }
}
