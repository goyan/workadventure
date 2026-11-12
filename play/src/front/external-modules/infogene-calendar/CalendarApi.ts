import { z } from "zod";
import { CalendarEvents, CalendarSource, CalendarSourceList } from "../../../common/Calendar";
import type { CalendarSourceInput } from "../../../common/Calendar";
import { PusherUnreachableError, pusherFetch } from "./pusherRequest";

export type CalendarApiErrorCode = "invalid" | "not-found" | "quota" | "unreachable" | "rate-limit" | "unavailable";

export class CalendarApiError extends Error {
    constructor(public readonly code: CalendarApiErrorCode) {
        super(`Calendar request failed: ${code}`);
        this.name = "CalendarApiError";
    }
}

function errorCodeFromStatus(status: number): CalendarApiErrorCode {
    switch (status) {
        case 400:
            return "invalid";
        case 404:
            return "not-found";
        case 409:
            return "quota";
        case 422:
            return "unreachable";
        case 429:
            return "rate-limit";
        default:
            return "unavailable";
    }
}

async function request(
    path: string,
    init: { method: string; body?: unknown; signal?: AbortSignal },
): Promise<Response> {
    let response: Response;
    try {
        response = await pusherFetch(path, init);
    } catch (e) {
        // A request cancelled by its caller keeps its abort error: the caller is gone and ignores it.
        if (e instanceof PusherUnreachableError) throw new CalendarApiError("unavailable");
        throw e;
    }
    if (!response.ok) {
        let code = errorCodeFromStatus(response.status);
        // The pusher answers 404 {"error":"disabled"} when the feature is off.
        if (response.status === 404) {
            const body = await response.json().catch(() => undefined);
            if (z.object({ error: z.literal("disabled") }).safeParse(body).success) code = "unavailable";
        }
        throw new CalendarApiError(code);
    }
    return response;
}

async function parseBody<T extends z.ZodTypeAny>(response: Response, schema: T): Promise<z.infer<T>> {
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
        throw new CalendarApiError("unavailable");
    }
    return parsed.data;
}

export async function listCalendarSources(signal?: AbortSignal): Promise<CalendarSource[]> {
    const response = await request("calendar/sources", { method: "GET", signal });
    return (await parseBody(response, CalendarSourceList)).calendars;
}

export async function addCalendarSource(input: CalendarSourceInput, signal?: AbortSignal): Promise<CalendarSource> {
    return parseBody(await request("calendar/sources", { method: "POST", body: input, signal }), CalendarSource);
}

export async function deleteCalendarSource(id: string, signal?: AbortSignal): Promise<void> {
    await request(`calendar/sources/${encodeURIComponent(id)}`, { method: "DELETE", signal });
}

export async function fetchCalendarEvents(from: Date, to: Date, signal?: AbortSignal): Promise<CalendarEvents> {
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    return parseBody(await request(`calendar/events?${query.toString()}`, { method: "GET", signal }), CalendarEvents);
}
