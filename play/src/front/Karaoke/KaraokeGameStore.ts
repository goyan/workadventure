import { derived, writable } from "svelte/store";
import type { Unsubscriber } from "svelte/store";

const activeGames = writable(0);
export const karaokeGameActiveStore = derived(activeGames, (count) => count > 0);

/** Isolate conversations temporarily without changing the user's saved media preferences. */
export function enterKaraokeGame(): Unsubscriber {
    activeGames.update((count) => count + 1);
    let active = true;
    return () => {
        if (!active) return;
        active = false;
        activeGames.update((count) => count - 1);
    };
}
