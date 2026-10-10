import SwiftUI
import UniformTypeIdentifiers

extension WorkType {
    var color: Color {
        switch self {
        case .day, .specialDay: .init(red:0.68,green:0.33,blue:0.08)
        case .night, .specialNight: .init(red:0.27,green:0.29,blue:0.60)
        case .leave, .halfPre, .halfPost: .green
        default: .secondary
        }
    }
}

struct RootView: View {
    @ObservedObject var model: AlarmModel
    @ObservedObject var schedule: ScheduleStore
    @State private var month = Date()
    var body: some View {
        TabView {
            ScheduleView(store:schedule,month:$month).tabItem { Label("근무표",systemImage:"calendar") }
            ScheduleShareView(store:schedule,month:$month).tabItem { Label("공유",systemImage:"square.and.arrow.up") }
            AlarmView(model:model).tabItem { Label("알람",systemImage:"alarm") }
            SettingsView(store:schedule).tabItem { Label("설정",systemImage:"gearshape") }
        }.tint(.indigo)
    }
}

struct ScheduleView: View {
    @ObservedObject var store: ScheduleStore
    @Binding var month: Date
    @State private var choosingGroup = false
    @State private var selected: WorkDay?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    todayCard
                    monthHeader
                    calendarGrid
                    HStack(spacing:16) {
                        Label("주간",systemImage:"sun.max.fill").foregroundStyle(WorkType.day.color)
                        Label("야간",systemImage:"moon.fill").foregroundStyle(WorkType.night.color)
                        Label("연차",systemImage:"leaf.fill").foregroundStyle(.green)
                    }.font(.caption)
                    Text("날짜를 누르면 근무 변경과 메모를 저장할 수 있어요.").font(.footnote).foregroundStyle(.secondary)
                    summary
                    if let error=store.storageMessage { Text(error).foregroundStyle(.red) }
                    Text("2025–2027년 공휴일·회사 휴무 규칙을 적용합니다. 이후에는 기본 교대 주기만 적용되므로 회사 공지에 맞춰 근무를 변경해 주세요.").font(.footnote).foregroundStyle(.secondary)
                }.padding()
            }.background(Color(.systemGroupedBackground))
            .navigationTitle("Shift_cal").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.topBarTrailing) {
                    Button { choosingGroup=true } label: { Text(store.group+"조").font(.headline); Image(systemName:"chevron.down").font(.caption) }
                    .accessibilityIdentifier("choose-group")
                }
                ToolbarItem(placement:.topBarTrailing) {
                    Menu {
                        Button("오늘로 이동",systemImage:"calendar.badge.clock") { month=Date() }
                    } label: { Image(systemName:"ellipsis.circle") }
                }
            }
            .sheet(isPresented:$choosingGroup) { GroupSelectionView(store:store) }
            .sheet(item:$selected) { item in EditWorkView(store:store,day:item).presentationDragIndicator(.visible) }

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
        MonthGrid(days:store.month(month),showMemos:true) { selected=$0 }
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

}

struct EditWorkView: View {
    @ObservedObject var store: ScheduleStore
    let day: WorkDay
    @Environment(\.dismiss) private var dismiss
    @State private var choice=""
    @State private var memo=""
    @State private var tab = 0
    private let columns = Array(repeating:GridItem(.flexible(),spacing:10),count:3)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    VStack(alignment:.leading,spacing:8) {
                        Text(ScheduleDisplay.title(day.date,format:"M월 d일 EEEE")).font(.title2.bold())
                        Text("\(store.group)조 · 기본 근무 \(store.engine.day(day.date,group:store.group).label)").foregroundStyle(.secondary)
                        if !day.holiday.isEmpty { Label(day.holiday,systemImage:"flag").font(.subheadline) }
                    }.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(.background,in:RoundedRectangle(cornerRadius:20))
                    Picker("편집 항목",selection:$tab) { Text("근무").tag(0); Text("메모").tag(1) }.pickerStyle(.segmented)
                    if tab == 0 {
                        Text("근무 선택").font(.headline)
                        options([.day,.night,.off,.specialDay,.specialNight,.noOT])
                        Text("연차 · 반차 · 무급").font(.headline)
                        options([.leave,.halfPre,.halfPost,.unpaid,.unpaidHalfPre,.unpaidHalfPost])
                        Button { choice="" } label: {
                            Label("기본 근무로 되돌리기",systemImage:choice.isEmpty ? "checkmark.circle.fill" : "arrow.uturn.backward")
                                .frame(maxWidth:.infinity,minHeight:48)
                        }.buttonStyle(.bordered).accessibilityIdentifier("reset-shift")
                        Text("저장하면 앱 근무표와 근무 알람에 반영됩니다.").font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Text("이날의 메모").font(.headline)
                        TextField("기억할 내용을 남겨 주세요",text:$memo,axis:.vertical).lineLimit(5...10)
                            .padding().background(.background,in:RoundedRectangle(cornerRadius:16)).accessibilityIdentifier("memo-editor")
                        Text("메모는 아이폰에 보관됩니다. 공유 이미지에는 기본으로 포함하지 않습니다.").font(.footnote).foregroundStyle(.secondary)
                    }
                }.padding()
            }.background(Color(.systemGroupedBackground))
            .navigationTitle("근무 변경").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement:.cancellationAction) { Button("취소") { dismiss() } } }
            .safeAreaInset(edge:.bottom) {
                Button { store.update(day.date,type:WorkType(rawValue:choice),memo:memo);dismiss() } label: {
                    Text("변경 저장").font(.headline).frame(maxWidth:.infinity).padding(16)
                }.buttonStyle(.borderedProminent).accessibilityIdentifier("save-shift").padding().background(.regularMaterial)
            }
            .onAppear { choice=day.changed ? day.type.rawValue : "";memo=day.memo }
        }
    }
    private var selectedType:WorkType { WorkType(rawValue:choice) ?? store.engine.day(day.date,group:store.group).type }
    private func options(_ types:[WorkType])->some View {
        LazyVGrid(columns:columns,spacing:10) {
            ForEach(types) { type in
                Button { choice=type.rawValue } label: {
                    VStack(spacing:8) {
                        Image(systemName:type.symbol).font(.title3)
                        Text(type.label).font(.subheadline.weight(.semibold)).minimumScaleFactor(0.7).lineLimit(1)
                        Image(systemName:selectedType==type ? "checkmark.circle.fill" : "circle").font(.caption)
                    }.foregroundStyle(type.color).frame(maxWidth:.infinity,minHeight:86)
                        .background(type.color.opacity(selectedType==type ? 0.18 : 0.06),in:RoundedRectangle(cornerRadius:16))
                        .overlay(RoundedRectangle(cornerRadius:16).stroke(type.color.opacity(selectedType==type ? 1 : 0.15),lineWidth:selectedType==type ? 2 : 1))
                }.buttonStyle(.plain).accessibilityLabel(type.label).accessibilityIdentifier("shift-"+type.rawValue)
                    .accessibilityAddTraits(selectedType==type ? .isSelected : [])
            }
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
