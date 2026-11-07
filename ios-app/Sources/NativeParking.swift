import SwiftUI
import CoreLocation
import UserNotifications

@MainActor final class NativeParkingPush: NSObject {
    static let shared = NativeParkingPush()
    private var pending: CheckedContinuation<String, Error>?
    private var timeout: Task<Void, Never>?
    static var environment: String? {
        switch Bundle.main.object(forInfoDictionaryKey: "WorkRoutineAPNSEnvironment") as? String {
        case "development": return "sandbox"
        case "production": return "production"
        default: return nil
        }
    }
    func register(requestPermission: Bool) async throws -> String {
        guard Self.environment != nil else { throw NativeFailure("이 앱의 알림 연결을 준비 중이에요.") }
        guard pending == nil else { throw NativeFailure("알림을 연결하고 있어요. 잠시만 기다려 주세요.") }
        let center = UNUserNotificationCenter.current()
        var settings = await center.notificationSettings()
        if requestPermission && settings.authorizationStatus == .notDetermined {
            _ = try await center.requestAuthorization(options: [.alert, .sound]); settings = await center.notificationSettings()
        }
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            throw NativeFailure("iPhone 설정에서 알림을 켜면 제보에 참여하고 만차 알림을 받을 수 있어요.")
        }
        // APNs issues the current token on each registration. Never cache a device token on disk.
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            timeout = Task { try? await Task.sleep(for: .seconds(20)); guard !Task.isCancelled else { return }; finish(.failure(NativeFailure("알림 연결이 늦어지고 있어요. 잠시 후 다시 켜 주세요."))) }
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
    func registered(_ data: Data) { finish(.success(data.map { String(format: "%02x", $0) }.joined())) }
    func failed() { finish(.failure(NativeFailure("iPhone 알림을 연결하지 못했어요. 잠시 후 다시 켜 주세요."))) }
    private func finish(_ result: Result<String, Error>) { timeout?.cancel(); timeout = nil; let waiting = pending; pending = nil; waiting?.resume(with: result) }
}

@MainActor final class NativeParkingNavigation: ObservableObject {
    static let shared = NativeParkingNavigation()
    @Published var open = false
}

@MainActor final class NativeParkingAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Install the shared notification delegate before a cold-start tap arrives.
        _ = NativeReminders.shared
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) { Task { @MainActor in NativeParkingPush.shared.registered(deviceToken) } }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { Task { @MainActor in NativeParkingPush.shared.failed() } }
}

struct NativeParkingSnapshot: Decodable {
    struct LastReport: Decodable { let at: Double; let value: String }
    let status: String
    let open: Bool
    let mine: String?
    let counts: [String: Int]
    let updatedAt: Double
    let lastReport: LastReport?
    let subscribed: Bool
    let subscriptionKind: String?
    let nativeAvailable: Bool?
    static func decode(_ response: [String: Any]) throws -> NativeParkingSnapshot {
        let value = try nativeServiceDecode(Self.self, response)
        guard ["free", "busy", "full", "unknown"].contains(value.status), value.updatedAt.isFinite, value.updatedAt > 0,
              ["free", "busy", "full"].allSatisfy({ (value.counts[$0] ?? -1) >= 0 }) else { throw NativeFailure("주차 정보를 확인하지 못했어요. 다시 불러와 주세요.") }
        return value
    }
}

@MainActor final class NativeParkingLocation: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var pending: CheckedContinuation<[String: Any], Error>?
    private var timeout: Task<Void, Never>?
    override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyBest }
    func locate() async throws -> [String: Any] {
        guard pending == nil else { throw NativeFailure("현재 위치를 확인하고 있어요.") }
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            timeout = Task { try? await Task.sleep(for: .seconds(20)); guard !Task.isCancelled else { return }; finish(.failure(NativeFailure("현재 위치를 확인하지 못했어요. 실외에서 다시 제보해 주세요."))) }
            switch manager.authorizationStatus {
            case .notDetermined: manager.requestWhenInUseAuthorization()
            case .authorizedAlways, .authorizedWhenInUse: manager.requestLocation()
            default: finish(.failure(NativeFailure("iPhone 설정에서 위치 권한을 켜면 주변에서 제보할 수 있어요.")))
            }
        }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pending != nil else { return }
        if [.authorizedAlways, .authorizedWhenInUse].contains(manager.authorizationStatus) { manager.requestLocation() }
        else if manager.authorizationStatus != .notDetermined { finish(.failure(NativeFailure("iPhone 설정에서 위치 권한을 켜면 주변에서 제보할 수 있어요."))) }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let found = locations.last, found.horizontalAccuracy >= 0, found.horizontalAccuracy <= 300, abs(found.timestamp.timeIntervalSinceNow) < 60 else { finish(.failure(NativeFailure("위치 오차가 커요. 실외에서 다시 제보해 주세요."))); return }
        finish(.success(["latitude": found.coordinate.latitude, "longitude": found.coordinate.longitude, "accuracy": found.horizontalAccuracy, "timestamp": found.timestamp.timeIntervalSince1970 * 1000]))
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { finish(.failure(NativeFailure("현재 위치를 확인하지 못했어요. 실외에서 다시 제보해 주세요."))) }
    private func finish(_ result: Result<[String: Any], Error>) { manager.stopUpdatingLocation(); timeout?.cancel(); timeout = nil; let waiting = pending; pending = nil; waiting?.resume(with: result) }
}

