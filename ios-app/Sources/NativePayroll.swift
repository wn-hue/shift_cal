import SwiftUI

// Uses the same pure calculation engines and storage keys as the existing app.
@MainActor
enum NativePayroll {
    nonisolated static func number(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }
    nonisolated static func money(_ value: Double) -> String { NativeL10n.won(value) }
    nonisolated static func quantity(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...1))) }
    nonisolated static func cleanAmount(_ raw: String) -> String {
        let digits = raw.replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "원", with: "").filter { !$0.isWhitespace }
        guard !digits.isEmpty else { return "" }
        // Keep invalid signs/decimals visible so validation rejects them instead
        // of silently turning a pasted negative or decimal amount into more pay.
        guard digits.allSatisfy({ $0.isASCII && $0.isNumber }) else { return digits }
        let normalized = digits.drop(while: { $0 == "0" })
        return normalized.isEmpty ? "0" : String(normalized)
    }
    nonisolated static func amount(_ raw: String, positive: Bool = false) -> Int? {
        guard let value = Int(raw), value >= (positive ? 1 : 0), value <= 1_000_000_000 else { return nil }
        return value
    }
    static func resolvedSeniority(_ config: [String: Any], end: String) -> Double {
        number(NativeLogic.shared.call("ShiftPlannerCore.resolveSeniorityPay", args: [config, end]))
    }
    static func profile(_ store: NativeStore, bonus: Bool = false) -> Any {
        let object = store.object(bonus ? "shift_bonus_sms_reference_v1" : "shift_payroll_sms_reference_v1")
        return object.isEmpty ? NSNull() : object
    }

    struct Snapshot {
        let start: String
        let end: String
        let counts: [String: Any]
        let payments: [String: Any]
        let estimate: [String: Any]
        let rows: [(String, Double)]
        let holidayPay: Double
        var gross: Double { NativePayroll.number(estimate["gross"]) }
        var net: Double { NativePayroll.number(estimate["net"]) }
        var deductions: Double { NativePayroll.number(estimate["total"]) }
        var support: Double { NativePayroll.number(payments["support"]) }
        var bonus: Double { NativePayroll.number(payments["bonus"]) }
    }

    static func payChange(date: Date, group: String, override: String?, store: NativeStore) -> Double {
        let calendar = NativeDates.calendar
        let payrollMonth = calendar.component(.day, from: date) > 15 ? calendar.date(byAdding: .month, value: 1, to: date)! : date
        let before = snapshot(month: payrollMonth, store: store, group: group)
        let after = snapshot(month: payrollMonth, store: store, group: group, overrideDate: NativeDates.key(date), overrideType: override)
        return after.gross - before.gross
    }
    static func snapshot(month: Date, store: NativeStore, group: String? = nil, overrideDate: String? = nil, overrideType: String? = nil) -> Snapshot {
        let activeGroup = group ?? store.group
        let calendar = NativeDates.calendar
        var parts = calendar.dateComponents([.year, .month], from: month)
        parts.day = 15
        let endDate = calendar.date(from: parts)!
        let end = NativeDates.key(endDate)
        let startDate = calendar.date(byAdding: .day, value: 1, to: calendar.date(byAdding: .month, value: -1, to: endDate)!)!
        let start = NativeDates.key(startDate)
        var days: [[String: Any]] = []
        var date = startDate
        var holidayPay = 0.0
        var eligible = 0
        var recorded = 0
        let config = store.config
        let holidayGroups = config["holidayWorkPay"] as? [String: Any] ?? [:]
        let holidayAmounts = holidayGroups[activeGroup] as? [String: Any] ?? [:]
        while date <= endDate {
            let shift = overrideDate == NativeDates.key(date) ? NativeShift.day(date, group: activeGroup, override: overrideType) : NativeShift.day(date, group: activeGroup, store: store)
            var item: [String: Any] = ["type": shift.type]
            if let original = shift.origType { item["origType"] = original }
            days.append(item)
            let holiday = NativeShift.holidayName(date)
            if (holiday == "설날" || holiday == "추석"),
               NativeLogic.shared.call("HolidayWorkPayCore.working", args: [item]) as? Bool == true {
                eligible += 1
                if let value = holidayAmounts[NativeDates.key(date)],
                   NativeLogic.shared.call("HolidayWorkPayCore.validAmount", args: [value]) as? Bool == true {
                    holidayPay += number(value)
                    recorded += 1
                }
            }
            date = calendar.date(byAdding: .day, value: 1, to: date)!
        }
        if recorded == 0 && eligible > 0,
           let legacy = config["holidayBonus"],
           NativeLogic.shared.call("HolidayWorkPayCore.validAmount", args: [legacy]) as? Bool == true {
            holidayPay = number(legacy)
        }
        let counts = NativeLogic.shared.call("ShiftPlannerCore.counts", args: [days]) as? [String: Any] ?? [:]
        var payments = NativeLogic.shared.call("ShiftPlannerCore.payments", args: [counts, config, end]) as? [String: Any] ?? [:]
        payments["regular"] = number(payments["regular"]) + holidayPay
        let estimate = NativeLogic.shared.call("PayrollEstimate.estimatePayments", args: [payments, profile(store), profile(store, bonus: true)]) as? [String: Any] ?? [:]
        let ordinary = number(config["ordinaryHourly"])
        let day = number(counts["day"]), night = number(counts["night"])
        let specialDay = number(counts["spDay"]), specialNight = number(counts["spNight"])
        let noOT = number(counts["noOT"]), unpaid = number(counts["unpaid"])
        let base = (number(config["baseHourly"]) * (number(config["baseHours"]) == 0 ? 209 : number(config["baseHours"]))).rounded(.towardZero)
        let duty = number(config["dutyPay"]), seniority = resolvedSeniority(config, end: end)
        let net: (Double) -> Double = { max(0, $0 - ($0 * unpaid / 27).rounded(.towardZero)) }
        let overtime = (ordinary * 1.5 * max(0, day + night - noOT) * 2.5).rounded(.towardZero)
        let nightPay = (ordinary * 0.5 * 7 * night).rounded(.towardZero)
        let special = (ordinary * 1.5 * 8 * (specialDay + specialNight)).rounded(.towardZero)
        let specialOT = (ordinary * 2 * 2.5 * max(0, specialDay + specialNight - number(counts["spDayNoOT"]) - number(counts["spNightNoOT"]))).rounded(.towardZero)
        let specialNightPay = (ordinary * 0.5 * 7 * specialNight).rounded(.towardZero)
        let known = net(base) + net(duty) + net(seniority) + overtime + nightPay + special + specialOT + specialNightPay + holidayPay
        let adjustment = max(0, number(payments["regular"]) - known)
        var rows: [(String, Double)] = [("기본급", base)]
        if seniority > 0 { rows.append(("근속수당", seniority)) }
        if duty > 0 { rows.append(("고정수당", duty)) }
        rows += [("연장근로수당", overtime), ("야간근로수당", nightPay), ("특근수당", special), ("특근 연장수당", specialOT), ("특근 야간수당", specialNightPay)]
        if adjustment > 0 { rows.append(("입사연도에 따른 보정수당", adjustment)) }
        if holidayPay > 0 { rows.append(("명절근무수당", holidayPay)) }
        let bonus = number(payments["bonus"])
        let underYear = NativeLogic.shared.call("ShiftPlannerCore.isUnderOneYear", args: [config["hireDate"] as? String ?? "", end]) as? Bool == true
        let bonusBefore = !underYear && calendar.component(.month, from: endDate).isMultiple(of: 2) ? (base * 0.5).rounded(.towardZero) + seniority : 0
        if bonusBefore > 0 { rows.append(("상여금", bonusBefore)) }
        if number(payments["support"]) > 0 { rows.append(("입사 1년 미만 지원금", number(payments["support"]))) }
        let attendance = base - net(base) + duty - net(duty) + seniority - net(seniority) + bonusBefore - bonus
        if attendance > 0 { rows.append(("무급근태 차감", -attendance)) }
        return Snapshot(start: start, end: end, counts: counts, payments: payments, estimate: estimate, rows: rows, holidayPay: holidayPay)
    }
}

