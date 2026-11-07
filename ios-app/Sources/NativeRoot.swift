import SwiftUI
import UniformTypeIdentifiers

struct NativeRootView: View {
    @StateObject private var store = NativeStore()
    @StateObject private var account = NativeAccount()
    @StateObject private var alarms = AlarmModel()
    @StateObject private var reminders = NativeReminders.shared
    @StateObject private var parkingNavigation = NativeParkingNavigation.shared
    @Environment(\.scenePhase) private var phase
    @State private var tab = 0
    @State private var started = false
    @State private var ready = false
    @State private var migrationError: String?
    @State private var accountOpen = false
    @State private var menuSheet: NativeMenuSheet?
    @AppStorage("natbam.appearance") private var appearance = "system"
    @AppStorage("natbam.accent") private var accent = "blue"
    @AppStorage("natbam.haptics") private var haptics = true
    private var tint: Color { accent == "mint" ? .teal : accent == "pink" ? .pink : NativeColors.blue }
    var body: some View {
        Group {
            if !ready {
                VStack(spacing: 20) {
                    Image(systemName: "calendar").font(.system(size: 54)).foregroundStyle(tint)
                    if let migrationError {
                        Text(NativeL10n.text(migrationError)).multilineTextAlignment(.center)
                        Button("다시 가져오기") { Task { await prepare() } }.buttonStyle(.borderedProminent)
                        Button("계정이나 백업으로 이어 쓰기") { do { try store.markMigrationChecked(); ready = true; accountOpen = true } catch { store.error = error.localizedDescription } }
                    } else { ProgressView("저장한 기록을 확인하고 있어요") }
                }.padding(32)
            } else if !store.onboardingComplete {
                NativeOnboardingView()
                    .safeAreaInset(edge: .bottom) { Button("이미 사용 중이라면 로그인") { accountOpen = true }.font(.subheadline).padding(.bottom, 8) }
            } else {
                TabView(selection: $tab) {
                    NavigationStack { NativeCalendarView().toolbar(.hidden, for: .navigationBar) }
                        .tabItem { Label("캘린더", systemImage: "calendar") }.tag(0)
                    NavigationStack { NativeGroupScheduleView().toolbar(.hidden, for: .navigationBar) }
                        .tabItem { Label("조별 근무", systemImage: "person.2") }.tag(1)
                    NavigationStack { NativePayrollView() }
                        .tabItem { Label("급여", systemImage: "wallet.bifold") }.tag(2)
                    NavigationStack { NativeMealsView() }
                        .tabItem { Label("오늘 메뉴", systemImage: "fork.knife") }.tag(3)
                    NavigationStack { NativeMenuView(alarms: alarms, sheet: $menuSheet) }
                        .tabItem { Label("전체", systemImage: "line.3.horizontal") }.tag(4)
                }
                .onChange(of: tab) { _, _ in if haptics { UISelectionFeedbackGenerator().selectionChanged() } }
            }
        }
        .onChange(of: store.preferences[NativeLanguage.preferenceKey], initial: true) { _, preference in NativeL10n.configure(preference) }
        .environment(\.timeZone, NativeDates.calendar.timeZone)
        .tint(tint).preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .task {
            guard !started else { return }; started = true
            account.attach(store)
            await prepare(); await account.refresh()
            if account.connected { await account.synchronize() }
            await scheduleAlarms()
            await NativeParkingModel.shared.resumeParticipation()
        }
        .task(id: store.changeID) { guard ready else { return }; NativeLiveShare.shared.queue(store: store, account: account); await scheduleAlarms() }
        .onChange(of: account.canPublishRecords) { _, ready in if ready { NativeLiveShare.shared.queue(store: store, account: account, force: true) } }
        .onChange(of: phase) { _, state in
            if state == .active && ready { Task { alarms.refresh(); await scheduleAlarms(); await NativeParkingModel.shared.resumeParticipation(); await account.synchronize(); NativeLiveShare.shared.queue(store: store, account: account, force: true) } }
        }
        .sheet(isPresented: $accountOpen) { NavigationStack { NativeAccountView().safeAreaInset(edge: .bottom) { NavigationLink("백업 파일로 이어 쓰기") { NativeBackupView() }.padding() }.toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { accountOpen = false } } } } }
        .sheet(item: $menuSheet) { target in menuContent(target) }
        .sheet(isPresented: $parkingNavigation.open) { NavigationStack { NativeParkingView().toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { parkingNavigation.open = false } } } } }
        .safeAreaInset(edge: .bottom) {
            if ready && (reminders.error != nil || reminders.deferredCount > 0) {
                HStack(spacing: 12) {
                    Image(systemName: reminders.error == nil ? "bell.badge" : "exclamationmark.circle").foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 3) {
                        if let message = reminders.error { Text(NativeL10n.text(message)).font(.caption) }
                        else if reminders.deferredCount > 0 { Text(NativeL10n.format("가까운 일정 %d개를 예약했어요. 남은 %d개는 앱을 다시 열면 이어서 예약해요.", reminders.scheduledCount, reminders.deferredCount)).font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer(minLength: 0)
                    if reminders.error != nil { Button("다시 시도") { Task { await reminders.retry() } }.font(.caption.bold()).disabled(reminders.busy) }
                }.padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)).padding(.horizontal, 16).padding(.bottom, 8)
            }
        }
        .alert("기록을 확인해 주세요", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) { Button("확인") { store.error = nil } } message: { Text(NativeL10n.text(store.error ?? "")) }
        .environmentObject(store).environmentObject(account).environmentObject(reminders)
        .environment(\.locale, NativeLanguage.resolve(store.preferences[NativeLanguage.preferenceKey]).locale)
    }
    @ViewBuilder private func menuContent(_ target: NativeMenuSheet) -> some View {
        switch target {
        case .wage: NativeWageSettingsView()
        case .onboarding: NativeOnboardingView().overlay(alignment: .topTrailing) { Button("닫기") { menuSheet = nil }.padding() }
        default:
            NavigationStack {
                Group {
                    switch target {
                    case .account: NativeAccountView()
                    case .settings: NativePreferencesView()
                    case .group: NativeGroupSettingsView()
                    case .leave: NativeLeaveSettingsView()
                    case .bus: NativeBusView()
                    case .lost: NativeLostFoundView()
                    case .parking: NativeParkingView()
                    case .lab: NativeLabView()
                    case .backup: NativeBackupView()
                    case .calendar: NativeCalendarExportView()
                    default: EmptyView()
                    }
                }.toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { menuSheet = nil } } }
            }
        }
    }

    private func prepare() async {
        migrationError = nil
        if !store.migrationChecked {
            do { let migration = NativeMigration(); try NativeMigration.apply(await migration.existingRecords(), to: store) }
            catch { migrationError = error.localizedDescription; return }
        }
        ready = true
    }
    private func scheduleAlarms() async {
        guard store.onboardingComplete else { alarms.clearSchedule(); await NativeReminders.shared.update([]); return }
        let calendar = NativeDates.calendar, start = calendar.startOfDay(for: Date())
        let days = (0..<30).map { NativeShift.day(calendar.date(byAdding: .day, value: $0, to: start)!, group: store.group, store: store) }
        let previous = NativeShift.day(calendar.date(byAdding: .day, value: -1, to: start)!, group: store.group, store: store)
        let snapshot = ShiftSnapshot(group: store.group, days: days, previousDay: previous)
        if snapshot.validated() { alarms.receive(snapshot) }
        await NativeReminders.shared.update(NativeDayEvents.reminderPlans(store: store), requestPermission: !NativeDayEvents.reminderPlans(store: store).isEmpty)
    }
}

