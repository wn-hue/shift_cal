import SwiftUI
import UniformTypeIdentifiers

// Keep the same rotation anchor, paused holiday dates and override vocabulary as the web data.
@MainActor
enum NativeShift {
    static let holidays: [String: String] = [
        "2025-01-01": "신정",
        "2025-01-28": "설날연휴",
        "2025-01-29": "설날",
        "2025-01-30": "설날연휴",
        "2025-03-01": "삼일절",
        "2025-03-03": "대체공휴일",
        "2025-05-05": "어린이날·부처님오신날",
        "2025-05-06": "대체공휴일",
        "2025-06-06": "현충일",
        "2025-08-15": "광복절",
        "2025-10-03": "개천절",
        "2025-10-05": "추석연휴",
        "2025-10-06": "추석",
        "2025-10-07": "추석연휴",
        "2025-10-08": "대체공휴일",
        "2025-10-09": "한글날",
        "2025-12-25": "성탄절",
        "2026-01-01": "신정",
        "2026-02-16": "설날연휴",
        "2026-02-17": "설날",
        "2026-02-18": "설날연휴",
        "2026-03-01": "삼일절",
        "2026-03-02": "대체공휴일",
        "2026-05-05": "어린이날",
        "2026-05-24": "부처님오신날",
        "2026-05-25": "대체공휴일",
        "2026-06-06": "현충일",
        "2026-08-15": "광복절",
        "2026-08-17": "대체공휴일",
        "2026-09-24": "추석연휴",
        "2026-09-25": "추석",
        "2026-09-26": "추석연휴",
        "2026-10-03": "개천절",
        "2026-10-05": "대체공휴일",
        "2026-10-09": "한글날",
        "2026-12-25": "성탄절",
        "2027-01-01": "신정",
        "2027-02-06": "설날연휴",
        "2027-02-07": "설날",
        "2027-02-08": "설날연휴",
        "2027-02-09": "대체공휴일",
        "2027-03-01": "삼일절",
        "2027-05-05": "어린이날",
        "2027-05-13": "부처님오신날",
        "2027-06-06": "현충일",
        "2027-08-15": "광복절",
        "2027-08-16": "대체공휴일",
        "2027-09-14": "추석연휴",
        "2027-09-15": "추석",
        "2027-09-16": "추석연휴",
        "2027-10-03": "개천절",
        "2027-10-04": "대체공휴일",
        "2027-10-09": "한글날",
        "2027-10-11": "대체공휴일",
        "2027-12-25": "성탄절",
        "2027-12-27": "대체공휴일",
    ]
    static let shutdowns: Set<String> = [
        "2025-01-28",
        "2025-01-29",
        "2025-01-30",
        "2025-10-05",
        "2025-10-06",
        "2025-10-07",
        "2026-02-16",
        "2026-02-17",
        "2026-02-18",
        "2026-09-24",
        "2026-09-25",
        "2026-09-26",
        "2027-02-06",
        "2027-02-07",
        "2027-02-08",
        "2027-09-14",
        "2027-09-15",
        "2027-09-16",
    ]
    private static let pausedDates = shutdowns.compactMap(NativeDates.date)
    static func holidayName(_ date: Date) -> String? { holidays[NativeDates.key(date)] }
    static func baseType(_ date: Date, group: String) -> String {
        let target = NativeDates.calendar.startOfDay(for: date)
        let key = NativeDates.key(target)
        if shutdowns.contains(key) { return "OFF" }
        let anchor = NativeDates.date("2026-09-09")!
        var distance = NativeDates.calendar.dateComponents([.day], from: anchor, to: target).day ?? 0
        for closed in pausedDates {
            if target >= anchor && closed >= anchor && closed < target { distance -= 1 }
            else if target < anchor && closed >= target && closed < anchor { distance += 1 }
        }
        let index = ((distance + (["C": 0, "B": 4, "A": 8][group] ?? 0)) % 12 + 12) % 12
        return index < 4 ? "DAY" : index < 6 ? "OFF" : index < 10 ? "NIGHT" : "OFF"
    }
    static func day(_ date: Date, group: String, store: NativeStore) -> ShiftDay {
        let key = NativeDates.key(date), base = baseType(date, group: group)
        let saved = store.object("shift_overrides_" + group)[key] as? String
        return day(date, group: group, override: saved, base: base)
    }
    static func day(_ date: Date, group: String, override: String?, base: String? = nil) -> ShiftDay {
        let key = NativeDates.key(date), original = base ?? baseType(date, group: group)
        let holiday = holidays[key] != nil
        let type: String
        switch override {
        case "FORCED_OFF": type = "OFF"
        case "HALF_LEAVE": type = "HALF_POST"
        case "UNPAID_HALF": type = "UNPAID_HALF_POST"
        case .some(let value): type = value
        case nil: type = holiday && original != "OFF" ? "SPECIAL_" + original : original
        }
        let attendance = ["NO_OT", "LEAVE", "UNPAID_OFF", "HALF_PRE", "HALF_POST", "UNPAID_HALF_PRE", "UNPAID_HALF_POST"]
        return ShiftDay(date: key, type: type, origType: attendance.contains(type) ? original : nil, isHoliday: holiday)
    }
    static func label(_ type: String) -> String {
        ["DAY":"주간", "NIGHT":"야간", "OFF":"휴무", "SPECIAL_DAY":"주간 특근", "SPECIAL_NIGHT":"야간 특근",
         "SPECIAL_DAY_NO_OT":"주간 특근 · 잔업 없음", "SPECIAL_NIGHT_NO_OT":"야간 특근 · 잔업 없음",
         "NO_OT":"잔업 없음", "LEAVE":"연차", "HALF_PRE":"반차(전)", "HALF_POST":"반차(후)",
         "UNPAID_OFF":"무급휴무", "UNPAID_HALF_PRE":"무급반차(전)", "UNPAID_HALF_POST":"무급반차(후)"][type] ?? type
    }
    static func short(_ type: String) -> String {
        ["DAY":"주", "NIGHT":"야", "OFF":"휴", "SPECIAL_DAY":"주특", "SPECIAL_NIGHT":"야특",
         "SPECIAL_DAY_NO_OT":"주특", "SPECIAL_NIGHT_NO_OT":"야특", "NO_OT":"OT−", "LEAVE":"연차",
         "HALF_PRE":"반전", "HALF_POST":"반후", "UNPAID_OFF":"무휴", "UNPAID_HALF_PRE":"무전", "UNPAID_HALF_POST":"무후"][type] ?? "휴"
    }
    static func color(_ type: String) -> Color {
        if type.contains("NIGHT") || type.contains("DAY") || type == "LEAVE" || type.hasPrefix("HALF") || type.hasPrefix("UNPAID") { return badgeFill(type) }
        return Color(red: 0.91, green: 0.408, blue: 0.498)
    }
    static func badgeFill(_ type: String) -> Color {
        switch type {
        case "DAY": return Color(red: 1, green: 0.839, blue: 0)
        case "NIGHT": return Color(red: 0.259, green: 0.259, blue: 0.259)
        case "SPECIAL_DAY", "SPECIAL_DAY_NO_OT": return Color(red: 0.278, green: 0.839, blue: 0.863)
        case "SPECIAL_NIGHT", "SPECIAL_NIGHT_NO_OT": return Color(red: 0.329, green: 0.522, blue: 0.933)
        case "LEAVE", "HALF_PRE", "HALF_POST": return Color(red: 0.141, green: 0.447, blue: 0.294)
        case "UNPAID_OFF", "UNPAID_HALF_PRE", "UNPAID_HALF_POST": return Color(red: 0.502, green: 0.325, blue: 0.271)
        default: return .clear
        }
    }
    static func badgeText(_ type: String) -> Color {
        if type == "OFF" { return Color(red: 0.91, green: 0.408, blue: 0.498) }
        if type == "DAY" { return Color(red: 0.259, green: 0.259, blue: 0.259) }
        return .white
    }
    static func hasOT(_ day: ShiftDay) -> Bool {
        ["DAY", "NIGHT", "SPECIAL_DAY", "SPECIAL_NIGHT", "HALF_PRE", "UNPAID_HALF_PRE"].contains(day.type)
    }
    static func visibleType(_ day: ShiftDay) -> String {
        if day.type == "NO_OT" { return day.origType ?? "DAY" }
        if day.type.contains("HALF") || ["LEAVE", "UNPAID_OFF"].contains(day.type) { return day.origType ?? "OFF" }
        return day.type
    }
    static func validation(_ type: String?, date: Date, group: String, store: NativeStore) -> String? {
        guard let type else { return nil }
        let value = type.replacingOccurrences(of: "_NO_OT", with: ""), base = baseType(date, group: group)
        if base == "OFF" && ["LEAVE", "HALF_PRE", "HALF_POST", "UNPAID_HALF_PRE", "UNPAID_HALF_POST", "UNPAID_OFF", "NO_OT"].contains(value) {
            return "쉬는 날에는 연차, 반차, 무급휴무를 쓰거나 잔업을 뺄 수 없어요."
        }
        if value == "SPECIAL_NIGHT" && base == "DAY" { return "주간 근무일에는 야간 특근을 넣을 수 없어요." }
        if value == "SPECIAL_DAY" && base == "NIGHT" { return "야간 근무일에는 주간 특근을 넣을 수 없어요." }
        let previous = NativeDates.calendar.date(byAdding: .day, value: -1, to: date)!
        if value == "SPECIAL_DAY" && ShiftPlanner.isNight(day(previous, group: group, store: store)) == true {
            return "전날 야간 근무가 끝난 직후에는 주간 특근을 넣을 수 없어요."
        }
        let overrides = store.object("shift_overrides_" + group)
        let next = NativeDates.calendar.date(byAdding: .day, value: 1, to: date)!
        if value == "SPECIAL_NIGHT", let nextType = overrides[NativeDates.key(next)] as? String,
           ["SPECIAL_DAY", "SPECIAL_DAY_NO_OT"].contains(nextType) { return "다음 날 주간 특근이 있어 야간 특근을 넣을 수 없어요." }
        func units(_ t: String) -> Int { t == "UNPAID_OFF" ? 2 : t.hasPrefix("UNPAID_HALF") ? 1 : 0 }
        let key = NativeDates.key(date), month = String(key.prefix(7))
        let used = overrides.reduce(0) { $0 + ($1.key != key && $1.key.hasPrefix(month) ? units($1.value as? String ?? "") : 0) }
        if units(type) > 0 && used + units(type) > 2 { return "한 달에 무급휴무 1번 또는 무급반차 2번까지 쓸 수 있어요." }
        return nil
    }
}