struct NativePayrollView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var month = Date()
    @State private var netMode = false
    @State private var wageSettings = false
    @State private var deductions = false
    @State private var details = false
    @State private var deductionDetails = false
    private var result: NativePayroll.Snapshot { NativePayroll.snapshot(month: month, store: store) }

    var body: some View {
        let result = result
        ScrollView {
            VStack(spacing: 16) {
                HStack {
                    Button { moveMonth(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("이전 급여월")
                    Spacer()
                    Text(NativeDates.monthTitle(month)).font(.headline)
                    Spacer()
                    Button { moveMonth(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("다음 급여월")
                }
                NativeCard {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("이번 달 예상 급여").font(.subheadline).foregroundStyle(.secondary)
                        HStack(alignment: .center, spacing: 12) {
                            Text(NativePayroll.money(netMode ? result.net : result.gross)).font(.system(size: 28, weight: .bold, design: .rounded)).minimumScaleFactor(0.6).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading).contentTransition(.numericText())
                            VStack(spacing: 4) {
                                Text(NativeL10n.text(netMode ? "세후" : "세전")).font(.caption.weight(.medium))
                                Toggle("세전 표시", isOn: Binding(get: { !netMode }, set: { netMode = !$0 })).labelsHidden().tint(NativeColors.blue).accessibilityIdentifier("payrollGrossToggle")
                            }.fixedSize()
                        }
                        Text("\(result.start.replacingOccurrences(of: "-", with: "."))–\(String(result.end.suffix(5)).replacingOccurrences(of: "-", with: "."))").font(.caption2).foregroundStyle(.secondary)
                        Divider()
                        payRow("월 급여", amount: estimatedPart("regular", result: result))
                        if result.bonus > 0 { payRow("상여금", amount: estimatedPart("bonus", result: result)) }
                        if result.support > 0 { payRow("지원금", amount: estimatedPart("support", result: result)) }
                        Text(NativeL10n.text(result.support > 0 ? "입사 1년 미만은 월 지원금 30만 원을 반영해요." : "상여금은 짝수 달에 자동 반영해요.")).font(.caption).foregroundStyle(.secondary)
                        DisclosureGroup(isExpanded: $deductionDetails) {
                            VStack(alignment: .leading, spacing: 14) {
                                payRow("예상 공제 합계", amount: result.deductions)
                                taxBasis("급여", profile: store.object("shift_payroll_sms_reference_v1"), fallback: 1045860.0 / 5781870.0)
                                taxBasis("상여", profile: store.object("shift_bonus_sms_reference_v1"), fallback: 29570.0 / 1224725.0)
                                Button("개인 공제 기준 등록") { deductions = true }.font(.subheadline)
                                Text("등록한 문자 기준이 없으면 기존 기본 비율로 예상해요.").font(.caption).foregroundStyle(.secondary)
                            }.padding(.top, 12)
                        } label: { Text("세금·보험료 계산 기준").font(.caption.weight(.medium)) }

                    }
                }
                NativeCard {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack { Text("근무일수").font(.headline); Spacer(); Text("\(store.group)조 · 급여 산정 기간").font(.caption).foregroundStyle(.secondary) }
                        HStack(spacing: 0) {
                            countCell("주간", key: "day", icon: "sun.max.fill", color: .orange, result: result)
                            countCell("야간", key: "night", icon: "moon.fill", color: .indigo, result: result)
                            countCell("특근 주간", key: "spDay", icon: "bolt.fill", color: .orange, result: result)
                            countCell("특근 야간", key: "spNight", icon: "bolt.fill", color: .indigo, result: result)
                        }
                        if NativePayroll.number(result.counts["noOT"]) > 0 || NativePayroll.number(result.counts["unpaid"]) > 0 {
                            Divider()
                            Text("연장 제외 \(NativePayroll.quantity(NativePayroll.number(result.counts["noOT"])))일 · 무급 \(NativePayroll.quantity(NativePayroll.number(result.counts["unpaid"])))일").font(.caption).foregroundStyle(.secondary)
                        }
                        Text("달력에서 변경한 근무와 반차를 반영해요.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                NativeCard {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack { Text("시급·수당").font(.headline); Spacer(); Button("설정") { wageSettings = true }.font(.subheadline) }
                        HStack(alignment: .top, spacing: 16) {
                            VStack(alignment: .leading, spacing: 16) {
                                wageValue("기본시급", value: NativePayroll.number(store.config["baseHourly"]))
                                wageValue("통상시급", value: NativePayroll.number(store.config["ordinaryHourly"]))
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Rectangle().fill(Color.secondary.opacity(0.15)).frame(width: 1)
                            VStack(alignment: .leading, spacing: 12) {
                                if wageAllowances(end: result.end).isEmpty { Text("설정한 수당이 없어요").font(.caption).foregroundStyle(.secondary) }
                                ForEach(Array(wageAllowances(end: result.end).enumerated()), id: \.offset) { _, item in wageValue(item.0, value: item.1) }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.fixedSize(horizontal: false, vertical: true)
                    }
                }
                NativeCard {
                    VStack(alignment: .leading, spacing: 16) {
                        DisclosureGroup(isExpanded: $details) {
                            VStack(spacing: 12) {
                                ForEach(Array(result.rows.enumerated()), id: \.offset) { _, row in payRow(row.0, amount: row.1) }
                                Divider()
                                payRow("세전 합계", amount: result.gross)
                                if netMode { payRow("예상 공제", amount: -result.deductions); payRow("세후 추정", amount: result.net) }
                            }.padding(.top, 16)
                        } label: { Text("지급 상세 내역").font(.headline) }
                    }
                }
                Text("계산 결과는 예상 금액이에요. 실제 지급액은 회사의 근태 마감과 공제 내역에 따라 달라질 수 있어요.").font(.caption).foregroundStyle(.secondary).padding(.horizontal, 4)
            }.padding(16)
        }
        .background(NativeColors.background)
        .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $wageSettings) { NativeWageSettingsView() }
        .sheet(isPresented: $deductions) { NativeDeductionSettingsView() }
    }
    private func wageValue(_ title: String, value: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(LocalizedStringKey(title)).font(.caption).foregroundStyle(.secondary); Text(NativePayroll.money(value)).font(.subheadline.weight(.medium)).monospacedDigit() }
    }
    private func wageAllowances(end: String) -> [(String, Double)] {
        let config = store.config, fixed = config["fixedAllowances"] as? [String: Any] ?? [:]
        var values: [(String, Double)] = []
        let seniority = NativePayroll.resolvedSeniority(config, end: end)
        if seniority > 0 { values.append(("근속수당", seniority)) }
        for category in NativeAllowance.allCases where category != .seniority {
            let value = fixed.isEmpty && category == .legacy ? NativePayroll.number(config["dutyPay"]) : NativePayroll.number(fixed[category.rawValue])
            if value > 0 { values.append((category.title, value)) }
        }
        return values
    }
    private func moveMonth(_ value: Int) { month = NativeDates.calendar.date(byAdding: .month, value: value, to: month)! }
    private func estimatedPart(_ name: String, result: NativePayroll.Snapshot) -> Double { NativePayroll.number((result.estimate[name] as? [String: Any])?[netMode ? "net" : "gross"]) }
    private func payRow(_ label: String, amount: Double) -> some View {
        HStack { Text(LocalizedStringKey(label)).foregroundStyle(.secondary); Spacer(); Text(NativePayroll.money(amount)).monospacedDigit().fontWeight(.medium) }.font(.subheadline)
    }
    private func countCell(_ title: String, key: String, icon: String, color: Color, result: NativePayroll.Snapshot) -> some View {
        VStack(spacing: 8) { Image(systemName: icon).foregroundStyle(color).frame(height: 20); Text(LocalizedStringKey(title)).font(.caption2).foregroundStyle(.secondary); Text(NativeL10n.days(NativePayroll.quantity(NativePayroll.number(result.counts[key])))).font(.subheadline.weight(.semibold)).monospacedDigit() }.frame(maxWidth: .infinity)
    }
}

private enum NativeAllowance: String, CaseIterable, Identifiable {
    case seniority, duty, qualification, family, job, legacy
    var id: String { rawValue }
    var title: String {
        switch self { case .seniority: return "근속수당"; case .duty: return "직책수당"; case .qualification: return "자격수당"; case .family: return "가족수당"; case .job: return "직무수당"; case .legacy: return "기타 고정수당" }
    }
    var symbol: String {
        switch self { case .seniority: return "clock.badge.checkmark"; case .duty: return "person.badge.shield.checkmark"; case .qualification: return "checkmark.seal"; case .family: return "person.2"; case .job: return "briefcase"; case .legacy: return "plus.circle" }
    }
}

@MainActor enum NativeWageUpdate {
    enum Seniority { case automatic, amount(Int) }
    private static let allowanceKeys = ["qualification", "job", "family", "duty", "legacy"]
    static func config(current: [String: Any], baseHourly: Int? = nil, ordinaryHourly: Int? = nil, allowances: [String: Int] = [:], seniority: Seniority? = nil) throws -> [String: Any] {
        let valid: (Int) -> Bool = { (0...1_000_000_000).contains($0) }
        guard [baseHourly, ordinaryHourly].compactMap({ $0 }).allSatisfy(valid),
              allowances.keys.allSatisfy(allowanceKeys.contains), allowances.values.allSatisfy(valid) else { throw NativeFailure("시급과 수당 금액을 확인해 주세요.") }
        var result = current
        if let baseHourly { result["baseHourly"] = baseHourly }
        if let ordinaryHourly { result["ordinaryHourly"] = ordinaryHourly }
        if !allowances.isEmpty {
            let saved = current["fixedAllowances"] as? [String: Any] ?? [:]
            var fixed = Dictionary(uniqueKeysWithValues: allowanceKeys.map { key in
                (key, saved.isEmpty && key == "legacy" ? Int(NativePayroll.number(current["dutyPay"])) : Int(NativePayroll.number(saved[key])))
            })
            for (key, value) in allowances { fixed[key] = value }
            let total = fixed.values.reduce(0, +)
            guard total <= 1_000_000_000 else { throw NativeFailure("고정수당 합계는 10억 원까지 입력할 수 있어요.") }
            result["fixedAllowances"] = fixed; result["dutyPay"] = total
        }
        if let seniority {
            switch seniority {
            case .automatic: result.removeValue(forKey: "seniorityPayOverride")
            case .amount(let value):
                guard valid(value) else { throw NativeFailure("근속수당 금액을 확인해 주세요.") }
                result["seniorityPayOverride"] = value
            }
        }
        return result
    }
    static func commit(store: NativeStore, config: [String: Any], salaryProfile: [String: Any]? = nil, bonusProfile: [String: Any]? = nil) throws {
        let previous = store.data
        var updated = previous; updated["shift_salary_config_master"] = config
        if let salaryProfile { updated["shift_payroll_sms_reference_v1"] = salaryProfile }
        if let bonusProfile { updated["shift_bonus_sms_reference_v1"] = bonusProfile }
        guard !NativeLogic.shared.equal(previous, updated) else { return }
        store.data = updated; store.error = nil
        guard store.save() else {
            store.data = previous
            throw NativeFailure(store.error ?? "기록을 저장하지 못했어요.")
        }
    }
}

struct NativeWageSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    var onComplete: (() -> Void)? = nil
    @State private var step = 0
    @State private var base = ""
    @State private var ordinary = ""
    @State private var amounts: [String: Int] = [:]
    @State private var selected: Set<NativeAllowance> = []
    @State private var automaticSeniority = true
    @State private var autoSeniority = 0
    @State private var amountSheet: NativeAllowance?
    @State private var remaining: [NativeAllowance] = []
    @State private var importKind: NativeTaxKind?
    @State private var salaryProfile: [String: Any]?
    @State private var bonusProfile: [String: Any]?
    @State private var validation = ""
    @State private var loaded = false
    @State private var didClose = false
    @State private var changedFields: Set<String> = []
    @State private var saveFailed = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if onComplete != nil { HStack(spacing: 6) { ForEach(0..<4) { index in Capsule().fill(index <= step ? NativeColors.blue : Color.secondary.opacity(0.15)).frame(height: 4) } }.accessibilityLabel("4단계 중 \(step + 1)단계") }
                    Group {
                        if onComplete == nil { manualSettings }
                        else if step == 0 { hourlyStep(title: "기본시급을 알려주세요", subtitle: "급여명세서의 기본시급을 그대로 입력해 주세요.", value: $base) }
                        else if step == 1 { hourlyStep(title: "통상시급을 알려주세요", subtitle: "연장·야간·특근수당 계산에 사용해요.", value: $ordinary) }
                        else if step == 2 { allowanceSelection }
                        else { review }
                    }
                    if !validation.isEmpty { Text(LocalizedStringKey(validation)).font(.caption).foregroundStyle(.red).accessibilityIdentifier("wageValidation") }
                    if onComplete != nil {
                        Button(action: advance) {
                            Text(NativeL10n.text(step == 3 ? "저장하기" : "다음")).fontWeight(.semibold).frame(maxWidth: .infinity).frame(height: 52)
                        }.buttonStyle(.borderedProminent).tint(NativeColors.blue).accessibilityIdentifier("wageNext")
                    }
                }.padding(24)
            }
            .background(NativeColors.background)
            .navigationTitle("시급·수당 설정").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if onComplete == nil { Button("완료") { save() } }
                }
                ToolbarItem(placement: .cancellationAction) {
                    if onComplete != nil { Button(NativeL10n.text(step == 0 ? "취소" : "이전")) { if step == 0 { dismiss() } else { validation = ""; step -= 1 } } }
                }
            }
            .onAppear(perform: prepare)
            .onDisappear { if !didClose { saveExistingChanges() } }
            .interactiveDismissDisabled(onComplete == nil && (!existingAmountsValid || saveFailed))
            .sheet(item: $amountSheet, onDismiss: showNextAmount) { category in
                NativeAllowanceAmountView(category: category, current: amounts[category.rawValue] ?? 0, automatic: category == .seniority ? autoSeniority : nil, usingAutomatic: automaticSeniority) { value, useAutomatic in
                    let changed = amounts[category.rawValue] != value || (category == .seniority && automaticSeniority != useAutomatic)
                    amounts[category.rawValue] = value
                    if category == .seniority { automaticSeniority = useAutomatic }
                    if changed { markExistingChanges(["allowance." + category.rawValue]) }
                }
            }
            .sheet(item: $importKind) { kind in NativeTaxImportView(kind: kind) { profile in if kind == .salary { salaryProfile = profile } else { bonusProfile = profile }; markExistingChanges([kind == .salary ? "salaryProfile" : "bonusProfile"]) } }
        }
    }
    private var existingAmountsValid: Bool {
        NativePayroll.amount(base.isEmpty ? "0" : base) != nil && NativePayroll.amount(ordinary.isEmpty ? "0" : ordinary) != nil && NativeAllowance.allCases.filter { $0 != .seniority && selected.contains($0) }.reduce(0, { $0 + (amounts[$1.rawValue] ?? 0) }) <= 1_000_000_000
    }
    private func markExistingChanges(_ fields: Set<String>) {
        guard loaded, onComplete == nil, !didClose, !fields.isEmpty else { return }
        changedFields.formUnion(fields)
        save(close: false)
    }
    private func saveExistingChanges() {
        guard loaded, onComplete == nil, !didClose, !changedFields.isEmpty else { return }
        save(close: false)
    }
    private var manualSettings: some View {
        VStack(alignment: .leading, spacing: 22) {
            NativeCard {
                VStack(spacing: 20) {
                    manualHourly("기본시급", value: $base, identifier: "baseHourly")
                    Divider()
                    manualHourly("통상시급", value: $ordinary, identifier: "ordinaryHourly")
                }
            }
            Text("받고 있는 수당").font(.headline)
            NativeCard {
                VStack(spacing: 18) {
                    ForEach(NativeAllowance.allCases) { category in
                        VStack(alignment: .leading, spacing: 9) {
                            Toggle(category.title, isOn: Binding(get: { selected.contains(category) }, set: { enabled in
                                guard selected.contains(category) != enabled else { return }
                                if enabled { selected.insert(category); remaining = []; amountSheet = category }
                                else { selected.remove(category) }
                                markExistingChanges(["allowance." + category.rawValue])
                            })).tint(NativeColors.blue).font(.subheadline)
                            if selected.contains(category) {
                                Button { remaining = []; amountSheet = category } label: {
                                    HStack { Text(NativeL10n.text(category == .seniority && automaticSeniority ? "입사일 기준 자동 계산" : "월 지급액")).font(.caption).foregroundStyle(.secondary); Spacer(); Text(NativePayroll.money(Double(amounts[category.rawValue] ?? 0))).font(.subheadline); Image(systemName: "chevron.right").font(.caption2) }
                                }
                            }
                        }
                        if category != .legacy { Divider() }
                    }
                }
            }
            taxSettings
            Text("시급을 모두 지우면 0원으로 저장해요. 문자는 공제 기준에만 사용해요.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private func manualHourly(_ label: String, value: Binding<String>, identifier: String) -> some View {
        HStack {
            Text(LocalizedStringKey(label)).font(.subheadline)
            Spacer()
            TextField("0", text: Binding(get: { value.wrappedValue }, set: { text in
                guard value.wrappedValue != text else { return }
                value.wrappedValue = text
                markExistingChanges([identifier])
            })).keyboardType(.numberPad).multilineTextAlignment(.trailing).font(.headline).frame(maxWidth: 150).accessibilityLabel(label).accessibilityIdentifier(identifier)
                .onChange(of: value.wrappedValue) { _, text in
                    let clean = NativePayroll.cleanAmount(text)
                    if clean != text { value.wrappedValue = clean; markExistingChanges([identifier]) }
                }
            Text("원").font(.subheadline).foregroundStyle(.secondary)
        }
    }
    private var taxSettings: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 14) {
                Text("급여 문자는 개인 공제 기준에만 사용해요. 입력한 시급과 수당은 그대로 유지돼요.").font(.caption).foregroundStyle(.secondary)
                taxBasis("급여", profile: salaryProfile ?? store.object("shift_payroll_sms_reference_v1"), fallback: 1045860.0 / 5781870.0)
                taxBasis("상여", profile: bonusProfile ?? store.object("shift_bonus_sms_reference_v1"), fallback: 29570.0 / 1224725.0)
                HStack { Button("급여 문자 등록") { importKind = .salary }; Spacer(); Button("상여 문자 등록") { importKind = .bonus } }.font(.subheadline)
            }.padding(.top, 12)
        } label: { Text("세금·보험료 기준 등록 (선택)").font(.subheadline.weight(.semibold)) }
    }
    private func hourlyStep(title: String, subtitle: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            Image(systemName: step == 0 ? "wonsign.circle.fill" : "clock.fill").font(.system(size: 42)).foregroundStyle(NativeColors.blue).padding(.top, 20)
            Text(LocalizedStringKey(title)).font(.title2.bold())
            Text(LocalizedStringKey(subtitle)).font(.subheadline).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline) {
                TextField("0", text: value).keyboardType(.numberPad).font(.system(size: 36, weight: .semibold, design: .rounded)).focused($focused).accessibilityLabel(step == 0 ? "기본시급" : "통상시급").accessibilityIdentifier(step == 0 ? "baseHourly" : "ordinaryHourly")
                    .onChange(of: value.wrappedValue) { _, text in value.wrappedValue = NativePayroll.cleanAmount(text); validation = "" }
                Text("원").foregroundStyle(.secondary)
            }.padding(20).background(.background, in: RoundedRectangle(cornerRadius: 18))
            Text("문자를 등록하지 않아도 시급과 수당을 직접 설정할 수 있어요.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private var allowanceSelection: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("받고 있는 수당을 골라주세요").font(.title2.bold())
            Text("여러 개를 선택할 수 있어요. 다음 화면에서 금액을 하나씩 입력해요.").font(.subheadline).foregroundStyle(.secondary)
            ForEach(NativeAllowance.allCases) { category in
                Button {
                    if selected.contains(category) { selected.remove(category) } else { selected.insert(category) }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: category.symbol).frame(width: 24)
                        Text(LocalizedStringKey(category.title)).fontWeight(.medium)
                        Spacer()
                        Image(systemName: selected.contains(category) ? "checkmark.circle.fill" : "circle").font(.title3)
                    }.padding(18).foregroundStyle(selected.contains(category) ? NativeColors.blue : Color.primary)
                        .background(selected.contains(category) ? NativeColors.blue.opacity(0.08) : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain).accessibilityAddTraits(selected.contains(category) ? .isSelected : [])
            }
            Text("받는 수당이 없다면 선택 없이 다음으로 넘어가세요.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private var review: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("입력한 내용을 확인해 주세요").font(.title2.bold())
            NativeCard {
                VStack(spacing: 16) {
                    reviewRow("기본시급", value: Int(base) ?? 0)
                    reviewRow("통상시급", value: Int(ordinary) ?? 0)
                    ForEach(NativeAllowance.allCases.filter { selected.contains($0) }) { category in
                        Button { remaining = []; amountSheet = category } label: { HStack { Text(LocalizedStringKey(category.title)); Spacer(); Text(NativePayroll.money(Double(amounts[category.rawValue] ?? 0))).monospacedDigit(); Image(systemName: "pencil").font(.caption) } }.foregroundStyle(.primary).font(.subheadline)
                    }
                }
            }
            taxSettings
            Text("공제 문자는 나중에 등록해도 돼요. 등록하지 않으면 기존 기본 비율로 세후 금액을 예상해요.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private func reviewRow(_ label: String, value: Int) -> some View { HStack { Text(LocalizedStringKey(label)).foregroundStyle(.secondary); Spacer(); Text(NativePayroll.money(Double(value))).monospacedDigit() }.font(.subheadline) }
    private func prepare() {
        guard !loaded else { return }; loaded = true
        if onComplete == nil { step = 3 }
        let config = store.config
        let baseValue = Int(NativePayroll.number(config["baseHourly"]))
        let ordinaryValue = Int(NativePayroll.number(config["ordinaryHourly"]))
        base = baseValue > 0 ? String(baseValue) : ""
        ordinary = ordinaryValue > 0 ? String(ordinaryValue) : ""
        let end = String(NativeDates.key(Date()).prefix(7)) + "-15"
        var automatic = config; automatic.removeValue(forKey: "seniorityPayOverride")
        autoSeniority = Int(NativePayroll.resolvedSeniority(automatic, end: end))
        automaticSeniority = config["seniorityPayOverride"] == nil
        amounts["seniority"] = Int(NativePayroll.resolvedSeniority(config, end: end))
        let fixed = config["fixedAllowances"] as? [String: Any] ?? [:]
        for category in NativeAllowance.allCases where category != .seniority {
            amounts[category.rawValue] = fixed.isEmpty && category == .legacy ? Int(NativePayroll.number(config["dutyPay"])) : Int(NativePayroll.number(fixed[category.rawValue]))
        }
        selected = Set(NativeAllowance.allCases.filter { (amounts[$0.rawValue] ?? 0) > 0 })
    }
    private func advance() {
        validation = ""
        if step < 2 {
            let requiresPositive = onComplete != nil
            let raw = step == 0 ? base : ordinary
            guard NativePayroll.amount(raw.isEmpty && !requiresPositive ? "0" : raw, positive: requiresPositive) != nil else { validation = "\(requiresPositive ? 1 : 0)원부터 10억 원까지 숫자로 입력해 주세요."; return }
            if raw.isEmpty { if step == 0 { base = "0" } else { ordinary = "0" } }
            focused = false; step += 1
        } else if step == 2 {
            remaining = NativeAllowance.allCases.filter { selected.contains($0) }
            step = 3
            showNextAmount()
        } else { save() }
    }
    private func showNextAmount() {
        guard !remaining.isEmpty else { return }
        let category = remaining.removeFirst()
        DispatchQueue.main.async { amountSheet = category }
    }
    private func save(close: Bool = true) {
        validation = ""
        let onboarding = onComplete != nil
        guard onboarding || !changedFields.isEmpty else {
            if close { didClose = true; dismiss() }
            return
        }
        guard let baseValue = NativePayroll.amount(base.isEmpty && !onboarding ? "0" : base, positive: onboarding),
              let ordinaryValue = NativePayroll.amount(ordinary.isEmpty && !onboarding ? "0" : ordinary, positive: onboarding) else { validation = "시급을 확인해 주세요."; return }
        var fixedChanges: [String: Int] = [:]
        for category in NativeAllowance.allCases where category != .seniority && (onboarding || changedFields.contains("allowance." + category.rawValue)) {
            fixedChanges[category.rawValue] = selected.contains(category) ? amounts[category.rawValue] ?? 0 : 0
        }
        var seniority: NativeWageUpdate.Seniority?
        if onboarding || changedFields.contains("allowance.seniority") {
            if selected.contains(.seniority) { seniority = automaticSeniority ? .automatic : .amount(amounts["seniority"] ?? 0) }
            else if autoSeniority > 0 || store.config["seniorityPayOverride"] != nil { seniority = .amount(0) }
        }
        do {
            let config = try NativeWageUpdate.config(current: store.config,
                baseHourly: onboarding || changedFields.contains("baseHourly") ? baseValue : nil,
                ordinaryHourly: onboarding || changedFields.contains("ordinaryHourly") ? ordinaryValue : nil,
                allowances: fixedChanges, seniority: seniority)
            try NativeWageUpdate.commit(store: store, config: config,
                salaryProfile: onboarding || changedFields.contains("salaryProfile") ? salaryProfile : nil,
                bonusProfile: onboarding || changedFields.contains("bonusProfile") ? bonusProfile : nil)
            changedFields.removeAll(); saveFailed = false
            if close { didClose = true; dismiss(); onComplete?() }
        } catch {
            saveFailed = true; validation = error.localizedDescription
        }
    }

}

private struct NativeAllowanceAmountView: View {
    @Environment(\.dismiss) private var dismiss
    let category: NativeAllowance
    let current: Int
    let automatic: Int?
    let usingAutomatic: Bool
    let onSave: (Int, Bool) -> Void
    @State private var custom = false
    @State private var amount = ""
    @State private var error = ""
    @State private var committed = false
    @FocusState private var focused: Bool
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text(NativeL10n.format("%@은 얼마인가요?", NativeL10n.text(category.title))).font(.title2.bold())
                if custom {
                    HStack { TextField("금액", text: $amount).keyboardType(.numberPad).font(.title.bold()).focused($focused).onChange(of: amount) { _, text in amount = NativePayroll.cleanAmount(text); error = "" }; Text("원") }.padding(18).background(NativeColors.background, in: RoundedRectangle(cornerRadius: 14))
                    if !error.isEmpty { Text(LocalizedStringKey(error)).font(.caption).foregroundStyle(.red) }
                    Button("이 금액으로 저장") { commit() }.buttonStyle(.borderedProminent).tint(NativeColors.blue).frame(maxWidth: .infinity)
                } else {
                    if let automatic {
                        option("입사일에 맞춰 자동 계산", subtitle: NativePayroll.money(Double(automatic))) { onSave(automatic, true); dismiss() }
                    }
                    if current > 0 && current != 70000 { option("현재 금액 유지", subtitle: NativePayroll.money(Double(current))) { onSave(current, automatic != nil && usingAutomatic); dismiss() } }
                    option("70,000원", subtitle: "") { onSave(70000, false); dismiss() }
                    option("직접 입력", subtitle: "다른 금액 설정") { custom = true; focused = true }
                }
                Spacer(minLength: 0)
            }.padding(24).navigationTitle(category.title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { if custom { commit() } else { dismiss() } } } }
                .onAppear { amount = current > 0 ? String(current) : "" }
                .onDisappear { if custom && !committed, let value = NativePayroll.amount(amount.isEmpty ? "0" : amount) { onSave(value, false) } }
        }.interactiveDismissDisabled(custom && NativePayroll.amount(amount.isEmpty ? "0" : amount) == nil).presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
    private func option(_ title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { HStack { Text(LocalizedStringKey(title)).fontWeight(.medium); Spacer(); if !subtitle.isEmpty { Text(LocalizedStringKey(subtitle)).font(.caption).foregroundStyle(.secondary) }; Image(systemName: "chevron.right").font(.caption) }.padding(17).background(NativeColors.background, in: RoundedRectangle(cornerRadius: 14)) }.buttonStyle(.plain)
    }
    private func commit() { guard let value = NativePayroll.amount(amount.isEmpty ? "0" : amount) else { error = "0원부터 10억 원까지 입력해 주세요."; return }; committed = true; onSave(value, false); dismiss() }
}

