import Foundation
import Combine

struct ShiftRules: Decodable {
    let base: String
    let offsets: [String: Int]
    let shutdown: [String]
    let holidays: [String: String]
    static let bundled: ShiftRules = {
        guard let url = Bundle.main.url(forResource: "ShiftRules", withExtension: "json"),
              let data = try? Data(contentsOf: url), let rules = try? JSONDecoder().decode(ShiftRules.self, from: data) else {
            fatalError("Bundled ShiftRules.json missing")
        }
        return rules
    }()
}

enum WorkType: String, Codable, CaseIterable, Identifiable {
    case day = "DAY", night = "NIGHT", off = "OFF", specialDay = "SPECIAL_DAY", specialNight = "SPECIAL_NIGHT"
    case leave = "LEAVE", halfPre = "HALF_PRE", halfPost = "HALF_POST", unpaid = "UNPAID_OFF"
    case unpaidHalfPre = "UNPAID_HALF_PRE", unpaidHalfPost = "UNPAID_HALF_POST", noOT = "NO_OT"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .day: "주간"
        case .night: "야간"
        case .off: "휴무"
        case .specialDay: "주특"
        case .specialNight: "야특"
        case .leave: "연차"
        case .halfPre: "반차(전)"
        case .halfPost: "반차(후)"
        case .unpaid: "무급 휴무"
        case .unpaidHalfPre: "무반(전)"
        case .unpaidHalfPost: "무반(후)"
        case .noOT: "O.T 해제"
        }
    }
    var symbol: String {
        switch self {
        case .day, .specialDay: "sun.max.fill"
        case .night, .specialNight: "moon.fill"
        case .leave, .halfPre, .halfPost: "leaf.fill"
        default: "cup.and.saucer.fill"
        }
    }
}

struct WorkDay: Identifiable {
    let key: String
    let date: Date
    let type: WorkType
    let baseType: WorkType
    let holiday: String
    let dayNumber: Int?
    let memo: String
    let changed: Bool
    var id: String { key }
    var label: String { type == .noOT ? baseType.label + " · O.T 해제" : type.label }
    var alarmHour: Int? {
        switch type {
        case .day, .specialDay: 6
        case .night, .specialNight: 18
        case .noOT: baseType == .day ? 6 : baseType == .night ? 18 : nil
        default: nil
        }
    }
}

struct ScheduleEngine {
    let rules: ShiftRules
    static func key(_ date: Date) -> String {
        let p = ShiftPlanner.korea.dateComponents([.year,.month,.day], from: date)
        return String(format: "%04d-%02d-%02d", p.year!, p.month!, p.day!)
    }
    static func date(_ key: String) -> Date? {
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let d = ShiftPlanner.korea.date(from: DateComponents(year:p[0],month:p[1],day:p[2])), Self.key(d) == key else { return nil }
        return d
    }
    func day(_ date: Date, group: String, override: WorkType? = nil, memo: String = "") -> WorkDay {
        let cal = ShiftPlanner.korea
        let date = cal.startOfDay(for: date), key = Self.key(date)
        let base = Self.date(rules.base)!
        var elapsed = cal.dateComponents([.day], from: base, to: date).day!
        for shutdown in rules.shutdown {
            guard let d = Self.date(shutdown) else { continue }
            if date >= base, d >= base, d < date { elapsed -= 1 }
            if date < base, d >= date, d < base { elapsed += 1 }
        }
        let idx = ((elapsed + (rules.offsets[group] ?? 0)) % 12 + 12) % 12
        let baseType: WorkType = rules.shutdown.contains(key) ? .off : idx < 4 ? .day : idx < 6 ? .off : idx < 10 ? .night : .off
        let holiday = rules.holidays[key] ?? ""
        let actual = override ?? (holiday.isEmpty ? baseType : baseType == .day ? .specialDay : baseType == .night ? .specialNight : .off)
        let number = rules.shutdown.contains(key) ? nil : idx < 4 ? idx+1 : idx < 6 ? idx-3 : idx < 10 ? idx-5 : idx-9
        return WorkDay(key:key,date:date,type:actual,baseType:baseType,holiday:holiday,dayNumber:override == nil && holiday.isEmpty ? number : nil,memo:memo,changed:override != nil)
    }
}

struct ScheduleBackup: Codable {
    let version: Int
    let group: String
    let overrides: [String: WorkType]
    let memos: [String: String]
}

