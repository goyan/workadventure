import type { GobeurPropertyData } from "@workadventure/map-editor";
import type { GobeurStartMessage } from "./GobeurProtocol";

/** Clock skew and network delay tolerated between the duration of the property and the one of a start. */
export const GOBEUR_START_DURATION_MARGIN_MS = 10_000;

/**
 * Whether a received start matches the Gobeur object it names, as stored in the map: same prison, players chosen in the
 * object, a duration no longer than the object's. Events are forgeable: a follower checks a start before following it.
 */
export function isStartConsistentWithProperty(
    start: GobeurStartMessage,
    property: Pick<GobeurPropertyData, "players" | "prisonAreaId" | "durationSeconds"> | undefined,
): boolean {
    if (!property || start.prisonAreaId !== property.prisonAreaId) {
        return false;
    }
    const allowed = new Set(property.players.map((player) => player.uuid));
    if (!start.players.every((uuid) => allowed.has(uuid))) {
        return false;
    }
    return start.endsAt - start.startedAt <= property.durationSeconds * 1000 + GOBEUR_START_DURATION_MARGIN_MS;
}
