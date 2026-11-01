import SwiftUI

struct AlarmView: View {
    @ObservedObject var model: AlarmModel
    @Environment(\.dismiss) private var dismiss
    private func time(_ night: Bool, weekendOrHoliday: Bool = false) -> Binding<Date> {
        Binding(get: {
            let minutes = model.preferences.minutes(night: night, weekendOrHoliday: weekendOrHoliday)
            return ShiftPlanner.korea.date(byAdding: .minute, value: minutes, to: ShiftPlanner.korea.startOfDay(for: Date()))!
        }, set: { value in
            let parts = ShiftPlanner.korea.dateComponents([.hour, .minute], from: value)
            let minutes = parts.hour! * 60 + parts.minute!
            model.change {
                if weekendOrHoliday {
                    if night { $0.weekendNightMinutes = minutes } else { $0.weekendDayMinutes = minutes }
                } else if night { $0.nightMinutes = minutes } else { $0.dayMinutes = minutes }
            }
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
                    Toggle("반차일에도 알림", isOn: Binding(get: { model.preferences.includeHalf }, set: { value in model.change { $0.includeHalf = value } }))
                } footer: {
                    Text("한국 시간 기준이에요. 휴무·연차·무급휴무는 제외해요. 반차일 알림을 켜면 해당 날짜의 주간·야간 시간에 울려요.")
                }
                Section(model.preferences.separateWeekendHolidays ? "평일 출근" : "출근 시간") {
                    DatePicker("주간 · 주특", selection: time(false), displayedComponents: .hourAndMinute)
                        .accessibilityIdentifier("weekdayDayTime")
                    DatePicker("야간 · 야특", selection: time(true), displayedComponents: .hourAndMinute)
                        .accessibilityIdentifier("weekdayNightTime")
                }
                Section {
                    Toggle("주말·공휴일 시간 따로 설정", isOn: Binding(get: { model.preferences.separateWeekendHolidays }, set: { value in
                        model.change { $0.setSeparateWeekendHolidays(value) }
                    }))
                    .accessibilityIdentifier("separateWeekendHolidaysToggle")
                    if model.preferences.separateWeekendHolidays {
                        DatePicker("주간 · 주특", selection: time(false, weekendOrHoliday: true), displayedComponents: .hourAndMinute)
                            .accessibilityIdentifier("weekendDayTime")
                        DatePicker("야간 · 야특", selection: time(true, weekendOrHoliday: true), displayedComponents: .hourAndMinute)
                            .accessibilityIdentifier("weekendNightTime")
                    }
                } header: {
                    Text("주말·공휴일 출근")
                } footer: {
                    Text(model.preferences.separateWeekendHolidays
                        ? "토·일요일과 달력에 표시된 공휴일·대체공휴일에 적용해요. 야간 근무도 출근하는 날짜를 기준으로 구분해요."
                        : "지금은 모든 출근일에 같은 시간을 사용해요. 따로 설정하면 처음에는 기존 시간을 그대로 가져와요.")
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
