import { z } from "zod";
import type {
    MapPatternDetailForClient,
    MapPatternPayload,
    MapPatternSummaryForClient,
} from "../../../../common/MapPattern";
import {
    MapPatternDetailForClient as MapPatternDetailSchema,
    MapPatternListForClient,
    MapPatternSummaryForClient as MapPatternSummarySchema,
} from "../../../../common/MapPattern";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../../../Enum/ComputedConst";

export type MapPatternApiErrorCode = "unavailable" | "forbidden" | "quota" | "invalid" | "not-found" | "rate-limit";

export class MapPatternApiError extends Error {
    constructor(public readonly code: MapPatternApiErrorCode) {
        super(`Map pattern request failed: ${code}`);
        this.name = "MapPatternApiError";
    }
}

function errorCodeFromStatus(status: number): MapPatternApiErrorCode {
    switch (status) {
        case 400:
            return "invalid";
        case 403:
            return "forbidden";
        case 404:
            // The pusher answers 404 {"error":"disabled"} when the feature is off: the caller sees "unavailable".
            return "not-found";
        case 409:
            return "quota";
        case 429:
            return "rate-limit";
        default:
            return "unavailable";
    }
}

async function request(path: string, roomUrl: string, init: { method: string; body?: unknown }): Promise<Response> {
    const isRead = init.body === undefined;
    const url = isRead
        ? `${ABSOLUTE_PUSHER_URL}${path}?roomUrl=${encodeURIComponent(roomUrl)}`
        : `${ABSOLUTE_PUSHER_URL}${path}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: init.method,
            headers: {
                Authorization: localUserStore.getAuthToken() || "",
                ...(isRead ? {} : { "Content-Type": "application/json" }),
            },
            ...(isRead ? {} : { body: JSON.stringify({ ...(init.body as object), roomUrl }) }),
        });
    } catch {
        throw new MapPatternApiError("unavailable");
    }
    if (!response.ok) {
        let code = errorCodeFromStatus(response.status);
        if (response.status === 404) {
            const body = await response.json().catch(() => undefined);
            if (z.object({ error: z.literal("disabled") }).safeParse(body).success) {
                code = "unavailable";
            }
        }
        throw new MapPatternApiError(code);
    }
    return response;
}

async function parseBody<T extends z.ZodTypeAny>(response: Response, schema: T): Promise<z.infer<T>> {
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
        throw new MapPatternApiError("unavailable");
    }
    return parsed.data;
}

export async function listMapPatterns(roomUrl: string): Promise<MapPatternSummaryForClient[]> {
    const response = await request("map-patterns", roomUrl, { method: "GET" });
    return (await parseBody(response, MapPatternListForClient)).patterns;
}

export async function getMapPattern(roomUrl: string, id: string): Promise<MapPatternDetailForClient> {
    const response = await request(`map-patterns/${encodeURIComponent(id)}`, roomUrl, { method: "GET" });
    return parseBody(response, MapPatternDetailSchema);
}

export async function createMapPattern(
    roomUrl: string,
    name: string,
    payload: MapPatternPayload,
): Promise<MapPatternSummaryForClient> {
    const response = await request("map-patterns", roomUrl, { method: "POST", body: { name, payload } });
    return parseBody(response, MapPatternSummarySchema);
}

export async function deleteMapPattern(roomUrl: string, id: string): Promise<void> {
    await request(`map-patterns/${encodeURIComponent(id)}`, roomUrl, { method: "DELETE" });
}
