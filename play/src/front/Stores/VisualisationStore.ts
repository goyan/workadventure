import { writable } from "svelte/store";
import type { CellExplained } from "../Phaser/Game/Weather/CellExplained";

/** Whether the visualisation panel is shown (apps menu, "Visualisation"). Session only: closed at each page load. */
export const visualisationPanelStore = writable<boolean>(false);

/**
 * Whether the flows of the water are drawn over the map: arrows for its movements and its speeds, a label on each
 * body of water, a tint where its level rises or falls. For this browser only, for the session; it stays on when the
 * panel is closed.
 */
export const waterFlowOverlayStore = writable<boolean>(false);

/**
 * Whether the "Weather explained" board is open in the visualisation panel: why this player sees the rain or the
 * snow, the frost and the ice they see. For the session; it shows with the panel only.
 */
export const weatherExplainedStore = writable<boolean>(false);

/** Whether the speeds the flows are drawn with are those the server computes (a water with inertia). */
export const waterFlowMeasuredStore = writable<boolean>(false);

/**
 * Whether the weather pipette is on: it explains what goes on in the cell of the ground under the pointer (its water,
 * its ice, its snow and where they go). For the session; it reads only, and takes no click of the map.
 */
export const weatherPipetteStore = writable<boolean>(false);

// Read by the game at each image: a plain value, kept by a subscription that lasts as long as the page.
let pipetteOn = false;
/** Stops keeping whether the pipette is on (tests): the page keeps it for as long as it lives. */
export const stopWeatherPipette = weatherPipetteStore.subscribe((on) => {
    pipetteOn = on;
});
export function isWeatherPipetteOn(): boolean {
    return pipetteOn;
}

/** What the pipette reads under the pointer now; undefined while it is off, or the pointer off the map. */
export const weatherPipetteCellStore = writable<CellExplained | undefined>(undefined);
