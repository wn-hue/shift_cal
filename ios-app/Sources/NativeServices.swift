import SwiftUI
import Foundation

// These screens share the production API and cookies. Writes only follow explicit user actions.
enum NativeServiceDates {
    static var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Asia/Seoul")!; return c }
    static func key(_ date: Date = Date()) -> String { let f = DateFormatter(); f.calendar = calendar; f.timeZone = calendar.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
    static func date(_ value: String) -> Date { let f = DateFormatter(); f.calendar = calendar; f.timeZone = calendar.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.date(from: value) ?? Date() }
    static var mealToday: String { key(Date().addingTimeInterval(-3 * 3600)) }
    static func label(_ value: String) -> String { let f = DateFormatter(); f.locale = NativeL10n.locale; f.timeZone = calendar.timeZone; f.setLocalizedDateFormatFromTemplate("MMMMdEEEE"); return f.string(from: date(value)) }
}
func nativeServiceDecode<T: Decodable>(_ type: T.Type, _ value: Any) throws -> T { try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: value)) }

private struct ServiceCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View { VStack(alignment: .leading, spacing: 14) { content }.frame(maxWidth: .infinity, alignment: .leading).padding(18).background(.background, in: RoundedRectangle(cornerRadius: 22)) }
}
private struct ServiceError: View {
    let text: String
    var body: some View { Label(NativeL10n.text(text), systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("service.error") }
}

struct NativeMealGroup: Codable, Identifiable {
    let title: String
    let items: [String]
    var id: String { title + items.joined() }
    var isChoice: Bool { title.contains("간편식") || title.contains("별미공방") || title.contains("마이보글") }
    var excludedFromVote: Bool { title.contains("간편식") || title.contains("마이보글") }
}
struct NativeMeal: Codable, Identifiable {
    let name: String
    let groups: [NativeMealGroup]
    var id: String { name }
    var eligibleForVote: Bool { ["조식", "중식", "석식", "야식"].contains(name) && groups.contains { !$0.excludedFromVote && $0.items.contains { !$0.contains("간편식") && !$0.contains("마이보글") } } }
}
struct NativeMealDay: Codable {
    let status: String
    let date: String
    let meals: [NativeMeal]
    let checkedAt: String?
    let message: String?
    let sourceUrl: String?
}

@MainActor final class NativeMealsModel: ObservableObject {
    @Published var selected = NativeServiceDates.mealToday
    @Published var menu: NativeMealDay?
    @Published var loading = false
    @Published var voting = false
    @Published var error: String?
    @Published var voteError: String?
    @Published var votes: [String: Any] = [:]
    private var cache: [String: NativeMealDay] = [:]
    private var generation = 0
    init() {
        if let data = UserDefaults.standard.data(forKey: "native.meals.cache.v1"), let saved = try? JSONDecoder().decode([String: NativeMealDay].self, from: data) { cache = saved }
    }
    func restoreLegacyCache(_ value: String?) {
        guard let value, let data = value.data(using: .utf8), let saved = try? JSONDecoder().decode([String: NativeMealDay].self, from: data) else { return }
        for (key, item) in saved where cache[key] == nil { if valid(item) || isFresh(item) { cache[key] = item } }
    }
    func move(_ offset: Int) {
        let next = NativeServiceDates.calendar.date(byAdding: .day, value: offset, to: NativeServiceDates.date(selected))!
        if abs(next.timeIntervalSince(NativeServiceDates.date(NativeServiceDates.mealToday))) <= 31 * 86400 { selected = NativeServiceDates.key(next) }
    }
    func load(force: Bool = false) async {
        generation += 1; let token = generation; let day = selected
        error = nil
        if !force, let saved = cache[day], saved.status == "ok" || isFresh(saved) { menu = saved; loading = false; return }
        if menu?.date != day { menu = nil }
        loading = true
        defer { if token == generation { loading = false } }
        do {
            let response = try await NativeAPI.shared.request(path: "/api/today-menu?date=\(day)")
            let current = try nativeServiceDecode(NativeMealDay.self, response)
            guard current.date == day else { throw URLError(.badServerResponse) }
            for raw in response["menus"] as? [[String: Any]] ?? [] {
                if let item = try? nativeServiceDecode(NativeMealDay.self, raw), valid(item) { cache[item.date] = item }
            }
            if valid(current) || current.status == "not_published" { cache[current.date] = current }
            if cache.count > 93 { for key in cache.keys.sorted().prefix(cache.count - 93) { cache.removeValue(forKey: key) } }
            if let encoded = try? JSONEncoder().encode(cache) { UserDefaults.standard.set(encoded, forKey: "native.meals.cache.v1") }
            guard token == generation, day == selected else { return }
            menu = current
        } catch { if token == generation { self.error = error.localizedDescription } }
    }
    private func isFresh(_ item: NativeMealDay) -> Bool {
        guard item.status == "not_published", let text = item.checkedAt else { return false }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text).map { Date().timeIntervalSince($0) < 3600 } ?? false
    }
    private func valid(_ item: NativeMealDay) -> Bool { item.status == "ok" && item.meals.count == 4 && item.meals.allSatisfy { !$0.groups.isEmpty && $0.groups.allSatisfy { !$0.items.isEmpty } } }
    func loadVotes() async {
        do { votes = try await NativeAPI.shared.request(path: "/api/meal-votes"); voteError = nil }
        catch { voteError = error.localizedDescription }
    }
    func vote(_ meal: String, _ value: String) async {
        guard !voting, selected == NativeServiceDates.mealToday, votes["date"] as? String == selected else { return }
        voting = true; voteError = nil; defer { voting = false }
        let mine = votes["mine"] as? [String: String] ?? [:]
        let choice: Any = mine[meal] == value ? NSNull() : value
        do { votes = try await NativeAPI.shared.request(path: "/api/meal-votes", method: "POST", body: ["date": selected, "meal": meal, "vote": choice]) }
        catch { voteError = error.localizedDescription }
    }
}