private enum NativeTaxKind: String, Identifiable { case salary, bonus; var id: String { rawValue }; var title: String { self == .salary ? "급여" : "상여" } }

@MainActor
private func taxBasis(_ title: String, profile: [String: Any], fallback: Double) -> some View {
    let monthly = profile["model"] as? String == "monthly-insurance"
    let value = NativePayroll.number(profile["rate"])
    let rate = profile.isEmpty ? fallback : (profile["rate"] != nil ? value : NativePayroll.number(profile["total"]) / max(1, NativePayroll.number(profile["gross"])))
    return VStack(alignment: .leading, spacing: 5) {
        Text(LocalizedStringKey(title)).font(.subheadline.weight(.semibold))
        if monthly {
            Text("월 보험료 \(NativePayroll.money(NativePayroll.number(profile["fixedInsurance"]))) · 세금 \((NativePayroll.number(profile["taxRate"]) * 100).formatted(.number.precision(.fractionLength(2))))% · 고용보험 \((NativePayroll.number(profile["employmentRate"]) * 100).formatted(.number.precision(.fractionLength(2))))%").font(.caption).foregroundStyle(.secondary)
            if NativePayroll.number(profile["otherFixed"]) > 0 { Text("기타 월 공제 \(NativePayroll.money(NativePayroll.number(profile["otherFixed"])))").font(.caption).foregroundStyle(.secondary) }
        } else {
            Text("\(profile.isEmpty ? "기본 비율" : "등록한 개인 공제율") \((rate * 100).formatted(.number.precision(.fractionLength(2))))% (세금·보험료 포함)").font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct NativeDeductionSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    @State private var kind: NativeTaxKind?
    @State private var reset = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    taxBasis("급여", profile: store.object("shift_payroll_sms_reference_v1"), fallback: 1045860.0 / 5781870.0)
                    Button("급여 문자 등록") { kind = .salary }
                    taxBasis("상여", profile: store.object("shift_bonus_sms_reference_v1"), fallback: 29570.0 / 1224725.0)
                    Button("상여 문자 등록") { kind = .bonus }
                } footer: { Text("문자는 개인 공제 기준에만 사용하며 시급과 수당을 바꾸지 않아요. 실제 공제액이 아닌 예상 금액이에요.") }
                Section { Button("기본 공제 기준으로 되돌리기", role: .destructive) { reset = true } }
            }.navigationTitle("세금·보험료 기준").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("완료") { dismiss() } } }
                .sheet(item: $kind) { item in NativeTaxImportView(kind: item) { profile in store.setObject(item == .salary ? "shift_payroll_sms_reference_v1" : "shift_bonus_sms_reference_v1", profile); store.save() } }
                .confirmationDialog("등록한 개인 공제 기준을 삭제하고 기본 비율을 사용할까요?", isPresented: $reset, titleVisibility: .visible) {
                    Button("기본 기준 사용", role: .destructive) { store.data["shift_payroll_sms_reference_v1"] = NSNull(); store.data["shift_bonus_sms_reference_v1"] = NSNull(); store.save() }
                }
        }
    }
}

