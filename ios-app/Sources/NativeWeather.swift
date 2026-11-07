import SwiftUI
import CoreLocation

struct NativeWeatherCity: Identifiable {
    let name: String
    let latitude: Double
    let longitude: Double
    var id: String { name }
    static let all: [NativeWeatherCity] = [
        .init(name: "안산", latitude: 37.32, longitude: 126.83), .init(name: "서울", latitude: 37.57, longitude: 126.98),
        .init(name: "인천", latitude: 37.46, longitude: 126.71), .init(name: "수원", latitude: 37.26, longitude: 127.03),
        .init(name: "성남", latitude: 37.42, longitude: 127.13), .init(name: "평택", latitude: 36.99, longitude: 127.11),
        .init(name: "대전", latitude: 36.35, longitude: 127.38), .init(name: "청주", latitude: 36.64, longitude: 127.49),
        .init(name: "대구", latitude: 35.87, longitude: 128.60), .init(name: "부산", latitude: 35.18, longitude: 129.08),
        .init(name: "울산", latitude: 35.54, longitude: 129.31), .init(name: "광주", latitude: 35.16, longitude: 126.85),
        .init(name: "전주", latitude: 35.82, longitude: 127.15), .init(name: "춘천", latitude: 37.88, longitude: 127.73),
        .init(name: "강릉", latitude: 37.75, longitude: 128.90), .init(name: "제주", latitude: 33.50, longitude: 126.53)
    ]
}

enum NativeWeatherCode {
    static func description(_ code: Int) -> String {
        switch code {
        case 0: return "맑음"
        case 1, 2: return "구름 조금"
        case 3: return "흐림"
        case 45, 48: return "안개"
        case 51, 53, 55, 56, 57: return "이슬비"
        case 61, 63, 65, 66, 67, 80, 81, 82: return "비"
        case 71, 73, 75, 77, 85, 86: return "눈"
        case 95, 96, 99: return "뇌우"
        default: return "날씨 정보"
        }
    }
    static func symbol(_ code: Int) -> String {
        switch code {
        case 0: return "sun.max.fill"
        case 1, 2: return "cloud.sun.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51, 53, 55, 56, 57: return "cloud.drizzle.fill"
        case 61, 63, 65, 66, 67, 80, 81, 82: return "cloud.rain.fill"
        case 71, 73, 75, 77, 85, 86: return "cloud.snow.fill"
        case 95, 96, 99: return "cloud.bolt.rain.fill"
        default: return "cloud"
        }
    }
}

struct NativeWeatherHour: Identifiable {
    let time: String
    let temperature: Double?
    let probability: Double
    let code: Int
    let rain: Double
    let snow: Double
    var id: String { time }
    var hour: String { String(time.dropFirst(11).prefix(2)) + "시" }
}

struct NativeWeatherReport {
    let temperature: Double
    let apparent: Double
    let code: Int
    let wind: Double
    let low: Double
    let high: Double
    let probability: Double
    let time: String
    let timezone: String
    let alert: String
    let forecast: String
    let hours: [NativeWeatherHour]

