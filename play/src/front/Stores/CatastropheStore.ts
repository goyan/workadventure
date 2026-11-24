import {
    BALL_DEFAULT_TILES,
    COLD_DEFAULT_CELSIUS,
    COLD_DEFAULT_TILES,
    DOWNPOUR_DEFAULT_TILES,
    DRAIN_DEFAULT_TILES,
    FIRE_DEFAULT_TILES,
    HURRICANE_DEFAULT_CATEGORY,
    HURRICANE_DEFAULT_HEADING,
    HURRICANE_DEFAULT_MINUTES,
    METEOR_DEFAULT_TILES,
} from "@workadventure/map-editor";
import type { Hurricane, HurricaneHere, WaterBall } from "@workadventure/map-editor";
import { derived, get, writable } from "svelte/store";
import { basicActiveStore } from "./BasicModeStore";

/** "meteor" is the comet, which brings water; "fireball" is the burning meteor, which sets its crater on fire. */
export type CatastropheChoice = "meteor" | "fireball" | "downpour" | "fire" | "drain" | "ball" | "cold";

/** Whether the catastrophe panel is shown. Session only: closed at each page load. */
export const catastrophePanelStore = writable<boolean>(false);

/** How wide the crater of the next comet or fireball is, in tiles: chosen in the panel, kept for the session. */
export const meteorRadiusTilesStore = writable<number>(METEOR_DEFAULT_TILES);

/** How wide the downpour is, in tiles, and whether it falls on the whole map instead: kept for the session. */
export const downpourRadiusTilesStore = writable<number>(DOWNPOUR_DEFAULT_TILES);
export const downpourWholeMapStore = writable<boolean>(false);

/** How wide the disc a drain empties is, in tiles: kept for the session. */
export const drainRadiusTilesStore = writable<number>(DRAIN_DEFAULT_TILES);

/** How wide the ball held under the pointer is, in tiles: its diameter, kept for the session. */
export const ballDiameterTilesStore = writable<number>(BALL_DEFAULT_TILES);

/**
 * The ball this player holds under their pointer now (map pixels), none when they hold none: it is drawn there at
 * once, without waiting for the server, which is told where it is and alone moves the water.
 */
export const heldBallStore = writable<WaterBall | undefined>(undefined);

/** How wide the mass of cold air of a cold snap is, in tiles, and the temperature of its air (°C): kept for the session. */
export const coldRadiusTilesStore = writable<number>(COLD_DEFAULT_TILES);
export const coldCelsiusStore = writable<number>(COLD_DEFAULT_CELSIUS);

/**
 * The cold air lying on the map now, as the game shows it: the temperature of the coldest mass (°C) and how long it
 * still has before it is the air of the map again (seconds; undefined while a player holds it). Undefined while no
 * cold air lies on the map. Written by the view of the cold snap, read by the panel, which offers to stop it.
 */
export const coldLyingStore = writable<{ celsius: number; secondsLeft: number | undefined } | undefined>(undefined);

/**
 * How the next hurricane crosses the map: its category, how long its eye takes to cross the map (minutes) and where it
 * goes (degrees). Kept for the session.
 */
export const hurricaneCategoryStore = writable<number>(HURRICANE_DEFAULT_CATEGORY);
export const hurricaneMinutesStore = writable<number>(HURRICANE_DEFAULT_MINUTES);
export const hurricaneHeadingStore = writable<number>(HURRICANE_DEFAULT_HEADING);
/**
 * How many times stronger than in reality the next hurricane acts on the water (its low and its wind): 1 the real
 * effect, 2 to 8 an exaggeration to see it better (HURRICANE_WATER_EFFECTS). Sent with the hurricane, for everyone.
 */
export const hurricaneWaterEffectStore = writable<number>(1);
/**
 * The flood of the hurricane as this browser saw it (Terrain/HurricaneFloodView): the most the water has risen over
 * a cell of the map since the hurricane began (m), and how much higher than before it the water stands under the
 * pointer (m). Undefined while there is no hurricane (nor its marks) to tell.
 */
export const hurricaneHighestRiseStore = writable<number | undefined>(undefined);
export const pointerFloodRiseStore = writable<number | undefined>(undefined);

/**
 * The hurricane crossing the map, and what it is where this player looks, as of the last word of the server (once a
 * second): the panel says it and offers to stop it. Undefined while none crosses the map.
 */
export const hurricaneShownStore = writable<{ hurricane: Hurricane; here: HurricaneHere | undefined } | undefined>(
    undefined,
);

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
 * the editor puts its tool aside while one is armed (see MapEditorModeManager). Never in Basique: the panel is hidden
 * there, a click on the map must not throw what it no longer shows.
 */
export const armedCatastropheStore = derived(
    [chosenCatastropheStore, catastrophePanelStore, basicActiveStore],
    ([$chosen, $panelShown, $basic]) => ($panelShown && !$basic ? $chosen : undefined),
);

/** Arms the catastrophe, or disarms it when it is already the armed one. */
export function toggleArmedCatastrophe(choice: CatastropheChoice): void {
    if (!get(catastrophePanelStore)) return;
    chosenCatastropheStore.update((chosen) => (chosen === choice ? undefined : choice));
}

export function disarmCatastrophe(): void {
    chosenCatastropheStore.set(undefined);
}
