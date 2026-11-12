import { afterEach, describe, expect, it } from "vitest";
import { AvailabilityStatus } from "@workadventure/messages";
import type { CalendarApiEvent } from "../../../src/common/Calendar";
import {
    decideBusyStatus,
    currentBusyMeetingIds,
    mergeRefreshedEvents,
    toCalendarEvents,
} from "../../../src/front/external-modules/infogene-calendar/calendarEvents";
import {
    loadBusyState,
    saveBusyState,
} from "../../../src/front/external-modules/infogene-calendar/calendarModuleState";

const meeting: CalendarApiEvent = {
    id: "s1:revue:2026-11-19T13:00:00.000Z",
    title: "Revue de sprint",
    description: "Ordre du jour",
    start: "2026-11-19T13:00:00.000Z",
    end: "2026-11-19T14:00:00.000Z",
    allDay: false,
    busy: true,
    private: false,
    joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc",
};
const leave: CalendarApiEvent = {
    ...meeting,
    id: "s1:conges:2026-11-17",
    title: "Congés",
    start: "2026-11-17",
    end: "2026-11-18",
    allDay: true,
    joinUrl: undefined,
};
const lunch: CalendarApiEvent = {
    ...meeting,
    id: "s1:dejeuner:2026-11-19T11:00:00.000Z",
    title: "Déjeuner",
    start: "2026-11-19T11:00:00.000Z",
    end: "2026-11-19T12:30:00.000Z",
    busy: false,
    joinUrl: undefined,
};
const doctor: CalendarApiEvent = {
    ...meeting,
    id: "s1:medecin:2026-11-20T15:00:00.000Z",
    title: "",
    description: "",
    start: "2026-11-20T15:00:00.000Z",
    end: "2026-11-20T16:00:00.000Z",
    private: true,
    joinUrl: undefined,
};

describe("mergeRefreshedEvents", () => {
    const otherCalendarMeeting: CalendarApiEvent = {
        ...meeting,
        id: "s2:point:2026-11-19T15:00:00.000Z",
        start: "2026-11-19T15:00:00.000Z",
        end: "2026-11-19T16:00:00.000Z",
    };

    it("keeps the meeting of a calendar that could not be read this time, so the user stays busy", () => {
        const kept = mergeRefreshedEvents([meeting, otherCalendarMeeting], [otherCalendarMeeting], ["s1"]);

        expect(kept.map((event) => event.id)).toEqual([otherCalendarMeeting.id, meeting.id]);
        expect(currentBusyMeetingIds(kept, new Date("2026-11-19T13:30:00.000Z"))).toEqual([meeting.id]);
    });

    it("replaces the events of a calendar read again: a cancelled meeting goes away", () => {
        const kept = mergeRefreshedEvents([meeting, lunch], [lunch], []);

        expect(kept).toEqual([lunch]);
    });

    it("keeps only the events of the failed calendar, not of a calendar whose id starts the same", () => {
        const tenthCalendarMeeting: CalendarApiEvent = { ...meeting, id: "s10:revue:2026-11-19T13:00:00.000Z" };

        const kept = mergeRefreshedEvents([meeting, tenthCalendarMeeting], [], ["s1"]);

        expect(kept).toEqual([meeting]);
    });
});

const availabilityTitle = (availability: string, calendar: string) => `${calendar} · ${availability}`;

