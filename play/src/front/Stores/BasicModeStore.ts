import { derived, get, type Readable } from "svelte/store";
import { mapEditorModeStore } from "./MapEditorStore";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";

/**
 * « Basique » : WorkAdventure as it was, for this person only. On, it hides every effect at once (weather, light and
 * night, catastrophes, the water and the relief, the life of the water, the trees that move) and the water no longer
 * acts on the avatar here (no swimming, no current, no slow ground). It writes no other setting: off, each one finds
 * their detailed settings as they were. The map editor ignores it, so that the relief and the water can be edited.
 * Nothing goes through the server: the others still see where the avatar really is.
 */
export const basicModeStore = createPersistedSwitchStore("basicMode", false);

/** Basique applies now: on, and out of the map editor. */
export const basicActiveStore: Readable<boolean> = derived(
    [basicModeStore, mapEditorModeStore],
    ([basic, editing]) => basic && !editing,
);

export function isBasicActive(): boolean {
    return get(basicActiveStore);
}

/** An effect is shown when its own setting wants it and Basique does not apply. */
export function unlessBasic(setting: Readable<boolean>): Readable<boolean> {
    return derived([setting, basicActiveStore], ([shown, basic]) => shown && !basic);
}
