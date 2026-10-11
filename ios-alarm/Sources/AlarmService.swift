@preconcurrency import AlarmKit
import SwiftUI

struct ShiftAlarmMetadata: AlarmMetadata {}

struct AlarmRecord: Codable {
    let id: UUID
    let plan: PlannedAlarm
}

@MainActor
protocol AlarmBackend {
    func currentIDs() throws -> Set<UUID>
    func cancel(id: UUID) throws
    func schedule(id: UUID, plan: PlannedAlarm) async throws
}

@MainActor
final class SystemAlarmBackend: AlarmBackend {
    private let manager = AlarmManager.shared
    func currentIDs() throws -> Set<UUID> { Set(try manager.alarms.map(\.id)) }
    func cancel(id: UUID) throws { try manager.cancel(id: id) }
    func schedule(id: UUID, plan: PlannedAlarm) async throws {
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: plan.title))
        } else {
            alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: plan.title),
                stopButton: AlarmButton(text: "알람 끄기", textColor: .white, systemImageName: "stop.circle"))
        }
        let attributes = AlarmAttributes<ShiftAlarmMetadata>(
            presentation: AlarmPresentation(alert: alert),
            metadata: ShiftAlarmMetadata(), tintColor: .blue)
        let configuration = AlarmManager.AlarmConfiguration<ShiftAlarmMetadata>.alarm(
            schedule: .fixed(plan.date), attributes: attributes)
        _ = try await manager.schedule(id: id, configuration: configuration)
    }
}

@MainActor
final class AlarmService {
    private let backend: AlarmBackend
    private let defaults: UserDefaults
    private let storageKey = "shiftCal.alarmRecords.v1"
    private(set) var records: [String: AlarmRecord]

    init(defaults: UserDefaults = .standard, backend: AlarmBackend? = nil) {
        self.defaults = defaults
        self.backend = backend ?? SystemAlarmBackend()
        records = defaults.data(forKey: storageKey)
            .flatMap { try? JSONDecoder().decode([String: AlarmRecord].self, from: $0) } ?? [:]
    }

    private func save() throws {
        defaults.set(try JSONEncoder().encode(records), forKey: storageKey)
    }

    func reconcile(_ desired: [PlannedAlarm]) async throws {
        let existing = try backend.currentIDs()
        let wanted = Dictionary(uniqueKeysWithValues: desired.map { ($0.key, $0) })
        // Cancel outdated work shifts first. A cancelled/leave date must not ring.
        // Save every change so interrupted runs can resume without duplicates.
        for (key, record) in records.sorted(by: { $0.key < $1.key }) {
            if wanted[key] != record.plan {
                if existing.contains(record.id) { try backend.cancel(id: record.id) }
                records.removeValue(forKey: key)
                try save()
            }
        }
        for plan in desired {
            try Task.checkCancellation()
            if let record = records[plan.key], existing.contains(record.id) { continue }
            let id = records[plan.key]?.id ?? UUID()
            // Persist the ID before scheduling: if the process is killed after the
            // daemon accepts it, the next refresh will recognise that same ID.
            records[plan.key] = AlarmRecord(id: id, plan: plan)
            try save()
            try await backend.schedule(id: id, plan: plan)
        }
    }

    func scheduled() throws -> [PlannedAlarm] {
        let existing = try backend.currentIDs()
        return records.values.filter { existing.contains($0.id) }.map(\.plan).sorted { $0.date < $1.date }
    }

    func clear() throws {
        // AlarmKit returns only this app's alarms. Also clears orphaned records.
        for id in try backend.currentIDs() { try backend.cancel(id: id) }
        records = [:]
        try save()
    }
}
