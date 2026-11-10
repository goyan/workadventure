import { writable } from "svelte/store";
import { z } from "zod";
import type { CalendarSource } from "../../../common/Calendar";
import type { BusyStatusState } from "./calendarEvents";

const BUSY_OPTION_KEY = "infogeneCalendarBusyStatus";
const BUSY_STATE_KEY = "infogeneCalendarBusyState";

// Browser storage can throw (private window, blocked site data): the option then falls back to off, for this page.
function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string | undefined): void {
    try {
        if (value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Not kept: the option and the state stay in memory only.
    }
}

/** The calendars of the user, as the pusher lists them (label and host, never the link). */
export const calendarSourcesStore = writable<CalendarSource[]>([]);

/** The labels of the calendars that could not be read at the last refresh. */
export const failedCalendarsStore = writable<string[]>([]);

function createBusyOptionStore() {
    const { subscribe, set } = writable(read(BUSY_OPTION_KEY) === "true");
    return {
        subscribe,
        set(enabled: boolean): void {
            write(BUSY_OPTION_KEY, enabled ? "true" : undefined);
            set(enabled);
        },
    };
}

/** "Busy during my meetings": off by default, kept in this browser. */
export const busyOptionStore = createBusyOptionStore();

const StoredBusyState = z.object({
    setByCalendar: z.boolean().catch(false),
    handledMeetingId: z.string().optional().catch(undefined),
});

/**
 * Whether the calendar set the busy status itself, kept across reloads: the requested status survives a reload too,
 * and only a busy status the calendar set is given back at the end of a meeting.
 */
export function loadBusyState(): BusyStatusState {
    const raw = read(BUSY_STATE_KEY);
    if (!raw) return { setByCalendar: false, handledMeetingId: undefined };
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return { setByCalendar: false, handledMeetingId: undefined };
    }
    const parsed = StoredBusyState.safeParse(json);
    return parsed.success
        ? { setByCalendar: parsed.data.setByCalendar, handledMeetingId: parsed.data.handledMeetingId }
        : { setByCalendar: false, handledMeetingId: undefined };
}

export function saveBusyState(state: BusyStatusState): void {
    write(BUSY_STATE_KEY, state.setByCalendar || state.handledMeetingId ? JSON.stringify(state) : undefined);
}

/** Asks the module to read the calendars again (after an addition or a deletion); replaced by the module at init. */
export const calendarRefresh = { request: (): void => undefined };