private struct NativeTaxImportView: View {
    @Environment(\.dismiss) private var dismiss
    let kind: NativeTaxKind
    let onApply: ([String: Any]) -> Void
    @State private var text = ""
    @State private var profile: [String: Any]?
    @State private var warnings: [String] = []
    @State private var status = ""
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(NativeL10n.format("지급 합계와 공제 합계가 있는 %@ 문자를 붙여넣어 주세요.", NativeL10n.text(kind.title))).font(.headline)
                    Text("시급·수당은 직접 입력한 금액을 사용해요. 문자 원문은 저장하지 않아요.").font(.caption).foregroundStyle(.secondary)
                    if let profile {
                        NativeCard { taxBasis(kind.title, profile: profile, fallback: 0) }
                        ForEach(warnings, id: \.self) { Text(NativeL10n.text($0)).font(.caption).foregroundStyle(.secondary) }
                        Button("이 공제 기준 사용") { onApply(profile); dismiss() }.buttonStyle(.borderedProminent).tint(NativeColors.blue)
                        Button("다시 붙여넣기") { self.profile = nil; status = "" }
                    } else {
                        TextEditor(text: $text).frame(minHeight: 230).padding(8).background(NativeColors.background, in: RoundedRectangle(cornerRadius: 14)).accessibilityLabel("급여 문자 내용")
                        Button("공제 내역 확인") { parse() }.buttonStyle(.borderedProminent).disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    if !status.isEmpty { Text(LocalizedStringKey(status)).font(.caption).foregroundStyle(.red) }
                }.padding(24)
            }.navigationTitle("\(kind.title) 문자 등록").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { text = ""; dismiss() } } }
                .onDisappear { text = "" }
        }
    }
    private func parse() {
        let raw = text; text = ""; status = ""
        guard let parsed = NativeLogic.shared.call("PayrollSMS.parse", args: [raw, ["kind": kind.rawValue, "taxOnly": true]]) as? [String: Any],
              let parsedProfile = parsed["profile"] as? [String: Any],
              let minimal = NativeLogic.shared.call("PayrollEstimate.minimalProfile", args: [parsedProfile]) as? [String: Any] else {
            status = "지급 합계와 공제 합계가 함께 있는 한 달치 문자를 확인해 주세요. 기존 공제 기준은 그대로 유지돼요."
            return
        }
        profile = minimal; warnings = parsed["warnings"] as? [String] ?? []
    }
}