enum NativeMenuSheet: String, Identifiable {
    case account, settings, group, leave, wage, bus, lost, parking, lab, backup, calendar, onboarding
    var id: String { rawValue }
}
struct NativeMenuView: View {
    @EnvironmentObject private var store: NativeStore
    @EnvironmentObject private var account: NativeAccount
    @ObservedObject var alarms: AlarmModel
    @Binding var sheet: NativeMenuSheet?
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("교대근무의 하루를 한곳에서").font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                NativeCard { menu("내 교대근무", detail: NativeL10n.group(store.group) + " · " + NativeL10n.text("3조 2교대"), symbol: "person.2.fill", color: .indigo, target: .group) }
                NativeCard {
                    Text("내 근무 도구").font(.subheadline.bold()).foregroundStyle(.secondary)
                    menu("연차", detail: "남은 연차 확인", symbol: "calendar.badge.checkmark", color: .teal, target: .leave)
                    menu("시급·수당", detail: "금액 설정", symbol: "wonsign.circle.fill", color: .blue, target: .wage)
                    Button { alarms.showingSettings = true } label: { row("근무 알람", detail: alarms.preferences.enabled || alarms.preferences.breaksEnabled ? "켜짐" : "꺼짐", symbol: "alarm.fill", color: .orange) }.buttonStyle(.plain)
                }
                NativeCard {
                    Text("생활·출퇴근").font(.subheadline.bold()).foregroundStyle(.secondary)
                    menu("분실물·습득물", detail: "잃어버린 물건 찾기", symbol: "bag.fill", color: .orange, target: .lost)
                    menu("통근버스", detail: "노선·정류장 찾기", symbol: "bus.fill", color: .blue, target: .bus)
                    menu("주차장", detail: "주차 현황 확인", symbol: "parkingsign.circle.fill", color: .teal, target: .parking)
                }
                NativeCard { menu("생활 기능 실험실", detail: "새 기능 미리 보기", symbol: "flask.fill", color: .purple, target: .lab) }
                VStack(alignment: .leading, spacing: 16) {
                    Button("계정 연결·저장 안내") { sheet = .account }
                    Button("처음 설정 다시 보기") { sheet = .onboarding }
                }.font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10)
            }.padding(18)
        }.background(NativeColors.background).navigationTitle("근무 루틴")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button { sheet = .account } label: { Image(systemName: "person.crop.circle") }.accessibilityLabel("내 계정") }
                ToolbarItem(placement: .topBarTrailing) { Button { sheet = .settings } label: { Image(systemName: "gearshape") }.accessibilityLabel("설정").accessibilityIdentifier("native.settings") }
            }
            .sheet(isPresented: $alarms.showingSettings) { AlarmView(model: alarms) }
    }
    private func menu(_ title: String, detail: String, symbol: String, color: Color, target: NativeMenuSheet) -> some View {
        Button { sheet = target } label: { row(title, detail: detail, symbol: symbol, color: color) }.buttonStyle(.plain).accessibilityIdentifier("native.menu." + target.rawValue)
    }
    private func row(_ title: String, detail: String, symbol: String, color: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.title3).foregroundStyle(color).frame(width: 40, height: 44).background(color.opacity(0.09), in: RoundedRectangle(cornerRadius: 13))
            Text(LocalizedStringKey(title)).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
            Spacer(minLength: 8)
            Text(LocalizedStringKey(detail)).font(.caption.weight(.medium)).foregroundStyle(NativeColors.blue).multilineTextAlignment(.trailing)
        }.padding(.vertical, 6).contentShape(Rectangle())
    }
}