struct NativeMealsView: View {
    @EnvironmentObject private var store: NativeStore
    @StateObject private var model = NativeMealsModel()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false
    @State private var lastMealToday = NativeServiceDates.mealToday
    private var offset: Int { NativeServiceDates.calendar.dateComponents([.day], from: NativeServiceDates.date(NativeServiceDates.mealToday), to: NativeServiceDates.date(model.selected)).day ?? 0 }
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                HStack(spacing: 24) {
                    Button { model.move(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.disabled(offset <= -31).accessibilityLabel("이전 날짜 식단")
                    Button { model.selected = NativeServiceDates.mealToday } label: {
                        Text(offset == 0 ? NativeL10n.text("오늘") : offset == 1 ? NativeL10n.text("내일") : offset == -1 ? NativeL10n.text("어제") : String(model.selected.suffix(5)).replacingOccurrences(of: "-", with: ". ")).font(.headline)
                    }.buttonStyle(.plain).accessibilityLabel(NativeServiceDates.label(model.selected))
                    Button { model.move(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.disabled(offset >= 31).accessibilityLabel("다음 날짜 식단")
                }.frame(maxWidth: .infinity)
                if model.loading {
                    ServiceCard {
                        VStack(spacing: 12) {
                            Image(systemName: "fork.knife.circle.fill").font(.system(size: 58)).foregroundStyle(.orange).rotationEffect(.degrees(animate && !reduceMotion ? 9 : -9)).scaleEffect(animate && !reduceMotion ? 1.06 : 1)
                            Text("식단을 가져오고 있어요").font(.headline)
                            ProgressView().accessibilityLabel("식단 불러오는 중")
                        }.frame(maxWidth: .infinity).padding(.vertical, 22)
                    }.onAppear { withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { animate = true } }
                }
                if let error = model.error { ServiceError(text: error); Button("다시 불러오기") { Task { await model.load(force: true) } }.buttonStyle(.bordered) }
                if let menu = model.menu {
                    if menu.status == "ok" { ForEach(menu.meals) { meal in mealCard(meal) } }
                    else { ContentUnavailableView("아직 게시된 식단이 없어요", systemImage: "fork.knife", description: Text(NativeL10n.text(menu.message ?? "다른 날짜를 선택하거나 잠시 후 다시 확인해 주세요."))) }
                    if menu.status == "ok" { Text("식당 사정에 따라 메뉴가 변경될 수 있어요. 알레르기·원산지는 식당 게시물을 확인해 주세요.").font(.caption).foregroundStyle(.secondary) }
                    if let source = menu.sourceUrl, let url = URL(string: source) { Link("식당 원본 식단표", destination: url).font(.caption) }
                }
                if let error = model.voteError { ServiceError(text: error); Button("평가 다시 불러오기") { Task { await model.loadVotes() } } }
                weeklyReport
            }.padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .task(id: model.selected) { model.restoreLegacyCache(store.preferences["shift_today_menu_cache_v2"]); await model.load() }
        .task { await model.loadVotes() }
        .refreshable { await model.load(force: true); await model.loadVotes() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { refreshMealDay(); Task { await model.loadVotes() } } }
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { _ in if scenePhase == .active { refreshMealDay() } }
        .simultaneousGesture(DragGesture(minimumDistance: 45).onEnded { value in if abs(value.translation.width) > abs(value.translation.height) * 1.5 { model.move(value.translation.width < 0 ? 1 : -1) } })
    }
    private func refreshMealDay() {
        let today = NativeServiceDates.mealToday
        guard today != lastMealToday else { return }
        if model.selected == lastMealToday { model.selected = today }
        lastMealToday = today
        Task { await model.loadVotes() }
    }
    private func mealCard(_ meal: NativeMeal) -> some View {
        ServiceCard {
            Label(NativeL10n.text(meal.name), systemImage: meal.name == "조식" ? "sunrise.fill" : meal.name == "중식" ? "sun.max.fill" : meal.name == "석식" ? "sunset.fill" : "moon.stars.fill").font(.title3.bold()).foregroundStyle(.primary)
            let main = meal.groups.filter { !$0.isChoice }
            let choices = meal.groups.filter(\.isChoice)
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) { ForEach(main) { group in groupContent(group) } }.frame(maxWidth: .infinity, alignment: .leading)
                if !choices.isEmpty {
                    Rectangle().fill(Color.secondary.opacity(0.15)).frame(width: 1)
                    VStack(alignment: .leading, spacing: 14) { Text("선택 메뉴").font(.caption.bold()).foregroundStyle(.secondary); ForEach(choices) { group in groupContent(group) } }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }.fixedSize(horizontal: false, vertical: true)
            if meal.eligibleForVote && model.selected == NativeServiceDates.mealToday {
                Divider()
                HStack(spacing: 10) { voteButton(meal.name, "up", "좋아요", "hand.thumbsup"); voteButton(meal.name, "down", "싫어요", "hand.thumbsdown") }
                Text("간편식·마이보글은 평가에서 제외해요.").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
    private func groupContent(_ group: NativeMealGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) { Text(NativeL10n.text(group.title)).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary); ForEach(Array(group.items.enumerated()), id: \.offset) { _, item in Text(item).font(.subheadline).fixedSize(horizontal: false, vertical: true) } }
    }
    private func voteButton(_ meal: String, _ vote: String, _ label: String, _ symbol: String) -> some View {
        let totals = (model.votes["totals"] as? [String: [String: Int]])?[meal]
        let chosen = (model.votes["mine"] as? [String: String])?[meal] == vote
        return Button { Task { await model.vote(meal, vote) } } label: { Label("\(label) \(totals?[vote].map(String.init) ?? "—")", systemImage: chosen ? symbol + ".fill" : symbol).font(.subheadline).frame(maxWidth: .infinity).padding(.vertical, 10).background(chosen ? Color.blue.opacity(0.13) : Color.secondary.opacity(0.07), in: Capsule()) }.buttonStyle(.plain).foregroundStyle(chosen ? .blue : .secondary).disabled(model.voting || totals == nil).accessibilityLabel("\(meal) \(label)").accessibilityAddTraits(chosen ? .isSelected : [])
    }
    @ViewBuilder private var weeklyReport: some View {
        if let report = model.votes["weekly"] as? [String: Any] {
            ServiceCard {
                DisclosureGroup("식단 평가 모아보기") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("지난주 · \(report["start"] as? String ?? "") ~ \(report["end"] as? String ?? "")").font(.caption).foregroundStyle(.secondary)
                        weeklyRows(report["mostLiked"] as? [[String: Any]] ?? [], title: "👍 좋아요 1위")
                        weeklyRows(report["mostDisliked"] as? [[String: Any]] ?? [], title: "👎 싫어요 1위")
                    }.padding(.top, 10)
                }
            }
        }
    }
    private func weeklyRows(_ rows: [[String: Any]], title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text(title + (rows.count > 1 ? " · 공동 \(rows.count)개" : "")).font(.subheadline.bold()); if rows.isEmpty { Text("집계된 표가 없어요.").font(.caption).foregroundStyle(.secondary) }; ForEach(Array(rows.enumerated()), id: \.offset) { _, row in VStack(alignment: .leading, spacing: 4) { Text("\(row["date"] as? String ?? "") · \(row["meal"] as? String ?? "")").font(.subheadline); Text((row["items"] as? [String] ?? []).joined(separator: " · ")).font(.caption); Text("좋아요 \(row["up"] as? Int ?? 0) · 싫어요 \(row["down"] as? Int ?? 0)").font(.caption).foregroundStyle(.secondary) } } }
    }
}

