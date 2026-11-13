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
 * The meetings "Go there" is not offered for, by event id: the Teams room the player stands in already serves them (its
 * meeting, or the next meeting of the user taking it over). Set by the calendar module that knows the rooms.
 */
export const goToHiddenStore = writable<ReadonlySet<string>>(new Set());
