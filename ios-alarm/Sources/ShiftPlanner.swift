import Foundation

struct ShiftEvent: Sendable {
    let title: String
    let notes: String
    let start: Date
    let allDay: Bool
}

struct PlannedAlarm: Codable, Equatable, Identifiable, Sendable {
    let key: String
    let title: String
    let date: Date
    var id: String { key }
}

enum ShiftPlanner {
    // The web app writes a separate, all-day shift event on the NIGHT start date.
    // Use Korea's work time even if the iPhone is travelling in another timezone.
    static var korea: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return calendar
    }

    static func hour(for event: ShiftEvent, includeHalf: Bool) -> Int? {
        let notes = event.notes.replacingOccurrences(of: "\r\n", with: "\n")
        let marker = "Shift_cal 근무 일정\n메모:"
        // Some calendar providers trim the final newline when the memo is empty.
        guard event.allDay, notes == marker || notes.hasPrefix(marker + "\n") else { return nil }
        let title = event.title.replacingOccurrences(of: "^[ABC]조\\s*", with: "", options: .regularExpression)
        if title.range(of: "^(무급 반차|무반|반차)\\(", options: .regularExpression) != nil {
            guard includeHalf else { return nil }
            if title.contains("· 야간") { return 18 }
            if title.contains("· 주간") { return 6 }
            return nil
        }
        if title.range(of: "^(야간 특근|야특|야간)(?: \\d+일차)?(?: · O\\.?T\\.?해제)?$", options: .regularExpression) != nil { return 18 }
        if title.range(of: "^(주간 특근|주특|주간)(?: \\d+일차)?(?: · O\\.?T\\.?해제)?$", options: .regularExpression) != nil { return 6 }
        return nil
    }

    static func plans(events: [ShiftEvent], now: Date, includeHalf: Bool = false) -> [PlannedAlarm] {
        let calendar = korea
        let end = calendar.date(byAdding: .day, value: 30, to: calendar.startOfDay(for: now))!
        let marked = events.filter { event in
            let notes = event.notes.replacingOccurrences(of: "\r\n", with: "\n")
            return event.allDay && (notes == "Shift_cal 근무 일정\n메모:" || notes.hasPrefix("Shift_cal 근무 일정\n메모:\n"))
        }
        let byDay = Dictionary(grouping: marked) { calendar.startOfDay(for: $0.start) }
        let conflicts = Set(byDay.compactMap { day, items in
            Set(items.map { hour(for: $0, includeHalf: includeHalf) ?? -1 }).count > 1 ? day : nil
        })
        var unique: [String: PlannedAlarm] = [:]
        for event in events {
            guard !conflicts.contains(calendar.startOfDay(for: event.start)), let hour = hour(for: event, includeHalf: includeHalf) else { continue }
            var components = calendar.dateComponents([.year, .month, .day], from: event.start)
            components.hour = hour
            components.minute = 30
            components.second = 0
            guard let date = calendar.date(from: components), date > now, date < end else { continue }
            let key = String(format: "%04d-%02d-%02d:%02d", components.year!, components.month!, components.day!, hour)
            unique[key] = PlannedAlarm(key: key, title: hour == 6 ? "주간 근무 알람" : "야간 근무 알람", date: date)
        }
        return unique.values.sorted { $0.date < $1.date }
    }
}