    @MainActor static func decode(_ object: [String: Any]) throws -> NativeWeatherReport {
        func number(_ value: Any?) -> Double? {
            guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else { return nil }
            return value.doubleValue
        }
        guard let current = object["current"] as? [String: Any], let daily = object["daily"] as? [String: Any],
              let temperature = number(current["temperature_2m"]), let apparent = number(current["apparent_temperature"]),
              let code = number(current["weather_code"]), let wind = number(current["wind_speed_10m"]),
              let low = number((daily["temperature_2m_min"] as? [Any])?.first), let high = number((daily["temperature_2m_max"] as? [Any])?.first),
              let probability = number((daily["precipitation_probability_max"] as? [Any])?.first),
              let time = current["time"] as? String, time.range(of: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$", options: .regularExpression) != nil,
              let dailyTime = (daily["time"] as? [String])?.first, String(time.prefix(10)) == dailyTime,
              (-100...100).contains(temperature), (-120...120).contains(apparent), (-100...100).contains(low), (-100...100).contains(high),
              high >= low, (0...100).contains(probability), wind >= 0, (0...99).contains(code), code.rounded(.towardZero) == code else {
            throw NativeFailure("날씨 정보를 확인하지 못했어요. 새로고침을 눌러 주세요.")
        }
        let hourly = object["hourly"] as? [String: Any] ?? [:]
        let summary = NativeLogic.shared.call("ShiftWeatherForecast.summarize", args: [hourly, time]) as? [String: Any] ?? [:]
        var hours: [NativeWeatherHour] = []
        let times = hourly["time"] as? [String] ?? []
        let probabilities = hourly["precipitation_probability"] as? [Any] ?? [], codes = hourly["weather_code"] as? [Any] ?? []
        let rains = hourly["rain"] as? [Any] ?? [], showers = hourly["showers"] as? [Any] ?? [], snows = hourly["snowfall"] as? [Any] ?? []
        let temperatures = hourly["temperature_2m"] as? [Any] ?? []
        let start = String(time.prefix(13)) + ":00"
        if [probabilities.count, codes.count, rains.count, showers.count, snows.count].allSatisfy({ $0 == times.count }), Set(times).count == times.count {
            for (index, hour) in times.enumerated() where hour >= start {
                guard hours.count < 24 else { break }
                guard hour.range(of: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$", options: .regularExpression) != nil,
                      let chance = number(probabilities[index]), (0...100).contains(chance), let condition = number(codes[index]), (0...99).contains(condition),
                      let rain = number(rains[index]), let shower = number(showers[index]), let snow = number(snows[index]), rain >= 0, shower >= 0, snow >= 0 else { hours = []; break }
                hours.append(NativeWeatherHour(time: hour, temperature: temperatures.indices.contains(index) ? number(temperatures[index]) : nil, probability: chance, code: Int(condition), rain: rain + shower, snow: snow))
            }
        }
        return NativeWeatherReport(temperature: temperature, apparent: apparent, code: Int(code), wind: wind, low: low, high: high, probability: probability, time: time,
            timezone: object["timezone"] as? String ?? "", alert: summary["label"] as? String ?? "", forecast: summary["detail"] as? String ?? "시간별 비·눈 예보를 확인하지 못했어요.", hours: hours)
    }
}

private final class NativeWeatherSessionDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.host == "api.open-meteo.com" && request.url?.scheme == "https" ? request : nil)
    }
}

enum NativeWeatherClient {
    static func requestURL(latitude: Double, longitude: Double) throws -> URL {
        guard latitude.isFinite, longitude.isFinite, (-90...90).contains(latitude), (-180...180).contains(longitude) else { throw NativeFailure("날씨를 확인할 지역을 선택해 주세요.") }
        var url = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        url.queryItems = [
            URLQueryItem(name: "latitude", value: String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), latitude)),
            URLQueryItem(name: "longitude", value: String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), longitude)),
            URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m"),
            URLQueryItem(name: "daily", value: "temperature_2m_max,temperature_2m_min,precipitation_probability_max"),
            URLQueryItem(name: "hourly", value: "temperature_2m,rain,showers,snowfall,precipitation_probability,weather_code"),
            URLQueryItem(name: "timezone", value: "auto"), URLQueryItem(name: "forecast_days", value: "2")
        ]
        return url.url!
    }
    static func fetch(latitude: Double, longitude: Double) async throws -> [String: Any] {
        let url = try requestURL(latitude: latitude, longitude: longitude)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil; configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil; configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 12; configuration.timeoutIntervalForResource = 20
        let session = URLSession(configuration: configuration, delegate: NativeWeatherSessionDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpShouldHandleCookies = false; request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await session.bytes(for: request)
        let limit = 256_000
        guard let response = response as? HTTPURLResponse, response.statusCode == 200, response.url?.host == "api.open-meteo.com", response.expectedContentLength <= limit else { throw NativeFailure("날씨를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.") }
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < limit else { throw NativeFailure("날씨 응답을 확인하지 못했어요.") }
            data.append(byte)
        }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NativeFailure("날씨 응답을 읽지 못했어요.") }
        return object
    }
}

