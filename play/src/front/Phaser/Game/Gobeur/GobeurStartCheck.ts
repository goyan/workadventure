import type { GobeurPropertyData } from "@workadventure/map-editor";
import { GOBEUR_COUNTDOWN_MS } from "./GobeurProtocol";
import type { GobeurStartMessage } from "./GobeurProtocol";

/** Clock skew and network delay tolerated between the duration of the property and the one of a start. */
export const GOBEUR_START_DURATION_MARGIN_MS = 10_000;

/**
 * Whether a received start matches the Gobeur object it names, as stored in the map: same prison, players chosen in the
 * object, a duration no longer than the object's, a countdown no longer than the usual one. Events are forgeable: a follower checks a start before following it.
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
    // The duration counts from the end of the countdown, which lies between the start and the end of the game.
    const huntsAt = start.huntsAt ?? start.startedAt;
    if (
        huntsAt < start.startedAt ||
        huntsAt > start.endsAt ||
        huntsAt - start.startedAt > GOBEUR_COUNTDOWN_MS + GOBEUR_START_DURATION_MARGIN_MS
    ) {
        return false;
    }
    return start.endsAt - huntsAt <= property.durationSeconds * 1000 + GOBEUR_START_DURATION_MARGIN_MS;
}
