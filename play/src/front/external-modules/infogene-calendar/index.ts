import { get } from "svelte/store";
import { asError } from "catch-unknown";
import { calendarWindow } from "@workadventure/shared-utils";
import type { ExtensionModule, ExtensionModuleOptions } from "../../ExternalModule/ExtensionModule";
import LL from "../../../i18n/i18n-svelte";
import type { CalendarApiEvent } from "../../../common/Calendar";
import { fetchCalendarEvents } from "./CalendarApi";
import { currentBusyMeetingId, decideBusyStatus, toCalendarEvents } from "./calendarEvents";
import {
    busyOptionStore,
    calendarRefresh,
    failedCalendarsStore,
    loadBusyState,
    saveBusyState,
} from "./calendarModuleState";
import CalendarSourcesSettings from "./CalendarSourcesSettings.svelte";

/** Outlook publishes calendars every few hours at best: reading them every 5 minutes is plenty. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
/** The status follows the meetings to the half minute. */
const STATUS_INTERVAL_MS = 30 * 1000;
const SETTINGS_KEY = "infogene-calendar-sources";

let options: ExtensionModuleOptions | undefined;
/** Cancels the request running when the module is destroyed (scene change). */
let abortController: AbortController | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let statusTimer: ReturnType<typeof setInterval> | undefined;
let unsubscribeBusyOption: (() => void) | undefined;
let lastEvents: CalendarApiEvent[] = [];
/** No status decision before the first events: after a reload during a meeting, "no meeting" would be wrong. */
let eventsLoaded = false;
let busyState = loadBusyState();

async function refresh(): Promise<void> {
    const moduleOptions = options;
    const signal = abortController?.signal;
    if (!moduleOptions || !signal) return;
    const { from, to } = calendarWindow();
    try {
        const { events, failed } = await fetchCalendarEvents(from, to, signal);
        if (signal.aborted) return;
        lastEvents = events;
        eventsLoaded = true;
        failedCalendarsStore.set(failed.map((calendar) => calendar.label));
        const calendarEvents = toCalendarEvents(events, get(LL).externalModule.outlookIcs.privateTitle());
        moduleOptions.calendarEventsStoreUpdate?.(() => calendarEvents);
    } catch (e) {
        if (signal.aborted) return;
        // Kept as it was: a failed refresh does not empty the agenda.
        console.error("Cannot read the Outlook calendars", asError(e));
    }
    updateStatus();
}

/** Turns the user busy during a meeting and back online after, per `decideBusyStatus`. */
function updateStatus(): void {
    if (!options || !eventsLoaded) return;
    const decision = decideBusyStatus({
        enabled: get(busyOptionStore),
        meetingId: currentBusyMeetingId(lastEvents, new Date()),
        current: get(options.workadventureStatusStore),
        state: busyState,
    });
    busyState = decision.state;
    saveBusyState(busyState);
    if (decision.change !== undefined) options.onExtensionModuleStatusChange(decision.change);
}

/**
 * The Outlook calendars (published ICS links) of the user in the native agenda panel, and the busy status during their
 * meetings. Announced by the Admin API in the map details ("infogene-calendar").
 */
const infogeneCalendarModule: ExtensionModule = {
    id: "infogene-calendar",
    calendarSynchronised: true,
    todoListSynchronized: false,

    init(_roomMetadata, moduleOptions) {
        options = moduleOptions;
        abortController = new AbortController();
        calendarRefresh.request = () => {
            refresh().catch((e: unknown) => console.error("Cannot refresh the Outlook calendars", asError(e)));
        };
        moduleOptions.externalSvelteComponent.addComponentToZone("calendarButton", SETTINGS_KEY, CalendarSourcesSettings);
        calendarRefresh.request();
        refreshTimer = setInterval(calendarRefresh.request, REFRESH_INTERVAL_MS);
        statusTimer = setInterval(updateStatus, STATUS_INTERVAL_MS);
        // Turning the option off during a meeting gives the busy status back at once.
        unsubscribeBusyOption = busyOptionStore.subscribe(() => updateStatus());
    },

    destroy() {
        abortController?.abort();
        abortController = undefined;
        if (refreshTimer) clearInterval(refreshTimer);
        if (statusTimer) clearInterval(statusTimer);
        unsubscribeBusyOption?.();
        options?.externalSvelteComponent.removeComponentFromZone("calendarButton", SETTINGS_KEY);
        refreshTimer = undefined;
        statusTimer = undefined;
        unsubscribeBusyOption = undefined;
        calendarRefresh.request = () => undefined;
        options = undefined;
        lastEvents = [];
        eventsLoaded = false;
    },
};

export default infogeneCalendarModule;
