import SwiftUI
import UserNotifications
import Combine

private struct NativeLabPost: Codable, Identifiable {
    var id = UUID().uuidString.lowercased()
    var kind: String
    var date: String
    var text: String
    var group: String?
    var department: String?
    var line: String?
    var state: String?
    var lane: String?
    var cheered: Bool?
}
private struct NativeCaffeineReminder: Codable {
    var at: Double
    var sleep: Double
    var lead: Double
    var sent: Bool
}
private struct NativeLabRecord: Codable {
    var posts: [NativeLabPost] = []
    var decisions: [String: String] = [:]
    var caffeine: NativeCaffeineReminder?
}

@MainActor
private final class NativeLabModel: ObservableObject {
    static let key = "shift_community_lab_v1"
    static let notificationID = "routine.lab.caffeine"
    @Published var record = NativeLabRecord()
    @Published var status: String?
    @Published var busy = false
    private var loaded = false
    func load(migrated: String?) {
        guard !loaded else { return }; loaded = true
        let data = UserDefaults.standard.data(forKey: Self.key) ?? (UserDefaults.standard.string(forKey: Self.key) ?? migrated)?.data(using: .utf8)
        guard let data else { return }
        do { record = try JSONDecoder().decode(NativeLabRecord.self, from: data) }
        catch { status = "이 기기의 체험 기록을 읽지 못했어요. 기존 기록은 그대로 보관했어요." }
    }
    @discardableResult func save() -> Bool {
        do { UserDefaults.standard.set(try JSONEncoder().encode(record), forKey: Self.key); status = "이 기기에 저장했어요."; return true }
        catch { status = "저장하지 못했어요. " + error.localizedDescription; return false }
    }
    func post(_ post: NativeLabPost) { record.posts.insert(post, at: 0); save() }
    func toggle(_ id: String, cover: Bool) {
        guard let index = record.posts.firstIndex(where: { $0.id == id }) else { return }
        if cover { record.posts[index].state = record.posts[index].state == "모집 중" ? "마감" : "모집 중" }
        else { record.posts[index].cheered = !(record.posts[index].cheered ?? false) }
        save()
    }
    func caffeine(sleep: Date, lead: Int) async {
        let fire = sleep.addingTimeInterval(-Double(lead) * 3600)
        guard fire > Date() else { status = "알림 시간이 이미 지났어요. 취침 예정 시간을 다시 선택해 주세요."; return }
        busy = true; defer { busy = false }
        do {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                guard try await center.requestAuthorization(options: [.alert, .sound]) else { status = "알림을 허용하면 취침 전 알림을 받을 수 있어요."; return }
            } else if ![.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) {
                status = "아이폰 설정에서 앱의 알림을 허용해 주세요."; return
            }
            let content = UNMutableNotificationContent()
            content.title = "취침 전 카페인 알림"
            content.body = "예정 취침까지 \(lead)시간. 물이나 디카페인은 어때요?"
            content.sound = .default
            var components = NativeDates.calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            components.timeZone = NativeDates.calendar.timeZone
            try await center.add(UNNotificationRequest(identifier: Self.notificationID, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
            record.caffeine = NativeCaffeineReminder(at: fire.timeIntervalSince1970 * 1000, sleep: sleep.timeIntervalSince1970 * 1000, lead: Double(lead), sent: false)
            if save() { status = "취침 전 알림을 설정했어요." }
        } catch { status = "알림을 설정하지 못했어요. " + error.localizedDescription }
    }
    func checkCaffeine(now: Date = Date()) {
        guard var caffeine = record.caffeine, !caffeine.sent, caffeine.at <= now.timeIntervalSince1970 * 1000 else { return }
        caffeine.sent = true; record.caffeine = caffeine; save()
        let remaining = max(0, Int(ceil((caffeine.sleep / 1000 - now.timeIntervalSince1970) / 60)))
        status = "☕ 예정 취침까지 \(remaining / 60)시간 \(remaining % 60)분. 물이나 디카페인은 어때요?"
    }
    func cancelCaffeine() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.notificationID])
        record.caffeine = nil; save()
    }
    func clear() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.notificationID])
        record = NativeLabRecord(); save()
    }
}