struct NativeLostPost: Codable, Identifiable {
    let id: String
    let type: String
    let date: String
    let place: String
    let item: String
    let itemType: String?
    let detail: String?
    let storage: String
    let stage: String
    let createdAt: Double
    let updatedAt: Double
    let version: Int
    let canManage: Bool
    let hidden: Bool
    let reported: Bool
    let history: [NativeLostHistory]
    var icon: String { switch itemType ?? item { case "카드", "사원증": return "creditcard"; case "지갑": return "wallet.bifold"; case "열쇠": return "key"; case "핸드폰": return "iphone"; case "이어폰": return "earbuds"; default: return "shippingbox" } }
}
struct NativeLostHistory: Codable { let stage: String; let at: Double }

@MainActor final class NativeLostModel: ObservableObject {
    @Published var posts: [NativeLostPost] = []
    @Published var query = ""
    @Published var kind = ""
    @Published var status = "open"
    @Published var itemType = ""
    @Published var place = ""
    @Published var days = ""
    @Published var mine = false
    @Published var connected = false
    @Published var blockedCount = 0
    @Published var busy = false
    @Published var error: String?
    @Published var next: String?
    private var generation = 0
    func load(append: Bool = false) async {
        generation += 1; let token = generation; busy = true; error = nil
        defer { if token == generation { busy = false } }
        var components = URLComponents(); components.path = "/api/lost-found"
        var params = ["q": query, "type": kind, "status": status, "itemType": itemType, "place": place, "days": days]
        if mine { params["mine"] = "1" }; if append, let next { params["after"] = next }
        components.queryItems = params.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        do {
            let data = try await NativeAPI.shared.request(path: components.string!)
            let fetched = try nativeServiceDecode([NativeLostPost].self, data["items"] ?? [])
            guard token == generation else { return }
            connected = data["connected"] as? Bool ?? false; blockedCount = data["blockedCount"] as? Int ?? 0; next = data["next"] as? String
            posts = append ? posts + fetched.filter { post in !posts.contains { $0.id == post.id } } : fetched
        } catch { if token == generation { self.error = error.localizedDescription } }
    }
    func mutate(_ body: [String: Any]) async throws -> NativeLostPost? {
        let result = try await NativeAPI.shared.request(path: "/api/lost-found", method: "POST", body: body)
        let post = (result["item"] as? [String: Any]).flatMap { try? nativeServiceDecode(NativeLostPost.self, $0) }
        await load()
        return post
    }
}