@MainActor final class NativeWeatherModel: ObservableObject {
    @Published var city = "안산"
    @Published var usingCurrentLocation = false
    @Published var report: NativeWeatherReport?
    @Published var busy = false
    @Published var error: String?
    private var coordinate: CLLocationCoordinate2D?
    private var loadedAt: Date?
    private var serial = 0
    private var requestTask: Task<Void, Never>?
    var placeName: String { usingCurrentLocation ? "현재 위치" : city }
    func selectCity(_ name: String) {
        guard NativeWeatherCity.all.contains(where: { $0.name == name }) else { return }
        city = name; usingCurrentLocation = false; coordinate = nil; reload(force: true)
    }
    func configure(_ saved: String?) {
        guard let saved, saved != city, NativeWeatherCity.all.contains(where: { $0.name == saved }), !usingCurrentLocation else { return }
        city = saved; report = nil; loadedAt = nil
    }
    func useLocation(_ location: CLLocation) {
        // Only the rounded coordinate is kept in memory. No preference, account
        // data, request cache or credential store receives the device location.
        coordinate = CLLocationCoordinate2D(latitude: (location.coordinate.latitude * 100).rounded() / 100, longitude: (location.coordinate.longitude * 100).rounded() / 100)
        usingCurrentLocation = true; reload(force: true)
    }
    func reload(force: Bool = false) {
        if !force, busy || (loadedAt.map { Date().timeIntervalSince($0) < 900 } ?? false) { return }
        requestTask?.cancel(); serial += 1
        let current = serial, chosen = NativeWeatherCity.all.first(where: { $0.name == city }) ?? NativeWeatherCity.all[0]
        let point = coordinate ?? CLLocationCoordinate2D(latitude: chosen.latitude, longitude: chosen.longitude)
        busy = true; error = nil; report = nil
        requestTask = Task { [weak self] in
            do {
                let object = try await NativeWeatherClient.fetch(latitude: point.latitude, longitude: point.longitude)
                guard let self, current == self.serial, !Task.isCancelled else { return }
                self.report = try NativeWeatherReport.decode(object); self.loadedAt = Date(); self.busy = false
            } catch {
                guard let self, current == self.serial, !Task.isCancelled else { return }
                self.loadedAt = nil; self.busy = false; self.error = "날씨를 불러오지 못했어요. 새로고침하거나 지역을 다시 선택해 주세요."
            }
        }
    }
}

struct NativeWeatherButton: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = NativeWeatherModel()
    @State private var open = false
    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 4) {
                Image(systemName: model.report.map { NativeWeatherCode.symbol($0.code) } ?? "cloud.sun").symbolRenderingMode(.multicolor)
                Text(model.report.map { "\(Int($0.temperature.rounded()))°" } ?? "--°").font(.caption.weight(.semibold)).monospacedDigit()
            }.frame(width: 50, height: 36)
        }.buttonStyle(.plain).accessibilityLabel(accessibilityLabel)
            .sheet(isPresented: $open) { NativeWeatherView(model: model) }
            .onAppear { model.configure(store.preferences["shift_weather_city"]); model.reload() }
            .onChange(of: store.preferences["shift_weather_city"]) { _, city in model.configure(city); model.reload() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.reload() } }
            .onReceive(Timer.publish(every: 900, on: .main, in: .common).autoconnect()) { _ in if scenePhase == .active { model.reload() } }
    }
    private var accessibilityLabel: String {
        guard let report = model.report else { return "오늘 날씨 확인" }
        return "\(model.placeName) \(NativeWeatherCode.description(report.code)) \(Int(report.temperature.rounded()))도, 상세 보기" + (report.alert.isEmpty ? "" : " · 앞으로 24시간 \(report.alert)")
    }
}