struct NativeMemoEntry: Identifiable {
    let sourceDate: String
    let memoID: String?
    let eventID: String?
    let text: String
    let event: [String: Any]?
    var id: String { sourceDate + ":" + (memoID ?? eventID ?? "new") }
}

@MainActor
enum NativeDayEvents {
    static func notes(_ date: String, store: NativeStore) -> [String: String] {
        let items = store.object("shift_day_memo_items_v1")[date] as? [String: String] ?? [:]
        if !items.isEmpty { return items }
        let legacy = (store.object("shift_day_memos")[date] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return legacy.isEmpty ? [:] : ["legacy": legacy]
    }
    static func dateTime(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = NativeDates.calendar
        formatter.timeZone = NativeDates.calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        formatter.isLenient = false
        return formatter.date(from: value)
    }
    static func timestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = NativeDates.calendar
        formatter.timeZone = NativeDates.calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter.string(from: date)
    }
    static func occurrence(_ event: [String: Any], on date: Date) -> [String: Any]? {
        guard let startText = event["start"] as? String, let endText = event["end"] as? String,
              let start = dateTime(startText), let end = dateTime(endText) else { return nil }
        let calendar = NativeDates.calendar, requested = calendar.startOfDay(for: date)
        let sourceDay = calendar.startOfDay(for: start)
        guard requested >= sourceDay else { return nil }
        var candidate = sourceDay
        if let repeatRule = event["repeat"] as? [String: Any], let frequency = repeatRule["frequency"] as? String {
            let until = (repeatRule["until"] as? String).flatMap(NativeDates.date) ?? requested
            let limit = min(requested, until)
            guard limit >= sourceDay else { return nil }
            let source = calendar.dateComponents([.year, .month, .day], from: sourceDay)
            let dest = calendar.dateComponents([.year, .month, .day], from: limit)
            var index: Int
            switch frequency {
            case "daily", "weekly": index = (calendar.dateComponents([.day], from: sourceDay, to: limit).day ?? 0) / (frequency == "weekly" ? 7 : 1)
            case "monthly": index = (dest.year! - source.year!) * 12 + dest.month! - source.month!
            case "yearly": index = dest.year! - source.year!
            default: return nil
            }
            var found: Date?
            while index >= 0 && found == nil {
                if frequency == "daily" || frequency == "weekly" {
                    found = calendar.date(byAdding: .day, value: index * (frequency == "weekly" ? 7 : 1), to: sourceDay)
                } else {
                    let months = source.month! - 1 + (frequency == "monthly" ? index : index * 12)
                    let year = source.year! + months / 12, month = months % 12 + 1
                    let key = String(format: "%04d-%02d-%02d", year, month, source.day!)
                    found = NativeDates.date(key)
                }
                if let value = found, value > limit { found = nil }
                index -= 1
            }
            guard let found else { return nil }
            candidate = found
        }
        let durationDays = calendar.dateComponents([.day], from: sourceDay, to: calendar.startOfDay(for: end)).day ?? 0
        let occurrenceEnd = calendar.date(byAdding: .day, value: durationDays, to: candidate)!
        var result = event
        result["start"] = NativeDates.key(candidate) + String(startText.suffix(6))
        result["end"] = NativeDates.key(occurrenceEnd) + String(endText.suffix(6))
        let allDay = event["allDay"] as? Bool ?? false
        guard allDay ? occurrenceEnd >= requested : dateTime(result["end"] as! String)! > requested else { return nil }
        return result
    }
    static func entries(on date: Date, store: NativeStore) -> [NativeMemoEntry] {
        let key = NativeDates.key(date), notes = notes(key, store: store)
        let sourceEvents = store.object("shift_day_events")
        var result: [NativeMemoEntry] = []
        var linked: Set<String> = []
        for (sourceDate, raw) in sourceEvents {
            guard let events = raw as? [String: [String: Any]] else { continue }
            for (eventID, original) in events {
                guard let event = occurrence(original, on: date) else { continue }
                let memoID = original["memoId"] as? String
                let sourceNotes = self.notes(sourceDate, store: store)
                let text = memoID.flatMap { sourceNotes[$0] } ?? [original["title"] as? String, original["notes"] as? String].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n\n")
                if sourceDate == key, let memoID { linked.insert(memoID) }
                result.append(NativeMemoEntry(sourceDate: sourceDate, memoID: memoID, eventID: eventID, text: text, event: event))
            }
        }
        for (id, text) in notes where !linked.contains(id) {
            result.append(NativeMemoEntry(sourceDate: key, memoID: id, eventID: nil, text: text, event: nil))
        }
        return result.sorted { ($0.event?["start"] as? String ?? key, $0.id) < ($1.event?["start"] as? String ?? key, $1.id) }
    }
    static func reminderPlans(store: NativeStore, now: Date = Date()) -> [PlannedAlarm] {
        var plans: [String: PlannedAlarm] = [:]
        let today = NativeDates.calendar.startOfDay(for: now)
        for offset in 0...31 {
            let date = NativeDates.calendar.date(byAdding: .day, value: offset, to: today)!
            for entry in entries(on: date, store: store) {
                guard let event = entry.event, let minutes = event["reminder"] as? Int,
                      let start = event["start"] as? String, start.hasPrefix(NativeDates.key(date)),
                      let startDate = dateTime(start) else { continue }
                let allDay = event["allDay"] as? Bool ?? false
                let fire = startDate.addingTimeInterval(Double((allDay ? 540 : 0) - minutes) * 60)
                guard fire > now else { continue }
                let key = "memo:" + entry.id + ":" + start
                plans[key] = PlannedAlarm(key: key, title: entry.text.components(separatedBy: .newlines).first ?? "일정 알림", date: fire)
            }
        }
        return plans.values.sorted { $0.date < $1.date }
    }
    static func ics(store: NativeStore, month: Date, includeMemos: Bool) -> String {
        func escape(_ text: String) -> String { text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").replacingOccurrences(of: "\n", with: "\\n").replacingOccurrences(of: ";", with: "\\;").replacingOccurrences(of: ",", with: "\\,") }
        func compact(_ text: String) -> String { text.replacingOccurrences(of: "-", with: "").replacingOccurrences(of: ":", with: "") }
        let calendar = NativeDates.calendar, first = calendar.date(from: calendar.dateComponents([.year, .month], from: month))!
        let monthDates = (0..<(calendar.range(of: .day, in: .month, for: first)?.count ?? 30)).map { calendar.date(byAdding: .day, value: $0, to: first)! }
        let utcFormatter = DateFormatter(); utcFormatter.locale = Locale(identifier: "en_US_POSIX"); utcFormatter.timeZone = TimeZone(secondsFromGMT: 0); utcFormatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        let stamp = "DTSTAMP:" + utcFormatter.string(from: Date())
        var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Natbam//Shift Calendar//KO", "CALSCALE:GREGORIAN"]
        for offset in 0..<(calendar.range(of: .day, in: .month, for: first)?.count ?? 30) {
            let date = calendar.date(byAdding: .day, value: offset, to: first)!, key = NativeDates.key(date)
            let shift = NativeShift.day(date, group: store.group, store: store)
            lines += ["BEGIN:VEVENT", "UID:natbam-\(store.group)-\(key)@shift-routine.local", stamp, "DTSTART;VALUE=DATE:" + compact(key), "DTEND;VALUE=DATE:" + compact(NativeDates.key(calendar.date(byAdding: .day, value: 1, to: date)!)), "SUMMARY:" + escape(store.group + "조 " + NativeShift.label(shift.type))]
            if includeMemos { lines.append("DESCRIPTION:" + escape(entries(on: date, store: store).map(\.text).joined(separator: "\n\n"))) }
            lines.append("END:VEVENT")
        }
        if includeMemos {
            // Export each original event once, including recurrence rather than flattening it.
            for (date, raw) in store.object("shift_day_events").sorted(by: { $0.key < $1.key }) {
                guard let events = raw as? [String: [String: Any]] else { continue }
                for (id, event) in events.sorted(by: { $0.key < $1.key }) {
                    guard let start = event["start"] as? String, let end = event["end"] as? String else { continue }
                    guard monthDates.contains(where: { occurrence(event, on: $0) != nil }) else { continue }
                    let allDay = event["allDay"] as? Bool ?? false
                    lines += ["BEGIN:VEVENT", "UID:natbam-event-\(date)-\(id)@shift-routine.local", stamp]
                    if allDay {
                        lines.append("DTSTART;VALUE=DATE:" + compact(String(start.prefix(10))))
                        let endDate = NativeDates.date(String(end.prefix(10)))!
                        lines.append("DTEND;VALUE=DATE:" + compact(NativeDates.key(calendar.date(byAdding: .day, value: 1, to: endDate)!)))
                    } else if event["repeat"] != nil {
                        lines += ["DTSTART:" + compact(start) + "00", "DTEND:" + compact(end) + "00"]
                    } else if let startDate = dateTime(start), let endDate = dateTime(end) {
                        lines += ["DTSTART:" + utcFormatter.string(from: startDate), "DTEND:" + utcFormatter.string(from: endDate)]
                    }
                    if let rule = event["repeat"] as? [String: Any], let frequency = rule["frequency"] as? String {
                        lines.append("RRULE:FREQ=" + frequency.uppercased() + ((rule["until"] as? String).map { ";UNTIL=" + compact($0) + (allDay ? "" : "T235959") } ?? ""))
                    }
                    lines += ["SUMMARY:" + escape(event["title"] as? String ?? "일정"), "LOCATION:" + escape(event["location"] as? String ?? ""), "DESCRIPTION:" + escape((event["memoId"] as? String).flatMap { notes(date, store: store)[$0] } ?? event["notes"] as? String ?? "")]
                    if let reminder = event["reminder"] as? Int {
                        let minutes = (allDay ? 540 : 0) - reminder
                        lines += ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:일정 알림", "TRIGGER:" + (minutes < 0 ? "-" : "") + "PT\(abs(minutes))M", "END:VALARM"]
                    }
                    lines.append("END:VEVENT")
                }
            }
        }
        lines.append("END:VCALENDAR")
        // RFC 5545 lines are folded by UTF-8 octets, without splitting Korean characters.
        return lines.map { line in
            var result = "", count = 0
            for scalar in line.unicodeScalars {
                let value = String(scalar), size = value.utf8.count
                if count + size > 75 { result += "\r\n "; count = 1 }
                result += value; count += size
            }
            return result
        }.joined(separator: "\r\n") + "\r\n"
    }
}

private struct NativeDateSelection: Identifiable {
    var date: Date
    var memo: Bool = false
    var id: String { NativeDates.key(date) + (memo ? "memo" : "work") }
}

struct NativeShiftBadge: View {
    let day: ShiftDay
    var size: CGFloat = 38
    var body: some View {
        let type = NativeShift.visibleType(day)
        Text(LocalizedStringKey(NativeShift.short(type)))
            .font(.system(size: size * (NativeShift.short(type).count > 1 ? 0.33 : 0.44), weight: .medium, design: .rounded))
            .foregroundStyle(NativeShift.badgeText(type))
            .frame(width: size, height: size)
            .background(NativeShift.badgeFill(type), in: Circle())
            .overlay(alignment: .bottomTrailing) {
                if day.type == "NO_OT" || day.type.hasSuffix("_NO_OT") {
                    Text("−").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 13, height: 13).background(.gray, in: Circle())
                }
            }
            .accessibilityLabel(NativeL10n.text(NativeShift.label(day.type)))
    }
}

