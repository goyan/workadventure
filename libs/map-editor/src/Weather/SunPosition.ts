import { PARIS_LATITUDE, PARIS_LONGITUDE } from "./RealWeather";
import type { MapPlace } from "./RealWeather";

const DEG = Math.PI / 180;
/**
 * The sun has risen when its centre is this high (degrees): the refraction and its half disc, as almanacs count. The
 * night veil of the front starts at the same elevation.
 */
export const SUNRISE_ELEVATION = -0.833;

/** Where the sun is, in degrees: elevation above the horizon, azimuth from the north, clockwise. */
export interface SunPosition {
    elevation: number;
    azimuth: number;
}

/** What the sun is at an instant, wherever it is seen from. */
export interface SolarTerms {
    /** Declination of the sun, in radians. */
    declination: number;
    /** Equation of time, in minutes: how far the true solar time runs ahead of the mean one. */
    equationOfTime: number;
}

/** The terms of the sun that depend on the instant alone (NOAA, Meeus), shared by every place seen at that instant. */
export function solarTermsAt(date: Date): SolarTerms {
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
    return { declination, equationOfTime };
}

/** The true solar time at a longitude, in minutes, not brought back into the day. */
function unwrappedSolarMinutes(date: Date, equationOfTime: number, longitude: number): number {
    const utcMinutes = (((date.getTime() / 60_000) % 1440) + 1440) % 1440;
    return utcMinutes + equationOfTime + 4 * longitude;
}

/**
 * The true solar time at a longitude, in minutes since midnight (720: the sun at its highest), with the equation of
 * time: the time the sun of the game keeps.
 */
export function trueSolarMinutes(date: Date, longitude: number): number {
    const minutes = unwrappedSolarMinutes(date, solarTermsAt(date).equationOfTime, longitude);
    return ((minutes % 1440) + 1440) % 1440;
}

/**
 * Where the sun is seen from a place: geometric elevation above the horizon and azimuth, both in degrees, the azimuth
 * from the north, clockwise (90 = east). Azimuth by Meeus 13.5, valid at any longitude and latitude.
 */
export function sunPositionAt(date: Date, place: MapPlace): SunPosition {
    const { declination, equationOfTime } = solarTermsAt(date);
    const hourAngle = (unwrappedSolarMinutes(date, equationOfTime, place.longitude) / 4 - 180) * DEG;

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
 * Whether it is day at a place (the map's, Paris without one): from sunrise to sunset, as the day and night cycle of
 * the game draws it, not from fixed hours.
 */
export function isDaylightAt(date: Date, place: MapPlace | undefined): boolean {
    const where = place ?? { latitude: PARIS_LATITUDE, longitude: PARIS_LONGITUDE };
    return sunPositionAt(date, where).elevation > SUNRISE_ELEVATION;
}
