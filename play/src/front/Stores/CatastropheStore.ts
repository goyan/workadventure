import {
    DOWNPOUR_DEFAULT_TILES,
    DRAIN_DEFAULT_TILES,
    FIRE_DEFAULT_TILES,
    METEOR_DEFAULT_TILES,
} from "@workadventure/map-editor";
import { derived, get, writable } from "svelte/store";

/** "meteor" is the comet, which brings water; "fireball" is the burning meteor, which sets its crater on fire. */
export type CatastropheChoice = "meteor" | "fireball" | "downpour" | "fire" | "drain";

/** Whether the catastrophe panel is shown. Session only: closed at each page load. */
export const catastrophePanelStore = writable<boolean>(false);

/** How wide the crater of the next comet or fireball is, in tiles: chosen in the panel, kept for the session. */
export const meteorRadiusTilesStore = writable<number>(METEOR_DEFAULT_TILES);

/** How wide the downpour is, in tiles, and whether it falls on the whole map instead: kept for the session. */
export const downpourRadiusTilesStore = writable<number>(DOWNPOUR_DEFAULT_TILES);
export const downpourWholeMapStore = writable<boolean>(false);

/** How wide the disc a drain empties is, in tiles: kept for the session. */
export const drainRadiusTilesStore = writable<number>(DRAIN_DEFAULT_TILES);

/** How wide the patch of fire set under the pointer is, in tiles: kept for the session. */
export const fireRadiusTilesStore = writable<number>(FIRE_DEFAULT_TILES);

const chosenCatastropheStore = writable<CatastropheChoice | undefined>(undefined);

// Closing the panel forgets the choice, so that reopening it is never armed.
// The subscription lives as long as the page: the unsubscriber is kept, never called.
export const forgetChoiceSubscriptions = [
    catastrophePanelStore.subscribe((panelShown) => {
        if (!panelShown) chosenCatastropheStore.set(undefined);
    }),
];

/**
 * The catastrophe the next click on the map throws: the chosen one while the panel is shown. In the map editor too:
 * the editor puts its tool aside while one is armed (see MapEditorModeManager).
 */
export const armedCatastropheStore = derived(
    [chosenCatastropheStore, catastrophePanelStore],
    ([$chosen, $panelShown]) => ($panelShown ? $chosen : undefined),
);

/** Arms the catastrophe, or disarms it when it is already the armed one. */
export function toggleArmedCatastrophe(choice: CatastropheChoice): void {
    if (!get(catastrophePanelStore)) return;
    chosenCatastropheStore.update((chosen) => (chosen === choice ? undefined : choice));
}

export function disarmCatastrophe(): void {
    chosenCatastropheStore.set(undefined);
}