private enum NativeCalendarFormatting {
    static func month(_ date: Date) -> String {
        let parts = NativeDates.calendar.dateComponents([.year, .month], from: date)
        return String(format: "%d.%02d", parts.year!, parts.month!)
    }
}

private struct NativeMonthHeader: View {
    @Binding var month: Date
    @Binding var picker: Bool
    var body: some View {
        HStack(spacing: 18) {
            Button { move(-1) } label: { Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold)).frame(width: 32, height: 44) }.accessibilityLabel("이전 달")
            Button { picker = true } label: {
                HStack(spacing: 7) { Text(NativeCalendarFormatting.month(month)).font(.system(size: 23, weight: .bold)); Image(systemName: "chevron.down").font(.caption.bold()) }
                    .foregroundStyle(.primary)
            }.accessibilityLabel("연월 선택")
            Button { move(1) } label: { Image(systemName: "chevron.right").font(.system(size: 16, weight: .semibold)).frame(width: 32, height: 44) }.accessibilityLabel("다음 달")
            Spacer(minLength: 0)
            Button("오늘") { withAnimation { month = Date() } }.font(.subheadline.weight(.semibold)).buttonStyle(.bordered)
        }.tint(.primary)
    }
    private func move(_ delta: Int) { withAnimation(.easeInOut(duration: 0.2)) { month = NativeDates.calendar.date(byAdding: .month, value: delta, to: month)! } }
}