struct NativeOnboardingView: View {
    @EnvironmentObject private var store: NativeStore
    @State private var step = 0
    @State private var hireDate = Date()
    @State private var group = "A"
    @State private var wageSheet = false
    @State private var float = false
    @State private var prepared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    HStack(spacing: 7) { ForEach(0..<3) { index in Capsule().fill(index <= step ? NativeColors.blue : Color.secondary.opacity(0.14)).frame(width: index == step ? 28 : 8, height: 8) } }.padding(.top, 22)
                    ZStack {
                        Circle().fill(NativeColors.blue.opacity(0.07)).frame(width: 168, height: 168)
                        Circle().fill(Color.orange.opacity(0.12)).frame(width: 90, height: 90).offset(x: 53, y: -37)
                        Image(systemName: step == 0 ? "calendar.badge.clock" : step == 1 ? "person.3.fill" : "wonsign.circle.fill")
                            .font(.system(size: 70, weight: .light)).foregroundStyle(NativeColors.blue).offset(y: float ? -6 : 6)
                            .symbolEffect(.pulse, options: .repeating, isActive: !reduceMotion)
                    }.frame(height: 190)
                    VStack(spacing: 12) {
                        Text(NativeL10n.text(step == 0 ? "언제 정규직으로 전환했나요?" : step == 1 ? "어느 조에서 근무하시나요?" : "내 급여를 설정해 볼까요?")).font(.title2.bold()).multilineTextAlignment(.center)
                        Text(NativeL10n.text(step == 0 ? "연차와 근속수당을 계산할 때 사용해요." : step == 1 ? "근무조에 맞춰 달력과 알람을 준비해요." : "기본시급, 통상시급, 수당 순서로 입력해요.\n급여 문자는 나중에 등록해도 괜찮아요.")).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    if step == 0 {
                        DatePicker("정규직 전환일", selection: $hireDate, in: ...Date(), displayedComponents: .date).datePickerStyle(.wheel).labelsHidden().environment(\.locale, NativeL10n.locale).environment(\.calendar, NativeDates.calendar).frame(maxHeight: 190)
                    } else if step == 1 {
                        VStack(spacing: 12) { ForEach(["A", "B", "C"], id: \.self) { value in
                            Button { group = value } label: {
                                HStack { Text("\(value)조").font(.headline); Spacer(); Image(systemName: group == value ? "checkmark.circle.fill" : "circle") }.padding(20).foregroundStyle(group == value ? NativeColors.blue : Color.primary).background(group == value ? NativeColors.blue.opacity(0.08) : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                            }.buttonStyle(.plain).accessibilityAddTraits(group == value ? .isSelected : [])
                        } }
                    } else {
                        VStack(spacing: 14) { Label("시급은 직접 입력", systemImage: "pencil"); Label("수당은 선택 후 하나씩", systemImage: "checklist"); Label("입력 내용은 나중에 수정 가능", systemImage: "slider.horizontal.3") }.font(.subheadline).frame(maxWidth: .infinity, alignment: .leading).padding(22).background(.background, in: RoundedRectangle(cornerRadius: 18))
                    }
                    Button {
                        if step < 2 { withAnimation { step += 1 } }
                        else { saveIntroduction(); wageSheet = true }
                    } label: { Text(NativeL10n.text(step == 2 ? "시급·수당 입력하기" : "다음")).fontWeight(.semibold).frame(maxWidth: .infinity).frame(height: 52) }.buttonStyle(.borderedProminent).tint(NativeColors.blue)
                    if step > 0 { Button("이전") { withAnimation { step -= 1 } }.font(.subheadline) }
                }.padding(24)
            }.background(NativeColors.background)
                .navigationTitle("근무 루틴 시작하기").navigationBarTitleDisplayMode(.inline)
                .onAppear {
                    if !prepared { prepared = true; if let saved = store.config["hireDate"] as? String, let date = NativeDates.date(saved) { hireDate = date }; group = store.group }
                    if !reduceMotion { withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) { float = true } }
                }
                .sheet(isPresented: $wageSheet) { NativeWageSettingsView(onComplete: { store.completeOnboarding() }) }
        }
    }
    private func saveIntroduction() {
        let key = NativeDates.key(hireDate)
        var changes: [String: Any] = ["hireDate": key, "applyRetroPay": NativeDates.calendar.component(.year, from: hireDate) < 2020]
        if store.config["hireDate"] as? String != key { changes["leaveByYear"] = [String: Double](); changes["leaveManualYears"] = [String: Bool]() }
        store.updateConfig(changes); store.group = group; store.save()
    }
}

