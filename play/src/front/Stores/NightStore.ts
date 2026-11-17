import { get, writable, type Writable } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { NIGHT_DARKNESS_MAX, NIGHT_DARKNESS_MIN, NIGHT_MAX_OPACITY } from "../Phaser/Game/Night/NightClock";
import { createPersistedNumberStore, createPersistedSwitchStore } from "./PersistedSwitchStore";

export enum NightMode {
    Server = "server",
    Computer = "computer",
    Disabled = "disabled",
}

const NIGHT_MODE_KEY = "nightMode";

/** Personal clock choice, preserving the old "turn off night" preference. */
function createNightModeStore(): Writable<NightMode> {
    const saved = localStorage.getItem(NIGHT_MODE_KEY);
    const initial =
        Object.values(NightMode).find((mode) => mode === saved) ??
        (localUserStore.getDisableNight() ? NightMode.Disabled : NightMode.Server);
    const store = writable(initial);
    const set = (value: NightMode): void => {
        localStorage.setItem(NIGHT_MODE_KEY, value);
        localUserStore.setDisableNight(value === NightMode.Disabled);
        store.set(value);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => {
            set(updater(get(store)));
        },
    };
}

export const nightModeStore = createNightModeStore();

/**
 * Realistic lighting, for this player only, off by default: at night the rooms no longer light up on their own when
 * somebody is in them. Only the lamps light them (see the switches and the presence sensors of the map); each player
 * keeps their halo. Kept in the browser.
 */
export const realisticNightStore = createPersistedSwitchStore("nightRealisticLighting", false);

/** How dark the full night is for this player (the opacity of the veil), kept in the browser. */
export const nightDarknessStore = createPersistedNumberStore(
    "nightDarkness",
    NIGHT_MAX_OPACITY,
    NIGHT_DARKNESS_MIN,
    NIGHT_DARKNESS_MAX,
);

/** Current clock shown by the map, updated by the existing night-mode tick. */
export const nightDateStore = writable<Date | undefined>(undefined);

/** The most of the night veil the light bounced around a room takes away, for this player (0: none). */
export const ambienceStrengthStore = createPersistedNumberStore("nightAmbienceStrength", 0.25, 0, 1);
/** The share of a room that must be lit directly for its bounced light to be at its strongest. */
export const ambienceFullShareStore = createPersistedNumberStore("nightAmbienceFullShare", 0.3, 0.05, 1);
/** How far the edge of the lights is softened, in map pixels (0: sharp), up to a tile. */
export const lightSoftEdgeStore = createPersistedNumberStore("nightLightSoftEdge", 8, 0, 32);
/** The share of its light a wall sends back, for this player (0: no bounce): a light then turns the corner of a door. */
export const lightBounceStore = createPersistedNumberStore("nightLightBounce", 0.4, 0, 1);
/** The time zone of the place of the map shown now (undefined: none, the time of Paris), for the clock. */
export const mapTimeZoneStore = writable<string | undefined>(undefined);
