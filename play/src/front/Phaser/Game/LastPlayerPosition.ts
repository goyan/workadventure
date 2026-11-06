import { z } from "zod";
import type { PositionInterface } from "../../Connection/ConnexionModels";

const STORAGE_KEY = "lastPlayerPosition";
const savedPosition = z.object({
    roomUrl: z.string(),
    userUuid: z.string(),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
});

/** A reload must not send a player away from their conversation to a start area or personal desk. */
export function readLastPlayerPosition(roomUrl: string, userUuid: string | undefined): PositionInterface | undefined {
    try {
        const result = savedPosition.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
        if (result.success && result.data.roomUrl === roomUrl && result.data.userUuid === userUuid) {
            return { x: result.data.x, y: result.data.y };
        }
    } catch {
        // Storage may be unavailable or contain an older, unreadable value.
    }
    return undefined;
}

export function saveLastPlayerPosition(
    roomUrl: string,
    userUuid: string | undefined,
    position: PositionInterface,
): void {
    if (!userUuid) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomUrl, userUuid, x: position.x, y: position.y }));
    } catch {
        // Reconnection within the current page still keeps its in-memory position.
    }
}
