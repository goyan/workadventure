import { derived, get, writable } from "svelte/store";
import type { Readable, Writable } from "svelte/store";
import { WORLD_WEATHER_PLACES, WorldWeatherReport } from "@wa/common/WorldWeather";
import { localUserStore } from "../Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";
import { WorldFall, WorldWeatherClient, pickWorldFall, stillFalls } from "../Phaser/Game/Night/WorldWeatherPick";
import type { WorldFallPick, WorldFallPlace } from "../Phaser/Game/Night/WorldWeatherPick";
import { chosenWeatherStateStore } from "../Phaser/Game/Weather/ChosenPlaceWeather";
import { nightDateStore, worldPointStore } from "./NightStore";

/** The place picked where it rains or snows (NightMode.World), and how hard it fell when picked. */
export interface WorldFallChoice {
    fall: WorldFall;
    place: WorldFallPlace["city"];
    rainRate: number;
}

const KEY = "nightWorldFall";

/** The place picked where it rains or snows, kept in the browser (by its name in the list); none: a moment or a point. */
function createWorldFallStore(): Writable<WorldFallChoice | undefined> {
    let initial: WorldFallChoice | undefined;
    try {
        const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (typeof value === "object" && value !== null && "fall" in value && "name" in value && "rainRate" in value) {
            const fall = Object.values(WorldFall).find((known) => known === value.fall);
            const place = WORLD_WEATHER_PLACES.find((known) => known.name === value.name);
            if (fall && place && typeof value.rainRate === "number" && value.rainRate >= 0) {
                initial = { fall, place, rainRate: value.rainRate };
            }
        }
    } catch {
        // Storage refused or broken: no place picked.
    }
    const store = writable<WorldFallChoice | undefined>(initial);
    const set = (choice: WorldFallChoice | undefined): void => {
        try {
            if (choice) {
                localStorage.setItem(
                    KEY,
                    JSON.stringify({ fall: choice.fall, name: choice.place.name, rainRate: choice.rainRate }),
                );
            } else localStorage.removeItem(KEY);
        } catch {
            // Storage refused: the choice lasts until the page is closed.
        }
        store.set(choice);
    };
    return { subscribe: store.subscribe, set, update: (updater) => set(updater(get(store))) };
}

export const worldFallStore = createWorldFallStore();

/** Why the last click on "Rain" or "Snow" changed nothing: it falls nowhere in the list, or the weather was unreadable. */
export const worldFallNoticeStore = writable<{ fall: WorldFall; status: "none" | "failed" } | undefined>(undefined);
/** The fall being looked for, while the weather of the world is asked: its button waits. */
export const worldFallPendingStore = writable<WorldFall | undefined>(undefined);

async function fetchWorldWeather(): Promise<WorldWeatherReport> {
    const response = await fetch(new URL("real-weather/world", ABSOLUTE_PUSHER_URL), {
        cache: "no-store",
        headers: { Authorization: localUserStore.getAuthToken() ?? "" },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return WorldWeatherReport.parse(await response.json());
}

const client = new WorldWeatherClient(fetchWorldWeather);

/**
 * A click on "Rain" or "Snow": the sky of a place of the world where it falls so now, the next one when that fall is
 * already shown. When it falls nowhere, or the weather cannot be read, the place followed stays and the menu says why.
 * A click while the weather is asked does nothing more.
 */
export async function chooseWorldFall(
    fall: WorldFall,
    pick: (fall: WorldFall, shown: string | undefined) => Promise<WorldFallPick> = (wanted, shown) =>
        pickWorldFall(wanted, client, shown),
): Promise<void> {
    if (get(worldFallPendingStore) !== undefined) return;
    worldFallPendingStore.set(fall);
    try {
        const current = get(worldFallStore);
        const result = await pick(
            fall,
            current?.fall === fall && !get(worldPointStore) ? current.place.name : undefined,
        );
        if (result.status === "picked") {
            worldFallNoticeStore.set(undefined);
            worldPointStore.set(undefined);
            worldFallStore.set({ fall, place: result.place.city, rainRate: result.place.rainRate });
        } else {
            worldFallNoticeStore.set({ fall, status: result.status });
        }
    } finally {
        worldFallPendingStore.set(undefined);
    }
}

/** Leaves the place picked for a moment or a point of the map. */
export function clearWorldFall(): void {
    worldFallStore.set(undefined);
    worldFallNoticeStore.set(undefined);
}

/**
 * Whether what was picked still falls at the place followed, by its weather timeline (asked every few minutes):
 * false once it no longer rains (or snows) there, undefined while not known. The place is kept all the same.
 */
export const worldFallStillFallsStore: Readable<boolean | undefined> = derived(
    [worldFallStore, chosenWeatherStateStore, nightDateStore],
    ([choice, chosen, date]) => {
        if (!choice || !date || chosen.state.status !== "known" || chosen.place?.name !== choice.place.name) {
            return undefined;
        }
        return stillFalls(choice.fall, chosen.state.slots, date.getTime());
    },
);
