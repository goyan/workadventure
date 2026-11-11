import EventKit
import Foundation

// Infogene WorkAdventure companion: reads the meetings of the macOS Calendar (Exchange accounts included) and uploads
// them to the game with the personal token created in the game. Runs every two minutes as a LaunchAgent.
// Commands: `authorize` (asks the Calendars access once, run by the installer), `run` (one upload), `status`.

let keychainService = "infogene-wa-companion"
let supportDirectory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/InfogeneCompanion")

func log(_ message: String) {
    // Never titles nor links: the log only says what happened.
    print("\(ISO8601DateFormatter().string(from: Date())) \(message)")
}

func gameUrl() -> URL? {
    guard let data = try? Data(contentsOf: supportDirectory.appendingPathComponent("config.json")),
          let config = try? JSONSerialization.jsonObject(with: data) as? [String: String],
          let url = config["url"]
    else { return nil }
    return URL(string: url)
}

func companionToken() -> String? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
    process.arguments = ["find-generic-password", "-s", keychainService, "-w"]
    let output = Pipe()
    process.standardOutput = output
    process.standardError = Pipe()
    guard (try? process.run()) != nil else { return nil }
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { return nil }
    let token = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines)
    return token?.isEmpty == false ? token : nil
}

func requestAccess(_ store: EKEventStore) -> Bool {
    let done = DispatchSemaphore(value: 0)
    var granted = false
    store.requestFullAccessToEvents { ok, _ in
        granted = ok
        done.signal()
    }
    _ = done.wait(timeout: .now() + 120)
    return granted
}

func calendarItems(_ store: EKEventStore, now: Date) -> [CalendarItem] {
    let predicate = store.predicateForEvents(
        withStart: now.addingTimeInterval(-60 * 60), end: now.addingTimeInterval(36 * 60 * 60), calendars: nil
    )
    return store.events(matching: predicate)
        .filter { $0.status != .canceled }
        .map { event in
            CalendarItem(
                uid: event.calendarItemExternalIdentifier ?? event.eventIdentifier ?? UUID().uuidString,
                title: event.title ?? "",
                start: event.startDate,
                end: event.endDate,
                allDay: event.isAllDay,
                notes: event.notes,
                location: event.location,
                alarmOffsets: (event.alarms ?? []).filter { $0.absoluteDate == nil }.map(\.relativeOffset)
            )
        }
}

func upload(_ body: Data, to base: URL, token: String) -> Int {
    var request = URLRequest(url: base.appendingPathComponent("companion/meetings"))
    request.httpMethod = "PUT"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = body
    request.timeoutInterval = 20
    let done = DispatchSemaphore(value: 0)
    var status = 0
    URLSession.shared.dataTask(with: request) { _, response, _ in
        status = (response as? HTTPURLResponse)?.statusCode ?? 0
        done.signal()
    }.resume()
    _ = done.wait(timeout: .now() + 30)
    return status
}

let command = CommandLine.arguments.dropFirst().first ?? "run"
let store = EKEventStore()

switch command {
case "authorize":
    let granted = requestAccess(store)
    log(granted ? "calendars access granted" : "calendars access refused: allow it in System Settings > Privacy > Calendars")
    exit(granted ? 0 : 1)
case "status":
    let access = EKEventStore.authorizationStatus(for: .event) == .fullAccess
    log("calendars access: \(access ? "yes" : "no"), game: \(gameUrl()?.absoluteString ?? "not set"), token: \(companionToken() == nil ? "missing" : "present")")
case "run":
    guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
        log("no calendars access: run the installer again")
        exit(1)
    }
    guard let base = gameUrl(), let token = companionToken() else {
        log("not configured: run the installer again")
        exit(1)
    }
    let meetings = companionMeetings(calendarItems(store, now: Date()), now: Date())
    let status = upload(try meetingsPayload(meetings), to: base, token: token)
    log("uploaded \(meetings.count) meeting(s): HTTP \(status)")
    if status == 401 { log("the token was revoked in the game: create a new one and run the installer again") }
    exit(status == 204 ? 0 : 1)
default:
    log("unknown command \(command): use authorize, run or status")
    exit(2)
}
