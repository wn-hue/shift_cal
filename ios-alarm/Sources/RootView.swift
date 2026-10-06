import SwiftUI
import UniformTypeIdentifiers

extension WorkType {
    var color: Color {
        switch self {
        case .day, .specialDay: .orange
        case .night, .specialNight: .indigo
        case .leave, .halfPre, .halfPost: .green
        default: .secondary
        }
    }
}

struct RootView: View {
    @ObservedObject var model: AlarmModel
    @ObservedObject var schedule: ScheduleStore
    var body: some View {
        TabView {
            ScheduleView(store:schedule).tabItem { Label("근무표",systemImage:"calendar") }
            AlarmView(model:model).tabItem { Label("알람",systemImage:"alarm") }
            SettingsView(store:schedule).tabItem { Label("설정",systemImage:"gearshape") }
        }.tint(.indigo)
    }
}

struct ScheduleView: View {
    @ObservedObject var store: ScheduleStore
    @State private var month = Date()
    @State private var selected: WorkDay?
    @State private var exportURL: URL?
    @State private var message: String?
    private let columns = Array(repeating:GridItem(.flexible(),spacing:4),count:7)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    todayCard
                    Picker("내 교대조",selection:Binding(get:{store.group},set:{store.setGroup($0)})) {
                        ForEach(["A","B","C"],id:\.self) { Text($0+"조").tag($0) }
                    }.pickerStyle(.segmented).accessibilityIdentifier("group-picker")
                    monthHeader
                    calendarGrid
                    HStack(spacing:16) {
                        Label("주간",systemImage:"sun.max.fill").foregroundStyle(.orange)
                        Label("야간",systemImage:"moon.fill").foregroundStyle(.indigo)
                        Label("연차",systemImage:"leaf.fill").foregroundStyle(.green)
                    }.font(.caption)
                    Text("날짜를 누르면 근무 변경과 메모를 저장할 수 있어요.").font(.footnote).foregroundStyle(.secondary)
                    summary
                    if let message { Text(message).foregroundStyle(.red).font(.footnote) }
                    if let error=store.storageMessage { Text(error).foregroundStyle(.red) }
                    Text("2025–2027년 공휴일·회사 휴무 규칙을 적용합니다. 이후에는 기본 교대 주기만 적용되므로 회사 공지에 맞춰 근무를 변경해 주세요.").font(.footnote).foregroundStyle(.secondary)
                }.padding()
            }.background(Color(.systemGroupedBackground))
            .navigationTitle("Shift_cal")
            .toolbar {
                ToolbarItem(placement:.topBarTrailing) {
                    Menu {
                        Button("이번 달 캘린더 내보내기",systemImage:"square.and.arrow.up") { exportCalendar() }
                        Button("오늘로 이동",systemImage:"calendar.badge.clock") { month=Date() }
                    } label: { Image(systemName:"ellipsis.circle") }
                }
            }
            .sheet(item:$selected) { item in EditWorkView(store:store,day:item) }
            .sheet(isPresented:Binding(get:{exportURL != nil},set:{if !$0 {exportURL=nil}})) {
                if let exportURL { ShareSheet(items:[exportURL]) }
            }
        }
    }
    private var todayCard: some View {
        let today=store.day(Date())
        return VStack(alignment:.leading,spacing:10) {
            Text("오늘 · \(store.group)조").font(.subheadline).foregroundStyle(.secondary)
            HStack {
                Image(systemName:today.type.symbol).font(.largeTitle).foregroundStyle(today.type.color)
                VStack(alignment:.leading,spacing:4) {
                    Text(today.label).font(.title.bold()).accessibilityIdentifier("today-shift")
                    Text(today.alarmHour.map{String(format:"근무 알람 %02d:30",$0)} ?? "오늘은 근무 알람 없음").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
            }
            if !today.memo.isEmpty { Text(today.memo).font(.subheadline) }
        }.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(.background,in:RoundedRectangle(cornerRadius:24))
    }
    private var monthHeader: some View {
        HStack {
            Button { move(-1) } label:{ Image(systemName:"chevron.left").frame(width:44,height:44) }.accessibilityLabel("이전 달")
            Spacer()
            Text(month.formatted(.dateTime.year().month(.wide).locale(Locale(identifier:"ko_KR")))).font(.title3.bold())
            Spacer()
            Button { move(1) } label:{ Image(systemName:"chevron.right").frame(width:44,height:44) }.accessibilityLabel("다음 달")
        }
    }
    private var calendarGrid: some View {
        let days=store.month(month)
        let pad=ShiftPlanner.korea.component(.weekday,from:days[0].date)-1
        return LazyVGrid(columns:columns,spacing:8) {
            ForEach(Array(["일","월","화","수","목","금","토"].enumerated()),id:\.offset) { i,name in
                Text(name).font(.caption).foregroundStyle(i==0 ? .red : .secondary).frame(maxWidth:.infinity)
            }
            ForEach(0..<pad,id:\.self) { _ in Color.clear.frame(height:65) }
            ForEach(days) { day in
                Button { selected=day } label: {
                    VStack(spacing:5) {
                        Text(String(ShiftPlanner.korea.component(.day,from:day.date))).font(.subheadline.weight(.semibold))
                            .foregroundStyle(day.holiday.isEmpty ? Color.primary : .red)
                        Text(day.type == .noOT ? "OT해제" : day.type.label).font(.system(size:11,weight:.medium)).minimumScaleFactor(0.7).lineLimit(1).foregroundStyle(day.type.color)
                        HStack(spacing:3) {
                            if day.changed { Image(systemName:"pencil").font(.system(size:8)) }
                            if !day.memo.isEmpty { Circle().frame(width:4,height:4) }
                        }.frame(height:6).foregroundStyle(.secondary)
                    }.frame(maxWidth:.infinity,minHeight:65)
                        .background(ShiftPlanner.korea.isDateInToday(day.date) ? Color.indigo.opacity(0.12) : Color(.secondarySystemGroupedBackground),in:RoundedRectangle(cornerRadius:12))
                }.buttonStyle(.plain)
                    .accessibilityLabel("\(day.key) \(day.label) \(day.holiday) \(day.memo)")
                    .accessibilityIdentifier("day-\(day.key)")
            }
        }
    }
    private var summary: some View {
        let days=store.month(month)
        let work=days.filter{ $0.alarmHour != nil }.count
        let leave=days.reduce(0.0) { $0 + ($1.type == .leave ? 1 : [.halfPre,.halfPost].contains($1.type) ? 0.5 : 0) }
        return HStack {
            stat("근무",value:"\(work)일")
            Spacer()
            stat("유급 연차 사용",value:String(format:"%g일",leave))
            Spacer()
            stat("휴무",value:"\(days.filter{$0.type == .off}.count)일")
        }.padding().background(.background,in:RoundedRectangle(cornerRadius:18))
    }
    private func stat(_ title:String,value:String)->some View { VStack(alignment:.leading,spacing:6) { Text(title).font(.caption).foregroundStyle(.secondary);Text(value).font(.headline) } }
    private func move(_ delta:Int) { month=ShiftPlanner.korea.date(byAdding:.month,value:delta,to:month)! }
    private func exportCalendar() {
        do {
            let url=FileManager.default.temporaryDirectory.appendingPathComponent("Shift_cal_\(store.group)_\(ScheduleEngine.key(month).prefix(7)).ics")
            try store.calendarText(for:month).write(to:url,atomically:true,encoding:.utf8);exportURL=url
        } catch { message="내보내기 실패: \(error.localizedDescription)" }
    }
}