private struct NativeMonthPicker: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var month: Date
    @State private var year = 2026
    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                HStack {
                    Button { year -= 1 } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    Spacer(); Text("\(String(year))년").font(.title2.bold()); Spacer()
                    Button { year += 1 } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 16) {
                    ForEach(1...12, id: \.self) { value in
                        Button {
                            month = NativeDates.calendar.date(from: DateComponents(year: year, month: value, day: 1))!
                            dismiss()
                        } label: {
                            Text("\(value)월").font(.headline).frame(maxWidth: .infinity).frame(height: 52)
                                .background(selected(value) ? Color.blue : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 15))
                                .foregroundStyle(selected(value) ? .white : .primary)
                        }
                    }
                }
                Spacer()
            }.padding(24).navigationTitle("연월 선택").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        }.onAppear { year = NativeDates.calendar.component(.year, from: month) }
            .presentationDetents([.medium, .large])
    }
    private func selected(_ value: Int) -> Bool { NativeDates.calendar.component(.year, from: month) == year && NativeDates.calendar.component(.month, from: month) == value }
}

struct NativeCalendarView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var month = Date()
    @State private var selected: NativeDateSelection?
    @State private var monthPicker = false
    @State private var showStats = false
    @State private var liveSharing = false
    @State private var includeMemos = false
    @State private var share: NativeSharePayload?
    @AppStorage("natbam.showAdjacent") private var showAdjacent = true
    @AppStorage("natbam.showHolidays") private var showHolidays = true
    @AppStorage("natbam.showMemos") private var showMemos = true
    private var days: [Date] {
        let calendar = NativeDates.calendar
        let first = calendar.date(from: calendar.dateComponents([.year, .month], from: month))!
        let leading = calendar.component(.weekday, from: first) - 1
        let count = calendar.range(of: .day, in: .month, for: first)!.count
        return (0..<((leading + count + 6) / 7 * 7)).map { calendar.date(byAdding: .day, value: $0 - leading, to: first)! }
    }
    var body: some View {
        VStack(spacing: 14) {
            calendarHeader
            VStack(spacing: 8) {
                HStack(spacing: 0) {
                    ForEach(Array(["일", "월", "화", "수", "목", "금", "토"].enumerated()), id: \.offset) { index, name in
                        Text(NativeL10n.weekday(index)).font(.caption.weight(.medium)).foregroundStyle(index == 0 ? .red : index == 6 ? .blue : .secondary).frame(maxWidth: .infinity)
                    }
                }.padding(.vertical, 6)
                GeometryReader { grid in
                    ScrollView(.vertical) {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 4) {
                            ForEach(days, id: \.self) { date in
                                let current = NativeDates.calendar.isDate(date, equalTo: month, toGranularity: .month)
                                NativeCalendarCell(date: date, group: store.group, current: current, showShift: current || showAdjacent, showHoliday: showHolidays, showMemo: showMemos, height: max(83, grid.size.height / CGFloat(days.count / 7) - 4))
                                    .contentShape(Rectangle())
                                    .onTapGesture { selected = NativeDateSelection(date: date) }
                                    .contextMenu {
                                        Button { selected = NativeDateSelection(date: date, memo: true) } label: { Label("메모 · 일정 작성", systemImage: "square.and.pencil") }
                                        Button { selected = NativeDateSelection(date: date) } label: { Label("근무 변경", systemImage: "calendar") }
                                    }
                            }
                        }
                    }.scrollIndicators(.hidden)
                        .simultaneousGesture(DragGesture(minimumDistance: 35).onEnded { value in
                            guard abs(value.translation.width) > abs(value.translation.height) * 1.4 else { return }
                            moveMonth(value.translation.width < 0 ? 1 : -1)
                        })
                }
            }.padding(10).frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22))
        }.padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 12).background(NativeColors.background)
            .sheet(item: $selected) { item in
                if item.memo { NativeMemoEditor(date: item.date, source: nil) }
                else { NativeDayEditor(date: item.date, group: store.group) }
            }
            .sheet(isPresented: $monthPicker) { NativeMonthPicker(month: $month) }
            .sheet(isPresented: $showStats) { NativeMonthStats(month: month, group: store.group) }
            .sheet(isPresented: $liveSharing) {
                NavigationStack { NativeLiveShareView(month: month, group: store.group).toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { liveSharing = false } } } }
            }
            .sheet(item: $share) { NativeActivityView(items: $0.items) }
    }
    private var calendarHeader: some View {
        HStack(spacing: 9) {
            Button { monthPicker = true } label: {
                HStack(spacing: 5) { Text(NativeCalendarFormatting.month(month)).font(.system(size: 23, weight: .bold)); Image(systemName: "chevron.down").font(.caption2.bold()) }.foregroundStyle(.primary)
            }.accessibilityLabel("연월 선택")
            Spacer(minLength: 2)
            NativeWeatherButton()
            Button { selected = NativeDateSelection(date: Date(), memo: true) } label: { Image(systemName: "square.and.pencil").font(.system(size: 20)).foregroundStyle(.primary).frame(width: 32, height: 44) }.accessibilityLabel("오늘 메모 작성")
            Menu {
                Menu("내 조 · " + store.group + "조") {
                    ForEach(["A", "B", "C"], id: \.self) { group in Button(NativeL10n.group(group)) { store.group = group } }
                }
                Button { withAnimation { month = Date() } } label: { Label("오늘로 이동", systemImage: "calendar") }
                Button { moveMonth(-1) } label: { Label("이전 달", systemImage: "chevron.left") }
                Button { moveMonth(1) } label: { Label("다음 달", systemImage: "chevron.right") }
                Button { selected = NativeDateSelection(date: Date(), memo: true) } label: { Label("오늘 메모 작성", systemImage: "square.and.pencil") }
                Divider()
                Button { showStats = true } label: { Label("이달 근무 통계", systemImage: "chart.bar") }
                Button { liveSharing = true } label: { Label("링크로 근무표 공유", systemImage: "link") }
                Toggle("메모 포함", isOn: $includeMemos)
                Button { shareImage() } label: { Label("근무표 이미지 공유", systemImage: "photo") }
                Button { shareCalendar() } label: { Label("캘린더 파일 공유", systemImage: "calendar.badge.plus") }
            } label: { Image(systemName: "ellipsis").font(.system(size: 19, weight: .semibold)).foregroundStyle(.primary).frame(width: 26, height: 44) }.accessibilityLabel("근무표 메뉴")
        }.frame(height: 44)
    }
    private func moveMonth(_ delta: Int) { withAnimation(.easeInOut(duration: 0.2)) { month = NativeDates.calendar.date(byAdding: .month, value: delta, to: month)! } }
    private func shareImage() {
        let renderer = ImageRenderer(content: NativeCalendarShareCard(month: month, group: store.group, includeMemos: includeMemos).environmentObject(store).frame(width: 700).background(.white))
        renderer.scale = 2
        if let image = renderer.uiImage { share = NativeSharePayload(items: [image]) }
        else { store.error = "이미지를 만들지 못했어요. 다시 시도해 주세요." }
    }
    private func shareCalendar() {
        let text = NativeDayEvents.ics(store: store, month: month, includeMemos: includeMemos)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("교대루틴-\(store.group)조-\(NativeDates.key(month).prefix(7)).ics")
        do { try text.write(to: url, atomically: true, encoding: .utf8); share = NativeSharePayload(items: [url]) }
        catch { store.error = error.localizedDescription }
    }
}

