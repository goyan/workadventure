import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { bubbleListenersStore, heardVideoBoxesStore } from "./PeerStore";
import { playersStore } from "./PlayersStore";

/** The names of the users at the edge of our bubble who hear it, for the discreet "someone is listening" hint. */
export const bubbleListenerNamesStore: Readable<string[]> = derived(
    [bubbleListenersStore, playersStore],
    ([$listeners, $players]) => listenerNames($listeners, $players),
);

/**
 * How loud each overheard member sounds, by spaceUserId, from 0 to 1: the farther from them, the lower.
 * Updated by the game scene as players move (see overheardLoudness); a member missing from it plays at 1.
 */
export const overheardLoudnessStore = writable<ReadonlyMap<string, number>>(new Map());

/** Within this distance of a member, their voice plays at the full overheard volume (one tile and a half). */
const LOUD_DISTANCE = 48;
/** At this distance, their voice is down to a murmur, just before the back stops the listening. */
const FADED_DISTANCE = 140;
const FADED_LOUDNESS = 0.1;

export function overheardLoudness(distance: number): number {
    const fading = Math.min(1, Math.max(0, (distance - LOUD_DISTANCE) / (FADED_DISTANCE - LOUD_DISTANCE)));
    return FADED_LOUDNESS + (1 - FADED_LOUDNESS) * (1 - fading) * (1 - fading);
}

/** The names of the bubble members we overhear from its edge. */
export const heardMemberNamesStore: Readable<string[]> = derived(heardVideoBoxesStore, ($videoBoxes) => [
    ...new Set($videoBoxes.map((videoBox) => videoBox.spaceUser.name)),
]);

/**
 * A listener is only known by the spaceUserId of its peer connection, `${roomId}_${userId}` (set by the pusher):
 * its user id gives its name among the players of the map. A listener not found there yet is left out.
 */
export function listenerNames(
    spaceUserIds: readonly string[],
    players: ReadonlyMap<number, { name: string }>,
): string[] {
    return spaceUserIds.flatMap((spaceUserId) => {
        const name = players.get(userIdOfSpaceUser(spaceUserId))?.name;
        return name === undefined ? [] : [name];
    });
}

/** The user id ending a spaceUserId, `${roomId}_${userId}` (set by the pusher). */
export function userIdOfSpaceUser(spaceUserId: string): number {
    return Number(spaceUserId.slice(spaceUserId.lastIndexOf("_") + 1));
}
