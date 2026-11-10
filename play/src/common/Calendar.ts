import { z } from "zod";

/** Same limits as the Admin API, which checks them again. */
export const CALENDAR_LABEL_MAX_LENGTH = 40;
export const CALENDAR_URL_MAX_LENGTH = 2048;

/**
 * An Outlook calendar published as ICS, as the browser sees it: its link is a secret kept (encrypted) by the Admin API
 * and never sent back, only its host is.
 */
export const CalendarSource = z.object({
    id: z.string(),
    label: z.string(),
    host: z.string(),
});
export type CalendarSource = z.infer<typeof CalendarSource>;

export const CalendarSourceList = z.object({ calendars: z.array(CalendarSource) });
export type CalendarSourceList = z.infer<typeof CalendarSourceList>;

/** What the browser sends to add a calendar. */
export const CalendarSourceInput = z.object({
    label: z.string().trim().min(1).max(CALENDAR_LABEL_MAX_LENGTH),
    url: z.string().trim().min(1).max(CALENDAR_URL_MAX_LENGTH),
});
export type CalendarSourceInput = z.infer<typeof CalendarSourceInput>;

/**
 * One occurrence of an event. An all-day event has dates without a time ("2026-11-17", end excluded); the others have
 * ISO instants. A private event comes without its title or description.
 */
export const CalendarApiEvent = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    start: z.string(),
    end: z.string(),
    allDay: z.boolean(),
    /** False for a slot marked "free": it does not make the user busy. */
    busy: z.boolean(),
    private: z.boolean(),
    /** Opened by the browser: an https link only (a "javascript:" URL is a valid URL too). */
    joinUrl: z
        .string()
        .url()
        .refine((url) => url.startsWith("https://"))
        .optional(),
});
export type CalendarApiEvent = z.infer<typeof CalendarApiEvent>;

/** The events of all the calendars of the user, and the calendars that could not be read this time. */
export const CalendarEvents = z.object({
    events: z.array(CalendarApiEvent),
    failed: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type CalendarEvents = z.infer<typeof CalendarEvents>;
