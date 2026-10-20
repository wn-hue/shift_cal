import Foundation

struct PlannedAlarm: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let title: String
    let date: Date
    var id: String { key }
}

struct ShiftDay: Codable, Equatable {
    let date: String
    let type: String
    let origType: String?
}
struct ShiftSnapshot: Codable, Equatable {
    let group: String
    let days: [ShiftDay]

    func validated(now: Date = Date()) -> Bool {
        guard ["A", "B", "C"].contains(group), days.count == 30 else { return false }
        let start = ShiftPlanner.korea.startOfDay(for: now)
        for (index, day) in days.enumerated() {
            guard let date = ShiftPlanner.date(day.date),
                  date == ShiftPlanner.korea.date(byAdding: .day, value: index, to: start),
                  ShiftPlanner.types.contains(day.type),
                  day.origType == nil || ShiftPlanner.types.contains(day.origType!) else { return false }
        }
        return true
    }
}

struct AlarmPreferences: Codable {
    var enabled = false
    var dayMinutes = 6 * 60 + 30
    var nightMinutes = 18 * 60 + 30
    var includeHalf = false
}

enum ShiftPlanner {
    static let types: Set<String> = ["DAY", "NIGHT", "OFF", "LEAVE", "UNPAID_OFF", "NO_OT",
        "SPECIAL_DAY", "SPECIAL_NIGHT", "SPECIAL_DAY_NO_OT", "SPECIAL_NIGHT_NO_OT",
        "HALF_PRE", "HALF_POST", "HALF_LEAVE", "UNPAID_HALF_PRE", "UNPAID_HALF_POST", "UNPAID_HALF"]
    static var korea: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return calendar
    }
    static func date(_ key: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = korea
        formatter.timeZone = korea.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: key), formatter.string(from: date) == key else { return nil }
        return date
    }
    static func isNight(_ day: ShiftDay, includeHalf: Bool) -> Bool? {
        var type = day.type
        if type.contains("HALF") {
            guard includeHalf else { return nil }
            type = day.origType ?? "OFF"
        } else if type == "NO_OT" { type = day.origType ?? "OFF" }
        switch type {
        case "DAY", "SPECIAL_DAY", "SPECIAL_DAY_NO_OT": return false
        case "NIGHT", "SPECIAL_NIGHT", "SPECIAL_NIGHT_NO_OT": return true
        default: return nil
        }
    }
    static func plans(_ snapshot: ShiftSnapshot, preferences: AlarmPreferences, now: Date = Date()) -> [PlannedAlarm] {
        guard preferences.enabled, (0..<1440).contains(preferences.dayMinutes),
              (0..<1440).contains(preferences.nightMinutes) else { return [] }
        let end = korea.date(byAdding: .day, value: 30, to: korea.startOfDay(for: now))!
        return snapshot.days.compactMap { day in
            guard let night = isNight(day, includeHalf: preferences.includeHalf), let start = date(day.date) else { return nil }
            let minutes = night ? preferences.nightMinutes : preferences.dayMinutes
            guard let fire = korea.date(byAdding: .minute, value: minutes, to: start), fire > now, fire < end else { return nil }
            return PlannedAlarm(key: day.date, title: "\(snapshot.group)조 \(night ? "야간" : "주간") 근무 알람", date: fire)
        }.sorted { $0.date < $1.date }
    }
}
