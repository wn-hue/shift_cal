import SwiftUI
import UniformTypeIdentifiers

enum AppTheme {
    static var style:String { UserDefaults.standard.string(forKey:"calendar-theme") ?? "current" }
    static func rgb(_ hex:UInt)->Color { Color(red:Double((hex>>16)&255)/255,green:Double((hex>>8)&255)/255,blue:Double(hex&255)/255) }
    static var accent:Color { rgb(style == "gpt" ? 0x212121 : style == "current" ? 0x424242 : 0x2874e8) }
    static var attendance:Color { rgb(style == "gpt" ? 0xb55b61 : style == "toss" ? 0xc94d61 : 0xc64b58) }
    static var green:Color { style == "current" ? Color(red:21/255,green:150/255,blue:106/255) : accent }
    static var orange:Color { style == "current" ? Color(red:223/255,green:140/255,blue:37/255) : accent }
    static var surface:Color { Color(.systemBackground) }
    static var page:Color { style == "toss" ? rgb(0xf5f7fa) : style == "gpt" ? Color(.systemBackground) : Color(.systemGroupedBackground) }
}

extension WorkType {
    var color: Color {
        if AppTheme.style != "current" {
            let gpt=AppTheme.style == "gpt"
            switch self {
            case .day:return AppTheme.rgb(gpt ? 0xddd9d0 : 0xe8f2ff)
            case .night:return AppTheme.rgb(gpt ? 0x343434 : 0x2453a6)
            case .specialDay:return AppTheme.rgb(gpt ? 0x555555 : 0x3182f6)
            case .specialNight:return AppTheme.rgb(gpt ? 0x212121 : 0x1b64da)
            case .off:return AppTheme.rgb(gpt ? 0x777777 : 0xd95769)
            default:return AppTheme.attendance
            }
        }
        switch self {
        case .day: return Color(red:255/255,green:214/255,blue:0/255)
        case .night: return Color(red:66/255,green:66/255,blue:66/255)
        case .specialDay: return Color(red:71/255,green:214/255,blue:220/255)
        case .specialNight: return Color(red:84/255,green:133/255,blue:238/255)
        case .off: return Color(red:232/255,green:104/255,blue:127/255)
        case .leave: return Color(red:195/255,green:91/255,blue:24/255)
        case .halfPre, .halfPost: return Color(red:128/255,green:86/255,blue:181/255)
        case .unpaid, .unpaidHalfPre, .unpaidHalfPost: return Color(red:169/255,green:82/255,blue:100/255)
        default: return .secondary
        }
    }
    var isAttendance:Bool { [.leave,.halfPre,.halfPost,.unpaid,.unpaidHalfPre,.unpaidHalfPost].contains(self) }
    var attendanceLabel:String { switch self { case .leave: "연차 1";case .halfPre:"반차 전";case .halfPost:"반차 후";case .unpaid:"무급 1";case .unpaidHalfPre:"무반 전";case .unpaidHalfPost:"무반 후";default:label } }
    var badgeTextColor: Color { self == .day ? AppTheme.rgb(0x424242) : .white }
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
    @AppStorage("calendar-theme") private var theme="current"
    @ObservedObject var model: AlarmModel
    @ObservedObject var schedule: ScheduleStore
    @State private var month = Date()
    var body: some View {
        TabView {
            ScheduleView(store:schedule,month:$month).tabItem { Label("근무표",systemImage:"calendar") }
            ScheduleShareView(store:schedule,month:$month).tabItem { Label("공유",systemImage:"square.and.arrow.up") }
            AlarmView(model:model).tabItem { Label("알람",systemImage:"alarm") }
            SettingsView(store:schedule).tabItem { Label("내 근무",systemImage:"line.3.horizontal") }
        }.tint(AppTheme.accent).toolbarBackground(AppTheme.surface,for:.tabBar).toolbarBackground(.visible,for:.tabBar)
    }
}

