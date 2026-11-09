import EventKit
import SwiftUI
import UIKit

struct AlarmView: View {
    @ObservedObject var model: AlarmModel
    @Environment(\.openURL) private var openURL

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.timeZone = TimeZone(identifier: "Asia/Seoul")
        formatter.dateFormat = "M월 d일 (E) HH:mm"
        return formatter
    }()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("주간 · 주특 06:30", systemImage: "sun.max.fill")
                    Label("야간 · 야특 18:30", systemImage: "moon.fill")
                } header: { Text("근무별 자동 알람") } footer: {
                    Text("한국 시간 기준입니다. 휴무·연차·무급 휴무와 개인 일정에는 알람을 만들지 않습니다.")
                }

                Section {
                    Picker("근무표 출처", selection: Binding(get: { model.useBuiltIn }, set: { value in Task { await model.setSource(builtIn: value) } })) {
                        Text("앱의 내 근무표").tag(true)
                        Text("iPhone 캘린더").tag(false)
                    }
                    if !model.useBuiltIn {
                        if !model.calendarGranted {
                            Button("iPhone 캘린더 연결") { Task { await model.requestCalendar() } }
                        } else {
                            Picker("근무 캘린더", selection: Binding(get: { model.calendarID }, set: { value in Task { await model.selectCalendar(value) } })) {
                                Text("선택해 주세요").tag("")
                                ForEach(model.calendars, id: \.calendarIdentifier) { calendar in
                                    Text("\(calendar.title) · \(calendar.source.title)").tag(calendar.calendarIdentifier)
                                }
                            }
                        }
                    }
                    Toggle("자동 알람 사용", isOn: Binding(get: { model.enabled }, set: { value in Task { await model.setEnabled(value) } }))
                        .accessibilityIdentifier("automatic-alarms")
                    Toggle("반차에도 기존 주·야 시간 적용", isOn: Binding(get: { model.includeHalf }, set: { value in Task { await model.setIncludeHalf(value) } }))
                    Button("iPhone 설정 열기") {
                        openURL(URL(string: UIApplication.openSettingsURLString)!)
                    }
                } header: { Text("연결 및 사용 설정") } footer: {
                    Text("앱의 내 근무표를 사용하면 캘린더 연결이나 단축어가 필요 없습니다. iPhone 캘린더를 선택하면 Google에 동기화된 근무표를 읽습니다. 반차 알람은 기본으로 제외합니다. 켜면 반차의 실제 출근 시각과 관계없이 06:30 또는 18:30에 울립니다.")
                }
                .disabled(model.busy)

                Section {
                    Text(model.message).accessibilityIdentifier("alarm-status")
                    if model.busy { ProgressView("알람 갱신 중") }
                    Button("근무표 및 알람 지금 갱신") { Task { _ = await model.refresh() } }
                        .disabled(model.busy)
                    Button("1분 뒤 테스트 알람") { Task { await model.testAlarm() } }
                        .disabled(model.busy || !model.enabled || !model.alarmGranted)
                    if let last = model.lastRefresh {
                        Text("마지막 근무표 확인: \(Self.formatter.string(from: last))").font(.footnote)
                    }
                    if let last = model.scheduled.last {
                        Text("현재 예약 마지막 날짜: \(Self.formatter.string(from: last.date))").font(.footnote)
                    }
                } header: { Text("예약 상태") } footer: {
                    Text("앞으로 30일의 근무를 미리 예약합니다. 예약된 알람은 앱을 닫아도 울립니다. 앱·Google에서 근무를 바꾼 뒤에는 이 앱을 열어 갱신 완료를 확인하세요. 계속 사용하려면 예약 마지막 날짜 전에 앱을 다시 열어 주세요. \(model.backgroundNote)")
                }

                Section("다가오는 알람") {
                    if model.scheduled.isEmpty { Text("예약된 알람 없음").foregroundStyle(.secondary) }
                    ForEach(model.scheduled) { alarm in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(alarm.title)
                            Text(Self.formatter.string(from: alarm.date)).foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Link("근무표 앱 열기", destination: URL(string: "https://h-lyart-ten.vercel.app/")!)
                    Text("iPhone 설정 → 앱 → 캘린더 → 캘린더 계정에서 Google 계정을 추가하고 캘린더를 켜 주세요. Shift_cal이 없으면 Google 캘린더의 iPhone 동기화 목록도 확인하세요.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Link("Google 캘린더 동기화 목록", destination: URL(string: "https://calendar.google.com/calendar/syncselect")!)
                } header: { Text("처음 연결하기") } footer: {
                    Text("iOS 26 이상에서 사용하는 앱 전용 시스템 알람입니다. Apple 기본 시계의 알람 목록에 추가되지는 않습니다. 이 앱은 선택한 캘린더를 읽기만 하며 일정이나 개인정보를 서버에 전송하지 않습니다.")
                }
            }
            .navigationTitle("근무 알람")
        }
    }
}
