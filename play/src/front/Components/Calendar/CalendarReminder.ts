import { get, writable } from "svelte/store";
import type { CalendarEventInterface } from "@workadventure/shared-utils";
import { calendarEventsStore, isCalendarVisibleStore } from "../../Stores/CalendarStore";
import { byStart, isLong } from "./agenda";

/** How long before it starts a meeting gets its reminder. */
export const REMINDER_LEAD_MS = 5 * 60 * 1000;

/** The calendar's own alarm when it gives one (Mac companion), else REMINDER_LEAD_MS. */
export function reminderLeadMs(event: CalendarEventInterface): number {
    const minutes = event.resource?.alarmMinutesBefore;
    return minutes !== undefined ? minutes * 60 * 1000 : REMINDER_LEAD_MS;
}

/** How long after its start the reminder stays: long enough for whoever arrives late to still join. */
export const REMINDER_LINGER_MS = 10 * 60 * 1000;

const MAX_REMINDERS = 3;

const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Reminders the user settled: closed, acted on, or seen in the agenda. Module scope on purpose: MainLayout, the
 * only caller of startCalendarReminders(), is destroyed and remounted on every room-to-room transition, and a set
 * living inside the call would bring every settled reminder back at each door the user walks through.
 */
const dismissed = new Set<string>();

/** Reminders shown again by remindAgain: they stay until their meeting ends. Same lifetime as `dismissed`. */
const shownAgain = new Set<string>();

/** The reminder cards on screen, earliest meeting first. */
export const calendarRemindersStore = writable<CalendarEventInterface[]>([]);

/**
 * The meetings that deserve a reminder now: from REMINDER_LEAD_MS before their start to REMINDER_LINGER_MS after
 * it (or their end, if sooner). All-day and long events never do: they would hold the corner all day.
 */
export function dueReminders(
    events: Iterable<CalendarEventInterface>,
    dismissed: ReadonlySet<string>,
    now: Date,
    /** Reminders shown again on purpose (see remindAgain): due until their meeting ends. */
    shownAgain: ReadonlySet<string> = new Set(),
): CalendarEventInterface[] {
    const time = now.getTime();
    return [...events]
        .filter(
            (event) =>
                !event.allDay &&
                !isLong(event) &&
                !dismissed.has(event.id) &&
                (shownAgain.has(event.id) ||
                    (event.start.getTime() - reminderLeadMs(event) <= time &&
                        time < event.start.getTime() + REMINDER_LINGER_MS)) &&
                time < event.end.getTime(),
        )
        .sort(byStart)
        .slice(0, MAX_REMINDERS);
}

/**
 * Whether the reminder or the agenda offers "Go there": a meeting with a Teams room key (Mac companion), once the module that
 * knows the rooms registered how to go there.
 */
export function canGoToMeeting(
    event: CalendarEventInterface,
    goTo: ((event: CalendarEventInterface) => void) | undefined,
    now: Date = new Date(),
): boolean {
    // Until the meeting ends: a guest arriving late still finds the room.
    return goTo !== undefined && event.resource?.meetingKey !== undefined && now < event.end;
}

/** Shows a settled reminder again (the user walked into a Teams room during that meeting). */
export function remindAgain(event: CalendarEventInterface): void {
    dismissed.delete(event.id);
    shownAgain.add(event.id);
    calendarRemindersStore.update((reminders) =>
        reminders.some((reminder) => reminder.id === event.id) ? reminders : [...reminders, event],
    );
}

export function dismissReminder(event: CalendarEventInterface): void {
    dismissed.add(event.id);
    shownAgain.delete(event.id);
    calendarRemindersStore.update((reminders) => reminders.filter((reminder) => reminder.id !== event.id));
}

/**
 * Keep the reminder cards in step with the calendar, whatever provider fills it. Returns the function stopping them.
 */
export function startCalendarReminders(): () => void {
    const check = () =>
        calendarRemindersStore.set(dueReminders(get(calendarEventsStore).values(), dismissed, new Date(), shownAgain));

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    // A refresh can bring a meeting into the window, or take a cancelled or moved one out of it.
    const unsubscribeEvents = calendarEventsStore.subscribe(check);
    // The agenda shows the same meetings with the same buttons: once it is open, the reminders have done their job.
    const unsubscribeAgenda = isCalendarVisibleStore.subscribe((visible) => {
        if (visible) get(calendarRemindersStore).forEach(dismissReminder);
    });

    return () => {
        clearInterval(interval);
        unsubscribeEvents();
        unsubscribeAgenda();
    };
}
