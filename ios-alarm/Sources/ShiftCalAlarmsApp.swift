import BackgroundTasks
import SwiftUI
import UIKit

class AlarmAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: AlarmModel.refreshIdentifier, using: .main) { task in
            let work = Task { @MainActor in
                let success = await AlarmModel.shared.refresh()
                task.setTaskCompleted(success: success && !Task.isCancelled)
            }
            task.expirationHandler = { work.cancel() }
        }
        return true
    }
}

@main
struct ShiftCalAlarmsApp: App {
    @UIApplicationDelegateAdaptor(AlarmAppDelegate.self) var delegate
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = AlarmModel.shared

    var body: some Scene {
        WindowGroup {
            AlarmView(model: model)
                .task { _ = await model.refresh() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { _ = await model.refresh() } }
                    if phase == .background { model.scheduleBackgroundRefresh() }
                }
        }
    }
}