private struct NativeCalendarCell: View {
    @EnvironmentObject private var store: NativeStore
    let date: Date
    let group: String
    let current: Bool
    let showShift: Bool
    let showHoliday: Bool
    let showMemo: Bool
    let height: CGFloat
    private var today: Bool { NativeDates.calendar.isDateInToday(date) }
    var body: some View {
        let shift = NativeShift.day(date, group: group, store: store)
        let entries = showMemo ? NativeDayEvents.entries(on: date, store: store) : []
        let holiday = NativeShift.holidayName(date)
        let weekday = NativeDates.calendar.component(.weekday, from: date)
        VStack(spacing: 3) {
            Text(String(NativeDates.calendar.component(.day, from: date)))
                .font(.system(size: 13, weight: today ? .bold : .medium))
                .foregroundStyle(today ? .white : holiday != nil || weekday == 1 ? .red : weekday == 7 ? .blue : .primary)
                .frame(width: 24, height: 24).background(today ? Color.blue : .clear, in: Circle())
                .overlay(alignment: .trailing) {
                    if showMemo, let sticker = store.object("shift_day_stickers")[NativeDates.key(date)] as? String, let emoji = NativeStickers.emoji(sticker) { Text(emoji).font(.system(size: 12)).offset(x: 17) }
                }
            if showShift {
                NativeShiftBadge(day: shift, size: 34)
                if ["LEAVE", "HALF_PRE", "HALF_POST", "UNPAID_OFF", "UNPAID_HALF_PRE", "UNPAID_HALF_POST"].contains(shift.type) {
                    Text(LocalizedStringKey(NativeShift.short(shift.type))).font(.system(size: 9, weight: .semibold)).foregroundStyle(NativeShift.color(shift.type)).lineLimit(1)
                } else if showHoliday, let holiday {
                    Text(LocalizedStringKey(holiday)).font(.system(size: 8, weight: .medium)).foregroundStyle(.red.opacity(0.8)).lineLimit(1).minimumScaleFactor(0.7)
                }
                if let first = entries.first {
                    HStack(spacing: 1) {
                        Circle().fill(Color.blue).frame(width: 3, height: 3)
                        Text(first.text.components(separatedBy: .newlines).joined(separator: " ")).font(.system(size: 9)).lineLimit(1)
                    }.foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }.padding(.top, 4).padding(.horizontal, 2).frame(maxWidth: .infinity).frame(height: height)
            .opacity(current ? 1 : 0.36)
            .background(today ? Color.blue.opacity(0.035) : .clear, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(today ? Color.blue : .clear, lineWidth: 1.8))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(NativeDates.key(date)), \(group)조 \(NativeShift.label(shift.type))\(holiday.map { ", " + $0 } ?? "")\(entries.isEmpty ? "" : ", 메모 \(entries.count)개")")
            .accessibilityAddTraits(.isButton)
    }
}

struct NativeGroupScheduleView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var month = Date()
    @State private var monthPicker = false
    @State private var selected: NativeDateSelection?
    private var days: [Date] {
        let first = NativeDates.calendar.date(from: NativeDates.calendar.dateComponents([.year, .month], from: month))!
        return (0..<NativeDates.calendar.range(of: .day, in: .month, for: first)!.count).map { NativeDates.calendar.date(byAdding: .day, value: $0, to: first)! }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("조별 근무표").font(.title2.bold())
            NativeMonthHeader(month: $month, picker: $monthPicker)
            Text("나의 \(store.group)조는 회색으로, 오늘은 파란색으로 표시해요.").font(.subheadline).foregroundStyle(.secondary)
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    HStack(spacing: 0) {
                        VStack(spacing: 0) {
                            Text("조").font(.caption).frame(width: 45, height: 58)
                            ForEach(["A", "B", "C"], id: \.self) { group in
                                Text(group).font(.headline).frame(width: 45, height: 64).background(group == store.group ? Color.gray.opacity(0.12) : .clear)
                            }
                        }
                        ForEach(days, id: \.self) { date in
                            let today = NativeDates.calendar.isDateInToday(date)
                            VStack(spacing: 0) {
                                VStack(spacing: 5) {
                                    Text(String(NativeDates.calendar.component(.day, from: date))).font(.headline)
                                    Text(date.formatted(.dateTime.weekday(.abbreviated).locale(NativeL10n.locale))).font(.caption2)
                                }.frame(width: 54, height: 58).foregroundStyle(today ? Color.blue : .secondary)
                                ForEach(["A", "B", "C"], id: \.self) { group in
                                    Button {
                                        if group == store.group { selected = NativeDateSelection(date: date) }
                                    } label: {
                                        NativeShiftBadge(day: NativeShift.day(date, group: group, store: store), size: 34)
                                            .frame(width: 54, height: 64).background(group == store.group ? Color.gray.opacity(0.10) : .clear)
                                    }.buttonStyle(.plain).disabled(group != store.group)
                                }
                            }.background(today ? Color.blue.opacity(0.09) : .clear)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(today ? Color.blue.opacity(0.65) : .clear, lineWidth: 1.5))
                                .id(NativeDates.key(date))
                        }
                    }.padding(.vertical, 2)
                }.scrollIndicators(.hidden)
                    .onAppear { focus(proxy) }
                    .onChange(of: month) { _, _ in focus(proxy) }
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("오늘의 근무").font(.headline)
                ForEach(["A", "B", "C"], id: \.self) { group in
                    HStack {
                        Text(NativeL10n.group(group)).font(.headline).frame(width: 45)
                        NativeShiftBadge(day: NativeShift.day(Date(), group: group, store: store), size: 32)
                        Text(LocalizedStringKey(NativeShift.label(NativeShift.day(Date(), group: group, store: store).type))).font(.subheadline)
                        Spacer()
                        if group == store.group { Text("나의 조").font(.caption).foregroundStyle(.secondary) }
                    }.padding(10).background(group == store.group ? Color.gray.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            Spacer(minLength: 0)
        }.padding(20).sheet(isPresented: $monthPicker) { NativeMonthPicker(month: $month) }
            .sheet(item: $selected) { NativeDayEditor(date: $0.date, group: store.group) }
    }
    private func focus(_ proxy: ScrollViewProxy) {
        let key = NativeDates.calendar.isDate(month, equalTo: Date(), toGranularity: .month) ? NativeDates.key(Date()) : NativeDates.key(days[0])
        DispatchQueue.main.async { proxy.scrollTo(key, anchor: .center) }
    }
}