@MainActor final class NativeParkingModel: ObservableObject {
    static let shared = NativeParkingModel()
    static let preference = "native.parking.participating.v1"
    @Published var snapshot: NativeParkingSnapshot?
    @Published var loading = false
    @Published var changing = false
    @Published var reporting = false
    @Published var error: String?
    @Published var message: String?
    @Published var permissionAllowed = true
    private let location = NativeParkingLocation()
    @Published private(set) var resuming = false
    var wanted: Bool { UserDefaults.standard.bool(forKey: Self.preference) }
    var participating: Bool { snapshot?.subscribed == true && snapshot?.subscriptionKind == "apns" && permissionAllowed }
    var available: Bool { snapshot?.nativeAvailable == true }
    func load() async {
        guard !loading, !changing, !reporting, !resuming else { return }
        loading = true; error = nil; defer { loading = false }
        do { snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking")) }
        catch { self.error = error.localizedDescription }
    }
    func setParticipation(_ enabled: Bool) async {
        guard !changing, !reporting, !resuming, !loading else { return }
        changing = true; error = nil; message = nil; defer { changing = false }
        do {
            // A GET installs the anonymous first-party cookie required for writes.
            snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking"))
            if enabled {
                guard available else { throw NativeFailure("iPhone 만차 알림을 준비 중이에요. 지금은 주차 현황을 확인할 수 있어요.") }
                try await subscribe(requestPermission: true)
                message = "제보에 참여하고 만차 알림을 받아요."
            } else {
                _ = try await NativeAPI.shared.request(path: "/api/parking", method: "POST", body: ["action": "unsubscribe"])
                UserDefaults.standard.set(false, forKey: Self.preference)
                message = "제보 참여와 만차 알림을 껐어요."
            }
            snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking"))
        } catch { self.error = error.localizedDescription }
    }
    private func subscribe(requestPermission: Bool) async throws {
        let token = try await NativeParkingPush.shared.register(requestPermission: requestPermission)
        guard let environment = NativeParkingPush.environment else { throw NativeFailure("이 앱의 알림 연결을 준비 중이에요.") }
        _ = try await NativeAPI.shared.request(path: "/api/parking", method: "POST", body: ["action": "native-subscribe", "subscription": ["kind": "apns", "token": token, "environment": environment]])
        UserDefaults.standard.set(true, forKey: Self.preference); permissionAllowed = true
    }
    // Re-register on launch/foreground to keep changing APNs tokens current.
    // No periodic location requests or background GPS tracking are used.
    func resumeParticipation() async {
        guard wanted, !resuming, !changing, !reporting, !loading else { return }
        resuming = true; defer { resuming = false }
        do {
            snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking"))
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            permissionAllowed = [.authorized, .provisional].contains(settings.authorizationStatus)
            if !permissionAllowed {
                _ = try await NativeAPI.shared.request(path: "/api/parking", method: "POST", body: ["action": "unsubscribe"])
                UserDefaults.standard.set(false, forKey: Self.preference)
                snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking"))
            } else if available { try await subscribe(requestPermission: false); snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking")) }
        } catch { self.error = error.localizedDescription }
    }
    func report(_ vote: String, group: String) async {
        guard participating, available, snapshot?.open == true, !reporting, !changing, !resuming, !loading else { return }
        reporting = true; error = nil; message = nil; defer { reporting = false }
        do {
            let position = try await location.locate()
            let choice: Any = snapshot?.mine == vote ? NSNull() : vote
            snapshot = try NativeParkingSnapshot.decode(await NativeAPI.shared.request(path: "/api/parking", method: "POST", body: ["vote": choice, "group": group, "location": position]))
            message = choice is NSNull ? "제보를 취소했어요." : "제보해 주셔서 고마워요."
        } catch { self.error = error.localizedDescription }
    }
}

struct NativeParkingView: View {
    @EnvironmentObject private var store: NativeStore
    @StateObject private var model = NativeParkingModel.shared
    private var state: String { model.snapshot?.status ?? "unknown" }
    private var statusTitle: String { switch state { case "free": return "여유 있어요"; case "busy": return "혼잡해요"; case "full": return "만차예요"; default: return "최근 제보가 없어요" } }
    private var color: Color { switch state { case "free": return .green; case "busy": return .orange; case "full": return .red; default: return .secondary } }
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                NativeCard {
                    HStack { Label("본사 · 1공장", systemImage: "parkingsign.circle.fill").font(.headline); Spacer(); if model.loading { ProgressView() } }
                    Text(LocalizedStringKey(model.loading ? "주차 정보를 확인하고 있어요" : model.error != nil ? "주차 정보를 확인해 주세요" : statusTitle)).font(.largeTitle.bold()).foregroundStyle(model.loading || model.error != nil ? .secondary : color).padding(.vertical, 10)
                    if let snapshot = model.snapshot {
                        if model.loading || model.error != nil { Text(LocalizedStringKey(statusTitle)).font(.subheadline) }
                        Text(Date(timeIntervalSince1970: snapshot.updatedAt / 1000), format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(.secondary)
                        Text("최근 10분 동안의 제보예요. 실제 주차 상황과 다를 수 있어요.").font(.caption).foregroundStyle(.secondary)
                        HStack { count("여유", snapshot.counts["free"] ?? 0, .green); count("혼잡", snapshot.counts["busy"] ?? 0, .orange); count("만차", snapshot.counts["full"] ?? 0, .red) }
                    }
                }
                NativeCard {
                    Toggle("제보 참여 · 만차 알림", isOn: Binding(get: { model.participating }, set: { value in Task { await model.setParticipation(value) } })).font(.headline).disabled(model.changing || model.reporting || model.resuming || model.loading || (!model.available && !model.participating)).accessibilityIdentifier("parking.participation")
                    Text("켜면 함께 제보하고 만차 알림을 받아요. 끄면 제보와 알림을 모두 쉬어요.").font(.subheadline).foregroundStyle(.secondary)
                    if model.changing || model.resuming { ProgressView("알림을 연결하고 있어요") }
                    if !model.available { Text("iPhone 만차 알림을 준비 중이에요. 지금은 주차 현황을 확인할 수 있어요.").font(.caption).foregroundStyle(.secondary) }
                    if !model.permissionAllowed { Button("iPhone 알림 설정 열기") { if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) } } }
                }
                NativeCard {
                    Text("지금 주차장은 어떤가요?").font(.headline)
                    HStack(spacing: 8) { voteButton("free", "여유", .green); voteButton("busy", "혼잡", .orange); voteButton("full", "만차", .red) }
                    if model.reporting { ProgressView("위치를 확인하고 제보를 보내요") }
                    Text("평일 06:50~07:30 · 본사·1공장 주변 1km").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Text("제보할 때만 위치를 확인해요. 위치 정보는 저장하지 않아요.").font(.caption).foregroundStyle(.secondary)
                    if model.snapshot?.open == false { Text("지금은 제보 시간이 아니에요.").font(.caption).foregroundStyle(.secondary) }
                }
                if let error = model.error { Label(LocalizedStringKey(error), systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
                if let message = model.message { Label(LocalizedStringKey(message), systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(.green).frame(maxWidth: .infinity, alignment: .leading) }
                Button { Task { await model.load() } } label: { Label("현황 새로고침", systemImage: "arrow.clockwise").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).disabled(model.loading)
            }.padding(16)
        }.background(Color(uiColor: .systemGroupedBackground)).navigationTitle("주차장")
            .task { await model.load(); await model.resumeParticipation() }.refreshable { await model.load() }
    }
    private func count(_ label: String, _ value: Int, _ tint: Color) -> some View { VStack(spacing: 5) { Text("\(value)").font(.title2.bold()); Text(LocalizedStringKey(label)).font(.caption) }.foregroundStyle(tint).frame(maxWidth: .infinity).padding(.vertical, 10).background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14)) }
    private func voteButton(_ vote: String, _ title: String, _ tint: Color) -> some View {
        Button { Task { await model.report(vote, group: store.group) } } label: {
            VStack(spacing: 8) { Image(systemName: model.snapshot?.mine == vote ? "checkmark.circle.fill" : "circle.fill").font(.title2); Text(LocalizedStringKey(title)).font(.subheadline.bold()) }.foregroundStyle(tint).frame(maxWidth: .infinity).padding(.vertical, 14).background(tint.opacity(0.09), in: RoundedRectangle(cornerRadius: 15))
        }.buttonStyle(.plain).disabled(!model.participating || !model.available || model.snapshot?.open != true || model.reporting || model.changing || model.resuming).accessibilityIdentifier("parking.vote." + vote)
    }
}