struct NativeGroupSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    var body: some View {
        Form {
            Section("어느 조에서 근무하시나요?") {
                Picker("근무조", selection: Binding(get: { store.group }, set: { store.group = $0 })) { ForEach(["A", "B", "C"], id: \.self) { Text(NativeL10n.group($0)).tag($0) } }.pickerStyle(.segmented)
                Text("근무조를 바꿔도 각 조에 저장한 근무 변경 기록은 그대로 남아요.").font(.subheadline).foregroundStyle(.secondary)
            }
            Section { Text("3조 2교대"); Text("기본 근무표와 회사 휴무일을 기준으로 표시해요. 달력에서 내 근무를 바꿀 수 있어요.").font(.subheadline).foregroundStyle(.secondary) }
        }.navigationTitle("내 교대근무")
    }
}

struct NativePreferencesView: View {
    @EnvironmentObject private var store: NativeStore
    @AppStorage("natbam.appearance") private var appearance = "system"
    @AppStorage("natbam.accent") private var accent = "blue"
    @AppStorage("natbam.haptics") private var haptics = true
    @AppStorage("natbam.showAdjacent") private var adjacent = true
    @AppStorage("natbam.showHolidays") private var holidays = true
    @AppStorage("natbam.showMemos") private var memos = true
    var body: some View {
        Form {
            Section("언어") {
                Picker("앱 언어", selection: Binding(get: { NativeLanguage.resolve(store.preferences[NativeLanguage.preferenceKey]) }, set: { language in
                    NativeL10n.configure(language.rawValue)
                    store.setPreference(NativeLanguage.preferenceKey, language.rawValue)
                })) { ForEach(NativeLanguage.allCases) { language in Text(verbatim: language.name).tag(language) } }.accessibilityIdentifier("native.language")
                Text("메모·식단·정류장 이름은 원래 내용 그대로 보여요.").font(.footnote).foregroundStyle(.secondary)
            }
            Section("화면") {
                Picker("화면 밝기", selection: $appearance) { Text("기기 설정").tag("system"); Text("밝게").tag("light"); Text("어둡게").tag("dark") }
                Picker("강조 색상", selection: $accent) { Text("블루").tag("blue"); Text("민트").tag("mint"); Text("핑크").tag("pink") }
                Toggle("탭을 누를 때 가볍게 진동", isOn: $haptics)
            }
            Section("달력") { Toggle("이전·다음 달 근무 표시", isOn: $adjacent); Toggle("공휴일 이름 표시", isOn: $holidays); Toggle("메모 표시", isOn: $memos) }
            Section("저장·내보내기") {
                NavigationLink("백업 파일 저장·불러오기") { NativeBackupView() }
                NavigationLink("Google 캘린더로 근무표 보내기") { NativeCalendarExportView() }
            }
            Section("도움말") {
                Link("앱 이용 안내", destination: URL(string: "https://20261104.xyz/ios-support.html")!)
                Link("개인정보 처리방침", destination: URL(string: "https://20261104.xyz/ios-privacy.html")!)
                Text("근무 루틴 · " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.1")).foregroundStyle(.secondary)
            }
        }.navigationTitle(Text(verbatim: NativeL10n.text("설정")))
    }
}

struct NativeBackupView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var importing = false
    @State private var exporting = false
    @State private var document = NativeBackupDocument(data: Data())
    @State private var pending: [String: Any]?
    @State private var pendingPreferences: [String: String] = [:]
    @State private var confirmImport = false
    @State private var message: String?
    var body: some View {
        Form {
            Section {
                Button("백업 파일 저장하기") { do { document = NativeBackupDocument(data: try store.backup()); exporting = true } catch { message = error.localizedDescription } }
                Button("백업 파일 불러오기") { importing = true }
            } footer: { Text("근무표·메모·시급·연차 설정을 파일로 보관해요. 웹에서 만든 백업 파일도 불러올 수 있어요.") }
            if let message { Text(NativeL10n.text(message)).font(.subheadline) }
        }.navigationTitle("내 기록 백업")
            .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "근무루틴-백업-" + NativeDates.key(Date())) { result in if case .failure(let error) = result { message = error.localizedDescription } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                do { let url = try result.get(); let granted = url.startAccessingSecurityScopedResource(); defer { if granted { url.stopAccessingSecurityScopedResource() } }; let bytes = try Data(contentsOf: url); pending = try store.decodeBackup(bytes); pendingPreferences = try store.backupPreferences(bytes); confirmImport = true }
                catch { message = error.localizedDescription }
            }
            .confirmationDialog("백업 파일의 기록으로 바꿀까요?", isPresented: $confirmImport, titleVisibility: .visible) {
                Button("불러오기") { if let pending { do { try store.importRecords(pending, preferences: pendingPreferences, onboardingComplete: pendingPreferences["shift_onboarding_v1"] == nil ? nil : NativeMigration.onboardingComplete(values: pendingPreferences, records: pending)); message = "백업 파일을 불러왔어요. 계정에 저장하려면 내 계정에서 동기화해 주세요." } catch { message = error.localizedDescription } }; pending = nil }
                Button("취소", role: .cancel) { pending = nil }
            } message: { Text("선택한 파일로 현재 기록을 바꿔요. 지금 기록도 보관하려면 먼저 백업 파일로 저장해 주세요.") }
    }
}

