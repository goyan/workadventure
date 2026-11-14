import Debug from "debug";
import { WeatherType } from "@workadventure/map-editor";
import { writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { abortTimeout } from "@workadventure/shared-utils/src/Abort/AbortTimeout";
import { PUSHER_URL } from "../../../Enum/EnvironmentVariable";
import { RealWeatherReport } from "../../../../common/RealWeather";
import { withRealWeather } from "./RealWeather";
import type { RealWeatherState } from "./RealWeather";
import type { MapSnowSettings } from "./SnowCover";

const debug = Debug("front:real-weather");
/** The pusher asks Open-Meteo every ten minutes: asking it every five keeps players at most a few minutes apart. */
const POLL_MS = 5 * 60 * 1000;

let state: RealWeatherState = { status: "pending" };
const store = writable<RealWeatherState>(state);
let started = false;

function set(next: RealWeatherState): void {
    state = next;
    store.set(next);
}

async function poll(): Promise<void> {
    try {
        const response = await fetch(new URL("/real-weather", PUSHER_URL), {
            cache: "no-store",
            signal: abortTimeout(10000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const report = RealWeatherReport.parse(await response.json());
        set(
            report.weather === null
                ? { status: "unavailable" }
                : { status: "known", weather: report.weather, since: report.since },
        );
    } catch (error) {
        debug("Real weather request failed: %O", error);
        // A pusher restart keeps the weather already known; only a first failure falls back to the seasonal draw.
        if (state.status === "pending") set({ status: "unavailable" });
    }
}

function start(): void {
    if (started) return;
    started = true;
    poll().catch((error: unknown) => debug("Real weather poll failed: %O", error));
    setInterval(() => {
        poll().catch((error: unknown) => debug("Real weather poll failed: %O", error));
    }, POLL_MS);
}

/** The weather in Paris as last reported by the pusher. The first call starts asking, every five minutes. */
export function realWeatherNow(): RealWeatherState {
    start();
    return state;
}

/** Same as realWeatherNow, for the settings panel. */
export const realWeatherStore: Readable<RealWeatherState> = {
    subscribe(run, invalidate) {
        start();
        return store.subscribe(run, invalidate);
    },
};

/**
 * The map weather settings as they are shown: a map set to "real" gets the weather in Paris (withRealWeather), and only
 * such a map makes this browser ask for it.
 */
export function shownWeatherSettings(settings: MapSnowSettings | undefined): MapSnowSettings | undefined {
    return settings?.weather === WeatherType.Real ? withRealWeather(settings, realWeatherNow()) : settings;
}
