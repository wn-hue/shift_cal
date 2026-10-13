import SwiftUI
import UniformTypeIdentifiers
import EventKit
import AuthenticationServices
import CryptoKit
import Security
import Combine

enum AppTheme {
    static var dark:Bool { style == "dark" }
    static var style:String { UserDefaults.standard.string(forKey:"calendar-theme") ?? "current" }
    static func rgb(_ hex:UInt)->Color { Color(red:Double((hex>>16)&255)/255,green:Double((hex>>8)&255)/255,blue:Double(hex&255)/255) }
    static var accent:Color { rgb(dark ? 0x83bce0 : style == "gpt" ? 0x212121 : style == "current" ? 0x202433 : 0x2874e8) }
    static var attendance:Color { rgb(dark ? 0xee9aaa : style == "gpt" ? 0xb55b61 : style == "toss" ? 0xc94d61 : 0xc64b58) }
    static var green:Color { style == "current" ? Color(red:21/255,green:150/255,blue:106/255) : accent }
    static var orange:Color { style == "current" ? Color(red:223/255,green:140/255,blue:37/255) : accent }
    static var surface:Color { Color(.systemBackground) }
    static var page:Color { style == "current" ? rgb(0xfbfaf7) : dark ? Color(.systemGroupedBackground) : style == "toss" ? rgb(0xf5f7fa) : style == "gpt" ? Color(.systemBackground) : Color(.systemGroupedBackground) }
}

