import { PARIS_LATITUDE, PARIS_LONGITUDE } from "../../../../common/RealWeather";
import type { MapPlace } from "../../../../common/RealWeather";

/** Darkness of the night veil once night has fully fallen. */
export const NIGHT_MAX_OPACITY = 0.6;
/** How dark each player may set the full night (the opacity of the veil): from almost no night to almost black. */
export const NIGHT_DARKNESS_MIN = 0.05;
export const NIGHT_DARKNESS_MAX = 0.95;

// The night follows the real sun of the place of the map (Paris by default), for everybody, as the clock does.
const PARIS = { latitude: PARIS_LATITUDE, longitude: PARIS_LONGITUDE };

// Geometric elevations of the sun's centre. Sunrise and sunset: the upper limb on the horizon, with the standard
// refraction (34′) and the sun's semi-diameter (16′) already counted. Civil twilight: 6° below the horizon.
const SUNSET_ELEVATION = -0.833;
const CIVIL_TWILIGHT_ELEVATION = -6;

const NIGHT_AT_PATTERN = /^(\d{1,2}):(\d{2})$/;

const parisWallClockFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

function parisParts(date: Date): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
    const parts = parisWallClockFormatter.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);
    return {
        year: part("year"),
        month: part("month"),
        day: part("day"),
        hour: part("hour"),
        minute: part("minute"),
        second: part("second"),
    };
}

/** Calendar date in Paris for this instant (month from 1 to 12). */
export function parisCalendarDay(date: Date): { year: number; month: number; day: number } {
    const { year, month, day } = parisParts(date);
    return { year, month, day };
}

/** Offset of Paris time from UTC at this instant, in milliseconds (1 h in winter, 2 h in summer). */
function parisOffset(epoch: number): number {
    const p = parisParts(new Date(epoch));
    const wallClock = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return wallClock - Math.floor(epoch / 1000) * 1000;
}

/**
 * The instant at which Paris clocks show this date (month from 1 to 12) and these minutes since midnight. A time
 * skipped when the clocks go forward gives an instant an hour off, a time seen twice when they go back gives the
 * first one: both are in the middle of the night.
 */
export function parisWallClockToInstant(year: number, month: number, day: number, minutes: number): Date {
    const wallClock = Date.UTC(year, month - 1, day) + minutes * 60_000;
    let epoch = wallClock - parisOffset(wallClock);
    // The offset may differ once moved to the real instant (near a clock change): correct once.
    epoch = wallClock - parisOffset(epoch);
    return new Date(epoch);
}

const DEG = Math.PI / 180;

/**
 * Geometric elevation of the sun's centre above the horizon of Paris, in degrees, without refraction. Solar position
 * equations of the NOAA (Jean Meeus, "Astronomical Algorithms"), accurate to well under a minute of time for sunrise
 * and sunset: a few trigonometric functions, cheap enough to be called every second.
 */
export function sunElevationInParis(date: Date): number {
    return sunElevationAt(date, PARIS);
}

/** Same as sunElevationInParis, above the horizon of any place. */
export function sunElevationAt(date: Date, place: MapPlace): number {
    return sunPositionAt(date, place).elevation;
}

/** Where the sun is, in degrees: elevation above the horizon, azimuth from the north, clockwise. */
export interface SunPosition {
    elevation: number;
    azimuth: number;
}

/**
 * The sun the clouds are drawn with: as it is while the night is drawn; with the night turned off the map stays in
 * daylight, so below 2° the clouds keep showing, without shadows (no sun).
 */
export function sunForClouds(sun: SunPosition | undefined, nightDisabled: boolean): SunPosition | undefined {
    return nightDisabled && sun && sun.elevation < 2 ? undefined : sun;
}

/**
 * Where the sun is seen from a place: geometric elevation above the horizon and azimuth, both in degrees, the azimuth
 * from the north, clockwise (90 = east). Azimuth by Meeus 13.5, valid at any longitude and latitude.
 */