struct NativeDayEditor: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let group: String
    @State private var date: Date
    @State private var selectedType: String?
    @State private var initialType: String?
    @State private var loaded = false
    @State private var specialExpanded = false
    @State private var attendanceExpanded = false
    @State private var memo: NativeMemoPresentation?
    @State private var validation: String?
    @State private var sticker = ""
    @State private var initialSticker = ""
    @State private var festivalPay = ""
    @State private var initialFestivalPay = ""
    init(date: Date, group: String) { _date = State(initialValue: date); self.group = group }
    private var base: String { NativeShift.baseType(date, group: group) }
    private var shift: ShiftDay { NativeShift.day(date, group: group, override: selectedType) }
    private var regularType: String { shift.type == "NO_OT" ? base : shift.type.replacingOccurrences(of: "_NO_OT", with: "") }
    private var canOT: Bool { ["SPECIAL_DAY", "SPECIAL_NIGHT"].contains(regularType) || (["DAY", "NIGHT"].contains(regularType) && regularType == base) }
    private var holiday: String? { NativeShift.holidayName(date) }
    private var festival: Bool { holiday?.contains("설날") == true || holiday?.contains("추석") == true }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack {
                        Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 40, height: 44) }.accessibilityLabel("이전 날짜")
                        Spacer()
                        Text(date.formatted(.dateTime.month(.wide).day().weekday(.wide).locale(NativeL10n.locale))).font(.headline)
                        Spacer()
                        Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 40, height: 44) }.accessibilityLabel("다음 날짜")
                    }
                    HStack(spacing: 14) {
                        NativeShiftBadge(day: shift, size: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(LocalizedStringKey(NativeShift.label(shift.type))).font(.title2.bold())
                            Text(NativeL10n.format("기본 %@ · %@", NativeL10n.text(NativeShift.label(base)), NativeL10n.group(group)) + (holiday.map { " · " + NativeL10n.text($0) } ?? "")).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 22))
                    VStack(alignment: .leading, spacing: 14) {
                        Text("근무 고르기").font(.headline)
                        HStack(spacing: 12) {
                            if base != "OFF" { choice(base) }
                            choice("OFF")
                        }
                        Toggle(isOn: Binding(get: { NativeShift.hasOT(shift) }, set: { setOT($0) })) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("O.T (잔업)").font(.headline)
                                Text(NativeL10n.text(shift.type.hasSuffix("HALF_POST") ? "반차(후)는 잔업이 자동으로 꺼져요" : canOT ? "이 날짜에만 적용돼요" : "근무를 선택하면 설정할 수 있어요")).font(.caption).foregroundStyle(.secondary)
                            }
                        }.disabled(!canOT).tint(.blue).padding(.vertical, 10)
                    }
                    DisclosureGroup(isExpanded: $specialExpanded) {
                        HStack(spacing: 12) {
                            if base != "NIGHT" { choice("SPECIAL_DAY") }
                            if base != "DAY" { choice("SPECIAL_NIGHT") }
                        }.padding(.top, 12)
                    } label: { Label("특근 설정", systemImage: "clock.badge.plus").font(.headline) }
                    Divider()
                    if base != "OFF" {
                        DisclosureGroup(isExpanded: $attendanceExpanded) {
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                                ForEach(["LEAVE", "UNPAID_OFF", "HALF_PRE", "HALF_POST", "UNPAID_HALF_PRE", "UNPAID_HALF_POST"], id: \.self) { choice($0) }
                            }.padding(.top, 12)
                        } label: { Label("근태 · 휴가", systemImage: "calendar.badge.checkmark").font(.headline) }
                        Divider()
                    }
                    if festival {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("명절근무수당").font(.headline)
                            HStack { TextField("0", text: $festivalPay).keyboardType(.numberPad); Text("원").foregroundStyle(.secondary) }
                            Text("실제 근무한 날짜의 수당을 급여에 반영해요.").font(.caption).foregroundStyle(.secondary)
                        }.padding(14).background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                    }
                    HStack {
                        Label("하루 스티커", systemImage: "face.smiling").font(.headline)
                        Spacer()
                        Menu {
                            Button("스티커 없음") { sticker = "" }
                            ForEach(NativeStickers.items, id: \.0) { item in Button(item.1 + " " + item.2) { sticker = item.0 } }
                        } label: { Text(NativeStickers.emoji(sticker) ?? "선택").font(sticker.isEmpty ? .subheadline : .title) }
                    }
                    Divider()
                    HStack {
                        Label("메모 · 일정", systemImage: "square.and.pencil").font(.headline)
                        Spacer()
                        Button("추가") { if commit() { memo = NativeMemoPresentation(date: date, source: nil) } }.font(.subheadline.weight(.semibold))
                    }
                    let entries = NativeDayEvents.entries(on: date, store: store)
                    if entries.isEmpty {
                        Button { if commit() { memo = NativeMemoPresentation(date: date, source: nil) } } label: {
                            Text("이날의 메모나 일정을 남겨 보세요").font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                        }
                    } else {
                        ForEach(entries) { entry in
                            Button { if commit() { memo = NativeMemoPresentation(date: date, source: entry) } } label: { NativeMemoRow(entry: entry) }.buttonStyle(.plain)
                        }
                    }
                    if selectedType != initialType {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("예상 급여 변화").font(.headline)
                            if (store.config["ordinaryHourly"] as? NSNumber)?.doubleValue ?? 0 > 0 {
                                let difference = NativePayroll.payChange(date: date, group: group, override: selectedType, store: store)
                                Text((difference > 0 ? "+" : "") + NativePayroll.money(difference)).font(.title3.bold()).foregroundStyle(difference >= 0 ? Color.blue : Color.red)
                            } else { Text("시급을 설정하면 확인할 수 있어요.").font(.subheadline).foregroundStyle(.secondary) }
                            Text("현재 저장된 근무와 비교한 세전 추정이에요.").font(.caption).foregroundStyle(.secondary)
                        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Color.secondary.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                    }
                    Button { selectedType = nil; validation = nil } label: { Label("기본 근무로 되돌리기", systemImage: "arrow.counterclockwise").font(.subheadline) }.frame(maxWidth: .infinity).padding(.vertical, 16)
                    if let validation { Text(LocalizedStringKey(validation)).font(.subheadline).foregroundStyle(.red) }
                }.padding(22)
            }.navigationTitle("나의 하루").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("닫기") { if commit() { dismiss() } } }
                    ToolbarItem(placement: .confirmationAction) { Button("완료") { if commit() { dismiss() } }.fontWeight(.semibold) }
                }
                .onAppear { if !loaded { load() } }
                .onDisappear { _ = commit() }
                .sheet(item: $memo) { NativeMemoEditor(date: $0.date, source: $0.source) }
        }
    }
    private func choice(_ type: String) -> some View {
        let selected = regularType == type
        return Button { choose(type) } label: {
            HStack(spacing: 9) {
                Text(LocalizedStringKey(NativeShift.short(type))).font(.system(size: 14, weight: .semibold)).foregroundStyle(NativeShift.badgeText(type)).frame(width: 35, height: 35).background(NativeShift.badgeFill(type), in: Circle())
                Text(LocalizedStringKey(NativeShift.label(type))).font(.subheadline.weight(.medium)).foregroundStyle(.primary).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue).font(.caption) }
            }.padding(10).frame(maxWidth: .infinity).frame(minHeight: 56).background(selected ? Color.blue.opacity(0.06) : Color.secondary.opacity(0.04), in: RoundedRectangle(cornerRadius: 15)).overlay(RoundedRectangle(cornerRadius: 15).stroke(selected ? Color.blue : Color.secondary.opacity(0.12), lineWidth: selected ? 1.5 : 1))
        }.buttonStyle(.plain)
    }
    private func load() {
        selectedType = store.object("shift_overrides_" + group)[NativeDates.key(date)] as? String
        initialType = selectedType
        sticker = store.object("shift_day_stickers")[NativeDates.key(date)] as? String ?? ""
        initialSticker = sticker
        let groups = store.config["holidayWorkPay"] as? [String: [String: Any]] ?? [:]
        festivalPay = (groups[group]?[NativeDates.key(date)] as? Int).map(String.init) ?? ""
        initialFestivalPay = festivalPay
        validation = nil; loaded = true
    }
    private func choose(_ type: String) {
        let next: String
        if canOT && !NativeShift.hasOT(shift) && ["DAY", "NIGHT", "SPECIAL_DAY", "SPECIAL_NIGHT"].contains(type) {
            next = type.hasPrefix("SPECIAL") ? type + "_NO_OT" : "NO_OT"
        } else { next = type }
        if let message = NativeShift.validation(next, date: date, group: group, store: store) { validation = message; return }
        validation = nil; selectedType = next
    }
    private func setOT(_ enabled: Bool) {
        guard canOT else { return }
        let next = enabled ? regularType : regularType.hasPrefix("SPECIAL") ? regularType + "_NO_OT" : "NO_OT"
        selectedType = next; validation = nil
    }
    @discardableResult private func commit() -> Bool {
        guard loaded else { return true }
        guard selectedType != initialType || sticker != initialSticker || festivalPay != initialFestivalPay else { return true }
        if let message = NativeShift.validation(selectedType, date: date, group: group, store: store) { validation = message; return false }
        let key = NativeDates.key(date)
        if festivalPay != initialFestivalPay && !festivalPay.isEmpty && (Int(festivalPay) == nil || Int(festivalPay)! < 0 || Int(festivalPay)! > 1_000_000_000) { validation = "수당 금액을 확인해 주세요."; return false }
        let previousData = store.data
        var nextData = previousData
        var overrides = store.object("shift_overrides_" + group)
        overrides[key] = selectedType
        nextData["shift_overrides_" + group] = overrides
        var stickers = store.object("shift_day_stickers")
        stickers[key] = sticker.isEmpty ? nil : sticker
        nextData["shift_day_stickers"] = stickers
        if festivalPay != initialFestivalPay {
            var config = store.config
            var groups = config["holidayWorkPay"] as? [String: [String: Any]] ?? [:]
            var days = groups[group] ?? [:]; days[key] = Int(festivalPay); groups[group] = days
            config["holidayWorkPay"] = groups
            nextData["shift_salary_config_master"] = config
        }
        store.data = nextData
        guard store.save() else { store.data = previousData; validation = store.error ?? "저장하지 못했어요. 다시 시도해 주세요."; return false }
        initialType = selectedType; initialSticker = sticker; initialFestivalPay = festivalPay
        return true
    }
    private func move(_ delta: Int) {
        guard commit() else { return }
        date = NativeDates.calendar.date(byAdding: .day, value: delta, to: date)!
        load()
    }
}

