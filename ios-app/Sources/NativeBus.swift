import SwiftUI
import CoreLocation

struct NativeBusStop: Codable, Identifiable {
    let name: String
    let time: String?
    var id: String { name + (time ?? "") }
}
struct NativeBusRoute: Codable, Identifiable {
    let id: String
    let name: String
    let period: String
    let depart: String?
    let destination: String
    let stops: [NativeBusStop]
    let notes: String
    var json: [String: Any] { ["id": id, "name": name, "period": period, "depart": depart as Any? ?? NSNull(), "destination": destination, "stops": stops.map { ["name": $0.name, "time": $0.time as Any? ?? NSNull()] }, "notes": notes] }
}
struct NativeBusPlace: Codable, Identifiable {
    let id: String?
    let name: String
    let address: String?
    let lat: Double
    let lon: Double
    let aliases: [String]?
    let source: String?
    let mapSource: String?
    let precision: String?
    let note: String?
    var stableID: String { id ?? name + String(lat) + String(lon) }
    var json: [String: Any] { var result: [String: Any] = ["name": name, "lat": lat, "lon": lon]; if let source { result["source"] = source }; return result }
    var mapURL: URL? { if let link = mapSource, let url = URL(string: link), ["https", "http"].contains(url.scheme ?? "") { return url }; return URL(string: "https://map.kakao.com/link/map/\(lat),\(lon)") }
}
struct NativeBusNearest: Decodable {
    let stop: NativeBusStop
    let place: NativeBusPlace
    let distance: Double
}
struct NativeBusRecommendation: Decodable {
    struct Item: Decodable { let route: NativeBusRoute; let nearest: NativeBusNearest }
    let items: [Item]
    let mode: String
    let radius: Double
    let automatic: Bool
    let exhausted: Bool
}

@MainActor final class NativeBusModel: ObservableObject {
    @Published var routes: [NativeBusRoute] = []
    @Published var places: [NativeBusPlace] = []
    @Published var factories: [NativeBusPlace] = []
    @Published var sourceDate = ""
    @Published var error: String?
    func load() {
        do {
            guard let schedule = NativeLogic.shared.call("nativeBusSchedule", args: [NativeServiceDates.key()]) as? [String: Any], let raw = schedule["routes"] else { throw NativeFailure("노선표를 읽지 못했어요. 다시 시도해 주세요.") }
            routes = try nativeServiceDecode([NativeBusRoute].self, raw)
            places = try nativeServiceDecode([NativeBusPlace].self, NativeLogic.shared.call("nativeBusPlaces") ?? [])
            factories = try nativeServiceDecode([NativeBusPlace].self, NativeLogic.shared.call("nativeBusFactories") ?? [])
            sourceDate = schedule["sourceDate"] as? String ?? ""; error = nil
        } catch { self.error = error.localizedDescription }
    }
    func search(_ routes: [NativeBusRoute], _ query: String) -> [NativeBusRoute] {
        guard !query.isEmpty else { return routes }
        return (try? nativeServiceDecode([NativeBusRoute].self, NativeLogic.shared.call("nativeBusSearch", args: [routes.map(\.json), query]) ?? [])) ?? []
    }
    func recommend(_ routes: [NativeBusRoute], period: String, place: NativeBusPlace, radius: Int) -> NativeBusRecommendation? {
        let raw = NativeLogic.shared.call("nativeBusRecommend", args: [routes.map(\.json), period, place.json, place.source != nil ? place.json : NSNull(), radius])
        return raw.flatMap { try? nativeServiceDecode(NativeBusRecommendation.self, $0) }
    }
    func lookup(_ name: String) -> NativeBusPlace? { places.first { $0.aliases?.contains(name) == true } }
}