/// Local prototypes use their own device store and never enter the account synchronization payload.
struct NativeCommunityLabView: View {
    @EnvironmentObject private var store: NativeStore
    @StateObject private var model = NativeLabModel()
    @State private var feature = "cover"
    @State private var preview = false
    @State private var department = ""
    @State private var line = ""
    @State private var coverDate = Date()
    @State private var requestText = ""
    @State private var sleep = Date().addingTimeInterval(9 * 3600)
    @State private var lead = 6
    @State private var lane = "arrive"
    @State private var postLane = "arrive"
    @State private var feedText = ""
    @State private var now = Date()
    @State private var clearConfirmation = false
    @State private var exporting = false
    @State private var exportDocument = NativeBackupDocument(data: Data())
    private let ticker = Timer.publish(every: 60, on: .main, in: .common).autoconnect()
    private var today: String { NativeDates.key(now) }
    private var feedOpen: Bool { preview || [7, 8, 19, 20].contains(NativeDates.calendar.component(.hour, from: now)) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("글과 체험 설정은 이 기기에만 저장돼요. 다른 이용자에게 보내지 않아요.").font(.subheadline).foregroundStyle(.secondary)
                Picker("체험 기능", selection: $feature) {
                    Text("대치 모집").tag("cover"); Text("카페인").tag("caffeine"); Text("교대 한마디").tag("feed")
                }.pickerStyle(.segmented)
                Toggle("예시 보기", isOn: $preview).font(.subheadline).tint(.blue)
                switch feature {
                case "cover": coverPanel
                case "caffeine": caffeinePanel
                default: feedPanel
                }
                if let status = model.status { Text(LocalizedStringKey(status)).font(.subheadline).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
                NativeCard {
                    Text("이 기능을 어떻게 할까요?").font(.headline)
                    HStack {
                        decision("계속 진행")
                        decision("보류")
                    }
                    Button { exportReview() } label: { Label("검토 결과 저장", systemImage: "square.and.arrow.up") }
                    Button("테스트 기록 지우기", role: .destructive) { clearConfirmation = true }
                }
            }.padding(20)
        }.background(NativeColors.background).navigationTitle("새 기능 체험").navigationBarTitleDisplayMode(.inline)
            .onAppear { model.load(migrated: store.preferences[NativeLabModel.key]); model.checkCaffeine() }
            .onReceive(ticker) { now = $0; model.checkCaffeine(now: $0) }
            .confirmationDialog("이 기기의 글, 설정, 검토 결과를 지울까요? 식단 평가는 그대로 남아요.", isPresented: $clearConfirmation, titleVisibility: .visible) {
                Button("체험 기록 지우기", role: .destructive) { model.clear() }
            }
            .fileExporter(isPresented: $exporting, document: exportDocument, contentType: .json, defaultFilename: "shift-feature-review") { result in
                if case .failure(let error) = result { model.status = error.localizedDescription }
            }
    }
    private var coverPanel: some View {
        VStack(spacing: 16) {
            NativeCard {
                Text("대치자 구하기").font(.title3.bold())
                Text("내 요청을 등록하고 모집 상태를 바꾸는 과정을 체험해요. 실제 지원은 전송되지 않으며, 회사의 공식 승인은 별도로 받아야 해요.").font(.subheadline).foregroundStyle(.secondary)
                TextField("부서", text: $department).textFieldStyle(.roundedBorder)
                TextField("라인", text: $line).textFieldStyle(.roundedBorder)
                DatePicker("대치 날짜", selection: $coverDate, displayedComponents: .date)
                TextField("근무 시간·요청사항", text: $requestText, axis: .vertical).lineLimit(3...6).textFieldStyle(.roundedBorder)
                Button("내 대치 요청 등록") {
                    guard valid(department), valid(line), valid(requestText) else { model.status = "부서, 라인, 요청사항을 각각 300자 이내로 입력해 주세요."; return }
                    model.post(NativeLabPost(kind: "cover", date: NativeDates.key(coverDate), text: trimmed(requestText), group: store.group, department: trimmed(department), line: trimmed(line), state: "모집 중"))
                    requestText = ""
                }.buttonStyle(.borderedProminent).disabled(trimmed(department).isEmpty || trimmed(line).isEmpty || trimmed(requestText).isEmpty)
            }
            ForEach(model.record.posts.filter { $0.kind == "cover" && $0.group == store.group }) { post in
                NativeCard {
                    Text(post.date + " · " + (post.department ?? "") + " / " + (post.line ?? "")).font(.headline)
                    Text("\(post.group ?? "")조 · \(post.text)").font(.subheadline)
                    HStack {
                        Text(post.state ?? "모집 중").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button(post.state == "모집 중" ? "모집 마감" : "다시 모집") { model.toggle(post.id, cover: true) }.buttonStyle(.bordered)
                    }
                }
            }
            if preview { NativeCard { Text("샘플 · 지원 확인 흐름").font(.headline); Text("동료가 지원하면 요청자가 선택하고, 두 사람이 확인하면 확정하는 흐름이에요. 체험 화면에서는 지원이 전송되지 않아요.").font(.subheadline).foregroundStyle(.secondary) } }
        }
    }
    private var caffeinePanel: some View {
        NativeCard {
            Text("취침 전 카페인 알림").font(.title3.bold())
            Text("다음 취침 시각을 정하고 원하는 시간 전에 알림을 받아요.").font(.subheadline).foregroundStyle(.secondary)
            DatePicker("다음 취침 예정", selection: $sleep, displayedComponents: [.date, .hourAndMinute])
            Stepper("취침 \(lead)시간 전 알림", value: $lead, in: 0...24)
            Button { Task { await model.caffeine(sleep: sleep, lead: lead) } } label: { HStack { if model.busy { ProgressView() }; Text("알림 설정") } }.buttonStyle(.borderedProminent).disabled(model.busy)
            if let caffeine = model.record.caffeine {
                Text("알림: " + Date(timeIntervalSince1970: caffeine.at / 1000).formatted(date: .abbreviated, time: .shortened)).font(.subheadline)
                Button("알림 해제", role: .destructive) { model.cancelCaffeine() }
            }
            Button("알림 미리보기") {
                let target = model.record.caffeine.map { Date(timeIntervalSince1970: $0.sleep / 1000) } ?? sleep
                let minutes = max(0, Int(ceil(target.timeIntervalSinceNow / 60)))
                model.status = "☕ 예정 취침까지 \(minutes / 60)시간 \(minutes % 60)분. 물이나 디카페인은 어때요?"
            }
        }
    }
    private var feedPanel: some View {
        VStack(spacing: 16) {
            NativeCard {
                Text("교대 시간 한마디").font(.title3.bold())
                Text(NativeL10n.text(feedOpen ? "출근·퇴근 중 서로에게 남기고 싶은 말을 적어 보세요. 글과 응원은 이 기기에만 저장돼요." : "지금은 글을 읽을 수 있어요. 한국 시간 오전 7~9시와 오후 7~9시에 글을 쓸 수 있어요.")).font(.subheadline).foregroundStyle(.secondary)
                Picker("글 보기", selection: $lane) { Text("출근").tag("arrive"); Text("퇴근").tag("leave"); Text("함께 보기").tag("all") }.pickerStyle(.segmented)
                if feedOpen {
                    Picker("지금은", selection: $postLane) { Text("출근 중").tag("arrive"); Text("퇴근 중").tag("leave") }
                    TextField("오늘 뭐 먹을까요? / 서로 격려하기", text: $feedText, axis: .vertical).lineLimit(3...5).textFieldStyle(.roundedBorder)
                    Button("내 테스트 글 남기기") {
                        now = Date()
                        guard feedOpen else { model.status = "글을 남길 수 있는 시간이 지났어요."; return }
                        guard valid(feedText) else { model.status = "글은 300자 이내로 입력해 주세요."; return }
                        model.post(NativeLabPost(kind: "feed", date: today, text: trimmed(feedText), lane: postLane, cheered: false)); feedText = ""
                    }.buttonStyle(.borderedProminent).disabled(trimmed(feedText).isEmpty)
                }
            }
            let posts = model.record.posts.filter { $0.kind == "feed" && $0.date == today && (lane == "all" || ($0.lane ?? "leave") == lane) }
            ForEach(posts) { post in
                NativeCard {
                    Text((post.lane == "arrive" ? "출근" : "퇴근") + " · 내 글 · " + post.date).font(.caption).foregroundStyle(.secondary)
                    Text(post.text).font(.body)
                    Button { model.toggle(post.id, cover: false) } label: { Label(post.cheered == true ? "응원했어요" : "응원 보내기", systemImage: post.cheered == true ? "heart.fill" : "heart") }.tint(.pink)
                }
            }
            if posts.isEmpty && !preview { Text("아직 이 기기에 작성한 글이 없어요.").font(.subheadline).foregroundStyle(.secondary).padding() }
            if preview {
                if lane != "leave" { sample("출근 · 샘플", "오늘도 안전하게! 퇴근하시는 분들은 푹 쉬세요.") }
                if lane != "arrive" { sample("퇴근 · 샘플", "오늘 야식은 따뜻한 국밥 어때요? 출근하시는 분들도 힘내세요.") }
            }
        }
    }
    private func sample(_ title: String, _ body: String) -> some View { NativeCard { Text(LocalizedStringKey(title)).font(.headline); Text(body).font(.subheadline).foregroundStyle(.secondary) } }
    private func trimmed(_ value: String) -> String { value.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func valid(_ value: String) -> Bool { !trimmed(value).isEmpty && trimmed(value).utf16.count <= 300 }
    private func decision(_ value: String) -> some View {
        Button { model.record.decisions[feature] = value; model.save() } label: {
            Label(value, systemImage: model.record.decisions[feature] == value ? "checkmark.circle.fill" : "circle").frame(maxWidth: .infinity)
        }.buttonStyle(.bordered)
    }
    private func exportReview() {
        do {
            let bytes = try JSONSerialization.data(withJSONObject: ["version": 1, "decisions": model.record.decisions], options: [.prettyPrinted, .sortedKeys])
            exportDocument = NativeBackupDocument(data: bytes); exporting = true
        } catch { model.status = error.localizedDescription }
    }
}
