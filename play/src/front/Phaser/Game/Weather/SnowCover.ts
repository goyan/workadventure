import type { AutoWeatherSettings, WeatherLocation, WeatherType } from "@workadventure/map-editor";

/** The weather settings of a map as the game shows them (the name dates from the snow cover they once carried). */
export interface MapSnowSettings {
    weather?: WeatherType;
    weatherStartedAt?: number;
    weatherAuto?: AutoWeatherSettings;
    /** Place of the map, for its real weather. */
    weatherLocation?: WeatherLocation;
    /**
     * The water of the map: its speed is the clock of its snow and its ice too (waterTimesOf), its speed of the freeze
     * and the thaw goes over it for the melt (freezeThawTimesOf).
     */
    water?: { speed?: number; freezeThawSpeed?: number };
    /** Real weather only (never saved): end of the weather under way, when a fog fades out. */
    weatherEndsAt?: number;
    /** Shown weather only (never saved): clouds of a clear sky, 0 to 1 (shownWeatherSettings). */
    cloudiness?: number;
    /** Real weather only (never saved): cloud cover of a rain or a storm, 0 to 1. */
    cloudCover?: number;
    /** Real weather only (never saved): where the wind comes from (degrees, 0 north), which moves the clouds. */
    windFrom?: number;
    /** Real weather only (never saved): wind speed (km/h), which sets how fast the clouds go. */
    windSpeed?: number;
    /** Real weather only (never saved): since when it has been raining, rain and storm together. */
    rainSince?: number;
    /** Real weather only (never saved): when the last rain stopped, the puddles drying from then. */
    rainDryFrom?: number;
    /** Real weather only (never saved): how hard it rains, mm an hour (rainIntensity). */
    rainRate?: number;
    /** A hurricane crosses the map (never saved): its own spiral of clouds takes the place of the clouds of the sky. */
    hurricaneSky?: boolean;
}