struct NativeLostFoundView: View {
    @EnvironmentObject private var account: NativeAccount
    @StateObject private var model = NativeLostModel()
    @State private var creating = false
    @State private var selected: NativeLostPost?
    @State private var filters = false
    @State private var unblock = false
    private var searchKey: String { [model.query, model.kind, model.status, model.itemType, model.place, model.days, String(model.mine)].joined(separator: "|") }
    var body: some View {
        List {
            Section {
                Picker("게시물 종류", selection: $model.kind) { Text("전체").tag(""); Text("찾고 있어요").tag("분실"); Text("주웠어요").tag("습득") }.pickerStyle(.segmented)
                HStack { Menu { Picker("처리 상태", selection: $model.status) { Text("진행 중").tag("open"); Text("완료").tag("resolved"); Text("전체").tag("all") } } label: { Label(model.status == "all" ? "전체 상태" : model.status == "resolved" ? "완료" : "진행 중", systemImage: "line.3.horizontal.decrease") }; Spacer(); Button { filters.toggle() } label: { Label("상세 조건", systemImage: "slider.horizontal.3") } }
                if filters { filterControls }
                if !model.connected { Text("누구나 글을 볼 수 있어요. 등록·관리·신고는 설정에서 Google 또는 Apple 로그인 후 이용해 주세요.").font(.caption).foregroundStyle(.secondary) }
            }
            if let error = model.error { Section { ServiceError(text: error); Button("다시 불러오기") { Task { await model.load() } } } }
            if model.busy && model.posts.isEmpty { Section { HStack { ProgressView(); Text("분실물 글을 불러오는 중…") } } }
            if !model.busy && model.posts.isEmpty && model.error == nil { ContentUnavailableView("조회 결과가 없어요", systemImage: "tray", description: Text("검색어나 조회 조건을 바꿔 보세요.")) }
            Section("조회 결과 \(model.posts.count)개") {
                ForEach(model.posts) { post in Button { selected = post } label: { lostRow(post) }.buttonStyle(.plain) }
                if model.next != nil { Button("더 불러오기") { Task { await model.load(append: true) } }.disabled(model.busy) }
            }
            if model.blockedCount > 0 { Section { Button("숨긴 작성자 모두 다시 표시") { unblock = true } } }
        }
        .navigationTitle("분실물 찾기")
        .searchable(text: $model.query, prompt: "물건·장소 검색")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { creating = true } label: { Label("등록", systemImage: "plus") }.disabled(!model.connected) } }
        .task(id: searchKey) { do { try await Task.sleep(for: .milliseconds(300)); guard !Task.isCancelled else { return }; await model.load() } catch {} }
        .onChange(of: account.connected) { _, _ in Task { await model.load() } }
        .refreshable { await model.load() }
        .sheet(isPresented: $creating) { NativeLostEditor(model: model, post: nil) }
        .sheet(item: $selected) { NativeLostDetail(model: model, original: $0) }
        .confirmationDialog("숨긴 작성자를 모두 다시 표시할까요?", isPresented: $unblock, titleVisibility: .visible) { Button("모두 다시 표시") { Task { do { _ = try await model.mutate(["action": "unblockAll"]) } catch { model.error = error.localizedDescription } } } }
    }
    private var filterControls: some View {
        Group {
            Picker("물건", selection: $model.itemType) { Text("전체").tag(""); ForEach(NativeLostEditor.items, id: \.self) { Text(LocalizedStringKey($0)).tag($0) } }
            Picker("장소", selection: $model.place) { Text("전체").tag(""); ForEach(NativeLostEditor.places + ["경비실"], id: \.self) { Text(LocalizedStringKey($0)).tag($0) } }
            Picker("기간", selection: $model.days) { Text("전체").tag(""); Text("최근 7일").tag("7"); Text("최근 30일").tag("30"); Text("최근 90일").tag("90") }
            Toggle("내 글만", isOn: $model.mine).disabled(!model.connected)
        }
    }
    private func lostRow(_ post: NativeLostPost) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: post.icon).font(.title2).foregroundStyle(.blue).frame(width: 48, height: 48).background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 7) { HStack { Text(NativeL10n.text(post.type == "습득" ? "주웠어요" : "찾고 있어요")).font(.caption.bold()).foregroundStyle(post.type == "습득" ? .blue : .orange); Text(NativeL10n.text(post.stage)).font(.caption).foregroundStyle(.secondary) }; Text(post.item).font(.headline); Text("\(post.place) · \(post.date)").font(.subheadline).foregroundStyle(.secondary); if !post.storage.isEmpty { Text("보관·문의: \(post.storage)").font(.caption).foregroundStyle(.secondary) }; if post.hidden { Text("신고 누적 · 공개 숨김").font(.caption).foregroundStyle(.red) } }
            Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(.vertical, 5)
    }
}

