import { derived, get, writable } from "svelte/store";
import { mapEditorModeStore } from "./MapEditorStore";

export type CatastropheChoice = "meteor";

/** Whether the catastrophe panel is shown. Session only: closed at each page load. */
export const catastrophePanelStore = writable<boolean>(false);

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
