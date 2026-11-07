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
    @ViewBuilder private func breakSchedule(night: Bool) -> some View {
        let round = night ? model.preferences.nightBreakRound : model.preferences.dayBreakRound
        VStack(alignment: .leading, spacing: 12) {
            Text(NativeL10n.text(night ? "야간" : "주간")).font(.subheadline.bold())
            Picker(NativeL10n.text(night ? "야간 차수" : "주간 차수"), selection: Binding(get: {
                night ? model.preferences.nightBreakRound : model.preferences.dayBreakRound
            }, set: { value in
                model.change { if night { $0.nightBreakRound = value } else { $0.dayBreakRound = value } }
            })) {
                Text("1차").tag(1)
                Text("2차").tag(2)
            }.pickerStyle(.segmented)
                .accessibilityIdentifier(night ? "nightBreakRound" : "dayBreakRound")
            ForEach(ShiftPlanner.breaks(night: night, round: round)) { item in
                LabeledContent(NativeL10n.format("%@ · %d분 전", NativeL10n.text(item.title), item.leadMinutes), value: item.timeLabel).font(.subheadline)
            }
        }.padding(.vertical, 6)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("내 근무에 맞춰, 제시간에", systemImage: "alarm.fill")
                        .font(.title3.bold()).padding(.vertical, 8)
                    Toggle("기상 알람", isOn: Binding(get: { model.preferences.enabled }, set: { value in Task { await model.enable(value) } }))
                        .accessibilityIdentifier("shiftAlarmToggle")
                } footer: {
                    Text("한국 시간 기준이에요. 반차일에도 기본 근무의 주간·야간 시간에 울려요. 휴무·연차·무급휴무는 제외해요.")
                }
                Section(NativeL10n.text(model.preferences.separateWeekendHolidays ? "평일 출근" : "출근 시간")) {
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
                    Text(NativeL10n.text(model.preferences.separateWeekendHolidays
                        ? "토·일요일과 달력에 표시된 공휴일·대체공휴일에 적용해요. 야간 근무도 출근하는 날짜를 기준으로 구분해요."
                        : "지금은 모든 출근일에 같은 시간을 사용해요. 따로 설정하면 처음에는 기존 시간을 그대로 가져와요."))
                }
                Section {
                    Toggle("휴게·식사 알람", isOn: Binding(get: { model.preferences.breaksEnabled }, set: { value in
                        Task { await model.enableBreaks(value) }
                    })).accessibilityIdentifier("breakAlarmToggle")
                    if model.preferences.breaksEnabled {
                        breakSchedule(night: false)
                        breakSchedule(night: true)
                    }
                } header: {
                    Text("휴게·식사 알람")
                } footer: {
                    Text("내 근무표에 맞춰 휴게는 5분 전, 식사는 10분 전에 울려요. 표시된 시간은 알람이 울리는 시간이에요. 야간의 자정 이후 알람은 다음 날에 울려요. 휴무·연차·무급휴무는 제외하며, 반차일은 기본 근무 시간표를 따라요.")
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
                        Label(NativeL10n.text(error), systemImage: "exclamationmark.circle").foregroundStyle(.red)
                        Button("다시 예약하기") { model.refresh() }.disabled(model.busy)
                        Button("아이폰 설정 열기") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                }
                if model.capacityReached {
                    Section("알람 예약 안내") {
                        Label("가까운 알람부터 예약했어요", systemImage: "clock.badge.exclamationmark").font(.subheadline.bold())
                        if let last = model.scheduled.last {
                            LabeledContent("예약된 마지막 알람") {
                                Text(last.date, format: .dateTime.month().day().hour().minute())
                            }
                        }
                        Text(NativeL10n.format("아이폰의 알람 예약 한도에 도달해 %d개는 아직 예약하지 못했어요. 앱을 다시 열면 남은 알람을 이어서 예약해요.", model.deferredCount))
                            .font(.footnote).foregroundStyle(.secondary)
                        Button("다시 예약하기") { model.refresh() }.disabled(model.busy)
                    }
                }
                Section("예약된 알람 · \(model.scheduled.count)개") {
                    if model.busy { ProgressView("알람 반영 중") }
                    if model.scheduled.isEmpty { Text("아직 예약된 알람이 없어요").foregroundStyle(.secondary) }
                    ForEach(model.scheduled) { plan in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(NativeL10n.text(plan.title)).font(.subheadline.bold())
                            Text(plan.date, format: .dateTime.month().day().weekday().hour().minute().timeZone(.omitted))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                Section("달력 연결") {
                    if let snapshot = model.snapshot, let sync = model.lastSync {
                        LabeledContent("근무조", value: NativeL10n.group(snapshot.group))
                        LabeledContent("최근 확인", value: sync.formatted(date: .abbreviated, time: .shortened))
                        if let last = snapshot.days.last { LabeledContent("근무표 확인 범위", value: NativeL10n.format("%@까지", last.date)) }
                    } else { Text("달력을 불러오면 근무표가 연결돼요") }
                    Text("앱을 열 때 향후 30일의 근무표를 확인하고, 아이폰이 허용하는 만큼 가까운 알람부터 예약해요. 다른 기기에서 바꾼 근무는 이 앱에서 동기화한 뒤 알람에 반영돼요.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("근무 알람").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
        }
        .environment(\.timeZone, ShiftPlanner.korea.timeZone)
        .environment(\.locale, NativeL10n.locale)
    }
}
