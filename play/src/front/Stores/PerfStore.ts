import { writable } from "svelte/store";
import type { PerfStats } from "../Phaser/Game/Perf/PerfMeter";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";

/** Whether this player sees the performance counter next to the action bar (kept in the browser; hidden by default). */
export const perfShownStore = createPersistedSwitchStore("perfCounterShown", false);

/** How the game ran over the last half second, while the counter is shown. */
export const perfStatsStore = writable<PerfStats | undefined>(undefined);

/** Metrics requested by the graphics panel, without changing the counter preference. */
export const graphicsMetricsRequestedStore = writable(false);
/** The desktop panel has its own request so closing the web panel cannot stop its measurements. */
export const desktopGraphicsMetricsRequestedStore = writable(false);
