import { WeatherType } from "@workadventure/map-editor";
import type { TranslationFunctions } from "../../../i18n/i18n-types";

/** The name of a weather or a map weather mode, as the weather tiles show it. */
export function weatherName(labels: TranslationFunctions["mapEditor"]["settings"]["weather"], w: WeatherType): string {
    switch (w) {
        case WeatherType.Rain:
            return labels.rain();
        case WeatherType.Snow:
            return labels.snow();
        case WeatherType.Storm:
            return labels.storm();
        case WeatherType.Fog:
            return labels.fog();
        case WeatherType.Automatic:
            return labels.automatic();
        case WeatherType.Real:
            return labels.real();
        case WeatherType.Cloudy:
            return labels.cloudy();
        default:
            return labels.clear();
    }
}

/** From this cloudiness, a clear sky is called cloudy; from the second, overcast (a cloud alone). */
export const CLOUDY_FROM = 0.2;
export const OVERCAST_FROM = 0.8;

/**
 * How a weather with its clouds is shown: a clear sky with clouds is named Cloudy, drawn as the sun behind a cloud, or
 * a cloud alone when overcast. Every other weather is shown as it is.
 */
export function weatherLook(weather: WeatherType, cloudiness = 0): { icon: WeatherType; name: WeatherType } {
    if (weather !== WeatherType.Clear || cloudiness < CLOUDY_FROM) return { icon: weather, name: weather };
    return { icon: cloudiness >= OVERCAST_FROM ? WeatherType.Cloudy : WeatherType.Automatic, name: WeatherType.Cloudy };
}