describe("toCalendarEvents", () => {
    it("keeps the meeting room key and the reminder lead of a meeting from the Mac", () => {
        const fromMac: CalendarApiEvent = {
            ...meeting,
            id: "mac:daily:2026-11-19T13:00:00.000Z",
            meetingKey: "a".repeat(64),
            alarmMinutesBefore: 15,
        };

        const event = toCalendarEvents([fromMac], "Occupé", availabilityTitle).get(fromMac.id);

        expect(event?.resource?.meetingKey).toBe("a".repeat(64));
        expect(event?.resource?.alarmMinutesBefore).toBe(15);
        expect(event?.resource?.onlineMeeting?.joinUrl).toBe(meeting.joinUrl);
    });

    it("names a slot of an availability-only calendar after its calendar and status, not Outlook's label", () => {
        const slot: CalendarApiEvent = {
            ...meeting,
            id: "s2:slot:2026-11-17T08:15:00.000Z",
            title: "Provisoire",
            description: "",
            joinUrl: undefined,
            availability: "tentative",
            calendar: "Emeria",
        };

        expect(toCalendarEvents([slot], "Occupé", availabilityTitle).get(slot.id)?.title).toBe("Emeria · tentative");
    });

    const events = toCalendarEvents([meeting, leave, lunch, doctor], "Occupé", availabilityTitle);

    it("keys the events by id and turns the instants into dates", () => {
        expect([...events.keys()]).toEqual([meeting.id, leave.id, lunch.id, doctor.id]);
        const review = events.get(meeting.id);
        expect(review?.start).toEqual(new Date("2026-11-19T13:00:00.000Z"));
        expect(review?.end).toEqual(new Date("2026-11-19T14:00:00.000Z"));
        expect(review?.allDay).toBe(false);
        expect(review?.title).toBe("Revue de sprint");
        expect(review?.description).toBe("Ordre du jour");
    });

    it("gives the Teams link to the join button", () => {
        expect(events.get(meeting.id)?.resource?.onlineMeeting?.joinUrl).toBe(meeting.joinUrl);
        expect(events.get(lunch.id)?.resource).toBeUndefined();
    });

    it("places an all-day event on the local day, from midnight to the next midnight", () => {
        const day = events.get(leave.id);
        expect(day?.allDay).toBe(true);
        expect(day?.start).toEqual(new Date(2026, 10, 17));
        expect(day?.end).toEqual(new Date(2026, 10, 18));
    });

    it("names a private event with the given label only", () => {
        expect(events.get(doctor.id)?.title).toBe("Occupé");
        expect(events.get(doctor.id)?.description).toBe("");
    });

    it("drops an event whose dates cannot be read", () => {
        expect(toCalendarEvents([{ ...meeting, start: "plus tard" }], "Occupé", availabilityTitle).size).toBe(0);
    });
});

describe("currentBusyMeetingIds", () => {
    const list = [meeting, leave, lunch];
    const overlapping: CalendarApiEvent = {
        ...meeting,
        id: "s2:point:2026-11-19T13:30:00.000Z",
        title: "Point client",
        start: "2026-11-19T13:30:00.000Z",
        end: "2026-11-19T14:30:00.000Z",
    };

    it("names the busy meetings in progress, end excluded", () => {
        expect(currentBusyMeetingIds(list, new Date("2026-11-19T13:00:00.000Z"))).toEqual([meeting.id]);
        expect(currentBusyMeetingIds(list, new Date("2026-11-19T13:59:59.000Z"))).toEqual([meeting.id]);
        expect(currentBusyMeetingIds(list, new Date("2026-11-19T14:00:00.000Z"))).toEqual([]);
    });

    it("names every meeting of an overlap", () => {
        expect(currentBusyMeetingIds([overlapping, meeting], new Date("2026-11-19T13:45:00.000Z"))).toEqual([
            overlapping.id,
            meeting.id,
        ]);
    });

    it("ignores a slot marked free and an all-day event", () => {
        expect(currentBusyMeetingIds(list, new Date("2026-11-19T11:30:00.000Z"))).toEqual([]);
        expect(currentBusyMeetingIds(list, new Date(2026, 10, 17, 10, 0))).toEqual([]);
    });
});

