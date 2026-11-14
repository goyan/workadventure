import { WeatherType } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";

import { desktopWeatherMode } from "../../../../src/front/Api/Desktop/EnvironmentControls";

describe("desktopWeatherMode", () => {
    it("shows a map in Real as Automatic to the desktop app, which has no Real mode", () => {
        expect(desktopWeatherMode(WeatherType.Real)).toBe(WeatherType.Automatic);
    });

    it("shows the other modes as they are, clear for a map without weather", () => {
        expect(desktopWeatherMode(WeatherType.Snow)).toBe(WeatherType.Snow);
        expect(desktopWeatherMode(WeatherType.Automatic)).toBe(WeatherType.Automatic);
        expect(desktopWeatherMode(undefined)).toBe(WeatherType.Clear);
    });
});