private struct NativeLostEditor: View {
    static let places = ["휴게실", "흡연장", "현장", "화장실", "옷장", "신발장", "사무실"]
    static let items = ["카드", "지갑", "사원증", "열쇠", "핸드폰", "이어폰", "기타"]
    @ObservedObject var model: NativeLostModel
    let post: NativeLostPost?
    var saved: ((NativeLostPost) -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var kind = "분실"
    @State private var date = Date()
    @State private var place = ""
    @State private var item = ""
    @State private var detail = ""
    @State private var storage = "경비실"
    @State private var stage = "찾는 중"
    @State private var requestID = UUID().uuidString.lowercased()
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("물건 정보") {
                    Picker("종류", selection: $kind) { Text("찾고 있어요").tag("분실"); Text("주웠어요").tag("습득") }.disabled(post != nil)
                    if kind == "분실" { DatePicker("잃어버린 날짜", selection: $date, in: Date().addingTimeInterval(-365 * 86400)...Date(), displayedComponents: .date) }
                    else { LabeledContent("등록 날짜", value: post?.date ?? NativeServiceDates.key()) }
                    Picker("장소", selection: $place) { Text("선택해 주세요").tag(""); ForEach(Self.places, id: \.self) { Text(LocalizedStringKey($0)).tag($0) } }
                    Picker("물건", selection: $item) { Text("선택해 주세요").tag(""); ForEach(Self.items, id: \.self) { Text(LocalizedStringKey($0)).tag($0) } }
                    if item == "기타" { TextField("물건 설명 (80자 이내)", text: $detail, axis: .vertical).lineLimit(2...4).onChange(of: detail) { _, value in if value.count > 80 { detail = String(value.prefix(80)) } } }
                    if kind == "습득" { Picker("보관 위치", selection: $storage) { Text("경비실").tag("경비실"); Text("현장").tag("현장") } }
                }
                if post != nil { Section("처리 상태") { Picker("상태", selection: $stage) { ForEach(kind == "습득" ? ["현장 보관 중", "경비실 보관 중", "주인에게 반환"] : ["찾는 중", "찾았어요"], id: \.self) { Text(LocalizedStringKey($0)).tag($0) } } } }
                Section { Text("연락처·사번·계좌번호·링크는 올릴 수 없어요. 물건을 확인하거나 돌려받을 때는 보관 장소로 문의해 주세요.").font(.caption).foregroundStyle(.secondary) }
                if let error { Section { ServiceError(text: error) } }
            }
            .navigationTitle(NativeL10n.text(post == nil ? "분실물 등록" : "게시물 수정"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() }.disabled(busy) }; ToolbarItem(placement: .confirmationAction) { Button { Task { await submit() } } label: { if busy { ProgressView() } else { Text("저장").bold() } }.disabled(busy || place.isEmpty || item.isEmpty || (item == "기타" && detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)) } }
            .interactiveDismissDisabled(busy)
            .onAppear { if let post { kind = post.type; date = NativeServiceDates.date(post.date); place = post.place; item = post.itemType ?? "기타"; detail = post.detail ?? ""; storage = post.storage.isEmpty ? "경비실" : post.storage; stage = post.stage; requestID = post.id } }
            .onChange(of: storage) { _, value in if kind == "습득" && stage != "주인에게 반환" { stage = value == "경비실" ? "경비실 보관 중" : "현장 보관 중" } }
            .onChange(of: stage) { _, value in if value == "경비실 보관 중" { storage = "경비실" } else if value == "현장 보관 중" { storage = "현장" } }
        }
    }
    private func submit() async {
        busy = true; error = nil; defer { busy = false }
        var body: [String: Any] = ["action": post == nil ? "create" : "update", "id": requestID, "type": kind, "date": kind == "습득" ? post?.date ?? NativeServiceDates.key() : NativeServiceDates.key(date), "place": place, "itemType": item, "detail": detail, "storage": storage]
        if let post { body["version"] = post.version; body["stage"] = stage }
        do { if let updated = try await model.mutate(body) { saved?(updated) }; dismiss() }
        catch { self.error = error.localizedDescription }
    }
}

