import SwiftUI
import UniformTypeIdentifiers

extension WorkType {
    var color: Color {
        switch self {
        case .day: Color(red:0.65,green:0.32,blue:0.16)
        case .night: Color(red:0.24,green:0.28,blue:0.48)
        case .specialDay: Color(red:0.10,green:0.44,blue:0.43)
        case .specialNight: Color(red:0.44,green:0.30,blue:0.55)
        case .leave, .halfPre, .halfPost: Color(red:0.22,green:0.46,blue:0.34)
        default: .secondary
        }
    }
    var shortLabel:String {
        switch self {
        case .day: "주"
        case .night: "야"
        case .off: "휴"
        case .unpaid: "무휴"
        case .halfPre: "반전"
        case .halfPost: "반후"
        case .unpaidHalfPre: "무전"
        case .unpaidHalfPost: "무후"
        case .noOT: "OT−"
        default: label
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
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment:.leading,spacing:12) {
                        monthHeader
                        todayCard
                        MonthGrid(days:store.month(month),showMemos:true,cellHeight:calendarHeight(geometry.size.height)) { selected=$0 }
                        HStack(spacing:16) {
                            Text("주 주간").foregroundStyle(WorkType.day.color)
                            Text("야 야간").foregroundStyle(WorkType.night.color)
                            Text("휴 휴무").foregroundStyle(.secondary)
                            Spacer()
                        }.font(.caption)
                        if let error=store.storageMessage { Text(error).foregroundStyle(.red).font(.footnote) }
                    }.padding(.horizontal,16).padding(.bottom,24)
                }.background(Color(.systemBackground))
            }
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
        return VStack(alignment:.leading,spacing:4) {
            HStack(spacing:8) {
                Text("오늘").foregroundStyle(.secondary)
                Text(today.label).fontWeight(.medium).foregroundStyle(today.type.color).accessibilityIdentifier("today-shift")
                Spacer()
                Text(today.alarmHour.map{String(format:"알람 %02d:30",$0)} ?? "알람 없음").foregroundStyle(.secondary)
            }.font(.caption)
            if !today.memo.isEmpty { Text(today.memo).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
        }.padding(.bottom,4)
    }
    private var monthHeader: some View {
        HStack(spacing:4) {
            Text(ScheduleDisplay.title(month,format:"yyyy.MM")).font(.system(size:28,weight:.semibold))
            Spacer()
            Button { move(-1) } label:{ Image(systemName:"chevron.left").font(.subheadline).frame(width:44,height:44) }.accessibilityLabel("이전 달")
            Button { move(1) } label:{ Image(systemName:"chevron.right").font(.subheadline).frame(width:44,height:44) }.accessibilityLabel("다음 달")
        }.foregroundStyle(.primary)
    }
    private func calendarHeight(_ available:CGFloat)->CGFloat {
        let days=store.month(month)
        let pad=ShiftPlanner.korea.component(.weekday,from:days[0].date)-1
        let rows=CGFloat((pad+days.count+6)/7)
        return max(74,(available-150)/rows)
    }
    private func move(_ delta:Int) { month=ShiftPlanner.korea.date(byAdding:.month,value:delta,to:month)! }

}

struct EditWorkView: View {
    @ObservedObject var store: ScheduleStore
    let day: WorkDay
    @Environment(\.dismiss) private var dismiss
    @State private var choice=""
    @State private var memo=""
    @State private var tab = 0
    private let columns=Array(repeating:GridItem(.flexible(),spacing:12),count:4)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    VStack(alignment:.leading,spacing:8) {
                        Text(ScheduleDisplay.title(day.date,format:"M월 d일 EEEE")).font(.title2.weight(.semibold))
                        Text("\(store.group)조 · 기본 근무 \(store.engine.day(day.date,group:store.group).label)").font(.subheadline).foregroundStyle(.secondary)
                        if !day.holiday.isEmpty { Text(day.holiday).font(.caption).foregroundStyle(.secondary) }
                    }.padding(.top,12)
                    HStack(spacing:28) {
                        editorTab("근무",index:0)
                        editorTab("메모",index:1)
                        Spacer()
                    }
                    if tab == 0 {
                        options([.day,.night,.off,.specialDay,.specialNight,.noOT])
                        Divider()
                        Text("연차 · 반차 · 무급").font(.subheadline).foregroundStyle(.secondary)
                        options([.leave,.halfPre,.halfPost,.unpaid,.unpaidHalfPre,.unpaidHalfPost])
                        Divider()
                        Button("기본 근무로 되돌리기") { choice="" }.font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("reset-shift")
                    } else {
                        TextField("메모를 남겨 주세요",text:$memo,axis:.vertical).lineLimit(6...12).accessibilityIdentifier("memo-editor")
                        Divider()
                        Text("공유할 때 메모 포함 여부를 선택할 수 있어요.").font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(.horizontal,24).padding(.bottom,24)
            }.background(Color(.systemBackground))
            .navigationTitle("근무 변경").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.cancellationAction) { Button("취소") { dismiss() }.foregroundStyle(.secondary) }
                ToolbarItem(placement:.confirmationAction) { Button("저장") { store.update(day.date,type:WorkType(rawValue:choice),memo:memo);dismiss() }.fontWeight(.semibold).accessibilityIdentifier("save-shift") }
            }
            .onAppear { choice=day.changed ? day.type.rawValue : "";memo=day.memo }
        }
    }
    private func editorTab(_ title:String,index:Int)->some View {
        Button { tab=index } label: {
            VStack(spacing:10) {
                Text(title).font(.headline).foregroundStyle(tab==index ? Color.primary : .secondary)
                Rectangle().fill(tab==index ? Color.primary : .clear).frame(height:2)
            }.fixedSize(horizontal:true,vertical:false)
        }.buttonStyle(.plain).accessibilityIdentifier("editor-tab-\(index)")
    }
    private var selectedType:WorkType { WorkType(rawValue:choice) ?? store.engine.day(day.date,group:store.group).type }
    private func options(_ types:[WorkType])->some View {
        LazyVGrid(columns:columns,spacing:22) {
            ForEach(types) { type in
                Button { choice=type.rawValue } label: {
                    VStack(spacing:8) {
                        Text(type.shortLabel).font(.system(size:15,weight:.semibold)).foregroundStyle(type.color)
                            .frame(width:44,height:40).background(type.color.opacity(0.10),in:RoundedRectangle(cornerRadius:10))
                            .overlay(RoundedRectangle(cornerRadius:10).stroke(selectedType==type ? type.color : .clear,lineWidth:1.5))
                        Text(type.label).font(.system(size:11)).foregroundStyle(selectedType==type ? Color.primary : .secondary).lineLimit(1).minimumScaleFactor(0.8)
                    }.frame(maxWidth:.infinity,minHeight:68)
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