@MainActor final class NativeBusLocation: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published var busy = false
    @Published var error: String?
    @Published var location: CLLocation?
    private let manager = CLLocationManager()
    private var timeout: Task<Void, Never>?
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyBest }
    func request() {
        error = nil; busy = true
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse: locate()
        default: busy = false; error = "위치 권한이 꺼져 있어요. iPhone 설정에서 권한을 켜거나 장소·주소로 검색해 주세요."
        }
    }
    private func locate() { manager.requestLocation(); timeout?.cancel(); timeout = Task { try? await Task.sleep(for: .seconds(15)); guard !Task.isCancelled, busy else { return }; manager.stopUpdatingLocation(); busy = false; error = "현재 위치를 확인하지 못했어요. 다시 시도하거나 장소를 검색해 주세요." } }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { guard busy else { return }; if [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) { locate() } else if manager.authorizationStatus != .notDetermined { busy = false; error = "위치 권한이 꺼져 있어요. 장소·주소 검색을 이용해 주세요." } }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        timeout?.cancel(); busy = false
        guard let found = locations.last, found.horizontalAccuracy >= 0, found.horizontalAccuracy <= 1000, abs(found.timestamp.timeIntervalSinceNow) < 120 else { error = "위치 오차가 커요. 장소나 주소로 검색해 주세요."; return }
        location = found
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { timeout?.cancel(); busy = false; self.error = "현재 위치를 확인하지 못했어요. 다시 시도하거나 장소·주소로 검색해 주세요." }
}