// Calendar-year grants, monthly accrual, previous-year use, and first-anniversary
// expiry follow calculateFiscalYearLeave from the original app.
@MainActor
enum NativeLeaveMetrics {
    struct Result {
        let automatic: Double
        let total: Double
        let used: Double
        let monthlyGenerated: Int
        let manual: Bool
        let description: String
        var remaining: Double { max(0, total - used) }
    }
    static func calculate(store: NativeStore, year: Int, asOf: Date = Date()) -> Result {
        calculate(config: store.config, overrides: store.object("shift_overrides_" + store.group), year: year, asOf: asOf)
    }
    static func calculate(config: [String: Any], overrides: [String: Any], year: Int, asOf: Date = Date()) -> Result {
        let calendar = NativeDates.calendar
        let jan1 = calendar.date(from: DateComponents(year: year, month: 1, day: 1))!
        let yearEnd = calendar.date(from: DateComponents(year: year, month: 12, day: 31))!
        let cutoff = min(calendar.startOfDay(for: asOf), yearEnd)
        func units(_ value: Any) -> Double { let type = value as? String ?? ""; return type == "LEAVE" ? 1 : ["HALF_PRE", "HALF_POST", "HALF_LEAVE"].contains(type) ? 0.5 : 0 }
        let used = overrides.filter { $0.key.hasPrefix("\(year)-") }.reduce(0.0) { $0 + units($1.value) }
        var automatic = 0.0, monthlyGenerated = 0
        var description = "정규직 전환일을 입력하면 연차를 자동으로 계산해요."
        if let hireKey = config["hireDate"] as? String, let hire = NativeDates.date(hireKey) {
            description = "아직 연차 발생 전이에요."
            if hire <= cutoff && cutoff >= jan1 {
                let hired = calendar.dateComponents([.year, .month, .day], from: hire)
                let hireYear = hired.year!, hireMonth = hired.month!, hireDay = hired.day!
                func due(_ months: Int) -> Date {
                    let first = calendar.date(byAdding: .month, value: months, to: calendar.date(from: DateComponents(year: hireYear, month: hireMonth, day: 1))!)!
                    let last = calendar.range(of: .day, in: .month, for: first)!.count
                    return calendar.date(byAdding: .day, value: min(hireDay, last + 1) - 1, to: first)!
                }
                let anniversary = due(12)
                let grants = (1...11).map(due).filter { $0 <= cutoff }
                let tenure = year - hireYear
                var regular = 0.0
                if tenure == 1 {
                    let hireYearStart = calendar.date(from: DateComponents(year: hireYear, month: 1, day: 1))!
                    let nextYear = calendar.date(from: DateComponents(year: hireYear + 1, month: 1, day: 1))!
                    let days = Double(calendar.dateComponents([.day], from: hireYearStart, to: nextYear).day!)
                    let worked = Double(calendar.dateComponents([.day], from: hire, to: jan1).day!)
                    regular = (15 * worked / days * 10).rounded() / 10
                } else if tenure > 1 { regular = Double(min(25, 15 + max(0, (tenure - 2) / 2))) }
                var priorUsed = 0.0, usedBeforeExpiry = 0.0
                for (key, value) in overrides {
                    guard let date = NativeDates.date(key), date >= hire && date < anniversary else { continue }
                    if date < jan1 { priorUsed += units(value) }
                    else if date <= cutoff { usedBeforeExpiry += units(value) }
                }
                let priorGrants = grants.filter { $0 < jan1 }.count
                let carry = max(0, Double(priorGrants) - priorUsed)
                let earned = grants.filter { $0 >= jan1 }.count
                let monthlyPool = carry + Double(earned)
                let monthly = cutoff >= anniversary ? min(monthlyPool, usedBeforeExpiry) : monthlyPool
                automatic = ((regular + monthly) * 10).rounded() / 10
                monthlyGenerated = tenure <= 1 ? grants.count : 0
                description = "\(NativeDates.key(cutoff).replacingOccurrences(of: "-", with: ".")) 기준 · 개근 가정"
                if regular > 0 { description += tenure == 1 ? " · 회계연도 비례 \(NativePayroll.quantity(regular))일 (재직일수 추정)" : " · 회계연도 부여 \(NativePayroll.quantity(regular))일" }
                if cutoff < anniversary { description += " · 월별 발생 누적 \(grants.count)일"; if priorGrants > 0 { description += " (전년도 사용 \(NativePayroll.quantity(min(priorUsed, Double(priorGrants))))일 반영)" } }
                else if tenure <= 1 { description += " · 1년 미만 미사용분은 첫 1년 종료 시 소멸" }
            }
        }
        let perYear = config["leaveByYear"] as? [String: Any] ?? [:]
        let manualYears = config["leaveManualYears"] as? [String: Any] ?? [:]
        let stored = perYear[String(year)]
        let legacyZero = NativePayroll.number(stored) == 0 && manualYears[String(year)] as? Bool != true && monthlyGenerated > 0
        let manual = stored != nil && !legacyZero
        return Result(automatic: automatic, total: manual ? NativePayroll.number(stored) : automatic, used: used, monthlyGenerated: monthlyGenerated, manual: manual, description: description)
    }
}

