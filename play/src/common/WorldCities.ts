import type { WeatherLocation } from "@workadventure/map-editor";

/**
 * Cities all around the world, a few degrees of longitude apart (an hour of the sun is 15°): whatever the time of the
 * server, one of them is near any moment of the day. Inhabited latitudes, for days and nights of a familiar length.
 * A few cities of the north fill what a longitude alone does not (Unalaska, St. John's, Khabarovsk, Petropavlovsk,
 * Anadyr): the sun of a northern summer climbs through the height of the morning hours before that of a temperate
 * city at the same longitude, the sun of a northern winter goes down through the height of the evening early in the
 * afternoon. Without them, for an hour or two of some days, no city of the list had a low sun the right way (a sun
 * of 45° for a morning of June, of 36° for an evening of November).
 */
/** A city of the list, with its country (ISO 3166-1 alpha-2 code, named in the language of the player). */
export interface WorldCity extends WeatherLocation {
    country: string;
}

export const WORLD_CITIES: readonly WorldCity[] = [
    { name: "Unalaska", latitude: 53.89, longitude: -166.53, timezone: "America/Anchorage", country: "US" },
    { name: "Honolulu", latitude: 21.31, longitude: -157.86, timezone: "Pacific/Honolulu", country: "US" },
    { name: "Anchorage", latitude: 61.22, longitude: -149.9, timezone: "America/Anchorage", country: "US" },
    { name: "Vancouver", latitude: 49.28, longitude: -123.12, timezone: "America/Vancouver", country: "CA" },
    { name: "San Francisco", latitude: 37.77, longitude: -122.42, timezone: "America/Los_Angeles", country: "US" },
    { name: "Denver", latitude: 39.74, longitude: -104.99, timezone: "America/Denver", country: "US" },
    { name: "Mexico", latitude: 19.43, longitude: -99.13, timezone: "America/Mexico_City", country: "MX" },
    { name: "Chicago", latitude: 41.88, longitude: -87.63, timezone: "America/Chicago", country: "US" },
    { name: "Bogotá", latitude: 4.71, longitude: -74.07, timezone: "America/Bogota", country: "CO" },
    { name: "New York", latitude: 40.71, longitude: -74.01, timezone: "America/New_York", country: "US" },
    { name: "Montréal", latitude: 45.5, longitude: -73.57, timezone: "America/Toronto", country: "CA" },
    { name: "Santiago", latitude: -33.45, longitude: -70.67, timezone: "America/Santiago", country: "CL" },
    {
        name: "Buenos Aires",
        latitude: -34.6,
        longitude: -58.38,
        timezone: "America/Argentina/Buenos_Aires",
        country: "AR",
    },
    { name: "St. John's", latitude: 47.56, longitude: -52.71, timezone: "America/St_Johns", country: "CA" },
    { name: "Rio de Janeiro", latitude: -22.91, longitude: -43.17, timezone: "America/Sao_Paulo", country: "BR" },
    { name: "Praia", latitude: 14.93, longitude: -23.51, timezone: "Atlantic/Cape_Verde", country: "CV" },
    { name: "Reykjavik", latitude: 64.15, longitude: -21.94, timezone: "Atlantic/Reykjavik", country: "IS" },
    { name: "Dakar", latitude: 14.72, longitude: -17.47, timezone: "Africa/Dakar", country: "SN" },
    { name: "Lisbonne", latitude: 38.72, longitude: -9.14, timezone: "Europe/Lisbon", country: "PT" },
    { name: "Casablanca", latitude: 33.57, longitude: -7.59, timezone: "Africa/Casablanca", country: "MA" },
    { name: "Paris", latitude: 48.86, longitude: 2.35, timezone: "Europe/Paris", country: "FR" },
    { name: "Rome", latitude: 41.9, longitude: 12.5, timezone: "Europe/Rome", country: "IT" },
    { name: "Le Cap", latitude: -33.92, longitude: 18.42, timezone: "Africa/Johannesburg", country: "ZA" },
    { name: "Athènes", latitude: 37.98, longitude: 23.73, timezone: "Europe/Athens", country: "GR" },
    { name: "Le Caire", latitude: 30.04, longitude: 31.24, timezone: "Africa/Cairo", country: "EG" },
    { name: "Nairobi", latitude: -1.29, longitude: 36.82, timezone: "Africa/Nairobi", country: "KE" },
    { name: "Moscou", latitude: 55.76, longitude: 37.62, timezone: "Europe/Moscow", country: "RU" },
    { name: "Dubaï", latitude: 25.2, longitude: 55.27, timezone: "Asia/Dubai", country: "AE" },
    { name: "Karachi", latitude: 24.86, longitude: 67.0, timezone: "Asia/Karachi", country: "PK" },
    { name: "Bombay", latitude: 19.08, longitude: 72.88, timezone: "Asia/Kolkata", country: "IN" },
    { name: "Katmandou", latitude: 27.72, longitude: 85.32, timezone: "Asia/Kathmandu", country: "NP" },
    { name: "Bangkok", latitude: 13.76, longitude: 100.5, timezone: "Asia/Bangkok", country: "TH" },
    { name: "Hong Kong", latitude: 22.32, longitude: 114.17, timezone: "Asia/Hong_Kong", country: "HK" },
    { name: "Perth", latitude: -31.95, longitude: 115.86, timezone: "Australia/Perth", country: "AU" },
    { name: "Séoul", latitude: 37.57, longitude: 126.98, timezone: "Asia/Seoul", country: "KR" },
    { name: "Khabarovsk", latitude: 48.48, longitude: 135.08, timezone: "Asia/Vladivostok", country: "RU" },
    { name: "Tokyo", latitude: 35.68, longitude: 139.69, timezone: "Asia/Tokyo", country: "JP" },
    { name: "Sydney", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney", country: "AU" },
    {
        name: "Petropavlovsk-Kamtchatski",
        latitude: 53.02,
        longitude: 158.65,
        timezone: "Asia/Kamchatka",
        country: "RU",
    },
    { name: "Nouméa", latitude: -22.28, longitude: 166.46, timezone: "Pacific/Noumea", country: "NC" },
    { name: "Auckland", latitude: -36.85, longitude: 174.76, timezone: "Pacific/Auckland", country: "NZ" },
    { name: "Anadyr", latitude: 64.73, longitude: 177.52, timezone: "Asia/Anadyr", country: "RU" },
];
