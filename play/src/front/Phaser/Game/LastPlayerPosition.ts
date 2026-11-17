import { z } from "zod";
import type { PositionInterface } from "../../Connection/ConnexionModels";

const STORAGE_KEY = "lastPlayerPosition";
const savedPosition = z.object({
    roomUrl: z.string(),
    userUuid: z.string(),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    // The altitude of the raised floor the player stood on; absent on the ground, and in positions saved earlier.
    floorZ: z.number().finite().positive().optional(),
});

export type LastPlayerPosition = PositionInterface & { floorZ?: number };

/** A reload must not send a player away from their conversation to a start area or personal desk. */
export function readLastPlayerPosition(roomUrl: string, userUuid: string | undefined): LastPlayerPosition | undefined {
    try {
        const result = savedPosition.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
        if (result.success && result.data.roomUrl === roomUrl && result.data.userUuid === userUuid) {
            const { x, y, floorZ } = result.data;
            return floorZ === undefined ? { x, y } : { x, y, floorZ };
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
    floorZ = 0,
): void {
    if (!userUuid) return;
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                roomUrl,
                userUuid,
                x: position.x,
                y: position.y,
                ...(floorZ > 0 ? { floorZ } : {}),
            }),
        );
    } catch {
        // Reconnection within the current page still keeps its in-memory position.
    }
}