private struct NativeLostDetail: View {
    @ObservedObject var model: NativeLostModel
    let original: NativeLostPost
    @Environment(\.dismiss) private var dismiss
    @State private var updated: NativeLostPost?
    @State private var editing = false
    @State private var confirmation = false
    @State private var confirmTitle = ""
    @State private var action: [String: Any] = [:]
    @State private var busy = false
    @State private var error: String?
    private var post: NativeLostPost { updated ?? original }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label(post.item, systemImage: post.icon).font(.title2.bold()).padding(.vertical, 10)
                    LabeledContent("종류", value: post.type == "습득" ? "주웠어요" : "찾고 있어요")
                    LabeledContent("상태", value: NativeL10n.text(post.stage))
                    LabeledContent("장소", value: NativeL10n.text(post.place))
                    LabeledContent("날짜", value: post.date)
                    if !post.storage.isEmpty { LabeledContent("보관·문의", value: NativeL10n.text(post.storage)) }
                    Text("등록 \(Date(timeIntervalSince1970: post.createdAt / 1000).formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary)
                    if post.hidden { Text("신고 누적으로 공개 목록에서 숨겨진 글이에요.").font(.caption).foregroundStyle(.red) }
                }
                Section("처리 기록") { ForEach(Array(post.history.enumerated()), id: \.offset) { _, history in VStack(alignment: .leading, spacing: 3) { Text(NativeL10n.text(history.stage)); Text(Date(timeIntervalSince1970: history.at / 1000).formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary) } } }
                if post.canManage {
                    Section("내 게시물 관리") {
                        Button("수정") { editing = true }
                        ForEach(post.type == "습득" ? ["현장 보관 중", "경비실 보관 중", "주인에게 반환"] : ["찾는 중", "찾았어요"], id: \.self) { stage in if stage != post.stage { Button(NativeL10n.text(stage)) { confirm(NativeL10n.format("실제 처리 상태를 ‘%@’로 기록할까요?", NativeL10n.text(stage)), ["action": "update", "id": post.id, "version": post.version, "stage": stage]) } } }
                        Button("삭제", role: .destructive) { confirm("글을 삭제할까요? 삭제한 글은 되돌릴 수 없어요.", ["action": "delete", "id": post.id, "version": post.version]) }
                    }.disabled(busy)
                } else if model.connected {
                    Section("신고·작성자 숨기기") {
                        if post.reported { Label("신고 접수됨", systemImage: "checkmark.circle") }
                        else { ForEach(["개인정보 노출", "부적절한 내용", "허위·스팸"], id: \.self) { reason in Button("\(reason) 신고", role: .destructive) { confirm("‘\(reason)’ 사유로 신고할까요?", ["action": "report", "id": post.id, "reason": reason]) } } }
                        Button("이 작성자의 글 숨기기") { confirm("이 작성자의 글을 내 목록에서 숨길까요?", ["action": "block", "id": post.id]) }
                    }.disabled(busy)
                } else { Section { Text("신고·작성자 숨기기는 설정에서 로그인 후 이용해 주세요.").font(.caption).foregroundStyle(.secondary) } }
                if busy { ProgressView("처리 중…") }
                if let error { ServiceError(text: error) }
            }
            .navigationTitle("분실물 상세")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
            .sheet(isPresented: $editing) { NativeLostEditor(model: model, post: post, saved: { updated = $0 }) }
            .confirmationDialog(NativeL10n.text(confirmTitle), isPresented: $confirmation, titleVisibility: .visible) { Button(action["action"] as? String == "delete" ? "삭제" : "확인", role: action["action"] as? String == "delete" ? .destructive : nil) { Task { await perform() } }; Button("취소", role: .cancel) {} }
            .interactiveDismissDisabled(busy)
        }
    }
    private func confirm(_ title: String, _ payload: [String: Any]) { confirmTitle = title; action = payload; confirmation = true }
    private func perform() async { busy = true; error = nil; defer { busy = false }; do { let result = try await model.mutate(action); if ["delete", "block"].contains(action["action"] as? String ?? "") { dismiss() } else { updated = result } } catch { self.error = error.localizedDescription } }
}
