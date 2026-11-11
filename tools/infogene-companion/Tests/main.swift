import Foundation

// Throwaway-free test runner: compiled with the sources by Tests/run.sh, exits non-zero at the first failure.
var failures = 0
func check(_ condition: Bool, _ name: String) {
    if condition {
        print("ok   \(name)")
    } else {
        print("FAIL \(name)")
        failures += 1
    }
}

let iso = ISO8601DateFormatter()
let now = iso.date(from: "2026-11-17T10:00:00Z")!

check(
    teamsLink(in: "Réunion Microsoft Teams\n<https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d>\nID")
        == "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d",
    "finds a meetup-join link in the notes"
)
check(teamsLink(in: "Join: https://teams.microsoft.com/meet/123456789?p=abcd then") == "https://teams.microsoft.com/meet/123456789?p=abcd", "finds a short meet link")
check(teamsLink(in: "https://zoom.us/j/1") == nil, "ignores another link")
check(teamsLink(in: nil) == nil, "no notes, no link")

func item(_ uid: String, start: String, end: String, title: String = "Daily", notes: String? = nil, alarms: [TimeInterval] = [], allDay: Bool = false, busy: Bool = true, declined: Bool = false) -> CalendarItem {
    CalendarItem(uid: uid, title: title, start: iso.date(from: start)!, end: iso.date(from: end)!, allDay: allDay, notes: notes, location: nil, alarmOffsets: alarms, busy: busy, declined: declined)
}

let items = [
    item("daily", start: "2026-11-17T10:15:00Z", end: "2026-11-17T10:45:00Z", notes: "https://teams.microsoft.com/meet/1?p=x", alarms: [-900]),
    item("far", start: "2026-11-19T02:00:00Z", end: "2026-11-19T03:00:00Z"),
    item("old", start: "2026-11-17T07:00:00Z", end: "2026-11-17T08:30:00Z"),
]
let meetings = companionMeetings(items, now: now)
check(meetings.map(\.uid) == ["daily"], "keeps the window [now - 1 h; now + 36 h]")
check(meetings.first?.joinUrl == "https://teams.microsoft.com/meet/1?p=x", "carries the Teams link")
check(meetings.first?.alarmMinutesBefore == 15, "turns a -15 min alarm into 15")
check(meetings.first?.private == false, "EventKit tells no privacy: not private")

let payload = String(data: try! meetingsPayload(meetings), encoding: .utf8)!
check(payload.contains("\"start\":\"2026-11-17T10:15:00.000Z\""), "dates in ISO 8601 with milliseconds")
check(payload.hasPrefix("{\"meetings\":["), "payload shape { meetings: [...] }")

let dayOff = companionMeetings([item("off", start: "2026-11-17T00:00:00Z", end: "2026-11-18T00:00:00Z", allDay: true)], now: now)
check(dayOff.first?.allDay == true, "keeps an all-day event as all-day")

let marked = companionMeetings([
    item("free", start: "2026-11-17T12:00:00Z", end: "2026-11-17T13:00:00Z", busy: false),
    item("declined", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z", declined: true),
], now: now)
check(marked.map(\.uid) == ["free"], "drops an invitation the user declined")
check(marked.first?.busy == false, "tells a slot marked free")
let freePayload = String(data: try! meetingsPayload(marked), encoding: .utf8)!
check(freePayload.contains("\"busy\":false"), "sends busy:false for a free slot")
check(!payload.contains("\"busy\""), "omits busy for a busy meeting (the server's default)")

if failures > 0 {
    print("\(failures) failure(s)")
    exit(1)
}
print("all passed")