@MainActor
final class ScheduleStore: ObservableObject {
    static let shared = ScheduleStore()
    static let changed = Notification.Name("ShiftCalScheduleChanged")
    private let defaults: UserDefaults
    let engine: ScheduleEngine
    @Published private(set) var group: String
    @Published private(set) var overrides: [String:WorkType]
    @Published private(set) var memos: [String:String]
    @Published private(set) var storageMessage: String?
    init(defaults: UserDefaults = .standard, rules: ShiftRules = .bundled) {
        self.defaults = defaults
        engine = ScheduleEngine(rules:rules)
        let data = defaults.data(forKey:"shiftCal.schedule.v1")
        let backup = data.flatMap { try? JSONDecoder().decode(ScheduleBackup.self,from:$0) }
        group = ["A","B","C"].contains(backup?.group ?? "") ? backup!.group : "C"
        overrides = backup?.overrides ?? [:]; memos = backup?.memos ?? [:]
        storageMessage = data != nil && backup == nil ? "저장된 근무표를 읽지 못했습니다. 백업 파일로 복원해 주세요." : nil
    }
    private func storageKey(_ key: String) -> String { group + ":" + key }
    func day(_ date: Date) -> WorkDay {
        let k = storageKey(ScheduleEngine.key(date))
        return engine.day(date,group:group,override:overrides[k],memo:memos[k] ?? "")
    }
    func month(_ date: Date) -> [WorkDay] {
        let cal = ShiftPlanner.korea
        let start = cal.date(from:cal.dateComponents([.year,.month],from:date))!
        return (0..<cal.range(of:.day,in:.month,for:date)!.count).map { day(cal.date(byAdding:.day,value:$0,to:start)!) }
    }
    func setGroup(_ group: String) { guard ["A","B","C"].contains(group) else { return }; self.group=group; save() }
    func update(_ date: Date, type: WorkType?, memo: String) {
        let k=storageKey(ScheduleEngine.key(date));overrides[k]=type
        memos[k]=memo.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ? nil : memo
        save()
    }
    private func save() {
        do { defaults.set(try backupData(),forKey:"shiftCal.schedule.v1");storageMessage=nil }
        catch { storageMessage="근무표 저장 실패: \(error.localizedDescription)" }
        NotificationCenter.default.post(name:Self.changed,object:nil)
    }
    func backupData() throws -> Data { try JSONEncoder().encode(ScheduleBackup(version:1,group:group,overrides:overrides,memos:memos)) }
    func restore(_ data: Data) throws {
        guard data.count <= 5_000_000 else { throw CocoaError(.fileReadTooLarge) }
        let b=try JSONDecoder().decode(ScheduleBackup.self,from:data)
        func valid(_ k:String)->Bool {
            let p=k.split(separator:":",maxSplits:1).map(String.init)
            return p.count==2 && ["A","B","C"].contains(p[0]) && ScheduleEngine.date(p[1]) != nil
        }
        guard b.version==1,["A","B","C"].contains(b.group),b.overrides.keys.allSatisfy(valid),b.memos.keys.allSatisfy(valid) else { throw CocoaError(.fileReadCorruptFile) }
        group=b.group;overrides=b.overrides;memos=b.memos;save()
    }
    func events(now: Date = Date()) -> [ShiftEvent] {
        let cal=ShiftPlanner.korea,start=cal.startOfDay(for:now)
        return (0..<30).map { offset in
            let d=day(cal.date(byAdding:.day,value:offset,to:start)!)
            var title=group+"조 "+d.label
            if [.halfPre,.halfPost,.unpaidHalfPre,.unpaidHalfPost].contains(d.type) { title += " · " + d.baseType.label }
            return ShiftEvent(title:title,notes:"Shift_cal 근무 일정\n메모:\n"+d.memo,start:d.date,allDay:true)
        }
    }
    func calendarText(for date: Date) -> String {
        func escape(_ s:String)->String { s.replacingOccurrences(of:"\\",with:"\\\\").replacingOccurrences(of:"\n",with:"\\n").replacingOccurrences(of:",",with:"\\,").replacingOccurrences(of:";",with:"\\;") }
        var lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Shift_cal//iOS//KO","CALSCALE:GREGORIAN","X-WR-CALNAME:Shift_cal \(group)조","X-WR-TIMEZONE:Asia/Seoul"]
        let stamp=ISO8601DateFormatter().string(from:Date()).replacingOccurrences(of:"-",with:"").replacingOccurrences(of:":",with:"")
        for d in month(date) {
            let next=ScheduleEngine.key(ShiftPlanner.korea.date(byAdding:.day,value:1,to:d.date)!).replacingOccurrences(of:"-",with:"")
            lines += ["BEGIN:VEVENT","UID:shift-cal-native-\(group)-\(d.key)@wn-hue","DTSTAMP:\(stamp)","DTSTART;VALUE=DATE:\(d.key.replacingOccurrences(of:"-",with:""))","DTEND;VALUE=DATE:\(next)","SUMMARY:\(escape(group+"조 "+d.label))","DESCRIPTION:\(escape("Shift_cal 근무 일정\n메모:\n"+d.memo))","END:VEVENT"]
        }
        lines.append("END:VCALENDAR")
        // RFC 5545 lines are folded at 75 UTF-8 bytes without splitting scalars.
        return lines.map { line in
            var result="",current="",count=0
            for scalar in line.unicodeScalars {
                let value=String(scalar),n=value.utf8.count
                if count+n>75 { result += current+"\r\n"; current=" ";count=1 }
                current += value;count += n
            }
            return result+current
        }.joined(separator:"\r\n")+"\r\n"
    }
}