extension WorkType {
    var color: Color {
        if AppTheme.dark {
            switch self {
            case .day:return AppTheme.rgb(0xf5ce68)
            case .night:return AppTheme.rgb(0xb6adff)
            case .specialDay, .specialDayNoOT:return AppTheme.rgb(0x6cd4c4)
            case .specialNight, .specialNightNoOT:return AppTheme.rgb(0x7daaff)
            case .off:return AppTheme.rgb(0xff9aa9)
            default:return AppTheme.attendance
            }
        }
        if AppTheme.style != "current" {
            let gpt=AppTheme.style == "gpt"
            switch self {
            case .day:return AppTheme.rgb(gpt ? 0xddd9d0 : 0xe8f2ff)
            case .night:return AppTheme.rgb(gpt ? 0x343434 : 0x2453a6)
            case .specialDay, .specialDayNoOT:return AppTheme.rgb(gpt ? 0x555555 : 0x3182f6)
            case .specialNight, .specialNightNoOT:return AppTheme.rgb(gpt ? 0x212121 : 0x1b64da)
            case .off:return AppTheme.rgb(gpt ? 0x777777 : 0xd95769)
            default:return AppTheme.attendance
            }
        }
        switch self {
        case .day: return AppTheme.rgb(0xffda54)
        case .night: return AppTheme.rgb(0x202433)
        case .specialDay, .specialDayNoOT: return Color(red:71/255,green:214/255,blue:220/255)
        case .specialNight, .specialNightNoOT: return Color(red:84/255,green:133/255,blue:238/255)
        case .off: return Color(red:232/255,green:104/255,blue:127/255)
        case .leave: return Color(red:195/255,green:91/255,blue:24/255)
        case .halfPre, .halfPost: return Color(red:128/255,green:86/255,blue:181/255)
        case .unpaid, .unpaidHalfPre, .unpaidHalfPost: return Color(red:169/255,green:82/255,blue:100/255)
        default: return .secondary
        }
    }
    var isAttendance:Bool { [.leave,.halfPre,.halfPost,.unpaid,.unpaidHalfPre,.unpaidHalfPost].contains(self) }
    var attendanceLabel:String { switch self { case .leave: "연차 1";case .halfPre:"반차 전";case .halfPost:"반차 후";case .unpaid:"무급 1";case .unpaidHalfPre:"무반 전";case .unpaidHalfPost:"무반 후";default:label } }
    var badgeTextColor: Color { AppTheme.dark ? AppTheme.rgb(0x15202b) : self == .day ? AppTheme.rgb(0x424242) : .white }
    var shortLabel:String {
        switch self {
        case .specialDay, .specialDayNoOT: "주특"
        case .specialNight, .specialNightNoOT: "야특"
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
    @Environment(\.scenePhase) private var scenePhase
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
        }.onAppear { let saved=UserDefaults.standard.string(forKey:"display-mode");if saved == "dark" || (saved == "auto" && UITraitCollection.current.userInterfaceStyle == .dark) {theme="dark"};UserDefaults.standard.removeObject(forKey:"display-mode") }.preferredColorScheme(theme == "dark" ? .dark : .light).onChange(of:scenePhase) { _,phase in if phase == .active {Task{await NativeCloudAccount.shared.sync()};CalendarOverlay.shared.refresh(month)} }.task { NativeCloudAccount.shared.attach(schedule) }.tint(AppTheme.accent).toolbarBackground(AppTheme.surface,for:.tabBar).toolbarBackground(.visible,for:.tabBar)
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
    @ObservedObject private var calendars=CalendarOverlay.shared
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
                    Button { sharing=true } label: { Image(systemName:"square.and.arrow.up") }.accessibilityLabel("근무표 공유")
                }
                ToolbarItem(placement:.topBarTrailing) {
                    Button { statistics=true } label:{ Image(systemName:"chart.bar.xaxis") }.accessibilityLabel("근무 통계")
                }

            }
            .task(id:month) { calendars.refresh(month) }
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
                        options([.day,.night,.off,.specialDay,.specialNight,.specialDayNoOT,.specialNightNoOT,.noOT])
                        Divider()
                        Text("근태").font(.subheadline.weight(.medium))
                        options([.leave,.halfPre,.halfPost,.unpaid,.unpaidHalfPre,.unpaidHalfPost])
                        Divider()
                        Button("기본 근무로 되돌리기") { choice="" }.font(.subheadline).foregroundStyle(.secondary).frame(maxWidth:.infinity,minHeight:44).background(AppTheme.surface,in:RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(Color.secondary.opacity(0.2))).accessibilityIdentifier("reset-shift").accessibilityValue(choice.isEmpty ? "선택됨" : "선택 안 됨")
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
                .foregroundStyle(tab==index ? (AppTheme.dark ? AppTheme.rgb(0x15202b) : AppTheme.style == "current" ? AppTheme.rgb(0xffda54) : Color.white) : Color.secondary)
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
                        Text(type.isSpecialNoOT ? type.label.replacingOccurrences(of:" ",with:"\n") : type.isAttendance || type == .noOT ? type.label : type.shortLabel).font(.system(size:type.isAttendance || type == .noOT || type.isSpecialNoOT ? 11 : 15,weight:.semibold)).foregroundStyle(AppTheme.dark ? AppTheme.rgb(0x15202b) : type.isAttendance ? Color.white : type == .noOT ? day.baseType.badgeTextColor : type.badgeTextColor)
                            .frame(width:58,height:58).background(type.isAttendance ? AppTheme.attendance : type == .noOT ? day.baseType.color : type.color,in:RoundedRectangle(cornerRadius:29))
                            .padding(3).overlay(RoundedRectangle(cornerRadius:32).stroke(selectedType==type ? AppTheme.accent : .clear,lineWidth:3))
                    }.frame(width:66,height:66)
                        .overlay(alignment:.topTrailing) { if selectedType==type { Image(systemName:"checkmark.circle.fill").font(.system(size:16,weight:.semibold)).symbolRenderingMode(.palette).foregroundStyle(AppTheme.dark ? AppTheme.rgb(0x15202b) : .white,AppTheme.accent).padding(2).accessibilityHidden(true) } }
                }.buttonStyle(.plain).accessibilityLabel(type.label).accessibilityValue(selectedType==type ? "선택됨" : "선택 안 됨").accessibilityIdentifier("shift-"+type.rawValue)
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
    @State private var loggingIn=false
    @State private var shareURL:URL?
    @State private var importing=false
    @State private var pending:Data?
    @State private var message=""
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button { loggingIn=true } label: {
                        HStack(spacing:12) {
                            Image(systemName:"person.crop.circle.fill").font(.system(size:30)).foregroundStyle(AppTheme.accent).accessibilityHidden(true)
                            VStack(alignment:.leading,spacing:5) { Text("로그인 및 동기화").font(.headline).foregroundStyle(AppTheme.accent);Text("Google · Apple 계정").font(.caption).foregroundStyle(.secondary) }
                            Spacer();Image(systemName:"chevron.right").font(.caption)
                        }.padding(.vertical,2)
                    }
                }
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
                Section("웹 기능") {
                    Link(destination:URL(string:"https://h-lyart-ten.vercel.app/?view=payroll")!) { Label("급여 계산기",systemImage:"banknote").foregroundStyle(AppTheme.accent) }
                    Link(destination:URL(string:"https://h-lyart-ten.vercel.app/?view=leave")!) { Label("시급·연차",systemImage:"calendar.badge.checkmark").foregroundStyle(AppTheme.green) }
                }

            }.scrollContentBackground(.hidden).background(AppTheme.page).navigationTitle("내 근무")
            .toolbar { ToolbarItem(placement:.topBarTrailing) { NavigationLink { AppPreferencesView() } label: { Image(systemName:"gearshape") }.accessibilityLabel("앱 환경") }; if showClose { ToolbarItem(placement:.cancellationAction) { Button("닫기") { dismiss() }.accessibilityIdentifier("close-menu") } } }
            .sheet(isPresented:$loggingIn) { NativeAccountView(store:store) }
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
            if day.type == type || type == .specialDay && day.type == .specialDayNoOT || type == .specialNight && day.type == .specialNightNoOT { return sum+1 }
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
                        Text("시급 설정과 급여 계산은 웹에서 확인할 수 있어요.").font(.caption).foregroundStyle(.secondary)
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
    @State private var connectingCalendars=false
    var body:some View {
        List {
            Section("테마") { Picker("달력 스타일",selection:$theme) { Text("1. 밤과 낮").tag("current");Text("2. 블루컬러").tag("toss");Text("3. 그레이").tag("gpt");Text("4. 다크모드").tag("dark") } }
            Section("화면 표시") {
                Toggle("공휴일 이름",isOn:$holidays)
                Toggle("달력 메모",isOn:$memos)
                Toggle("원형 근무 배지",isOn:$circle)
            }
            Section("내 캘린더") { Button { connectingCalendars=true } label: { Label("iCloud · Google 일정 표시",systemImage:"calendar.badge.plus").foregroundStyle(AppTheme.accent) } }
            Section("앱 정보") {
                Text("Shift_cal 1.0 · iOS 26 이상")
                NavigationLink("도움말 및 문의") { SupportView() }
                NavigationLink("개인정보 처리방침") { PrivacyView() }
                Link("서비스 이용약관",destination:URL(string:"https://h-lyart-ten.vercel.app/terms.html")!)
            }
        }.sheet(isPresented:$connectingCalendars) { DeviceCalendarsView() }.scrollContentBackground(.hidden).background(AppTheme.page).navigationTitle("앱 환경").navigationBarTitleDisplayMode(.inline).tint(AppTheme.accent)
    }
}