struct ScheduleView: View {
    @AppStorage("calendar-theme") private var theme="current"
    @State private var pickingMonth=false
    @ObservedObject var store: ScheduleStore
    @Binding var month: Date
    @State private var choosingGroup = false
    @State private var statistics = false
    @State private var sharing = false
    @State private var selected: WorkDay?
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment:.leading,spacing:12) {
                        monthHeader
                        todayCard
                        MonthGrid(days:store.month(month),showMemos:true,cellHeight:calendarHeight(geometry.size.height)) { selected=$0 }
                            .simultaneousGesture(DragGesture(minimumDistance:30).onEnded { value in if abs(value.translation.width)>abs(value.translation.height),abs(value.translation.width)>50 { move(value.translation.width<0 ? 1 : -1) } })
                        HStack(spacing:16) {
                            Text("주 주간").foregroundStyle(WorkType.day.color)
                            Text("야 야간").foregroundStyle(WorkType.night.color)
                            Text("휴 휴무").foregroundStyle(.secondary)
                            Spacer()
                        }.font(.caption)
                        if let error=store.storageMessage { Text(error).foregroundStyle(.red).font(.footnote) }
                    }.padding(.horizontal,16).padding(.bottom,24)
                }.background(AppTheme.page)
            }
            .navigationTitle("Shift_cal").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.topBarLeading) {
                    Button { choosingGroup=true } label: { Image(systemName:"line.3.horizontal") }
                        .accessibilityLabel("메뉴").accessibilityIdentifier("open-menu")
                }
                ToolbarItem(placement:.topBarTrailing) {
                    VStack(spacing:1) {
                        Text("Google 로그인").font(.system(size:10))
                        Text("준비 중").font(.system(size:8))
                    }.foregroundStyle(.secondary).accessibilityLabel("Google 로그인 준비 중")
                }
                ToolbarItem(placement:.topBarTrailing) {
                    Button { sharing=true } label: { Image(systemName:"square.and.arrow.up") }.accessibilityLabel("근무표 공유")
                }
                ToolbarItem(placement:.topBarTrailing) {
                    Button { statistics=true } label:{ Image(systemName:"chart.bar.xaxis") }.accessibilityLabel("근무 통계")
                }

            }
            .sheet(isPresented:$pickingMonth) { NavigationStack { DatePicker("이동할 날짜",selection:$month,displayedComponents:.date).datePickerStyle(.graphical).padding().navigationTitle("월 이동").toolbar { ToolbarItem(placement:.confirmationAction) { Button("완료") { pickingMonth=false } } } } }
            .sheet(isPresented:$statistics) { WorkStatisticsView(store:store,month:month).presentationDragIndicator(.visible) }
            .sheet(isPresented:$sharing) { ScheduleShareView(store:store,month:$month).presentationDragIndicator(.visible) }
            .sheet(isPresented:$choosingGroup) { SettingsView(store:store,showClose:true) }
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
            Button { pickingMonth=true } label: { Text(ScheduleDisplay.title(month,format:"yyyy.MM")).font(.system(size:28,weight:.semibold)).foregroundStyle(.primary) }.accessibilityLabel("달력 월 선택")
            Spacer()
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
    @AppStorage("display-circle") private var displayCircle=false
    @AppStorage("calendar-theme") private var theme="current"
    @ObservedObject var store: ScheduleStore
    let day: WorkDay
    @Environment(\.dismiss) private var dismiss
    @State private var choice=""
    @State private var memo=""
    @State private var tab = 0
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    VStack(alignment:.leading,spacing:8) {
                        Text(ScheduleDisplay.title(day.date,format:"M월 d일 EEEE")).font(.title2.weight(.semibold))
                        Text("\(store.group)조 · 기본 근무 \(store.engine.day(day.date,group:store.group).label)").font(.subheadline).foregroundStyle(.secondary)
                        if !day.holiday.isEmpty { Text(day.holiday).font(.caption).foregroundStyle(.secondary) }
                    }.padding(.top,12)
                    HStack(spacing:4) {
                        editorTab("근무",index:0)
                        editorTab("메모",index:1)
                    }.padding(4).background(Color(.secondarySystemBackground),in:RoundedRectangle(cornerRadius:12))
                    if tab == 0 {
                        Text("근무").font(.subheadline.weight(.medium))
                        options([.day,.night,.off,.specialDay,.specialNight,.noOT])
                        Divider()
                        Text("근태").font(.subheadline.weight(.medium))
                        options([.leave,.halfPre,.halfPost,.unpaid,.unpaidHalfPre,.unpaidHalfPost])
                        Divider()
                        Button("기본 근무로 되돌리기") { choice="" }.font(.subheadline).foregroundStyle(.secondary).frame(maxWidth:.infinity,minHeight:44).background(AppTheme.surface,in:RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(Color.secondary.opacity(0.2))).accessibilityIdentifier("reset-shift")
                    } else {
                        TextField("메모를 남겨 주세요",text:$memo,axis:.vertical).lineLimit(12...18).frame(minHeight:240,alignment:.top).accessibilityIdentifier("memo-editor")
                        Divider()
                    }
                }.padding(.horizontal,24).padding(.bottom,24)
            }.background(AppTheme.page)
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
            Text(title).font(.system(size:16,weight:.semibold))
                .foregroundStyle(tab==index ? Color.white : Color.secondary)
                .frame(maxWidth:.infinity,minHeight:44)
                .background(tab==index ? AppTheme.accent : Color.clear,in:RoundedRectangle(cornerRadius:9))
        }.buttonStyle(.plain).accessibilityIdentifier("editor-tab-\(index)")
            .accessibilityAddTraits(tab==index ? .isSelected : [])
    }
    private var selectedType:WorkType { WorkType(rawValue:choice) ?? store.engine.day(day.date,group:store.group).type }
    private func options(_ types:[WorkType])->some View {
        ScrollView(.horizontal,showsIndicators:false) {
          HStack(spacing:12) {
            ForEach(types) { type in
                Button { choice=type.rawValue } label: {
                    VStack(spacing:8) {
                        Text(type.isAttendance || type == .noOT ? type.label : type.shortLabel).font(.system(size:type.isAttendance || type == .noOT ? 11 : 15,weight:.semibold)).foregroundStyle(type.isAttendance || type == .noOT ? Color(red:70/255,green:86/255,blue:106/255) : type == .off ? type.color : type.badgeTextColor)
                            .frame(width:displayCircle ? 58 : 44,height:displayCircle ? 58 : 40).background(type.isAttendance || type == .noOT ? Color(red:237/255,green:241/255,blue:245/255) : type == .off ? Color.clear : type.color,in:RoundedRectangle(cornerRadius:displayCircle ? 29 : 10))
                            .padding(3).overlay(RoundedRectangle(cornerRadius:displayCircle ? 32 : 13).stroke(selectedType==type ? Color.primary : .clear,lineWidth:2))
                    }.frame(width:displayCircle ? 66 : 58,height:displayCircle ? 66 : 48)
                }.buttonStyle(.plain).accessibilityLabel(type.label).accessibilityIdentifier("shift-"+type.rawValue)
                    .accessibilityAddTraits(selectedType==type ? .isSelected : [])
            }
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
    var showClose=false
    @Environment(\.dismiss) private var dismiss
    @State private var changingGroup=false
    @State private var shareURL:URL?
    @State private var importing=false
    @State private var pending:Data?
    @State private var message=""
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button { changingGroup=true } label: {
                        HStack { Image(systemName:"person.2.fill").foregroundStyle(AppTheme.accent);Text("교대조 설정").font(.subheadline);Spacer();Text(store.group+"조").font(.subheadline);Image(systemName:"chevron.right").font(.caption) }
                    }.accessibilityIdentifier("menu-group-settings")
                }
                Section("백업 및 복원") {
                    Button { backup() } label: { Label("근무 변경·메모 백업",systemImage:"tray.and.arrow.up.fill").foregroundStyle(AppTheme.green) }.accessibilityIdentifier("backup-schedule")
                    Button { importing=true } label: { Label("백업 파일 복원",systemImage:"tray.and.arrow.down.fill").foregroundStyle(AppTheme.orange) }
                    if !message.isEmpty { Text(message).font(.footnote) }
                }
                Section("기존 Shift_cal 기능") {
                    Link("웹 근무표·급여·식단·Google 연동 열기",destination:URL(string:"https://h-lyart-ten.vercel.app/")!)
                    Text("기존 웹 기능은 Safari에서 이용합니다. 앱의 근무 변경과 메모는 웹 계정과 자동으로 동기화되지 않습니다. Google에 저장한 근무는 알람 탭에서 iPhone 캘린더를 선택해 사용할 수 있습니다.").font(.footnote).foregroundStyle(.secondary)
                }

            }.scrollContentBackground(.hidden).background(AppTheme.page).navigationTitle("내 근무")
            .toolbar { ToolbarItem(placement:.topBarTrailing) { NavigationLink { AppPreferencesView() } label: { Image(systemName:"gearshape") }.accessibilityLabel("앱 환경") }; if showClose { ToolbarItem(placement:.cancellationAction) { Button("닫기") { dismiss() }.accessibilityIdentifier("close-menu") } } }
            .sheet(isPresented:$changingGroup) { GroupSelectionView(store:store) }
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


struct WorkStatisticsView: View {
    @ObservedObject var store:ScheduleStore
    let month:Date
    @Environment(\.dismiss) private var dismiss
    private var periodStart:Date {
        let cal=ShiftPlanner.korea
        let first=cal.date(from:cal.dateComponents([.year,.month],from:month))!
        return cal.date(byAdding:.day,value:15,to:cal.date(byAdding:.month,value:-1,to:first)!)!
    }
    private var periodEnd:Date {
        let cal=ShiftPlanner.korea
        return cal.date(byAdding:.day,value:14,to:cal.date(from:cal.dateComponents([.year,.month],from:month))!)!
    }
    private var days:[WorkDay] {
        var result:[WorkDay]=[],date=periodStart
        while date<=periodEnd {
            result.append(store.day(date))
            date=ShiftPlanner.korea.date(byAdding:.day,value:1,to:date)!
        }
        return result
    }
    private func count(_ type:WorkType)->Int { days.filter{$0.type==type}.count }
    private var used:Double { Double(count(.leave)) + Double(count(.halfPre)+count(.halfPost))/2 }
    private func amount(_ type:WorkType)->Double {
        days.reduce(0) { sum,day in
            if type == .off { return sum + (day.type == .off || day.type == .unpaid ? 1 : [.unpaidHalfPre,.unpaidHalfPost].contains(day.type) ? 0.5 : 0) }
            if day.type == type { return sum+1 }
            if type == .day || type == .night {
                let base=store.engine.day(day.date,group:store.group).type
                let direction:WorkType = [.night,.specialNight].contains(base) ? .night : .day
                if direction == type {
                    if day.type == .noOT { return sum+1 }
                    if [.halfPre,.halfPost,.unpaidHalfPre,.unpaidHalfPost].contains(day.type) { return sum+0.5 }
                }
            }
            return sum
        }
    }
    private var working:Double { amount(.day)+amount(.night)+amount(.specialDay)+amount(.specialNight) }
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    VStack(alignment:.leading,spacing:6) {
                        Text(ScheduleDisplay.title(month,format:"yyyy.MM")).font(.system(size:28,weight:.semibold))
                        Text(store.group+"조 · 근무 통계").font(.caption).foregroundStyle(.secondary)
                    }
                    VStack(alignment:.leading,spacing:16) {
                        Text("급여 기간 근무").font(.subheadline.weight(.semibold))
                        Text(ScheduleDisplay.title(periodStart,format:"yyyy.MM.dd")+" – "+ScheduleDisplay.title(periodEnd,format:"yyyy.MM.dd")).font(.caption).foregroundStyle(.secondary)
                        ViewThatFits {
                            HStack(spacing:16) { badges }
                            ScrollView(.horizontal,showsIndicators:false) { HStack(spacing:16) { badges } }
                        }
                        row("총 출근",value:working.formatted()+"일")
                    }
                    Divider()
                    VStack(alignment:.leading,spacing:16) {
                        Text("예상 급여").font(.subheadline.weight(.semibold))
                        Text("급여 설정과 계산은 웹에서 확인할 수 있어요.").font(.caption).foregroundStyle(.secondary)
                        Link(destination:URL(string:"https://h-lyart-ten.vercel.app/")!) {
                            HStack { Text("급여 계산기 열기");Spacer();Image(systemName:"chevron.right") }
                                .font(.subheadline.weight(.medium)).padding(14)
                                .foregroundStyle(AppTheme.accent).background(AppTheme.accent.opacity(0.08),in:RoundedRectangle(cornerRadius:12))
                        }
                    }
                    Divider()
                    row("급여 기간 사용 연차",value:used.formatted()+"일")
                }.padding(24)
            }.background(AppTheme.page)
            .navigationTitle("근무 통계").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement:.confirmationAction) { Button("닫기") { dismiss() } } }
        }
    }
    private var badges:some View {
        ForEach([WorkType.day,.night,.off,.specialDay,.specialNight]) { type in
            HStack(spacing:5) {
                Text(type.shortLabel).font(.system(size:11,weight:.medium))
                    .foregroundStyle(type == .off ? type.color : type.badgeTextColor)
                    .frame(width:30,height:30).background(type == .off ? type.color.opacity(0.08) : type.color,in:RoundedRectangle(cornerRadius:9))
                Text(amount(type).formatted()).font(.system(size:13,weight:.semibold))
            }
        }
    }
    private func row(_ title:String,value:String)->some View {
        HStack { Text(title).foregroundStyle(.secondary);Spacer();Text(value).fontWeight(.semibold) }.font(.subheadline)
    }
}

struct AppPreferencesView:View {
    @AppStorage("calendar-theme") private var theme="current"
    @AppStorage("display-holidays") private var holidays=true
    @AppStorage("display-memos") private var memos=true
    @AppStorage("display-circle") private var circle=false
    var body:some View {
        List {
            Section("테마") { Picker("달력 스타일",selection:$theme) { Text("1").tag("current");Text("2").tag("toss");Text("3").tag("gpt") } }
            Section("화면 표시") {
                Toggle("공휴일 이름",isOn:$holidays)
                Toggle("달력 메모",isOn:$memos)
                Toggle("원형 근무 배지",isOn:$circle)
            }
            Section("앱 정보") {
                Text("Shift_cal 1.0 · iOS 26 이상")
                NavigationLink("도움말 및 문의") { SupportView() }
                NavigationLink("개인정보 처리방침") { PrivacyView() }
                Link("서비스 이용약관",destination:URL(string:"https://h-lyart-ten.vercel.app/terms.html")!)
            }
        }.scrollContentBackground(.hidden).background(AppTheme.page).navigationTitle("앱 환경").navigationBarTitleDisplayMode(.inline).tint(AppTheme.accent)
    }
}