struct EditWorkView: View {
    @ObservedObject var store: ScheduleStore
    let day: WorkDay
    @Environment(\.dismiss) private var dismiss
    @State private var choice=""
    @State private var memo=""
    var body: some View {
        NavigationStack {
            Form {
                Section("\(store.group)조 · \(day.key)") {
                    Text("기본 근무: \(store.engine.day(day.date,group:store.group).label)")
                    if !day.holiday.isEmpty { Label(day.holiday,systemImage:"flag") }
                    Picker("근무 변경",selection:$choice) {
                        Text("기본 근무표 사용").tag("")
                        ForEach(WorkType.allCases) { Text($0.label).tag($0.rawValue) }
                    }.accessibilityIdentifier("shift-editor")
                }
                Section("메모") { TextField("이날 기억할 내용",text:$memo,axis:.vertical).lineLimit(3...6).accessibilityIdentifier("memo-editor") }
                Section { Text("앱의 근무표를 알람 출처로 사용 중이면 저장한 변경이 알람에 반영됩니다. 웹 근무표와는 별도로 저장됩니다.").font(.footnote).foregroundStyle(.secondary) }
            }.navigationTitle("근무 변경").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement:.cancellationAction) { Button("취소") { dismiss() } }
                    ToolbarItem(placement:.confirmationAction) { Button("저장") { store.update(day.date,type:WorkType(rawValue:choice),memo:memo);dismiss() }.accessibilityIdentifier("save-shift") }
                }
                .onAppear { choice=day.changed ? day.type.rawValue : "";memo=day.memo }
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items:[Any]
    func makeUIViewController(context:Context)->UIActivityViewController { UIActivityViewController(activityItems:items,applicationActivities:nil) }
    func updateUIViewController(_ controller:UIActivityViewController,context:Context) {}
}