struct CalendarOverlayEvent: Identifiable {
    let id:String
    let title:String
    let start:Date
    let end:Date
    let color:Color
}
@MainActor
final class CalendarOverlay: ObservableObject {
    static let shared=CalendarOverlay()
    private let eventStore=EKEventStore()
    @Published var calendars:[EKCalendar]=[]
    @Published var selected:Set<String>=Set(UserDefaults.standard.stringArray(forKey:"overlay-calendars") ?? [])
    @Published var events:[CalendarOverlayEvent]=[]
    @Published var message=""
    private var month=Date()
    private var observer:AnyCancellable?
    private init() {
        observer=NotificationCenter.default.publisher(for:.EKEventStoreChanged).receive(on:RunLoop.main).sink { [weak self] _ in Task { @MainActor in self?.refresh(self?.month ?? Date()) } }
    }
    func connect() async {
        do { guard try await eventStore.requestFullAccessToEvents() else {message="캘린더 접근이 꺼져 있습니다. iPhone 설정에서 허용해 주세요.";return};refresh(month) }
        catch {message="캘린더를 열지 못했습니다. 권한을 확인해 주세요."}
    }
    func toggle(_ id:String) { if selected.contains(id){selected.remove(id)}else{selected.insert(id)};UserDefaults.standard.set(Array(selected),forKey:"overlay-calendars");refresh(month) }
    func refresh(_ date:Date) {
        month=date
        guard EKEventStore.authorizationStatus(for:.event) == .fullAccess else {calendars=[];events=[];return}
        calendars=eventStore.calendars(for:.event).sorted { $0.source.title == $1.source.title ? $0.title < $1.title : $0.source.title < $1.source.title }
        let chosen=calendars.filter{selected.contains($0.calendarIdentifier)}
        guard !chosen.isEmpty else {events=[];message=calendars.isEmpty ? "연결된 캘린더가 없습니다. iPhone 설정에서 계정을 추가하세요." : "표시할 캘린더를 선택하세요.";return}
        let cal=ShiftPlanner.korea,parts=cal.dateComponents([.year,.month],from:date),start=cal.date(from:parts)!,end=cal.date(byAdding:.month,value:1,to:start)!
        events=eventStore.events(matching:eventStore.predicateForEvents(withStart:start,end:end,calendars:chosen)).sorted{$0.startDate < $1.startDate}.map{CalendarOverlayEvent(id:$0.eventIdentifier ?? UUID().uuidString,title:$0.title ?? "일정",start:$0.startDate,end:$0.endDate,color:Color(cgColor:$0.calendar.cgColor))}
        message="선택한 일정은 근무와 급여 계산에 반영되지 않습니다."
    }
    func on(_ date:Date)->[CalendarOverlayEvent] {let start=ShiftPlanner.korea.startOfDay(for:date),end=ShiftPlanner.korea.date(byAdding:.day,value:1,to:start)!;return events.filter{$0.start < end && $0.end > start}}
}
struct DeviceCalendarsView: View {
    @ObservedObject private var model=CalendarOverlay.shared
    @Environment(\.dismiss) private var dismiss
    var body:some View {
        NavigationStack {
            List {
                Section { Button("캘린더 접근 허용") { Task {await model.connect()} };Text(model.message).font(.footnote).foregroundStyle(.secondary) }
                ForEach(Array(Set(model.calendars.map{$0.source.title})).sorted(),id:\.self) { source in
                    Section(source) { ForEach(model.calendars.filter{$0.source.title==source},id:\.calendarIdentifier) { calendar in
                        Button {model.toggle(calendar.calendarIdentifier)} label:{HStack{Image(systemName:model.selected.contains(calendar.calendarIdentifier) ? "checkmark.square.fill" : "square").foregroundStyle(AppTheme.accent);Circle().fill(Color(cgColor:calendar.cgColor)).frame(width:9,height:9);Text(calendar.title).foregroundStyle(.primary);Spacer()}}
                    } }
                }
                Section {Text("Google 일정이 보이지 않으면 iPhone 설정 → 앱 → 캘린더 → 캘린더 계정에서 Google 계정을 추가하세요. iCloud 캘린더도 기기의 계정 설정을 사용합니다.").font(.footnote).foregroundStyle(.secondary)}
            }.scrollContentBackground(.hidden).background(AppTheme.page).navigationTitle("내 캘린더").toolbar{ToolbarItem(placement:.confirmationAction){Button("완료"){dismiss()}}}.task{model.refresh(Date())}
        }.tint(AppTheme.accent)
    }
}
struct NativeAccountView: View {
    @ObservedObject var store:ScheduleStore
    @State private var deleting=false
    @ObservedObject private var account=NativeCloudAccount.shared
    @Environment(\.dismiss) private var dismiss
    var body:some View {
        NavigationStack {
            VStack(alignment:.leading,spacing:20) {
                Text("내 근무, 어디서나").font(.title2.bold())
                Text("로그인하면 근무 변경과 메모를 웹·다른 기기에서 이어서 사용할 수 있습니다.").foregroundStyle(.secondary)
                if account.email.isEmpty || account.needsReconnect {
                    Button {account.login("google")} label:{Text("Google로 로그인").frame(maxWidth:.infinity).padding().background(AppTheme.surface,in:RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(Color.secondary.opacity(0.2)))}
                    Button {account.login("apple")} label:{Label("Apple로 로그인",systemImage:"apple.logo").frame(maxWidth:.infinity).padding().background(Color.black,in:RoundedRectangle(cornerRadius:12)).foregroundStyle(.white)}.disabled(!account.appleAvailable)
                    if !account.appleAvailable {Text("Apple 로그인은 개발자 서비스 설정 완료 후 사용할 수 있습니다.").font(.footnote).foregroundStyle(.secondary)}
                } else {
                    Text(account.email).font(.headline)
                    Button("지금 동기화"){Task{await account.sync()}}
                    Button("로그아웃"){Task{await account.logout()}}
                    Button("계정 데이터 삭제",role:.destructive){deleting=true}
                }
                if account.busy {ProgressView()}
                Text(account.message).font(.footnote).foregroundStyle(.secondary)
                if account.conflict {Button("계정 근무표 사용"){Task{await account.resolve(useDevice:false)}};Button("이 기기 근무표 사용"){Task{await account.resolve(useDevice:true)}}}
                Text("급여 기준은 계정에서 보관하고 웹 급여 계산기에 반영됩니다. 캘린더 표시 선택은 기기별로 유지합니다.").font(.footnote).foregroundStyle(.secondary)
                Spacer()
            }.padding(24).background(AppTheme.page).navigationTitle("로그인 및 동기화").toolbar{ToolbarItem(placement:.confirmationAction){Button("닫기"){dismiss()}}}.task{account.attach(store)}.confirmationDialog("계정 데이터를 삭제하고 로그아웃할까요? 공유 링크는 공유 화면에서 별도로 종료하세요.",isPresented:$deleting,titleVisibility:.visible){Button("계정 데이터 삭제",role:.destructive){Task{await account.deleteAccount()}}}.disabled(account.busy)
        }.tint(AppTheme.accent)
    }
}

