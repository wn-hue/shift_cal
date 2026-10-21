import SwiftUI

@main
struct NatbamApp: App {
    @StateObject private var alarms = AlarmModel()
    @StateObject private var web = WebState()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            ZStack {
                WebApp(alarms: alarms, state: web)
                    .ignoresSafeArea(.container, edges: .bottom)
                if web.loading {
                    ProgressView("교대 루틴을 불러오고 있어요")
                        .padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
                }
                if let error = web.error {
                    VStack(spacing: 20) {
                        Image(systemName: "wifi.slash").font(.largeTitle)
                        Text(error).multilineTextAlignment(.center)
                        Button("다시 연결") { web.retry() }.buttonStyle(.borderedProminent)
                        Button("근무 알람 확인") { alarms.showingSettings = true }
                    }.padding(30).frame(maxWidth: .infinity, maxHeight: .infinity).background(.background)
                }
            }
            .sheet(isPresented: $alarms.showingSettings) { AlarmView(model: alarms) }
            .onChange(of: phase) { _, value in
                if value == .active { web.refreshSchedule(); alarms.refresh() }
            }
            .onAppear {
                alarms.refresh()
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("--alarm-settings") { alarms.showingSettings = true }
                #endif
            }
        }
    }
}