struct NativeLabView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var budget = 1
    private var suggestions: [[String: Any]] {
        let start = NativeDates.calendar.startOfDay(for: Date())
        let days: [[String: Any]] = (0..<90).map {
            let date = NativeDates.calendar.date(byAdding: .day, value: $0, to: start)!
            let type = NativeShift.day(date, group: store.group, store: store).type
            return ["key": NativeDates.key(date), "rest": ["OFF", "FORCED_OFF", "LEAVE"].contains(type), "eligible": ["DAY", "NIGHT", "NO_OT"].contains(type)]
        }
        return NativeLogic.shared.call("ShiftPlannerCore.vacations", args: [days, budget]) as? [[String: Any]] ?? []
    }
    var body: some View {
        List {
            Section { NavigationLink("동료와 함께·생활 알림 체험") { NativeCommunityLabView() } }
            Section {
                Stepper("사용할 연차 \(budget)일", value: $budget, in: 1...5)
                ForEach(Array(suggestions.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(item["start"] as? String ?? "") ~ \(item["end"] as? String ?? "")").font(.headline)
                        Text("\(item["days"] as? Int ?? 0)일 연속 휴식 · 연차 \((item["leave"] as? [String] ?? []).count)일").font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 5)
                }
            } header: { Text("연차로 더 길게 쉬어요") } footer: { Text("앞으로 90일의 내 근무표로 추천해요. 연차는 달력에서 직접 등록해 주세요.") }
        }.navigationTitle("생활 기능 실험실")
    }
}