struct NativeBusView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = NativeBusModel()
    @StateObject private var locator = NativeBusLocation()
    @State private var direction = "in"
    @State private var period = "day"
    @State private var factory = "1"
    @State private var followWork = true
    @State private var searchOpen = false
    @State private var query = ""
    @State private var selectedPlace: NativeBusPlace?
    @State private var radius = 0
    @State private var favorites: [String] = []
    @State private var favoritesOnly = false
    @State private var results = false
    @State private var ready = false
    private var periods: [(String, String)] { direction == "in" ? [("day", "주간 출근"), ("night", "야간 출근"), ("shuttle", "안산역 셔틀 · 출근 전용")] : [("r1750", "주간 퇴근 · 17:50"), ("r2055", "주간 퇴근 · 20:55"), ("r0610", "야간 퇴근 · 06:10"), ("r0910", "야간 퇴근 · 09:10")] }
    private var periodTitle: String { periods.first { $0.0 == period }?.1 ?? period }
    private var eligible: [NativeBusRoute] { model.routes.filter { $0.period == period && supportsFactory($0) } }
    private var searched: [NativeBusRoute] { model.search(eligible.filter { !favoritesOnly || favorites.contains($0.id) }, query) }
    private var recommendation: NativeBusRecommendation? { guard let selectedPlace, period != "shuttle" else { return nil }; return model.recommend(searched, period: period, place: selectedPlace, radius: radius) }
    private var visibleRoutes: [NativeBusRoute] {
        if let recommendation { return recommendation.items.map(\.route) }
        return searched.sorted { first, second in
            let a = (direction == "out" ? first.depart : first.stops.first?.time) ?? "99:99"
            let b = (direction == "out" ? second.depart : second.stops.first?.time) ?? "99:99"
            return a < b
        }
    }
    private var myShift: ShiftDay { NativeShift.day(Date(), group: store.group, store: store) }
    private var followingDescription: String { !followWork ? "탑승 시간을 직접 선택해요." : ShiftPlanner.isNight(myShift) != nil ? NativeL10n.format("%@ · %@에 맞춰 설정", NativeL10n.group(store.group), NativeL10n.text(NativeShift.label(myShift.type))) : "오늘은 탑승 시간을 맞출 근무가 없어요." }
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                controls
                if let error = model.error { busError(error); Button("노선표 다시 불러오기") { model.load() } }
                if let error = locator.error { busError(error) }
                if results { resultList }
                else {
                    VStack(spacing: 12) { Image(systemName: "bus.fill").font(.system(size: 42)).foregroundStyle(.blue); Text("어디에서 탑승하시나요?").font(.title3.bold()); Text("장소·주소·호차·방향으로 검색하거나 전체 노선을 확인해 보세요.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }.frame(maxWidth: .infinity).padding(.vertical, 28)
                }
                guidance
            }.padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("통근버스")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { searchOpen = true } label: { Image(systemName: "magnifyingglass") }.accessibilityLabel("정류장·노선 검색") } }
        .sheet(isPresented: $searchOpen) { NativeBusSearchView(model: model, eligible: eligible, periodTitle: periodTitle, initialQuery: query, selectPlace: choosePlace, selectRoute: { value in query = value; selectedPlace = nil; favoritesOnly = false; results = true }) }
        .onAppear { if !ready { readPreferences(); ready = true }; model.load(); syncShift() }
        .onChange(of: direction) { _, _ in period = direction == "in" ? "day" : "r2055"; syncShift() }
        .onChange(of: followWork) { _, value in if ready { store.setPreference("shift_bus_my_shift_v1", value ? "on" : "off") }; syncShift() }
        .onChange(of: factory) { _, value in if ready { store.setPreference("shift_bus_factory_v1", value) } }
        .onChange(of: store.changeID) { _, _ in syncShift() }
        .onChange(of: scenePhase) { _, value in if value == .active { model.load(); syncShift() } }
        .onChange(of: locator.location) { _, location in if let location { choosePlace(NativeBusPlace(id: "current-location", name: "현재 위치", address: nil, lat: location.coordinate.latitude, lon: location.coordinate.longitude, aliases: nil, source: nil, mapSource: nil, precision: nil, note: nil)) } }
    }
    private var controls: some View {
        NativeCard {
            HStack { VStack(alignment: .leading, spacing: 4) { Text("내 근무").font(.headline); Text(NativeL10n.text(followingDescription)).font(.caption).foregroundStyle(.secondary) }; Spacer(); Toggle("내 근무 자동 설정", isOn: $followWork).labelsHidden() }
            Picker("이동 방향", selection: $direction) { Text("출근").tag("in"); Text("퇴근").tag("out") }.pickerStyle(.segmented)
            Picker(direction == "in" ? "도착 공장" : "출발 공장", selection: $factory) { Text("1공장 · 본사").tag("1"); Text("2공장").tag("2"); Text("4공장").tag("4") }
            Picker("탑승 시간", selection: Binding(get: { period }, set: { period = $0; followWork = false })) { ForEach(periods, id: \.0) { Text(LocalizedStringKey($0.1)).tag($0.0) } }
            Button { searchOpen = true } label: { HStack { Image(systemName: "magnifyingglass"); VStack(alignment: .leading, spacing: 4) { Text(NativeL10n.text(direction == "in" ? "출발" : "도착")).font(.caption).foregroundStyle(.secondary); Text(period == "shuttle" ? "안산역" : selectedPlace?.name ?? (query.isEmpty ? "장소·주소·호차·방향 검색" : query)).font(.subheadline).multilineTextAlignment(.leading) }; Spacer(); Image(systemName: "chevron.right").font(.caption) }.padding(14).background(.blue.opacity(0.06), in: RoundedRectangle(cornerRadius: 14)) }.buttonStyle(.plain)
            if period == "shuttle" { Text("안산역 셔틀은 출근 전용이에요. 노선별 차종과 공장 하차 여부를 확인해 주세요.").font(.caption).foregroundStyle(.secondary) }
            HStack { if period != "shuttle" { Button { locator.request() } label: { if locator.busy { ProgressView() } else { Label("현재 위치", systemImage: "location") } }.disabled(locator.busy).buttonStyle(.bordered) }; Button("전체 노선 보기") { selectedPlace = nil; query = ""; favoritesOnly = false; results = true }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity) }
        }
    }
    private var resultList: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack { Text("\(visibleRoutes.count)개 노선").font(.headline); Spacer(); Toggle("즐겨찾기만", isOn: $favoritesOnly).font(.caption).toggleStyle(.button) }
            Text("\(periodTitle) · \(factory)공장\(query.isEmpty ? "" : " · " + query)").font(.caption).foregroundStyle(.secondary)
            if let selectedPlace, let recommendation {
                HStack { Label(selectedPlace.name, systemImage: "mappin.and.ellipse").font(.subheadline); Spacer(); Button("해제") { self.selectedPlace = nil } }
                if recommendation.mode == "exact" { Text("선택한 정류장에 서는 버스만 표시해요.").font(.caption).foregroundStyle(.secondary) }
                else {
                    Picker("검색 반경", selection: $radius) { Text("자동").tag(0); Text("500m").tag(500); Text("1km").tag(1000); Text("2km").tag(2000) }.pickerStyle(.segmented)
                    Text("\(Int(recommendation.radius))m 이내 · 직선거리 기준 가까운 순서예요. 도보 경로는 길찾기에서 확인해 주세요.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if visibleRoutes.isEmpty { ContentUnavailableView("조건에 맞는 버스가 없어요", systemImage: "bus", description: Text("공장·탑승 시간·검색 조건을 바꿔 보세요.")) }
            ForEach(visibleRoutes) { route in routeCard(route) }
        }
    }
    private func routeCard(_ route: NativeBusRoute) -> some View {
        let nearest = recommendation?.items.first { $0.route.id == route.id }?.nearest
        return NativeCard {
            HStack { Text(route.name).font(.headline); Spacer(); Button { toggleFavorite(route.id) } label: { Image(systemName: favorites.contains(route.id) ? "star.fill" : "star").foregroundStyle(favorites.contains(route.id) ? .orange : .secondary).frame(width: 40, height: 40) }.accessibilityLabel("\(route.name) 즐겨찾기 \(favorites.contains(route.id) ? "해제" : "추가")") }
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 16) {
                    if let nearest { nearby(nearest) }
                    ForEach(Array(route.stops.enumerated()), id: \.offset) { index, stop in stopRow(stop, highlight: nearest?.stop.name == stop.name, first: index == 0) }
                    if !route.notes.isEmpty { Text(route.notes).font(.caption).foregroundStyle(.secondary) }
                }.padding(.top, 12)
            } label: {
                VStack(alignment: .leading, spacing: 7) { HStack(alignment: .firstTextBaseline) { Text((direction == "out" ? route.depart : nearest?.stop.time ?? route.stops.first?.time) ?? "시간 정보 없음").font(.title2.bold()).monospacedDigit(); Text(NativeL10n.text(direction == "out" ? "1공장 기준" : nearest != nil ? "승차" : "첫 출발")).font(.caption).foregroundStyle(.secondary) }; Text(nearest?.stop.name ?? (direction == "out" ? route.destination : route.stops.first?.name ?? "")).font(.subheadline); if let nearest { Text(distance(nearest.distance) + " · 직선거리").font(.caption).foregroundStyle(.blue) }; Text("노선 보기").font(.caption).foregroundStyle(.secondary) }.padding(.vertical, 3)
            }.tint(.primary)
        }
    }
    private func stopRow(_ stop: NativeBusStop, highlight: Bool, first: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 4) { Circle().fill(highlight ? Color.blue : Color.secondary.opacity(0.4)).frame(width: 9, height: 9); Rectangle().fill(Color.secondary.opacity(0.16)).frame(width: 1, height: 32) }.padding(.top, 5)
            VStack(alignment: .leading, spacing: 6) { HStack(alignment: .firstTextBaseline) { Text(stop.time ?? "시간 정보 없음").font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(highlight ? .blue : .primary); Text(stop.name).font(.subheadline) }; mapLinks(stop) }
        }
    }
    @ViewBuilder private func mapLinks(_ stop: NativeBusStop) -> some View {
        if stop.name.contains("공장") || stop.name.contains("본사") {
            ForEach(model.factories.filter { factory in stop.name.contains((factory.id ?? "") + "공장") || (factory.id == "1" && stop.name.contains("본사")) }, id: \.stableID) { factory in if let url = factory.mapURL { Link(factory.name + " 위치 확인", destination: url).font(.caption) } }
        } else if let point = model.lookup(stop.name) {
            HStack { if let url = point.mapURL { Link(point.precision == "shared-pin" ? "공유 위치" : "등록 위치", destination: url) }; if let url = naverPlace(point, name: stop.name) { Link("지도 앱", destination: url) } }.font(.caption)
        } else if let search = stop.name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed), let url = URL(string: "https://map.naver.com/p/search/\(search)") { Link("지도에서 검색", destination: url).font(.caption) }
    }
    private func nearby(_ nearest: NativeBusNearest) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text((direction == "in" ? "가까운 승차 지점 · " : "추천 하차 지점 · ") + nearest.stop.name).font(.subheadline.bold())
            Text("\(distance(nearest.distance)) · 직선거리").font(.caption).foregroundStyle(.secondary)
            Text((nearest.place.precision == "shared-pin" ? "공유 정류장 핀: " : "주변 기준점: ") + nearest.place.name).font(.caption).foregroundStyle(.secondary)
            if let chosen = selectedPlace, let url = walkingURL(from: direction == "in" ? chosen : nearest.place, to: direction == "in" ? nearest.place : chosen) { Link("카카오 도보 길찾기", destination: url).font(.caption) }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
    }
    private var guidance: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("도로 사정에 따라 1~2분 빠를 수 있으니 출발 5분 전까지 나와 주세요.").font(.caption)
            Text("노선표 기준 \(model.sourceDate) · 주변 기준점은 실제 승차장·도로 방향과 다를 수 있어요.").font(.caption).foregroundStyle(.secondary)
            if let place = model.factories.first(where: { $0.id == factory }), let url = place.mapURL { Link("\(place.name) 위치 확인", destination: url).font(.caption) }
            Link("공장 위치 출처: 코리아써키트", destination: URL(string: "https://kcg.co.kr/location")!).font(.caption)
            Text("근무 루틴은 회사에서 운영하는 공식 앱이 아니에요.").font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 5)
    }
    private func supportsFactory(_ route: NativeBusRoute) -> Bool {
        if direction == "in" { return route.stops.contains { $0.name.contains(factory + "공장") || (factory == "1" && $0.name.contains("본사")) } }
        if route.notes.contains("→") { return route.notes.contains(factory + "공장") }
        for value in ["1", "2", "4"] { if route.notes.hasPrefix(value + "공장 출발") { return value == factory } }
        return true
    }
    private func syncShift() {
        guard followWork, let night = ShiftPlanner.isNight(myShift) else { return }
        period = direction == "in" ? (night ? "night" : "day") : night ? (NativeShift.hasOT(myShift) ? "r0910" : "r0610") : (NativeShift.hasOT(myShift) ? "r2055" : "r1750")
    }
    private func choosePlace(_ place: NativeBusPlace) { selectedPlace = place; query = ""; radius = 0; favoritesOnly = false; results = true }
    private func readPreferences() { followWork = store.preferences["shift_bus_my_shift_v1"] != "off"; factory = ["1", "2", "4"].contains(store.preferences["shift_bus_factory_v1"] ?? "") ? store.preferences["shift_bus_factory_v1"]! : "1"; if let value = store.preferences["shift_bus_favorites_v1"], let data = value.data(using: .utf8), let saved = try? JSONDecoder().decode([String].self, from: data) { favorites = saved } }
    private func toggleFavorite(_ id: String) { if favorites.contains(id) { favorites.removeAll { $0 == id } } else { favorites.append(id) }; if let data = try? JSONEncoder().encode(favorites), let value = String(data: data, encoding: .utf8) { store.setPreference("shift_bus_favorites_v1", value) } }
    private func distance(_ meters: Double) -> String { meters < 1000 ? "\(Int((meters / 10).rounded()) * 10)m" : String(format: "%.1fkm", meters / 1000) }
    private func busError(_ message: String) -> some View { Label(message, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
    private func naverPlace(_ place: NativeBusPlace, name: String) -> URL? { var c = URLComponents(); c.scheme = "nmap"; c.host = "place"; c.queryItems = [URLQueryItem(name: "lat", value: String(place.lat)), URLQueryItem(name: "lng", value: String(place.lon)), URLQueryItem(name: "name", value: name), URLQueryItem(name: "appname", value: "com.wnhue.natbam")]; return c.url }
    private func walkingURL(from: NativeBusPlace, to: NativeBusPlace) -> URL? { let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/,?#")); guard let a = from.name.addingPercentEncoding(withAllowedCharacters: allowed), let b = to.name.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }; return URL(string: "https://map.kakao.com/link/by/walk/\(a),\(from.lat),\(from.lon)/\(b),\(to.lat),\(to.lon)") }
}

private struct NativeBusSearchView: View {
    @ObservedObject var model: NativeBusModel
    let eligible: [NativeBusRoute]
    let periodTitle: String
    let initialQuery: String
    let selectPlace: (NativeBusPlace) -> Void
    let selectRoute: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var region = "all"
    @State private var remote: [NativeBusPlace] = []
    @State private var busy = false
    @State private var error: String?
    @State private var searchID = UUID()
    private var local: [NativeBusPlace] {
        let normalized = query.replacingOccurrences(of: " ", with: "").lowercased()
        return model.places.filter { point in
            let area = (point.address ?? "") + point.name
            let matchesRegion = region == "all" || (region == "ansan" ? area.contains("안산") : area.contains("시흥") || area.contains("배곧"))
            let corpus = ([point.name, point.address ?? ""] + (point.aliases ?? [])).joined(separator: " ").replacingOccurrences(of: " ", with: "").lowercased()
            return matchesRegion && (normalized.isEmpty || corpus.contains(normalized))
        }
    }
    private var matchedRoutes: [NativeBusRoute] { query.isEmpty ? [] : model.search(eligible, query) }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("장소·주소·호차·방향 검색", text: $query).submitLabel(.search).onSubmit { Task { await searchRemote() } }; if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.accessibilityLabel("검색어 지우기") } }
                    Picker("지역", selection: $region) { Text("전체").tag("all"); Text("안산").tag("ansan"); Text("시흥·배곧").tag("siheung") }.pickerStyle(.segmented)
                    Text(periodTitle + " 조건에서 검색해요.").font(.caption).foregroundStyle(.secondary)
                }
                if !matchedRoutes.isEmpty {
                    Section("노선 \(matchedRoutes.count)개") {
                        Button("일치하는 노선 전체 보기") { selectRoute(query); dismiss() }
                        ForEach(matchedRoutes) { route in
                            Button { selectRoute(route.name); dismiss() } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(route.name).foregroundStyle(.primary)
                                    Text("\(route.stops.count)곳 경유").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                Section(query.isEmpty ? "정류장·장소 목록" : "정류장·장소") { ForEach(local, id: \.stableID) { place in placeRow(place) }; if local.isEmpty { Text("일치하는 정류장이 없어요.").foregroundStyle(.secondary) } }
                if !remote.isEmpty { Section("주소·장소 검색 결과") { ForEach(remote, id: \.stableID) { place in placeRow(place) }; Text("OpenStreetMap · Photon / 안산·시흥 및 인근 지역").font(.caption).foregroundStyle(.secondary) } }
                if let error { Section { Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red).font(.subheadline) } }
                if query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 { Section { Button { Task { await searchRemote() } } label: { HStack { Label("주소·장소 더 검색", systemImage: "magnifyingglass"); if busy { Spacer(); ProgressView() } } }.disabled(busy) } }
            }
            .navigationTitle("정류장·노선 검색")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
            .onAppear { query = initialQuery }
            .onChange(of: query) { _, _ in searchID = UUID(); remote = []; error = nil; busy = false }
            .onDisappear { searchID = UUID() }
        }
    }
    private func placeRow(_ place: NativeBusPlace) -> some View {
        Button { selectPlace(place); dismiss() } label: { HStack(alignment: .top) { Image(systemName: "mappin.circle.fill").foregroundStyle(.blue).font(.title3); VStack(alignment: .leading, spacing: 5) { Text(place.name).foregroundStyle(.primary); if let address = place.address { Text(address).font(.caption).foregroundStyle(.secondary) }; if place.precision != "shared-pin" { Text("주변 기준점 · 실제 승차 위치 확인 필요").font(.caption2).foregroundStyle(.secondary) } } } }
    }
    private func searchRemote() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 2, !busy else { return }
        let token = UUID(); searchID = token; busy = true; error = nil
        defer { if searchID == token { busy = false } }
        var c = URLComponents(); c.path = "/api/bus-places"; c.queryItems = [URLQueryItem(name: "q", value: text)]
        do { let data = try await NativeAPI.shared.request(path: c.string!); guard searchID == token else { return }; remote = try nativeServiceDecode([NativeBusPlace].self, data["places"] ?? []); if remote.isEmpty { error = "검색 결과가 없어요. 다른 주소나 장소 이름을 입력해 주세요." } }
        catch { if searchID == token { self.error = error.localizedDescription } }
    }
}
