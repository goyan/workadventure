import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { writable } from "svelte/store";

export const isActivatedStore = writable(false);
export const isCalendarVisibleStore = writable(false);
export const calendarEventsStore = writable(new Map<string, CalendarEventInterface>());

/**
 * How to go to a meeting from its reminder ("Go there": walk to the meeting's room, then offer Teams there). Set by the
 * calendar module that knows the Teams meeting rooms; undefined when none does.
 */
export const goToMeetingStore = writable<((event: CalendarEventInterface) => void) | undefined>(undefined);

/**
 * The meeting key of the user's own taken room their feet stand in, if any: "Go there" is not offered for that meeting
 * then. Set by the calendar module that knows the Teams meeting rooms.
 */
export const meetingKeyHereStore = writable<string | undefined>(undefined);