struct NativeLeaveSettingsView: View {
    @EnvironmentObject private var store: NativeStore
    @Environment(\.dismiss) private var dismiss
    @State private var year = NativeDates.calendar.component(.year, from: Date())
    @State private var hireDate = Date()
    @State private var hireEditor = false
    @State private var total = ""
    @State private var validation = ""
    private var result: NativeLeaveMetrics.Result { NativeLeaveMetrics.calculate(store: store, year: year) }
    var body: some View {
        let result = result
        ScrollView {
            VStack(spacing: 18) {
                HStack { Button { changeYear(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }; Spacer(); Text("\(String(year))년").font(.headline); Spacer(); Button { changeYear(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) } }
                NativeCard {
                    VStack(alignment: .leading, spacing: 20) {
                        HStack { Text("남은 연차").font(.headline); Spacer(); Text(NativeL10n.days(NativePayroll.quantity(result.remaining))).font(.title.bold()).foregroundStyle(NativeColors.blue) }
                        HStack { stat("총 연차", result.total); Divider(); stat("사용", result.used); Divider(); stat("남음", result.remaining) }.frame(height: 50)
                        Text(NativeL10n.text(result.manual ? "직접 입력한 총 연차를 적용 중이에요." : result.description)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                NativeCard {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("연차 기준").font(.headline)
                        Button { hireDate = NativeDates.date(store.config["hireDate"] as? String ?? "") ?? Date(); hireEditor = true } label: { HStack { Text("정규직 전환일"); Spacer(); Text(store.config["hireDate"] as? String ?? "설정하기").foregroundStyle(.secondary); Image(systemName: "chevron.right").font(.caption) } }.font(.subheadline)
                        Divider()
                        HStack { Text("\(String(year))년 총 연차"); Spacer(); TextField("0", text: $total).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 90).accessibilityLabel("총 연차"); Text("일") }.font(.subheadline)
                        if !validation.isEmpty { Text(LocalizedStringKey(validation)).font(.caption).foregroundStyle(.red) }
                        Button("입력한 연차 저장", action: saveTotal).buttonStyle(.borderedProminent).tint(NativeColors.blue)
                        if result.manual { Button("자동 계산으로 되돌리기", action: restoreAutomatic).font(.subheadline) }
                    }
                }
                NativeCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("미사용 연차수당 예상").font(.headline)
                        HStack { Text("1일 기준").foregroundStyle(.secondary); Spacer(); Text(NativePayroll.money(NativePayroll.number(store.config["ordinaryHourly"]) * 8)) }
                        HStack { Text("남은 연차 기준").foregroundStyle(.secondary); Spacer(); Text(NativePayroll.money(result.remaining * NativePayroll.number(store.config["ordinaryHourly"]) * 8)).fontWeight(.semibold) }
                        Text("통상시급 × 8시간 × 남은 연차로 예상해요. 실제 지급 조건과 금액은 회사 기준에 따라 달라질 수 있어요.").font(.caption).foregroundStyle(.secondary)
                    }.font(.subheadline)
                }
            }.padding(16)
        }.background(NativeColors.background).navigationTitle("연차 설정").navigationBarTitleDisplayMode(.inline)
            .onAppear { total = NativePayroll.quantity(result.total) }
            .sheet(isPresented: $hireEditor) {
                NavigationStack {
                    VStack(spacing: 20) {
                        Text("정규직 전환일").font(.title2.bold())
                        DatePicker("정규직 전환일", selection: $hireDate, in: ...Date(), displayedComponents: .date).datePickerStyle(.wheel).labelsHidden().environment(\.locale, NativeL10n.locale).environment(\.calendar, NativeDates.calendar)
                        Text("날짜를 변경하면 연도별로 직접 설정한 연차를 초기화하고 자동으로 다시 계산해요.").font(.caption).foregroundStyle(.secondary)
                        Button("이 날짜로 저장") { saveHireDate(); hireEditor = false }.buttonStyle(.borderedProminent)
                    }.padding(24).toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { hireEditor = false } } }
                }.presentationDetents([.medium, .large])
            }
    }
    private func stat(_ label: String, _ value: Double) -> some View { VStack(spacing: 6) { Text(LocalizedStringKey(label)).font(.caption).foregroundStyle(.secondary); Text(NativeL10n.days(NativePayroll.quantity(value))).font(.subheadline.weight(.semibold)) }.frame(maxWidth: .infinity) }
    private func changeYear(_ amount: Int) { year += amount; validation = ""; total = NativePayroll.quantity(result.total) }
    private func saveTotal() {
        guard let value = Double(total.replacingOccurrences(of: ",", with: "")), value.isFinite, (0...366).contains(value) else { validation = "연차는 0일부터 366일 사이로 입력해 주세요."; return }
        if value == result.automatic { restoreAutomatic(); return }
        var config = store.config, byYear = config["leaveByYear"] as? [String: Any] ?? [:], manual = config["leaveManualYears"] as? [String: Any] ?? [:]
        byYear[String(year)] = value; manual[String(year)] = true
        config["leaveByYear"] = byYear; config["leaveManualYears"] = manual
        store.setObject("shift_salary_config_master", config); store.save(); validation = ""; total = NativePayroll.quantity(value)
    }
    private func restoreAutomatic() {
        var config = store.config, byYear = config["leaveByYear"] as? [String: Any] ?? [:], manual = config["leaveManualYears"] as? [String: Any] ?? [:]
        byYear.removeValue(forKey: String(year)); manual.removeValue(forKey: String(year))
        config["leaveByYear"] = byYear; config["leaveManualYears"] = manual
        store.setObject("shift_salary_config_master", config); store.save(); total = NativePayroll.quantity(result.total); validation = ""
    }
    private func saveHireDate() {
        let key = NativeDates.key(hireDate)
        guard key != store.config["hireDate"] as? String else { return }
        store.updateConfig(["hireDate": key, "leaveByYear": [String: Double](), "leaveManualYears": [String: Bool](), "applyRetroPay": NativeDates.calendar.component(.year, from: hireDate) < 2020]); store.save(); total = NativePayroll.quantity(result.total)
    }
}
