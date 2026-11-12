import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { AvailabilityStatus } from "@workadventure/messages";
import type { CalendarApiEvent, CalendarAvailability } from "../../../common/Calendar";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An all-day date ("2026-11-17") is a day of the user, so local midnight; anything else is an instant. */
function parseDate(value: string): Date | undefined {
    const day = DATE_ONLY.exec(value);
    const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The events of the native agenda panel, keyed by id. A private event comes without a title: it is named with
 * `privateTitle`. A slot of an availability-only calendar is named with `availabilityTitle`, from its status and its
 * calendar. An event whose dates cannot be read is dropped.
 */
export function toCalendarEvents(
    events: readonly CalendarApiEvent[],
    privateTitle: string,
    availabilityTitle: (availability: CalendarAvailability, calendar: string) => string,
): Map<string, CalendarEventInterface> {
    const result = new Map<string, CalendarEventInterface>();
    for (const event of events) {
        const start = parseDate(event.start);
        const end = parseDate(event.end);
        if (!start || !end) continue;
        result.set(event.id, {
            id: event.id,
            title: event.private
                ? privateTitle
                : event.availability
                  ? availabilityTitle(event.availability, event.calendar ?? "")
                  : event.title,
            description: event.description,
            start,
            end,
            allDay: event.allDay,
            ...(event.joinUrl || event.meetingKey || event.alarmMinutesBefore !== undefined
                ? {
                      resource: {
                          ...(event.joinUrl ? { onlineMeeting: { joinUrl: event.joinUrl } } : {}),
                          ...(event.meetingKey ? { meetingKey: event.meetingKey } : {}),
                          ...(event.alarmMinutesBefore !== undefined
                              ? { alarmMinutesBefore: event.alarmMinutesBefore }
                              : {}),
                      },
                  }
                : {}),
        });
    }
    return result;
}

/**
 * The events to keep after a refresh: the events read this time, plus the previous events of the calendars that could
 * not be read (an Outlook timeout must not end a meeting, nor empty that calendar in the panel). An event id starts with
 * the id of its calendar and a colon.
 */
export function mergeRefreshedEvents(
    previous: readonly CalendarApiEvent[],
    events: readonly CalendarApiEvent[],
    failedCalendarIds: readonly string[],
): CalendarApiEvent[] {
    const failedPrefixes = failedCalendarIds.map((id) => `${id}:`);
    const keptFromFailed = previous.filter((event) => failedPrefixes.some((prefix) => event.id.startsWith(prefix)));
    return [...events, ...keptFromFailed];
}

/** The busy meetings going on at `now` (end excluded), overlaps included. A free slot or an all-day event does not count. */
export function currentBusyMeetingIds(events: readonly CalendarApiEvent[], now: Date): string[] {
    return events
        .filter((event) => {
            if (!event.busy || event.allDay) return false;
            const start = parseDate(event.start);
            const end = parseDate(event.end);
            return start !== undefined && end !== undefined && start <= now && now < end;
        })
        .map((event) => event.id);
}

export interface BusyStatusState {
    /** The busy status of the user was set by the calendar, and is given back at the end of the meetings. */
    setByCalendar: boolean;
    /**
     * The meetings already handled, among those going on: once the user changed their status during them, they do not
     * set it again. A meeting that starts later does.
     */
    handledMeetingIds: string[];
}

/**
 * The status the calendar requests, from the option, the meetings going on and the status the user requested. The
 * requested status is read, not the displayed one: a bubble or a hidden tab (shown "away") changes what is displayed
 * without the user choosing anything. Only a user with no requested status is turned busy, and only the busy status
 * the calendar set itself is given back: do not disturb, back in a moment, or a busy status the user picked are never
 * overridden. A status the user changes during meetings is left alone until a new meeting starts.
 */
export function decideBusyStatus(input: {
    enabled: boolean;
    meetingIds: readonly string[];
    requested: AvailabilityStatus | null;
    state: BusyStatusState;
}): { change: AvailabilityStatus | undefined; state: BusyStatusState } {
    const { enabled, meetingIds, requested, state } = input;
    // Finished meetings are forgotten; the meetings going on are all handled once the calendar acted on them.
    const handled = state.handledMeetingIds.filter((id) => meetingIds.includes(id));
    const allGoingOn = [...handled, ...meetingIds.filter((id) => !handled.includes(id))];
    if (state.setByCalendar) {
        if (requested !== AvailabilityStatus.BUSY) {
            return { change: undefined, state: { setByCalendar: false, handledMeetingIds: allGoingOn } };
        }
        if (!enabled || meetingIds.length === 0) {
            return { change: AvailabilityStatus.ONLINE, state: { setByCalendar: false, handledMeetingIds: handled } };
        }
        return { change: undefined, state: { setByCalendar: true, handledMeetingIds: allGoingOn } };
    }
    const newMeeting = meetingIds.some((id) => !handled.includes(id));
    if (enabled && newMeeting && requested === null) {
        return { change: AvailabilityStatus.BUSY, state: { setByCalendar: true, handledMeetingIds: allGoingOn } };
    }
    return { change: undefined, state: { setByCalendar: false, handledMeetingIds: handled } };
}
