import { writable } from "svelte/store";

/** Whether the visualisation panel is shown (apps menu, "Visualisation"). Session only: closed at each page load. */
export const visualisationPanelStore = writable<boolean>(false);

/**
 * Whether the flows of the water are drawn over the map: arrows for its movements and its speeds, a label on each
 * body of water, a tint where its level rises or falls. For this browser only, for the session; it stays on when the
 * panel is closed.
 */
export const waterFlowOverlayStore = writable<boolean>(false);
