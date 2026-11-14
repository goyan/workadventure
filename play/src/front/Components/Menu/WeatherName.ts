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
        default:
            return labels.clear();
    }
}
