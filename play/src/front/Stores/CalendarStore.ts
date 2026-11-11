import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { writable } from "svelte/store";

export const isActivatedStore = writable(false);
export const isCalendarVisibleStore = writable(false);
export const calendarEventsStore = writable(new Map<string, CalendarEventInterface>());

/**
 * How to go to a meeting from its reminder ("Go there": open Teams, then walk to the meeting's room). Set by the
 * calendar module that knows the Teams meeting rooms; undefined when none does.
 */
export const goToMeetingStore = writable<((event: CalendarEventInterface) => void) | undefined>(undefined);
