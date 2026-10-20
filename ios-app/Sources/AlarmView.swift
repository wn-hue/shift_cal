import SwiftUI

struct AlarmView: View {
    @ObservedObject var model: AlarmModel
    @Environment(\.dismiss) private var dismiss
    private func time(_ night: Bool) -> Binding<Date> {
        Binding(get: {
            let minutes = night ? model.preferences.nightMinutes : model.preferences.dayMinutes
            return ShiftPlanner.korea.date(byAdding: .minute, value: minutes, to: ShiftPlanner.korea.startOfDay(for: Date()))!
        }, set: { value in
            let parts = ShiftPlanner.korea.dateComponents([.hour, .minute], from: value)
            let minutes = parts.hour! * 60 + parts.minute!
            model.change { if night { $0.nightMinutes = minutes } else { $0.dayMinutes = minutes } }
        })
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("내 근무에 맞춰, 제시간에", systemImage: "alarm.fill")
                        .font(.title3.bold()).padding(.vertical, 8)
                    Toggle("근무 알람", isOn: Binding(get: { model.preferences.enabled }, set: { value in Task { await model.enable(value) } }))
                        .accessibilityIdentifier("shiftAlarmToggle")
                    DatePicker("주간 · 주특", selection: time(false), displayedComponents: .hourAndMinute)
                    DatePicker("야간 · 야특", selection: time(true), displayedComponents: .hourAndMinute)
                    Toggle("반차일에도 알림", isOn: Binding(get: { model.preferences.includeHalf }, set: { value in model.change { $0.includeHalf = value } }))
                } footer: {
                    Text("한국 시간 기준이에요. 휴무·연차·무급휴무는 제외해요. 반차일 알림을 켜면 위의 주간·야간 시간에 그대로 울려요.")
                }
                Section("알람 확인") {
                    Button { Task { await model.test() } } label: {
                        Label("1분 뒤 테스트 알람", systemImage: "play.circle.fill")
                    }.accessibilityIdentifier("testAlarmButton").disabled(model.busy)
                    if model.scheduled.contains(where: { $0.key == "test" }) {
                        Button("테스트 알람 취소", role: .destructive) { model.stopTest() }
                    }
                    Text("예약 후 화면을 잠가 확인해 주세요. 앱을 닫아도 예약된 알람은 시스템이 울려요.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error = model.error {
                    Section {
                        Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red)
                        Button("아이폰 설정 열기") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                }
                Section("예약된 알람 · \(model.scheduled.count)개") {
                    if model.busy { ProgressView("알람 반영 중") }
                    if model.scheduled.isEmpty { Text("아직 예약된 알람이 없어요").foregroundStyle(.secondary) }
                    ForEach(model.scheduled) { plan in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(plan.title).font(.subheadline.bold())
                            Text(plan.date, format: .dateTime.month().day().weekday().hour().minute().timeZone(.omitted))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                Section("달력 연결") {
                    if let snapshot = model.snapshot, let sync = model.lastSync {
                        LabeledContent("근무조", value: "\(snapshot.group)조")
                        LabeledContent("최근 확인", value: sync.formatted(date: .abbreviated, time: .shortened))
                        if let last = snapshot.days.last { LabeledContent("예약 범위", value: "\(last.date)까지") }
                    } else { Text("달력을 불러오면 근무표가 연결돼요") }
                    Text("앱을 열 때 향후 30일을 갱신해요. 다른 기기에서 바꾼 근무는 이 앱에서 동기화한 뒤 알람에 반영돼요. 주차장 만차 원격 알림은 이 테스트 앱에 포함되지 않아요.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("근무 알람").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
        }
        .environment(\.timeZone, ShiftPlanner.korea.timeZone)
        .environment(\.locale, Locale(identifier: "ko_KR"))
    }
}