describe("decideBusyStatus", () => {
    const idle = { setByCalendar: false, handledMeetingIds: [] };
    const base = { enabled: true, meetingIds: ["m1"], requested: null, state: idle };
    const busyByCalendar = { setByCalendar: true, handledMeetingIds: ["m1"] };
    const busy = { ...base, requested: AvailabilityStatus.BUSY, state: busyByCalendar };

    it("turns a user with no requested status busy when a meeting starts, and remembers it did", () => {
        expect(decideBusyStatus(base)).toEqual({ change: AvailabilityStatus.BUSY, state: busyByCalendar });
    });

    it("does nothing while the option is off, or out of a meeting", () => {
        expect(decideBusyStatus({ ...base, enabled: false })).toEqual({ change: undefined, state: idle });
        expect(decideBusyStatus({ ...base, meetingIds: [] })).toEqual({ change: undefined, state: idle });
    });

    it("never overrides do not disturb, back in a moment or a busy status the user requested", () => {
        for (const requested of [
            AvailabilityStatus.DO_NOT_DISTURB,
            AvailabilityStatus.BACK_IN_A_MOMENT,
            AvailabilityStatus.BUSY,
        ]) {
            expect(decideBusyStatus({ ...base, requested })).toEqual({ change: undefined, state: idle });
        }
    });

    it("keeps the busy status it set while meetings go on, back to back included", () => {
        expect(decideBusyStatus(busy)).toEqual({ change: undefined, state: busyByCalendar });
        expect(decideBusyStatus({ ...busy, meetingIds: ["m2"] })).toEqual({
            change: undefined,
            state: { setByCalendar: true, handledMeetingIds: ["m2"] },
        });
    });

    it("puts the user back online at the end, only if it set the busy status itself", () => {
        expect(decideBusyStatus({ ...busy, meetingIds: [] })).toEqual({
            change: AvailabilityStatus.ONLINE,
            state: idle,
        });
        expect(decideBusyStatus({ ...base, meetingIds: [], requested: AvailabilityStatus.BUSY })).toEqual({
            change: undefined,
            state: idle,
        });
    });

    it("lets the user take over: a status requested by hand is left alone for the meetings going on", () => {
        const tookOver = { setByCalendar: false, handledMeetingIds: ["m1"] };
        expect(decideBusyStatus({ ...busy, requested: null })).toEqual({ change: undefined, state: tookOver });
        expect(decideBusyStatus({ ...busy, requested: AvailabilityStatus.DO_NOT_DISTURB })).toEqual({
            change: undefined,
            state: tookOver,
        });
        expect(decideBusyStatus({ ...base, state: tookOver })).toEqual({ change: undefined, state: tookOver });
        // A meeting that starts after the take-over turns the user busy again.
        expect(decideBusyStatus({ ...base, meetingIds: ["m1", "m2"], state: tookOver })).toEqual({
            change: AvailabilityStatus.BUSY,
            state: { setByCalendar: true, handledMeetingIds: ["m1", "m2"] },
        });
    });

    it("does not turn the user busy again at the end of the first of two overlapping meetings", () => {
        // Busy for m1, then m2 starts during m1, then the user takes over, then m1 ends while m2 goes on.
        const both = decideBusyStatus({ ...busy, meetingIds: ["m1", "m2"] });
        expect(both).toEqual({ change: undefined, state: { setByCalendar: true, handledMeetingIds: ["m1", "m2"] } });
        const tookOver = decideBusyStatus({ ...base, meetingIds: ["m1", "m2"], requested: null, state: both.state });
        expect(tookOver).toEqual({
            change: undefined,
            state: { setByCalendar: false, handledMeetingIds: ["m1", "m2"] },
        });
        expect(decideBusyStatus({ ...base, meetingIds: ["m2"], state: tookOver.state })).toEqual({
            change: undefined,
            state: { setByCalendar: false, handledMeetingIds: ["m2"] },
        });
    });

    it("gives the busy status back when the option is turned off during a meeting", () => {
        expect(decideBusyStatus({ ...busy, enabled: false })).toEqual({
            change: AvailabilityStatus.ONLINE,
            state: { setByCalendar: false, handledMeetingIds: ["m1"] },
        });
    });
});

describe("busy state kept across reloads", () => {
    afterEach(() => localStorage.clear());

    it("keeps every handled meeting", () => {
        saveBusyState({ setByCalendar: true, handledMeetingIds: ["m1", "m2"] });
        expect(loadBusyState()).toEqual({ setByCalendar: true, handledMeetingIds: ["m1", "m2"] });
    });

    it("reads the state written before overlapping meetings were tracked", () => {
        localStorage.setItem(
            "infogeneCalendarBusyState",
            JSON.stringify({ setByCalendar: true, handledMeetingId: "m1" }),
        );
        expect(loadBusyState()).toEqual({ setByCalendar: true, handledMeetingIds: ["m1"] });
    });

    it("forgets an empty state", () => {
        saveBusyState({ setByCalendar: false, handledMeetingIds: [] });
        expect(localStorage.getItem("infogeneCalendarBusyState")).toBeNull();
    });
});
