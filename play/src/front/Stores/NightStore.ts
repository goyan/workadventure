import { derived, get, writable, type Readable, type Writable } from "svelte/store";
import { isTimeZone } from "@workadventure/map-editor";
import { WorldMoment, type WorldPlace, type WorldPoint } from "@wa/front/Phaser/Game/Night/WorldDaylight";
import { localUserStore } from "../Connection/LocalUserStore";
import { NIGHT_DARKNESS_MAX, NIGHT_DARKNESS_MIN, NIGHT_MAX_OPACITY } from "../Phaser/Game/Night/NightClock";
import { basicActiveStore } from "./BasicModeStore";
import {
    createPersistedChoiceStore,
    createPersistedNumberStore,
    createPersistedSwitchStore,
} from "./PersistedSwitchStore";

export enum NightMode {
    Server = "server",
    Computer = "computer",
    Disabled = "disabled",
    /** Night all day long: the sky of a Paris night, whatever the time. */
    Always = "always",
    /** The sky of a city of the world where it is now the moment chosen (worldMomentStore), at the server time. */
    World = "world",
}

/** The moment of the day of the sky of the world (NightMode.World), for this player. */
export const worldMomentStore = createPersistedChoiceStore(
    "nightWorldMoment",
    Object.values(WorldMoment),
    WorldMoment.Noon,
);
/** The hour chosen for the sky of the world (WorldMoment.Custom), in minutes since midnight. */
export const worldCustomMinutesStore = createPersistedNumberStore("nightWorldMinutes", 10 * 60, 0, 1439);
/**
 * A point chosen on the map of the world (NightMode.World): its sky at its own time. None: the city where it is the
 * moment chosen (worldMomentStore). Kept in the browser.
 */
export const worldPointStore = createWorldPointStore();

function createWorldPointStore(): Writable<WorldPoint | undefined> {
    const key = "nightWorldPoint";
    let initial: WorldPoint | undefined;
    try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        if (
            typeof value === "object" &&
            value !== null &&
            "latitude" in value &&
            "longitude" in value &&
            typeof value.latitude === "number" &&
            typeof value.longitude === "number" &&
            Math.abs(value.latitude) <= 90 &&
            Math.abs(value.longitude) <= 180
        ) {
            initial = { latitude: value.latitude, longitude: value.longitude };
            // A town chosen by its name keeps its name and its time zone; anything else in them is dropped.
            if ("name" in value && typeof value.name === "string" && value.name.trim() !== "") {
                initial.name = value.name.slice(0, 200);
            }
            if ("timezone" in value && typeof value.timezone === "string" && isTimeZone(value.timezone)) {
                initial.timezone = value.timezone;
            }
        }
    } catch {
        // Storage refused or broken: no point.
    }
    const store = writable<WorldPoint | undefined>(initial);
    const set = (point: WorldPoint | undefined): void => {
        try {
            if (point) localStorage.setItem(key, JSON.stringify(point));
            else localStorage.removeItem(key);
        } catch {
            // Storage refused: the point lasts until the page is closed.
        }
        store.set(point);
    };
    return { subscribe: store.subscribe, set, update: (updater) => set(updater(get(store))) };
}

/** The city (or the point of the map of the world) whose sky is shown (NightMode.World); undefined otherwise. */
export const worldCityStore = writable<WorldPlace | undefined>(undefined);

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

/** The mode the night really follows now: Basique is the diffuse light of day, whatever the mode chosen and kept. */
export const effectiveNightModeStore: Readable<NightMode> = derived(
    [nightModeStore, basicActiveStore],
    ([mode, basic]) => (basic ? NightMode.Disabled : mode),
);

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
/**
 * The three effects of the indirect light, each turned on or off at will (all on by default): the setting of an effect
 * is kept while it is off, to compare with and without at a click.
 */
export const ambienceOnStore = createPersistedSwitchStore("nightAmbienceOn", true);
export const softEdgeOnStore = createPersistedSwitchStore("nightLightSoftEdgeOn", true);
export const bounceOnStore = createPersistedSwitchStore("nightLightBounceOn", true);

/** A second bounce off the walls, for who wants the light to go one corner further: costly, off by default. */
export const secondBounceOnStore = createPersistedSwitchStore("nightLightSecondBounceOn", false);

const whileOn = (on: Readable<boolean>, setting: Readable<number>): Readable<number> =>
    derived([on, setting], ([isOn, value]) => (isOn ? value : 0));

/** What each effect is drawn with now: its setting while it is on, nothing once it is off. */
export const shownAmbienceStrengthStore = whileOn(ambienceOnStore, ambienceStrengthStore);
export const shownLightSoftEdgeStore = whileOn(softEdgeOnStore, lightSoftEdgeStore);
export const shownLightBounceStore = whileOn(bounceOnStore, lightBounceStore);

/** The time zone of the place of the map shown now (undefined: none, the time of Paris), for the clock. */
export const mapTimeZoneStore = writable<string | undefined>(undefined);
/** Whether this player keeps the night in the map editor, to set the lamps as they will look (hidden there by default). */
export const nightInEditorStore = createPersistedSwitchStore("nightKeptInEditor", false);
/** Whether the second bounce is drawn now: asked for, and the bounce itself on. */
export const shownSecondBounceStore = derived(
    [bounceOnStore, secondBounceOnStore],
    ([bounceOn, secondOn]) => bounceOn && secondOn,
);

/**
 * Under the realistic lighting, the areas no longer darken the rest of the map when entered (their "highlight"
 * property): a room is lit by its lamps, not by a veil around it. A player may keep the highlight all the same.
 */
export const noAreaHighlightStore = createPersistedSwitchStore("nightNoAreaHighlight", true);
/** Whether the highlight of the areas is dropped now: asked for (the default), under the realistic lighting only. */
export const areaHighlightHiddenStore = derived(
    [realisticNightStore, noAreaHighlightStore],
    ([realistic, dropped]) => realistic && dropped,
);
/** Whether the lights fade as a real lamp does, brighter at the foot with a long faint tail: off by default. */
export const realFalloffStore = createPersistedSwitchStore("nightLightRealFalloff", false);
