import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { AvailabilityStatus } from "@workadventure/messages";
import type { CalendarApiEvent } from "../../../common/Calendar";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An all-day date ("2026-11-17") is a day of the user, so local midnight; anything else is an instant. */
function parseDate(value: string): Date | undefined {
    const day = DATE_ONLY.exec(value);
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The events of the native agenda panel, keyed by id. A private event comes without a title: it is named with
 * `privateTitle`. An event whose dates cannot be read is dropped.
 */
export function toCalendarEvents(
    events: readonly CalendarApiEvent[],
    privateTitle: string,
): Map<string, CalendarEventInterface> {
    const result = new Map<string, CalendarEventInterface>();
    for (const event of events) {
        const start = parseDate(event.start);
        const end = parseDate(event.end);
        if (!start || !end) continue;
        result.set(event.id, {
            id: event.id,
            title: event.private ? privateTitle : event.title,
            description: event.description,
            start,
            end,
            allDay: event.allDay,
            ...(event.joinUrl ? { resource: { onlineMeeting: { joinUrl: event.joinUrl } } } : {}),
        });
    }
    return result;
}

/** The busy meeting going on at `now` (end excluded), if any. A free slot or an all-day event does not count. */
export function currentBusyMeetingId(events: readonly CalendarApiEvent[], now: Date): string | undefined {
    return events.find((event) => {
        if (!event.busy || event.allDay) return false;
        const start = parseDate(event.start);
        const end = parseDate(event.end);
        return start !== undefined && end !== undefined && start <= now && now < end;
    })?.id;
}

export interface BusyStatusState {
    /** The busy status of the user was set by the calendar, and is given back at the end of the meetings. */
    setByCalendar: boolean;
    /** The meeting already handled: once the user changed their status during it, it is not set again. */
    handledMeetingId: string | undefined;
}

/**
 * The status the calendar sets, from the option, the meeting going on and the current status. Only an online user is
 * turned busy, and only the busy status the calendar set itself is given back: do not disturb, away, or a status the
 * user picked are never overridden. A status the user changes during a meeting is left alone until the next one.
 */
export function decideBusyStatus(input: {
    enabled: boolean;
    meetingId: string | undefined;
    current: AvailabilityStatus;
    state: BusyStatusState;
}): { change: AvailabilityStatus | undefined; state: BusyStatusState } {
    const { enabled, meetingId, current, state } = input;
    if (state.setByCalendar) {
        if (current !== AvailabilityStatus.BUSY) {
            return { change: undefined, state: { setByCalendar: false, handledMeetingId: state.handledMeetingId } };
        }
        if (!enabled || meetingId === undefined) {
            return {
                change: AvailabilityStatus.ONLINE,
                state: { setByCalendar: false, handledMeetingId: state.handledMeetingId },
            };
        }
        return { change: undefined, state };
    }
    if (
        enabled &&
        meetingId !== undefined &&
        meetingId !== state.handledMeetingId &&
        current === AvailabilityStatus.ONLINE
    ) {
        return { change: AvailabilityStatus.BUSY, state: { setByCalendar: true, handledMeetingId: meetingId } };
    }
    return { change: undefined, state };
}