struct NativeWeatherView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: NativeWeatherModel
    @StateObject private var locator = NativeBusLocation()
    @State private var acceptingLocation = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    NativeCard {
                        HStack {
                            Picker("지역", selection: Binding(get: { model.usingCurrentLocation ? "현재 위치" : model.city }, set: { city in acceptingLocation = false; model.selectCity(city); store.setPreference("shift_weather_city", city) })) {
                                ForEach(NativeWeatherCity.all) { Text($0.name).tag($0.name) }
                                if model.usingCurrentLocation { Text("현재 위치").tag("현재 위치") }
                            }.pickerStyle(.menu)
                            Spacer()
                            Button { acceptingLocation = true; locator.request() } label: { if locator.busy { ProgressView() } else { Image(systemName: "location") } }.disabled(locator.busy).accessibilityLabel("현재 위치 날씨 확인")
                            Button { model.reload(force: true) } label: { Image(systemName: "arrow.clockwise") }.disabled(model.busy).accessibilityLabel("날씨 새로고침")
                        }
                        if locator.busy { Text("현재 위치를 확인하고 있어요.").font(.caption).foregroundStyle(.secondary) }
                        if locator.error != nil { Text("현재 위치를 확인하지 못했어요. 지역을 선택하거나 iPhone의 위치 권한을 확인해 주세요.").font(.caption).foregroundStyle(.secondary) }
                    }
                    if model.busy { ProgressView("날씨를 불러오는 중…").padding(30) }
                    if let report = model.report {
                        currentWeather(report)
                        NativeCard {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("앞으로 24시간").font(.headline)
                                Label(NativeL10n.text(report.forecast), systemImage: report.alert.isEmpty ? "checkmark.circle" : "umbrella.fill").font(.subheadline).foregroundStyle(report.alert.isEmpty ? .secondary : .primary)
                                if !report.hours.isEmpty {
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 18) {
                                            ForEach(report.hours) { hour in
                                                VStack(spacing: 9) {
                                                    Text(hour.hour).font(.caption).foregroundStyle(.secondary)
                                                    Image(systemName: NativeWeatherCode.symbol(hour.code)).symbolRenderingMode(.multicolor).frame(height: 25)
                                                    if let temperature = hour.temperature { Text("\(Int(temperature.rounded()))°").font(.subheadline.weight(.semibold)) }
                                                    Text("\(Int(hour.probability.rounded()))%").font(.caption2).foregroundStyle(.blue)
                                                }.frame(minWidth: 38).accessibilityElement(children: .ignore).accessibilityLabel("\(hour.hour) \(NativeWeatherCode.description(hour.code)), 강수확률 \(Int(hour.probability.rounded()))퍼센트")
                                            }
                                        }.padding(.vertical, 4)
                                    }
                                    Text("시간별 강수확률 · 비와 눈 예보").font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    if let error = model.error { NativeCard { Text(LocalizedStringKey(error)).font(.subheadline); Button("다시 불러오기") { model.reload(force: true) } } }
                    VStack(alignment: .leading, spacing: 9) {
                        Text("현재 위치는 선택 사항이에요. 대략적인 좌표를 Open-Meteo에 보내 날씨를 조회하며, 위치는 저장하거나 계정에 동기화하지 않아요.")
                        HStack { Link("날씨: Open-Meteo", destination: URL(string: "https://open-meteo.com/")!); Text("· 예보는 실제 날씨와 다를 수 있어요.") }
                    }.font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
                }.padding(16)
            }.background(NativeColors.background).navigationTitle("오늘 날씨").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
                .onAppear { model.configure(store.preferences["shift_weather_city"]); model.reload() }
                .onChange(of: locator.location) { _, location in
                    if let location { if acceptingLocation { model.useLocation(location) }; acceptingLocation = false; locator.location = nil }
                }
                .onDisappear { acceptingLocation = false; locator.location = nil }
        }
    }
    private func currentWeather(_ report: NativeWeatherReport) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) { Text(model.placeName).font(.headline); Text(NativeL10n.text(NativeWeatherCode.description(report.code))).font(.subheadline).foregroundStyle(.secondary) }
                    Spacer()
                    Image(systemName: NativeWeatherCode.symbol(report.code)).font(.system(size: 38)).symbolRenderingMode(.multicolor)
                    Text("\(Int(report.temperature.rounded()))°").font(.system(size: 44, weight: .medium, design: .rounded))
                }
                HStack { detail("체감", "\(Int(report.apparent.rounded()))°"); detail("최저 / 최고", "\(Int(report.low.rounded()))° / \(Int(report.high.rounded()))°"); detail("강수확률", "\(Int(report.probability.rounded()))%") }
                HStack { Label("바람 \(Int(report.wind.rounded())) km/h", systemImage: "wind"); Spacer() }.font(.caption).foregroundStyle(.secondary)
                Text(report.time.replacingOccurrences(of: "T", with: " ") + " 기준 · " + report.timezone).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
    private func detail(_ title: String, _ value: String) -> some View { VStack(spacing: 6) { Text(LocalizedStringKey(title)).font(.caption).foregroundStyle(.secondary); Text(value).font(.subheadline.weight(.medium)) }.frame(maxWidth: .infinity) }
}