struct SettingsView: View {
    @ObservedObject var store: ScheduleStore
    @State private var shareURL:URL?
    @State private var importing=false
    @State private var pending:Data?
    @State private var message=""
    var body: some View {
        NavigationStack {
            List {
                Section("내 근무 설정") {
                    Picker("교대조",selection:Binding(get:{store.group},set:{store.setGroup($0)})) {
                        ForEach(["A","B","C"],id:\.self) { Text($0+"조").tag($0) }
                    }
                    Text("한국 시간 · 주간 06:30 / 야간 18:30").font(.footnote)
                }
                Section("백업 및 복원") {
                    Button("근무 변경·메모 백업") { backup() }.accessibilityIdentifier("backup-schedule")
                    Button("백업 파일 복원") { importing=true }
                    if !message.isEmpty { Text(message).font(.footnote) }
                }
                Section("기존 Shift_cal 기능") {
                    Link("웹 근무표·급여·식단·Google 연동 열기",destination:URL(string:"https://h-lyart-ten.vercel.app/")!)
                    Text("기존 웹 기능은 Safari에서 이용합니다. 앱의 근무 변경과 메모는 웹 계정과 자동으로 동기화되지 않습니다. Google에 저장한 근무는 알람 탭에서 iPhone 캘린더를 선택해 사용할 수 있습니다.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("앱 정보") {
                    Text("Shift_cal 1.0 · iOS 26 이상")
                    NavigationLink("도움말 및 문의") { SupportView() }
                    NavigationLink("개인정보 처리방침") { PrivacyView() }
                    Link("기존 서비스 이용약관",destination:URL(string:"https://h-lyart-ten.vercel.app/terms.html")!)
                    Text("알람은 앞으로 30일을 미리 예약합니다. 예약 마지막 날짜 전에 앱을 다시 열어 주세요. 근무 변경 후 예약 목록을 확인하세요.").font(.footnote).foregroundStyle(.secondary)
                }
            }.navigationTitle("설정")
            .fileImporter(isPresented:$importing,allowedContentTypes:[.json]) { result in
                do {
                    let url=try result.get();let access=url.startAccessingSecurityScopedResource();defer { if access {url.stopAccessingSecurityScopedResource()} }
                    let data=try Data(contentsOf:url)
                    guard data.count <= 5_000_000 else { throw CocoaError(.fileReadTooLarge) }
                    pending=data
                } catch { message="파일을 열지 못했습니다: \(error.localizedDescription)" }
            }
            .confirmationDialog("백업으로 앱의 근무 변경과 메모를 교체할까요?",isPresented:Binding(get:{pending != nil},set:{if !$0 {pending=nil}}),titleVisibility:.visible) {
                Button("백업으로 복원",role:.destructive) {
                    if let data=pending { do { try store.restore(data);message="백업을 복원했습니다." } catch { message="올바른 Shift_cal 백업이 아닙니다. 기존 데이터는 유지됩니다." } };pending=nil
                }
                Button("취소",role:.cancel) {pending=nil}
            }
            .sheet(isPresented:Binding(get:{shareURL != nil},set:{if !$0 {shareURL=nil}})) { if let shareURL { ShareSheet(items:[shareURL]) } }
        }
    }
    private func backup() {
        do {
            let url=FileManager.default.temporaryDirectory.appendingPathComponent("Shift_cal_백업.json")
            try store.backupData().write(to:url,options:.atomic);shareURL=url
        } catch {message="백업 실패: \(error.localizedDescription)"}
    }
}

struct PolicySection: Decodable { let title: String; let body: String }
struct AppPolicy: Decodable {
    let email: String
    let effectiveDate: String
    let privacy: [PolicySection]
    let support: [PolicySection]
    static let shared: AppPolicy = {
        guard let url = Bundle.main.url(forResource: "AppPolicy", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let policy = try? JSONDecoder().decode(AppPolicy.self, from: data) else {
            fatalError("Bundled AppPolicy.json is missing or invalid")
        }
        return policy
    }()
}
struct SupportView: View {
    var body: some View {
        List {
            Section("지원 연락처") {
                Text(AppPolicy.shared.email).textSelection(.enabled)
                Link("메일로 문의하기", destination: URL(string: "mailto:" + AppPolicy.shared.email)!)
                Text("메일 앱이 열립니다. 내용을 확인한 뒤 직접 보내 주세요.").font(.footnote)
            }
            ForEach(AppPolicy.shared.support, id: \.title) { item in
                Section(item.title) { Text(item.body) }
            }
            NavigationLink("개인정보 처리방침") { PrivacyView() }
            Link("공개 지원 페이지", destination: URL(string: "https://h-lyart-ten.vercel.app/ios-support.html")!)
        }.navigationTitle("도움말 및 문의").navigationBarTitleDisplayMode(.inline)
    }
}
struct PrivacyView: View {
    var body: some View {
        List {
            ForEach(AppPolicy.shared.privacy, id: \.title) { item in
                Section(item.title) { Text(item.body) }
            }
            Link("공개 iOS 개인정보 처리방침", destination: URL(string: "https://h-lyart-ten.vercel.app/ios-privacy.html")!)
            Link("Google 개인정보처리방침", destination: URL(string: "https://policies.google.com/privacy")!)
            Link("Vercel 개인정보처리방침", destination: URL(string: "https://vercel.com/legal/privacy-policy")!)
            Link("기존 웹 서비스 개인정보 처리방침", destination: URL(string: "https://h-lyart-ten.vercel.app/privacy.html")!)
        }.navigationTitle("개인정보 처리방침").navigationBarTitleDisplayMode(.inline)
    }
}