@MainActor
final class NativeCloudAccount: NSObject,ObservableObject,ASWebAuthenticationPresentationContextProviding {
    static let shared=NativeCloudAccount()
    @Published var email=""
    @Published var message=""
    @Published var busy=false
    @Published var conflict=false
    @Published var appleAvailable=false
    @Published var needsReconnect=false
    private var provider="google"
    private var userID=""
    private var syncPending=false
    private var token:String?
    private var authSession:ASWebAuthenticationSession?
    private var store:ScheduleStore?
    private var observer:AnyCancellable?
    private var baseline:[String:Any]?
    private var remote:[String:Any]=[:]
    private var parents:[String]=[]
    private var applying=false
    private var timer:Task<Void,Never>?
    private let keys=["shift_salary_config_master","shift_active_group","shift_day_memos","shift_overrides_A","shift_overrides_B","shift_overrides_C","shift_payroll_sms_reference_v1","shift_bonus_sms_reference_v1"]
    override private init(){super.init();if let saved=readKeychain(),let data=try? JSONSerialization.jsonObject(with:saved) as? [String:String]{token=data["token"];email=data["email"] ?? "";provider=data["provider"] ?? "google";userID=data["userID"] ?? ""}}
    func attach(_ schedule:ScheduleStore){store=schedule;if observer == nil {observer=NotificationCenter.default.publisher(for:ScheduleStore.changed).receive(on:RunLoop.main).sink{[weak self] _ in Task{@MainActor in guard let self,!self.applying else{return};self.timer?.cancel();self.timer=Task{try? await Task.sleep(for:.seconds(2));if !Task.isCancelled {await self.sync()}}}}};Task{await checkApple();if token != nil {await sync()}}}
    func presentationAnchor(for session:ASWebAuthenticationSession)->ASPresentationAnchor{UIApplication.shared.connectedScenes.compactMap{$0 as? UIWindowScene}.flatMap{$0.windows}.first{$0.isKeyWindow} ?? UIWindow()}
    private func randomHex()->String{var bytes=[UInt8](repeating:0,count:32);guard SecRandomCopyBytes(kSecRandomDefault,bytes.count,&bytes)==errSecSuccess else{return UUID().uuidString.replacingOccurrences(of:"-",with:"")+UUID().uuidString.replacingOccurrences(of:"-",with:"")};return bytes.map{String(format:"%02x",$0)}.joined()}
    func login(_ provider:String){guard !busy else{return};busy=true;message="로그인 화면을 여는 중…";let verifier=randomHex(),state=randomHex(),challenge=SHA256.hash(data:Data(verifier.utf8)).map{String(format:"%02x",$0)}.joined();let base="https://h-lyart-ten.vercel.app/api/"+(provider=="apple" ? "apple-account" : "google-calendar");var url=URLComponents(string:base)!;url.queryItems=[URLQueryItem(name:"action",value:"login"),URLQueryItem(name:"storage",value:"1"),URLQueryItem(name:"native_challenge",value:challenge),URLQueryItem(name:"native_state",value:state)];authSession=ASWebAuthenticationSession(url:url.url!,callbackURLScheme:"shiftcal"){[weak self] callback,error in Task{@MainActor in guard let self else{return};self.busy=false;if let error{self.message=(error as NSError).code==ASWebAuthenticationSessionError.canceledLogin.rawValue ? "로그인을 취소했습니다." : "로그인 화면을 열지 못했습니다.";return};guard let callback,let components=URLComponents(url:callback,resolvingAgainstBaseURL:false),components.host=="auth",components.queryItems?.first(where:{$0.name=="state"})?.value==state,let ticket=components.queryItems?.first(where:{$0.name=="ticket"})?.value else{self.message="로그인 요청을 확인하지 못했습니다.";return};do{let result=try await self.request("exchange",body:["ticket":ticket,"state":state,"verifier":verifier],anonymous:true);guard let token=result["token"] as? String,let user=result["user"] as? [String:String] else{throw CocoaError(.coderReadCorrupt)};self.token=token;self.provider=provider;self.userID=user["id"] ?? "";self.needsReconnect=false;self.email=user["email"] ?? "계정";self.baseline=nil;self.conflict=false;try self.saveKeychain();await self.sync()}catch{self.message=error.localizedDescription}}};authSession?.presentationContextProvider=self;authSession?.prefersEphemeralWebBrowserSession=false;if authSession?.start() != true {busy=false;message="로그인 화면을 열지 못했습니다."}}
    func checkApple() async {do{let (data,_)=try await URLSession.shared.data(from:URL(string:"https://h-lyart-ten.vercel.app/api/apple-account?action=status")!);let j=try JSONSerialization.jsonObject(with:data) as? [String:Any];appleAvailable=j?["configured"] as? Bool ?? false}catch{appleAvailable=false}}
    private func request(_ action:String,body:[String:Any]=[:],anonymous:Bool=false) async throws -> [String:Any]{var req=URLRequest(url:URL(string:"https://h-lyart-ten.vercel.app/api/native-account?action="+action)!);req.httpMethod="POST";req.timeoutInterval=45;req.setValue("application/json",forHTTPHeaderField:"Content-Type");if !anonymous,let token{req.setValue("Bearer "+token,forHTTPHeaderField:"Authorization")};req.httpBody=try JSONSerialization.data(withJSONObject:body);let(data,response)=try await URLSession.shared.data(for:req);guard let r=response as? HTTPURLResponse,let j=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{throw CocoaError(.coderReadCorrupt)};guard (200..<300).contains(r.statusCode) else{if r.statusCode==401 {needsReconnect=true};throw NSError(domain:"ShiftCalCloud",code:r.statusCode,userInfo:[NSLocalizedDescriptionKey:j["message"] as? String ?? "동기화에 실패했습니다."])};return j}
    private var liveKey:String { "shift-native-live-links/"+(userID.isEmpty ? provider+"/"+email : userID) }
    private func liveLinks()->[String:String] { { if let links=UserDefaults.standard.dictionary(forKey:liveKey) as? [String:String]{return links};let links=(UserDefaults.standard.dictionary(forKey:"shift-native-live-links/"+provider+"/"+email) ?? UserDefaults.standard.dictionary(forKey:"shift-native-live-links/"+email)) as? [String:String] ?? [:];if !links.isEmpty{UserDefaults.standard.set(links,forKey:liveKey)};return links }() }
    private func livePayload(group:String,month:Date)->[String:Any] {
        guard let store else{return [:]}
        let days=ShiftPlanner.korea.range(of:.day,in:.month,for:month)!.map { offset -> [String:String] in
            let date=ShiftPlanner.korea.date(byAdding:.day,value:offset-1,to:month)!
            let key=ScheduleEngine.key(date)
            return ["type":store.engine.day(date,group:group,override:store.overrides[group+":"+key]).type.rawValue]
        }
        return ["group":group,"month":String(ScheduleEngine.key(month).prefix(7)),"days":days]
    }
    func shareURL(month:Date) async throws -> URL {
        guard token != nil,let store else{throw NSError(domain:"ShiftCalShare",code:401,userInfo:[NSLocalizedDescriptionKey:"내 근무 메뉴에서 로그인한 뒤 링크를 공유하세요."])}
        guard !busy,!conflict else{throw NSError(domain:"ShiftCalShare",code:409,userInfo:[NSLocalizedDescriptionKey:"계정 동기화를 마친 뒤 다시 시도하세요."])}
        let month=ShiftPlanner.korea.date(from:ShiftPlanner.korea.dateComponents([.year,.month],from:month))!
        let key=store.group+"/"+String(ScheduleEngine.key(month).prefix(7));var links=liveLinks()
        var body:[String:Any]=["schedule":livePayload(group:store.group,month:month)];if let id=links[key]{body["id"]=id}
        let result:[String:Any]
        do{result=try await request("live-write",body:body)}catch{if body["id"] != nil,[403,404].contains((error as NSError).code){body.removeValue(forKey:"id");result=try await request("live-write",body:body)}else{throw error}}
        guard let id=result["id"] as? String else{throw CocoaError(.coderReadCorrupt)}
        links[key]=id;UserDefaults.standard.set(links,forKey:liveKey)
        return URL(string:"https://h-lyart-ten.vercel.app/shared-schedule.html#live="+id)!
    }
    func stopSharing(month:Date) async throws {
        guard let store,token != nil else{return}
        let key=store.group+"/"+String(ScheduleEngine.key(month).prefix(7));var links=liveLinks()
        guard let id=links[key] else{return}
        _ = try await request("live-delete",body:["id":id]);links.removeValue(forKey:key);UserDefaults.standard.set(links,forKey:liveKey)
    }
    private func publishLiveLinks() async throws {
        for (key,id) in liveLinks() {
            let parts=key.split(separator:"/");guard parts.count==2,let date=ScheduleEngine.date(String(parts[1])+"-01") else{continue}
            do { _ = try await request("live-write",body:["id":id,"schedule":livePayload(group:String(parts[0]),month:date)]) }
            catch { if [403,404].contains((error as NSError).code) {var links=liveLinks();links.removeValue(forKey:key);UserDefaults.standard.set(links,forKey:liveKey)} else {throw error} }
        }
    }
    private func equal(_ a:Any?,_ b:Any?)->Bool{let x=a ?? NSNull(),y=b ?? NSNull();return NSDictionary(dictionary:["v":x]).isEqual(to:["v":y])}
    private func blank()->[String:Any]{Dictionary(uniqueKeysWithValues:keys.map{($0,NSNull())})}
    private func snapshot()->[String:Any]{var data=baseline ?? remote;if data.isEmpty{data=blank()};guard let store else{return data};data["shift_active_group"]=store.group;for group in ["A","B","C"]{var map=[String:String]();for(k,v)in store.overrides where k.hasPrefix(group+":"){map[String(k.dropFirst(2))]=v.rawValue};if map.isEmpty{data["shift_overrides_"+group]=NSNull()}else{data["shift_overrides_"+group]=map}};var memos=remote["shift_day_memos"] as? [String:String] ?? [:];let old=baseline?["shift_day_memos"] as? [String:String] ?? [:];for k in old.keys{memos.removeValue(forKey:k)};for(k,v)in store.memos where k.hasPrefix(store.group+":"){memos[String(k.dropFirst(2))]=v};if memos.isEmpty{data["shift_day_memos"]=NSNull()}else{data["shift_day_memos"]=memos};return data}
    private func apply(_ data:[String:Any]) throws{guard let store else{return};let group=data["shift_active_group"] as? String ?? store.group;var overrides=[String:WorkType]();for g in ["A","B","C"]{for(k,v)in data["shift_overrides_"+g] as? [String:String] ?? [:]{let name=v=="FORCED_OFF" ? "OFF" : v=="HALF_LEAVE" ? "HALF_POST" : v=="UNPAID_HALF" ? "UNPAID_HALF_POST" : v;if let type=WorkType(rawValue:name){overrides[g+":"+k]=type}}};var memos=store.memos.filter{!$0.key.hasPrefix(group+":")};for(k,v)in data["shift_day_memos"] as? [String:String] ?? [:]{memos[group+":"+k]=v;for g in ["A","B","C"] where memos[g+":"+k] == nil {memos[g+":"+k]=v}};applying=true;defer{applying=false};try store.restore(JSONEncoder().encode(ScheduleBackup(version:1,group:group,overrides:overrides,memos:memos)))}
    private func merge(_ b:Any?,_ l:Any?,_ r:Any?,clash:inout Bool)->Any{if equal(l,r)||equal(b,r){return l ?? NSNull()};if equal(b,l){return r ?? NSNull()};if let ld=l as? [String:Any],let rd=r as? [String:Any]{let bd=b as? [String:Any] ?? [:];var result=[String:Any]();for k in Set(bd.keys).union(ld.keys).union(rd.keys){let value=merge(bd[k],ld[k],rd[k],clash:&clash);if !(value is NSNull){result[k]=value}};return result};clash=true;return l ?? NSNull()}
    func sync() async {guard token != nil,store != nil,!conflict,!needsReconnect else{return};if busy{syncPending=true;return};busy=true;defer{busy=false;if syncPending{syncPending=false;Task{await self.sync()}}};message="근무표와 메모 동기화 중…";do{if userID.isEmpty{let status=try await request("status");let user=status["user"] as? [String:String];userID=user?["id"] ?? "";provider=status["provider"] as? String ?? provider;try saveKeychain()};let result=try await request("cloud-read");let versions=result["versions"] as? [[String:Any]] ?? [];parents=versions.compactMap{$0["revision"] as? String};remote=versions.first?["data"] as? [String:Any] ?? blank();let local=snapshot();if versions.count>1{conflict=true;message="여러 기기에서 동시에 수정했습니다. 웹에서 저장 기록을 선택한 뒤 다시 시도하세요.";return};if baseline == nil,!versions.isEmpty,!equal(local,remote){let workKeys=["shift_active_group","shift_day_memos","shift_overrides_A","shift_overrides_B","shift_overrides_C"];let hasLocal=store!.overrides.count>0 || store!.memos.count>0;if hasLocal&&workKeys.contains(where:{!equal(local[$0],remote[$0])}){conflict=true;message="기기와 계정의 근무표가 다릅니다. 사용할 데이터를 선택하세요.";return};try apply(remote);baseline=remote;try await publishLiveLinks();message="계정에서 근무표와 메모를 불러왔습니다.";return};var clash=false;let merged=merge(baseline ?? blank(),local,remote,clash:&clash) as! [String:Any];if clash{conflict=true;message="다른 기기에서 같은 항목을 수정했습니다. 사용할 데이터를 선택하세요.";return};let saved=equal(merged,remote) ? remote : try await write(merged);var furtherClash=false;let current=snapshot();let after=merge(local,current,saved,clash:&furtherClash) as! [String:Any];baseline=saved;if furtherClash{conflict=true;message="저장 중 수정된 항목이 있습니다. 사용할 데이터를 선택하세요.";return};try apply(after);if !equal(after,saved){timer?.cancel();timer=Task{try? await Task.sleep(for:.seconds(2));if !Task.isCancelled{await self.sync()}}};try await publishLiveLinks();message="동기화 완료 · "+Date().formatted(date:.omitted,time:.shortened)}catch{message=error.localizedDescription}}
    private func write(_ data:[String:Any]) async throws->[String:Any]{let j=try await request("cloud-write",body:["revision":UUID().uuidString.replacingOccurrences(of:"-",with:"").lowercased(),"parents":parents,"data":data]);parents=[j["revision"] as? String ?? ""];return j["data"] as? [String:Any] ?? data}
    func resolve(useDevice:Bool) async {guard conflict,!busy else{return};busy=true;defer{busy=false};do{let j=try await request("cloud-read"),versions=j["versions"] as? [[String:Any]] ?? [];guard versions.count<=1 else{message="웹에서 여러 저장 기록을 먼저 정리하세요.";return};parents=versions.compactMap{$0["revision"] as? String};remote=versions.first?["data"] as? [String:Any] ?? blank();let data=useDevice ? snapshot() : remote;let saved=useDevice ? try await write(data) : data;try apply(saved);baseline=saved;conflict=false;try await publishLiveLinks();message="선택한 근무표를 동기화했습니다."}catch{message=error.localizedDescription}}
    func logout() async {guard !busy else{return};await sync();guard !conflict,!busy,message.hasPrefix("동기화 완료") || message.hasPrefix("계정에서") else{return};token=nil;email="";baseline=nil;deleteKeychain();message="로그아웃했습니다. 기기에 저장된 근무표는 유지됩니다."}
    func deleteAccount() async {guard !busy else{return};busy=true;defer{busy=false};do{_ = try await request("cloud-delete");token=nil;email="";baseline=nil;conflict=false;deleteKeychain();message="계정 데이터를 삭제했습니다. 기기 근무표는 유지됩니다."}catch{message=error.localizedDescription}}
    private var keychainQuery:[String:Any]{[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"com.wnhue.shiftcal.account",kSecAttrAccount as String:"session"]}
    private func readKeychain()->Data?{var q=keychainQuery;q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne;var result:CFTypeRef?;guard SecItemCopyMatching(q as CFDictionary,&result)==errSecSuccess else{return nil};return result as? Data}
    private func deleteKeychain(){SecItemDelete(keychainQuery as CFDictionary)}
    private func saveKeychain() throws{let data=try JSONSerialization.data(withJSONObject:["token":token ?? "","email":email,"provider":provider,"userID":userID]);deleteKeychain();var q=keychainQuery;q[kSecValueData as String]=data;q[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;guard SecItemAdd(q as CFDictionary,nil)==errSecSuccess else{throw CocoaError(.fileWriteUnknown)}}
}
