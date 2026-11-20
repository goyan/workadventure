import {
    DOWNPOUR_DEFAULT_TILES,
    DRAIN_DEFAULT_TILES,
    FIRE_DEFAULT_TILES,
    METEOR_DEFAULT_TILES,
} from "@workadventure/map-editor";
import { derived, get, writable } from "svelte/store";
import { mapEditorModeStore } from "./MapEditorStore";

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

// Closing the panel or opening the map editor forgets the choice, so that coming back is never armed.
function forgetUnlessUsable(panelShown: boolean, editorOpen: boolean): void {
    if (!panelShown || editorOpen) chosenCatastropheStore.set(undefined);
}
// Both subscriptions live as long as the page: the unsubscribers are kept, never called.
export const forgetChoiceSubscriptions = [
    catastrophePanelStore.subscribe((panelShown) => forgetUnlessUsable(panelShown, get(mapEditorModeStore))),
    mapEditorModeStore.subscribe((editorOpen) => forgetUnlessUsable(get(catastrophePanelStore), editorOpen)),
];

/** The catastrophe the next click on the map throws: the chosen one while the panel is shown and the editor closed. */
export const armedCatastropheStore = derived(
    [chosenCatastropheStore, catastrophePanelStore, mapEditorModeStore],
    ([$chosen, $panelShown, $editorOpen]) => ($panelShown && !$editorOpen ? $chosen : undefined),
);

/** Arms the catastrophe, or disarms it when it is already the armed one. Nothing while the editor is open. */
export function toggleArmedCatastrophe(choice: CatastropheChoice): void {
    if (!get(catastrophePanelStore) || get(mapEditorModeStore)) return;
    chosenCatastropheStore.update((chosen) => (chosen === choice ? undefined : choice));
}

export function disarmCatastrophe(): void {
    chosenCatastropheStore.set(undefined);
}
