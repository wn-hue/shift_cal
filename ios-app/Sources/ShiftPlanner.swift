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
    let isHoliday: Bool?

    init(date: String, type: String, origType: String?, isHoliday: Bool? = nil) {
        self.date = date
        self.type = type
        self.origType = origType
        self.isHoliday = isHoliday
    }
}
struct ShiftSnapshot: Codable, Equatable {
    let group: String
    let days: [ShiftDay]
    let previousDay: ShiftDay?

    init(group: String, days: [ShiftDay], previousDay: ShiftDay? = nil) {
        self.group = group
        self.days = days
        self.previousDay = previousDay
    }

    func validated(now: Date = Date()) -> Bool {
        guard ["A", "B", "C"].contains(group), days.count == 30 else { return false }
        let start = ShiftPlanner.korea.startOfDay(for: now)
        if let previousDay {
            guard ShiftPlanner.date(previousDay.date) == ShiftPlanner.korea.date(byAdding: .day, value: -1, to: start),
                  ShiftPlanner.types.contains(previousDay.type),
                  previousDay.origType == nil || ShiftPlanner.types.contains(previousDay.origType!) else { return false }
        }
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
    var separateWeekendHolidays = false
    var weekendDayMinutes: Int?
    var weekendNightMinutes: Int?
    var breaksEnabled = false
    var dayBreakRound = 1
    var nightBreakRound = 1

    init() {}

    private enum CodingKeys: String, CodingKey {
        case enabled, dayMinutes, nightMinutes
        case separateWeekendHolidays, weekendDayMinutes, weekendNightMinutes
        case breaksEnabled, dayBreakRound, nightBreakRound
    }

    // Ignore the retired half-day switch while preserving existing alarm times and enabled state.
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        dayMinutes = try values.decodeIfPresent(Int.self, forKey: .dayMinutes) ?? 6 * 60 + 30
        nightMinutes = try values.decodeIfPresent(Int.self, forKey: .nightMinutes) ?? 18 * 60 + 30
        separateWeekendHolidays = try values.decodeIfPresent(Bool.self, forKey: .separateWeekendHolidays) ?? false
        weekendDayMinutes = try values.decodeIfPresent(Int.self, forKey: .weekendDayMinutes)
        weekendNightMinutes = try values.decodeIfPresent(Int.self, forKey: .weekendNightMinutes)
        breaksEnabled = try values.decodeIfPresent(Bool.self, forKey: .breaksEnabled) ?? false
        let dayRound = try values.decodeIfPresent(Int.self, forKey: .dayBreakRound) ?? 1
        let nightRound = try values.decodeIfPresent(Int.self, forKey: .nightBreakRound) ?? 1
        dayBreakRound = [1, 2].contains(dayRound) ? dayRound : 1
        nightBreakRound = [1, 2].contains(nightRound) ? nightRound : 1
    }

    mutating func setSeparateWeekendHolidays(_ value: Bool) {
        if value {
            if weekendDayMinutes == nil { weekendDayMinutes = dayMinutes }
            if weekendNightMinutes == nil { weekendNightMinutes = nightMinutes }
        }
        separateWeekendHolidays = value
    }

    func minutes(night: Bool, weekendOrHoliday: Bool) -> Int {
        if separateWeekendHolidays && weekendOrHoliday {
            return night ? (weekendNightMinutes ?? nightMinutes) : (weekendDayMinutes ?? dayMinutes)
        }
        return night ? nightMinutes : dayMinutes
    }
}

struct WorkBreak: Identifiable {
    let id: String
    let title: String
    // Minutes from the work date's midnight. Night shifts continue into the next day.
    let startMinutes: Int
    var alarmMinutes: Int { startMinutes - 5 }
    var timeLabel: String {
        let minutes = alarmMinutes % 1440
        return (alarmMinutes >= 1440 ? "다음 날 " : "") + String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }
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
    static func isNight(_ day: ShiftDay) -> Bool? {
        var type = day.type
        if type.contains("HALF") {
            type = day.origType ?? "OFF"
        } else if type == "NO_OT" { type = day.origType ?? "OFF" }
        switch type {
        case "DAY", "SPECIAL_DAY", "SPECIAL_DAY_NO_OT": return false
        case "NIGHT", "SPECIAL_NIGHT", "SPECIAL_NIGHT_NO_OT": return true
        default: return nil
        }
    }
    static func breaks(night: Bool, round: Int) -> [WorkBreak] {
        guard [1, 2].contains(round) else { return [] }
        let starts: [Int]
        let titles: [String]
        if night {
            starts = round == 1 ? [1380, 1520, 1710, 1830] : [1400, 1560, 1730, 1850]
            titles = ["쉬는시간 1", "야식", "쉬는시간 2", "쉬는시간 3"]
        } else {
            starts = round == 1 ? [630, 720, 930, 1050] : [645, 770, 945, 1080]
            titles = ["쉬는시간 1", "점심", "쉬는시간 2", "석식"]
        }
        return zip(starts, titles).enumerated().map { index, value in
            WorkBreak(id: String(index), title: value.1, startMinutes: value.0)
        }
    }
    static func plans(_ snapshot: ShiftSnapshot, preferences: AlarmPreferences, now: Date = Date()) -> [PlannedAlarm] {
        let validWakeTimes = (0..<1440).contains(preferences.dayMinutes) &&
              (0..<1440).contains(preferences.nightMinutes) &&
              (0..<1440).contains(preferences.minutes(night: false, weekendOrHoliday: true)) &&
              (0..<1440).contains(preferences.minutes(night: true, weekendOrHoliday: true))
        let end = korea.date(byAdding: .day, value: 30, to: korea.startOfDay(for: now))!
        var plans: [PlannedAlarm] = []
        if preferences.enabled && validWakeTimes {
          plans = snapshot.days.compactMap { day in
            guard let night = isNight(day), let start = date(day.date) else { return nil }
            let weekday = korea.component(.weekday, from: start)
            let weekendOrHoliday = weekday == 1 || weekday == 7 || day.isHoliday == true
            let minutes = preferences.minutes(night: night, weekendOrHoliday: weekendOrHoliday)
            guard let fire = korea.date(byAdding: .minute, value: minutes, to: start), fire > now, fire < end else { return nil }
            let dayLabel = preferences.separateWeekendHolidays ? " · \(weekendOrHoliday ? "주말·공휴일" : "평일")" : ""
            return PlannedAlarm(key: day.date, title: "\(snapshot.group)조 \(night ? "야간" : "주간") 근무 알람\(dayLabel)", date: fire)
          }
        }
        if preferences.breaksEnabled {
            let yesterday = korea.date(byAdding: .day, value: -1, to: korea.startOfDay(for: now))
            let previous = snapshot.previousDay.flatMap { date($0.date) == yesterday ? $0 : nil }
            let days = (previous.map { [$0] } ?? []) + snapshot.days
            for day in days {
                guard let night = isNight(day), let start = date(day.date) else { continue }
                let round = night ? preferences.nightBreakRound : preferences.dayBreakRound
                for item in breaks(night: night, round: round) {
                    guard let fire = korea.date(byAdding: .minute, value: item.alarmMinutes, to: start), fire > now, fire < end else { continue }
                    plans.append(PlannedAlarm(key: day.date + ":break:" + item.id,
                        title: "\(snapshot.group)조 \(night ? "야간" : "주간") \(round)차 · \(item.title) 5분 전", date: fire))
                }
            }
        }
        return plans.sorted { $0.date < $1.date }
    }
}