private enum NativeStickers {
    static let items = [("soju", "🍶", "소주"), ("beer", "🍺", "맥주"), ("kimchi-stew", "🥘", "김치찌개"), ("pork-belly", "🥓", "삼겹살"), ("chicken", "🍗", "치킨"), ("gukbap", "🍲", "국밥"), ("baeksuk", "🐔", "백숙"), ("doenjang-stew", "🫕", "된장찌개"), ("tteokbokki", "🌶️", "떡볶이"), ("jajangmyeon", "🍜", "짜장면"), ("kimchi-rice", "🍚", "김치볶음밥"), ("gimbap", "🍙", "김밥"), ("jjamppong", "🍜", "짬뽕")]
    static func emoji(_ key: String) -> String? { items.first { $0.0 == key }?.1 }
}

private struct NativeMemoPresentation: Identifiable {
    let date: Date
    let source: NativeMemoEntry?
    let id = UUID()
}

private struct NativeMemoRow: View {
    let entry: NativeMemoEntry
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: entry.event == nil ? "note.text" : "calendar").foregroundStyle(.blue).padding(.top, 2)
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.text).font(.subheadline).lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
                if let event = entry.event {
                    let allDay = event["allDay"] as? Bool ?? false
                    let start = event["start"] as? String ?? ""
                    Text((allDay ? NativeL10n.text("하루 종일") : String(start.suffix(5))) + (event["reminder"] is Int ? " · " + NativeL10n.text("알림") : "") + (event["repeat"] == nil ? "" : " · " + NativeL10n.text("반복")))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(16).background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 15))
    }
}

struct NativeMemoEditor: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let date: Date
    let source: NativeMemoEntry?
    @State private var text = ""
    @State private var schedule = false
    @State private var allDay = false
    @State private var start = Date()
    @State private var end = Date()
    @State private var location = ""
    @State private var reminder = -1
    @State private var frequency = ""
    @State private var hasUntil = false
    @State private var until = Date()
    @State private var error: String?
    @State private var loaded = false
    @State private var saved = false
    @State private var deleteConfirmation = false
    @FocusState private var textFocused: Bool
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text).frame(minHeight: 155).focused($textFocused).accessibilityLabel("메모 내용")
                        .overlay(alignment: .topLeading) {
                            if text.isEmpty { Text("메모를 입력하세요").foregroundStyle(.tertiary).padding(.top, 8).allowsHitTesting(false) }
                        }
                } header: {
                    HStack {
                        Text("메모")
                        Spacer()
                        // A keyboard ToolbarItem triggers an invalid-frame warning
                        // on iOS 27; keep dismissal in the stable form layout.
                        if textFocused {
                            Button("키보드 닫기") { textFocused = false }
                                .buttonStyle(.borderless).textCase(nil)
                        }
                    }
                } footer: { Text("하루에 메모 50개, 총 16,000자까지 저장할 수 있어요.") }
                Section {
                    Toggle("일정으로 설정", isOn: $schedule).tint(.blue)
                    if schedule {
                        Toggle("하루 종일", isOn: $allDay).tint(.blue)
                        DatePicker("시작", selection: $start, displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
                        DatePicker("종료", selection: $end, in: start..., displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
                        TextField("장소 (선택)", text: $location)
                        Picker("알림", selection: $reminder) {
                            Text("알림 없음").tag(-1)
                            Text(NativeL10n.text(allDay ? "당일 오전 9시" : "일정 시작할 때")).tag(0)
                            Text("5분 전").tag(5); Text("10분 전").tag(10); Text("30분 전").tag(30)
                            Text("1시간 전").tag(60); Text("1일 전").tag(1440)
                        }
                        Picker("반복", selection: $frequency) {
                            Text("반복 안 함").tag(""); Text("매일").tag("daily"); Text("매주").tag("weekly"); Text("매월").tag("monthly"); Text("매년").tag("yearly")
                        }
                        if !frequency.isEmpty {
                            Toggle("반복 종료 날짜", isOn: $hasUntil).tint(.blue)
                            if hasUntil { DatePicker("종료일", selection: $until, in: NativeDates.calendar.startOfDay(for: start)..., displayedComponents: .date) }
                        }
                    }
                } footer: {
                    if schedule {
                        Text((allDay ? NativeL10n.text("하루 종일 일정의 알림은 오전 9시를 기준으로 해요. ") : "") + (!frequency.isEmpty ? NativeL10n.text("반복 일정의 수정·삭제는 전체 반복에 적용돼요.") : ""))
                    }
                }
                if let error { Section { Text(LocalizedStringKey(error)).foregroundStyle(.red) } }
                if source != nil { Section { Button("메모 · 일정 삭제", role: .destructive) { deleteConfirmation = true } } }
            }.scrollDismissesKeyboard(.interactively).navigationTitle(NativeL10n.text(source == nil ? "새 메모" : "메모 수정")).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("저장") { save() }.fontWeight(.semibold).disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saved) }
                }
                .onAppear { load() }
                .onChange(of: start) { _, value in
                    if end < value { end = allDay ? value : value.addingTimeInterval(3600) }
                    if until < value { until = value }
                }
                .confirmationDialog(source?.event?["repeat"] == nil ? "이 메모와 일정을 삭제할까요?" : "전체 반복 일정과 메모를 삭제할까요?", isPresented: $deleteConfirmation, titleVisibility: .visible) {
                    Button("삭제", role: .destructive) { save(deleting: true) }
                }
        }.environment(\.locale, NativeL10n.locale).environment(\.timeZone, NativeDates.calendar.timeZone)
    }
    private func load() {
        guard !loaded else { return }; loaded = true
        text = source?.text ?? ""
        let defaultStart = NativeDates.calendar.date(bySettingHour: 9, minute: 0, second: 0, of: date)!
        start = defaultStart; end = defaultStart.addingTimeInterval(3600); until = date
        guard let source, let id = source.eventID,
              let events = store.object("shift_day_events")[source.sourceDate] as? [String: [String: Any]], let event = events[id] else { return }
        schedule = true
        allDay = event["allDay"] as? Bool ?? false
        start = (event["start"] as? String).flatMap(NativeDayEvents.dateTime) ?? defaultStart
        end = (event["end"] as? String).flatMap(NativeDayEvents.dateTime) ?? start.addingTimeInterval(3600)
        location = event["location"] as? String ?? ""; reminder = event["reminder"] as? Int ?? -1
        if let rule = event["repeat"] as? [String: Any] {
            frequency = rule["frequency"] as? String ?? ""
            if let key = rule["until"] as? String, let value = NativeDates.date(key) { hasUntil = true; until = value }
        }
    }
    private func save(deleting: Bool = false) {
        guard !saved else { return }
        let value = deleting ? "" : text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !deleting && value.isEmpty { error = "메모를 입력해 주세요."; return }
        let calendar = NativeDates.calendar
        let startTime = allDay ? calendar.startOfDay(for: start) : start
        let endTime = allDay ? calendar.startOfDay(for: end) : end
        if !deleting && schedule && (allDay ? endTime < startTime : endTime <= startTime) { error = "종료 시간은 시작 시간보다 늦게 설정해 주세요."; return }
        if location.utf16.count > 300 { error = "장소는 300자까지 입력해 주세요."; return }
        if hasUntil && NativeDates.key(until) < NativeDates.key(startTime) { error = "반복 종료일은 시작일 이후로 설정해 주세요."; return }
        var allMemos = store.object("shift_day_memos")
        var allItems = store.object("shift_day_memo_items_v1")
        var allEvents = store.object("shift_day_events")
        var touched: [String: [String: String]] = [:]
        func items(_ key: String) -> [String: String] { touched[key] ?? NativeDayEvents.notes(key, store: store) }
        if let source {
            var sourceItems = items(source.sourceDate)
            if let id = source.memoID { sourceItems.removeValue(forKey: id) }
            touched[source.sourceDate] = sourceItems
            var events = allEvents[source.sourceDate] as? [String: [String: Any]] ?? [:]
            for (id, event) in events where id == source.eventID || (source.memoID != nil && event["memoId"] as? String == source.memoID) { events.removeValue(forKey: id) }
            allEvents[source.sourceDate] = events.isEmpty ? nil : events
        }
        if !deleting {
            let key = schedule ? NativeDates.key(startTime) : source?.sourceDate ?? NativeDates.key(date)
            var destination = items(key)
            let preferred = source?.memoID ?? UUID().uuidString.lowercased()
            let memoID = destination[preferred] == nil ? preferred : UUID().uuidString.lowercased()
            destination[memoID] = value; touched[key] = destination
            if schedule {
                var events = allEvents[key] as? [String: [String: Any]] ?? [:]
                let title = value.components(separatedBy: .newlines).first ?? "메모"
                var trimmedTitle = ""
                for character in title {
                    if (trimmedTitle + String(character)).utf16.count > 120 { break }
                    trimmedTitle.append(character)
                }
                var event: [String: Any] = ["title": trimmedTitle, "start": NativeDayEvents.timestamp(startTime), "end": NativeDayEvents.timestamp(endTime), "allDay": allDay, "location": location.trimmingCharacters(in: .whitespacesAndNewlines), "notes": "", "memoId": memoID, "reminder": reminder < 0 ? NSNull() : reminder as Any]
                if !frequency.isEmpty { event["repeat"] = ["frequency": frequency, "until": hasUntil ? NativeDates.key(until) as Any : NSNull()] }
                let preferredEvent = source?.eventID ?? memoID
                events[events[preferredEvent] == nil ? preferredEvent : UUID().uuidString.lowercased()] = event
                if events.count > 50 { error = "하루에 일정은 50개까지 저장할 수 있어요."; return }
                allEvents[key] = events
            }
        }
        for (key, notes) in touched {
            let projection = notes.keys.sorted().compactMap { notes[$0] }.joined(separator: "\n\n")
            if notes.count > 50 || projection.utf16.count > 16000 { error = "하루 메모는 50개, 총 16,000자까지 저장할 수 있어요."; return }
            allItems[key] = notes.isEmpty ? nil : notes
            allMemos[key] = projection.isEmpty ? nil : projection
        }
        // Publish the three linked representations as one persisted transaction.
        let previousData = store.data
        var nextData = previousData
        nextData["shift_day_memos"] = allMemos
        nextData["shift_day_memo_items_v1"] = allItems
        nextData["shift_day_events"] = allEvents
        store.data = nextData
        guard store.save() else { store.data = previousData; error = store.error ?? "저장하지 못했어요. 다시 시도해 주세요."; return }
        saved = true; dismiss()
    }
}

