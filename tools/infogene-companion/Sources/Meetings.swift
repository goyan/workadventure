import Foundation

/// What the companion reads of a calendar event, independent of EventKit so that it can be tested.
struct CalendarItem {
    let uid: String
    let title: String
    let start: Date
    let end: Date
    let allDay: Bool
    let notes: String?
    let location: String?
    /// Offsets of the event's alarms relative to its start, in seconds (negative: before).
    let alarmOffsets: [TimeInterval]
}

/// A meeting as the game server expects it (`PUT /companion/meetings`).
struct CompanionMeeting: Encodable {
    let uid: String
    let title: String
    let start: String
    let end: String
    let allDay: Bool
    /// EventKit does not tell whether an Exchange event is private.
    let `private`: Bool
    let joinUrl: String?
    let alarmMinutesBefore: Int?
}

private let pastWindow: TimeInterval = 60 * 60
private let futureWindow: TimeInterval = 36 * 60 * 60

private let instantFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
}()

/// The meetings of the window [now - 1 h; now + 36 h], earliest first.
func companionMeetings(_ items: [CalendarItem], now: Date) -> [CompanionMeeting] {
    let from = now.addingTimeInterval(-pastWindow)
    let to = now.addingTimeInterval(futureWindow)
    return items
        .filter { $0.end > from && $0.start < to }
        .sorted { $0.start < $1.start }
        .map { item in
            let firstAlarm = item.alarmOffsets.filter { $0 <= 0 }.max()
            return CompanionMeeting(
                uid: item.uid,
                title: String(item.title.prefix(200)),
                start: instantFormatter.string(from: item.start),
                end: instantFormatter.string(from: item.end),
                allDay: item.allDay,
                private: false,
                joinUrl: teamsLink(in: item.notes) ?? teamsLink(in: item.location),
                alarmMinutesBefore: firstAlarm.map { min(Int((-$0 / 60).rounded()), 1440) }
            )
        }
        .prefix(200)
        .map { $0 }
}

/// The JSON body of an upload: `{ "meetings": [...] }`.
func meetingsPayload(_ meetings: [CompanionMeeting]) throws -> Data {
    struct Payload: Encodable { let meetings: [CompanionMeeting] }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    return try encoder.encode(Payload(meetings: meetings))
}
