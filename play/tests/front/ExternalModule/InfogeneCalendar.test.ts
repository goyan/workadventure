import { describe, expect, it } from "vitest";
import { AvailabilityStatus } from "@workadventure/messages";
import type { CalendarApiEvent } from "../../../src/common/Calendar";
import {
    decideBusyStatus,
    currentBusyMeetingId,
    toCalendarEvents,
} from "../../../src/front/external-modules/infogene-calendar/calendarEvents";

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

describe("toCalendarEvents", () => {
    const events = toCalendarEvents([meeting, leave, lunch, doctor], "Occupé");

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
        expect(toCalendarEvents([{ ...meeting, start: "plus tard" }], "Occupé").size).toBe(0);
    });
});

describe("currentBusyMeeting", () => {
    const list = [meeting, leave, lunch];

    it("names the busy meeting in progress, end excluded", () => {
        expect(currentBusyMeetingId(list, new Date("2026-11-19T13:00:00.000Z"))).toBe(meeting.id);
        expect(currentBusyMeetingId(list, new Date("2026-11-19T13:59:59.000Z"))).toBe(meeting.id);
        expect(currentBusyMeetingId(list, new Date("2026-11-19T14:00:00.000Z"))).toBeUndefined();
    });

    it("ignores a slot marked free and an all-day event", () => {
        expect(currentBusyMeetingId(list, new Date("2026-11-19T11:30:00.000Z"))).toBeUndefined();
        expect(currentBusyMeetingId(list, new Date(2026, 10, 17, 10, 0))).toBeUndefined();
    });
});

describe("decideBusyStatus", () => {
    const idle = { setByCalendar: false, handledMeetingId: undefined };
    const base = { enabled: true, meetingId: "m1", requested: null, state: idle };
    const busyByCalendar = { setByCalendar: true, handledMeetingId: "m1" };
    const busy = { ...base, requested: AvailabilityStatus.BUSY, state: busyByCalendar };

    it("turns a user with no requested status busy when a meeting starts, and remembers it did", () => {
        expect(decideBusyStatus(base)).toEqual({ change: AvailabilityStatus.BUSY, state: busyByCalendar });
    });

    it("does nothing while the option is off, or out of a meeting", () => {
        expect(decideBusyStatus({ ...base, enabled: false })).toEqual({ change: undefined, state: idle });
        expect(decideBusyStatus({ ...base, meetingId: undefined })).toEqual({ change: undefined, state: idle });
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
        expect(decideBusyStatus({ ...busy, meetingId: "m2" })).toEqual({ change: undefined, state: busyByCalendar });
    });

    it("puts the user back online at the end, only if it set the busy status itself", () => {
        expect(decideBusyStatus({ ...busy, meetingId: undefined })).toEqual({
            change: AvailabilityStatus.ONLINE,
            state: { setByCalendar: false, handledMeetingId: "m1" },
        });
        expect(decideBusyStatus({ ...base, meetingId: undefined, requested: AvailabilityStatus.BUSY })).toEqual({
            change: undefined,
            state: idle,
        });
    });

    it("lets the user take over: a status requested by hand is left alone for the rest of that meeting", () => {
        const tookOver = { setByCalendar: false, handledMeetingId: "m1" };
        expect(decideBusyStatus({ ...busy, requested: null })).toEqual({ change: undefined, state: tookOver });
        expect(decideBusyStatus({ ...busy, requested: AvailabilityStatus.DO_NOT_DISTURB })).toEqual({
            change: undefined,
            state: tookOver,
        });
        expect(decideBusyStatus({ ...base, state: tookOver })).toEqual({ change: undefined, state: tookOver });
        // The next meeting turns the user busy again.
        expect(decideBusyStatus({ ...base, meetingId: "m2", state: tookOver })).toEqual({
            change: AvailabilityStatus.BUSY,
            state: { setByCalendar: true, handledMeetingId: "m2" },
        });
    });

    it("gives the busy status back when the option is turned off during a meeting", () => {
        expect(decideBusyStatus({ ...busy, enabled: false })).toEqual({
            change: AvailabilityStatus.ONLINE,
            state: { setByCalendar: false, handledMeetingId: "m1" },
        });
    });
});