private struct NativeMonthStats: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    let month: Date
    let group: String
    private var shifts: [ShiftDay] {
        let first = NativeDates.calendar.date(from: NativeDates.calendar.dateComponents([.year, .month], from: month))!
        return (0..<NativeDates.calendar.range(of: .day, in: .month, for: first)!.count).map { NativeShift.day(NativeDates.calendar.date(byAdding: .day, value: $0, to: first)!, group: group, store: store) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    stat("주간 근무", shifts.filter { ShiftPlanner.isNight($0) == false }.count, "일")
                    stat("야간 근무", shifts.filter { ShiftPlanner.isNight($0) == true }.count, "일")
                    stat("휴무", shifts.filter { $0.type == "OFF" }.count, "일")
                    stat("특근", shifts.filter { $0.type.hasPrefix("SPECIAL") }.count, "일")
                    stat("잔업", shifts.filter { NativeShift.hasOT($0) }.count, "일")
                    HStack { Text("사용 연차"); Spacer(); Text(String(format: "%g일", shifts.reduce(0.0) { $0 + ($1.type == "LEAVE" ? 1 : $1.type.hasPrefix("HALF") ? 0.5 : 0) })).fontWeight(.semibold) }
                } header: { Text(NativeDates.monthTitle(month) + " · " + group + "조") }
                Section("근무별 상세") {
                    ForEach(Array(Set(shifts.map(\.type))).sorted(), id: \.self) { type in
                        HStack { Circle().fill(NativeShift.color(type)).frame(width: 9, height: 9); Text(LocalizedStringKey(NativeShift.label(type))); Spacer(); Text("\(shifts.filter { $0.type == type }.count)일").foregroundStyle(.secondary) }
                    }
                }
            }.navigationTitle("이달 근무 통계").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } } }
        }.presentationDetents([.medium, .large])
    }
    private func stat(_ label: String, _ value: Int, _ unit: String) -> some View { HStack { Text(label); Spacer(); Text("\(value)\(unit)").fontWeight(.semibold) } }
}

private struct NativeCalendarShareCard: View {
    @EnvironmentObject private var store: NativeStore
    let month: Date
    let group: String
    let includeMemos: Bool
    private var dates: [Date] {
        let cal = NativeDates.calendar, first = cal.date(from: cal.dateComponents([.year, .month], from: month))!
        let leading = cal.component(.weekday, from: first) - 1, total = cal.range(of: .day, in: .month, for: first)!.count
        return (0..<((leading + total + 6) / 7 * 7)).map { cal.date(byAdding: .day, value: $0 - leading, to: first)! }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack { VStack(alignment: .leading, spacing: 8) { Text("교대 루틴").font(.headline).foregroundStyle(.secondary); Text(NativeDates.monthTitle(month)).font(.largeTitle.bold()) }; Spacer(); Text(NativeL10n.group(group)).font(.title2.bold()).padding().background(Color.blue.opacity(0.1), in: Circle()) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 8) {
                ForEach(Array(["일", "월", "화", "수", "목", "금", "토"].enumerated()), id: \.offset) { _, name in Text(LocalizedStringKey(name)).font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity) }
                ForEach(dates, id: \.self) { date in
                    NativeCalendarCell(date: date, group: group, current: NativeDates.calendar.isDate(date, equalTo: month, toGranularity: .month), showShift: true, showHoliday: true, showMemo: includeMemos, height: includeMemos ? 115 : 95)
                }
            }
        }.padding(32).environment(\.colorScheme, .light)
    }
}

private struct NativeSharePayload: Identifiable {
    let id = UUID()
    let items: [Any]
}
private struct NativeActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
