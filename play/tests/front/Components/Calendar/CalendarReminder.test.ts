import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { get } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";

import {
    askToOpenInTeams,
    canGoToMeeting,
    closeTeamsPrompt,
    dueReminders,
    REMINDER_LEAD_MS,
    REMINDER_LINGER_MS,
    teamsPromptStore,
} from "../../../../src/front/Components/Calendar/CalendarReminder";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const MINUTE = 60 * 1000;

function event(id: string, startsInMs: number, extra: Partial<CalendarEventInterface> = {}): CalendarEventInterface {
    return {
        id,
        title: `Meeting ${id}`,
        description: "",
        start: new Date(NOW.getTime() + startsInMs),
        end: new Date(NOW.getTime() + startsInMs + 30 * MINUTE),
        ...extra,
    };
}

const ids = (events: CalendarEventInterface[]) => events.map((e) => e.id);

describe("dueReminders", () => {
    it("reminds of a meeting from 5 minutes before it starts", () => {
        const due = dueReminders(
            [event("soon", REMINDER_LEAD_MS), event("later", REMINDER_LEAD_MS + MINUTE)],
            new Set(),
            NOW,
        );
        expect(ids(due)).toEqual(["soon"]);
    });

    it("keeps reminding until 10 minutes after the start, for whoever arrives late", () => {
        const due = dueReminders(
            [event("late", -REMINDER_LINGER_MS + MINUTE), event("too-late", -REMINDER_LINGER_MS)],
            new Set(),
            NOW,
        );
        expect(ids(due)).toEqual(["late"]);
    });

    it("stops once the meeting is over, even within those 10 minutes", () => {
        const short = event("short", -8 * MINUTE, { end: new Date(NOW.getTime() - 3 * MINUTE) });
        expect(dueReminders([short], new Set(), NOW)).toEqual([]);
    });

    it("never reminds of a dismissed meeting, an all-day event or a long one", () => {
        const due = dueReminders(
            [
                event("dismissed", MINUTE),
                event("all-day", MINUTE, { allDay: true }),
                event("hackathon", MINUTE, { end: new Date(NOW.getTime() + 4 * 60 * MINUTE) }),
            ],
            new Set(["dismissed"]),
            NOW,
        );
        expect(due).toEqual([]);
    });

    it("shows three reminders at most, the earliest first", () => {
        const due = dueReminders(
            [event("d", 4 * MINUTE), event("b", 2 * MINUTE), event("a", MINUTE), event("c", 3 * MINUTE)],
            new Set(),
            NOW,
        );
        expect(ids(due)).toEqual(["a", "b", "c"]);
    });

    it("reminds as early as the calendar's own alarm asks", () => {
        const withAlarm = event("alarm", 15 * MINUTE, { resource: { alarmMinutesBefore: 15 } });
        const tooEarly = event("too-early", 16 * MINUTE, { resource: { alarmMinutesBefore: 15 } });

        expect(ids(dueReminders([withAlarm, tooEarly], new Set(), NOW))).toEqual(["alarm"]);
    });
});

describe("dueReminders, reminder shown again", () => {
    it("keeps a reminder shown again (walking into the meeting's room) until the meeting ends", () => {
        const started = event("started", -20 * MINUTE);

        expect(ids(dueReminders([started], new Set(), NOW))).toEqual([]);
        expect(ids(dueReminders([started], new Set(), NOW, new Set(["started"])))).toEqual(["started"]);
        expect(ids(dueReminders([started], new Set(), started.end, new Set(["started"])))).toEqual([]);
    });
});

describe("canGoToMeeting", () => {
    it("offers to go to the meeting only for a meeting with a Teams room key, once the module handles it", () => {
        const goTo = () => undefined;
        const withKey = event("mac", MINUTE, { resource: { meetingKey: "a".repeat(64) } });

        expect(canGoToMeeting(withKey, goTo, NOW)).toBe(true);
        expect(canGoToMeeting(event("ics", MINUTE), goTo, NOW)).toBe(false);
        expect(canGoToMeeting(withKey, undefined, NOW)).toBe(false);
    });

    it("keeps offering to go to the meeting until it ends, then stops", () => {
        const goTo = () => undefined;
        const started = event("started", -20 * MINUTE, { resource: { meetingKey: "a".repeat(64) } });

        expect(canGoToMeeting(started, goTo, NOW)).toBe(true);
        expect(canGoToMeeting(started, goTo, new Date(started.end.getTime()))).toBe(false);
    });
});

describe("askToOpenInTeams", () => {
    const joinUrl = "https://teams.microsoft.com/l/meetup-join/abc";
    const teams = event("teams", 0, { resource: { onlineMeeting: { joinUrl } } });

    afterEach(() => closeTeamsPrompt());

    it("asks once, for the latest meeting only", () => {
        askToOpenInTeams(teams, "arrived");
        askToOpenInTeams(teams, "arrived");
        expect(get(teamsPromptStore)).toEqual({ event: teams, reason: "arrived" });

        const other = event("other", 0, { resource: { onlineMeeting: { joinUrl } } });
        askToOpenInTeams(other, "rooms-full");
        expect(get(teamsPromptStore)).toEqual({ event: other, reason: "rooms-full" });
    });

    it("asks nothing for a meeting without a link to open", () => {
        askToOpenInTeams(event("nolink", 0), "teams-only");
        expect(get(teamsPromptStore)).toBeUndefined();
    });

    it("closes the question", () => {
        askToOpenInTeams(teams, "teams-only");
        closeTeamsPrompt();
        expect(get(teamsPromptStore)).toBeUndefined();
    });
});
