/**
 * A real Open-Meteo answer for Paris, asked at 2026-11-14 11:22:12 UTC (OPEN_METEO_ASKED_AT, epoch seconds) with
 * minutely_15=weather_code,temperature_2m, past_minutely_15=8, forecast_minutely_15=24, timeformat=unixtime.
 */
export const OPEN_METEO_ASKED_AT = 1794655332;

export const OPEN_METEO_PARIS = {
    latitude: 48.853382,
    longitude: 2.355208,
    generationtime_ms: 0.05269050598144531,
    utc_offset_seconds: 0,
    timezone: "GMT",
    timezone_abbreviation: "GMT",
    elevation: 50.0,
    minutely_15_units: { time: "unixtime", weather_code: "wmo code", temperature_2m: "°C" },
    minutely_15: {
        time: [
            1794647700, 1794648600, 1794649500, 1794650400, 1794651300, 1794652200, 1794653100, 1794654000, 1794654900,
            1794655800, 1794656700, 1794657600, 1794658500, 1794659400, 1794660300, 1794661200, 1794662100, 1794663000,
            1794663900, 1794664800, 1794665700, 1794666600, 1794667500, 1794668400, 1794669300, 1794670200, 1794671100,
            1794672000, 1794672900, 1794673800, 1794674700, 1794675600,
        ],
        weather_code: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
        temperature_2m: [
            4.9, 5.4, 5.9, 6.4, 6.8, 7.2, 7.5, 7.9, 8.2, 8.5, 8.9, 9.1, 9.4, 9.6, 9.8, 9.9, 10.1, 10.2, 10.3, 10.4,
            10.4, 10.4, 10.3, 10.2, 10.0, 9.8, 9.5, 9.2, 8.9, 8.6, 8.4, 8.1,
        ],
    },
};