export function sunPositionAt(date: Date, place: MapPlace = PARIS): SunPosition {
    const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
    const t = (julianDay - 2_451_545) / 36_525; // Julian centuries since J2000.0

    const meanLongitude = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360;
    const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
    const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const center =
        Math.sin(meanAnomaly * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
        Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * t) +
        Math.sin(3 * meanAnomaly * DEG) * 0.000289;
    const omega = 125.04 - 1934.136 * t;
    const apparentLongitude = meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega * DEG);
    const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG);
    const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG));

    // Equation of time, in minutes.
    const y = Math.tan((obliquity / 2) * DEG) ** 2;
    const equationOfTime =
        (4 / DEG) *
        (y * Math.sin(2 * meanLongitude * DEG) -
            2 * eccentricity * Math.sin(meanAnomaly * DEG) +
            4 * eccentricity * y * Math.sin(meanAnomaly * DEG) * Math.cos(2 * meanLongitude * DEG) -
            0.5 * y * y * Math.sin(4 * meanLongitude * DEG) -
            1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * DEG));

    const utcMinutes = (((date.getTime() / 60_000) % 1440) + 1440) % 1440;
    const trueSolarMinutes = utcMinutes + equationOfTime + 4 * place.longitude;
    const hourAngle = (trueSolarMinutes / 4 - 180) * DEG;

    const latitude = place.latitude * DEG;
    const cosZenith =
        Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
    const elevation = 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / DEG;
    // Meeus measures from the south, westward; + 180° gives it from the north, clockwise.
    const fromSouth = Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
    );
    const azimuth = (((fromSouth / DEG + 180) % 360) + 360) % 360;
    return { elevation, azimuth };
}

/**
 * The place whose sun lights the map: its own on the server clock; Paris (undefined) for a clock read as Paris time
 * (the computer clock, `?nightAt`), whose instant is only right for the sun of Paris.
 */
export function sunPlaceOf(clockReadAsParis: boolean, mapPlace: MapPlace | undefined): MapPlace | undefined {
    return clockReadAsParis ? undefined : mapPlace;
}

/**
 * The opacity of the veil for a player who set how dark the full night is (`darkness`, NIGHT_MAX_OPACITY by default):
 * the dusk and the dawn keep their share of it, the day stays clear.
 */
export function nightOpacityWith(opacity: number, darkness: number): number {
    const kept = Number.isFinite(darkness)
        ? Math.min(NIGHT_DARKNESS_MAX, Math.max(NIGHT_DARKNESS_MIN, darkness))
        : NIGHT_MAX_OPACITY;
    return (opacity / NIGHT_MAX_OPACITY) * kept;
}

/**
 * Darkness of the night veil at this instant (0 = day, NIGHT_MAX_OPACITY = night), on the sun of the place (Paris by
 * default): none while
 * the sun is up, darkening from sunset to the end of the civil dusk, full until the civil dawn, fading out until
 * sunrise. The ramp is linear in the sun's elevation, which is almost linear in time over those 30 to 40 minutes.
 */
export function nightOpacityAt(date: Date, place: MapPlace = PARIS): number {
    const elevation = sunElevationAt(date, place);
    if (elevation >= SUNSET_ELEVATION) {
        return 0;
    }
    if (elevation <= CIVIL_TWILIGHT_ELEVATION) {
        return NIGHT_MAX_OPACITY;
    }
    return ((SUNSET_ELEVATION - elevation) / (SUNSET_ELEVATION - CIVIL_TWILIGHT_ELEVATION)) * NIGHT_MAX_OPACITY;
}

/**
 * Development override: "HH:MM" from the `nightAt` URL parameter, as minutes since midnight,
 * or undefined (absent, invalid, or not in dev mode).
 */
export function parseNightAt(search: string, isDev: boolean): number | undefined {
    if (!isDev) {
        return undefined;
    }
    const value = new URLSearchParams(search).get("nightAt");
    const match = value === null ? null : NIGHT_AT_PATTERN.exec(value);
    if (!match) {
        return undefined;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return undefined;
    }
    return hours * 60 + minutes;
}

/**
 * The time zone of the clock shown under the action bar: the one of the place of the map on the server clock (Paris
 * without one), the computer's own (undefined) for a player who follows their computer.
 */
export function worldClockTimeZone(computerClock: boolean, mapTimeZone: string | undefined): string | undefined {
    return computerClock ? undefined : (mapTimeZone ?? "Europe/Paris");
}
