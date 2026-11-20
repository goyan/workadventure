import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { ABSOLUTE_PUSHER_URL } from "@wa/front/Enum/ComputedConst";
import { RealWeatherForecast } from "@wa/common/RealWeather";
import type { MapPlace } from "@wa/common/RealWeather";

/** The weather timeline of a place (Paris when absent), through the pusher (Open-Meteo, cached there). */
export async function fetchRealWeather(place: MapPlace | undefined): Promise<RealWeatherForecast> {
    const url = new URL("real-weather", ABSOLUTE_PUSHER_URL);
    if (place) {
        url.searchParams.set("latitude", String(place.latitude));
        url.searchParams.set("longitude", String(place.longitude));
    }
    const response = await fetch(url, {
        cache: "no-store",
        headers: { Authorization: localUserStore.getAuthToken() ?? "" },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return RealWeatherForecast.parse(await response.json());
}
