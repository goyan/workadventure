import { derived } from "svelte/store";
import type { Readable } from "svelte/store";
import { bubbleListenersStore, heardVideoBoxesStore } from "./PeerStore";
import { playersStore } from "./PlayersStore";

/** The names of the users at the edge of our bubble who hear it, for the discreet "someone is listening" hint. */
export const bubbleListenerNamesStore: Readable<string[]> = derived(
    [bubbleListenersStore, playersStore],
    ([$listeners, $players]) => listenerNames($listeners, $players),
);

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
        const name = players.get(Number(spaceUserId.slice(spaceUserId.lastIndexOf("_") + 1)))?.name;
        return name === undefined ? [] : [name];
    });
}
