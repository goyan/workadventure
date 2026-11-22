import { derived, writable, type Readable } from "svelte/store";
import { FAST_WATER_SPEED } from "../Phaser/Game/Terrain/FastWaterSpeed";
import { basicActiveStore } from "./BasicModeStore";
import { mapEditorModeStore } from "./MapEditorStore";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";

/**
 * « Eau rapide » : the water of the relief goes sixty times faster for this person only (LocalTerrainController, in a
 * worker), under the weather of the map or of the city they follow. Kept in this browser, like Basique; the water
 * itself is not: it starts again from the water of the server each time. Nothing goes to the server but the symbol
 * over the avatar (PerceptionProtocol).
 */
export const fastWaterStore = createPersistedSwitchStore("fastWater", false);

/** Fast water applies now: on, neither in Basique nor in the map editor (they show the water of the server). */
export const fastWaterActiveStore: Readable<boolean> = derived(
    [fastWaterStore, basicActiveStore, mapEditorModeStore],
    ([fast, basic, editing]) => fast && !basic && !editing,
);

/**
 * The local water has just gone back to the water of the server, at this moment of the page (performance.now): the
 * game says so for a moment. Undefined until it does.
 */
export const sharedWaterBackStore = writable<number | undefined>(undefined);

/** Fast water applies now, read by the game at each image: a plain value, kept for as long as the page lives. */
let activeNow = false;
/** Stops keeping it (tests): the page keeps it for as long as it lives. */
export const stopFastWaterActive = fastWaterActiveStore.subscribe((active) => {
    activeNow = active;
});
export function fastWaterActiveNow(): boolean {
    return activeNow;
}

/** What « Resynchroniser » does: the scene tells it (LocalTerrainController.resynchronize). */
let resynchronize: () => void = () => undefined;
export function setFastWaterResynchronize(action: () => void): void {
    resynchronize = action;
}
/** « Resynchroniser »: the water of this player starts again from the water of the server. */
export function resynchronizeFastWater(): void {
    resynchronize();
}

/**
 * How fast the water of this player goes, as the indicator says it: what comes in at FAST_WATER_SPEED, its currents
 * at `reached` (the reachedSpeed of its statistics) when the computer holds less. Then a river carries in its time
 * what comes in sixty times faster: it stands higher than in reality by (60 / reached) ^ 0.6 (Manning: the flow of a
 * stream goes as its depth to the power 5/3), rounded to a tenth.
 */
export function fastWaterPace(reached: number | undefined): { speed: number; reached?: number; higher?: number } {
    if (reached === undefined || reached >= FAST_WATER_SPEED) return { speed: FAST_WATER_SPEED };
    const flow = Math.max(1, reached);
    return {
        speed: FAST_WATER_SPEED,
        reached: flow,
        higher: Math.round((FAST_WATER_SPEED / flow) ** 0.6 * 10) / 10,
    };
}
