import { PARIS_LATITUDE, PARIS_LONGITUDE } from "../../../../common/RealWeather";
import type { MapPlace } from "../../../../common/RealWeather";
import type { SunPosition } from "./NightClock";

const DEG = Math.PI / 180;
const PARIS = { latitude: PARIS_LATITUDE, longitude: PARIS_LONGITUDE };
const EARTH_RADIUS_KM = 6378.14;

/** An angle brought back between 0 (included) and 360 (excluded), in degrees. */
const degrees360 = (angle: number): number => ((angle % 360) + 360) % 360;

/** Julian centuries since J2000.0 for an instant (taken as TD: ΔT, about a minute, is left out). */
function centuriesOf(date: Date): number {
    const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
    return (julianDay - 2_451_545) / 36_525;
}

/**
 * The main periodic terms of the longitude and distance of the Moon, Meeus "Astronomical Algorithms" table 47.A: the
 * multiples of D, M, M′ and F, then the coefficients of the longitude (0.000001°) and of the distance (0.001 km). Only
 * the terms of 0.001° and more in longitude are kept (the 21 left out add up to 0.0105° at most); their distance
 * terms come along.
 */
const LONGITUDE_DISTANCE_TERMS: readonly (readonly [number, number, number, number, number, number])[] = [
    [0, 0, 1, 0, 6288774, -20905355],
    [2, 0, -1, 0, 1274027, -3699111],
    [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925],
    [0, 1, 0, 0, -185116, 48888],
    [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158],
    [2, -1, -1, 0, 57066, -152138],
    [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586],
    [0, 1, -1, 0, -40923, -129620],
    [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755],
    [2, 0, 0, -2, 15327, 10321],
    [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661],
    [4, 0, -1, 0, 10675, -34782],
    [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636],
    [2, 1, -1, 0, -7888, 24208],
    [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379],
    [1, 1, 0, 0, 4987, -16675],
    [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445],
    [4, 0, 0, 0, 3861, -11650],
    [2, 0, -3, 0, 3665, 14403],
    [0, 1, -2, 0, -2689, -7003],
    [2, 0, -1, 2, -2602, 0],
    [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322],
    [2, -2, 0, 0, 2236, -9884],
    [0, 1, 2, 0, -2120, 5751],
    [0, 2, 0, 0, -2069, 0],
    [2, -2, -1, 0, 2048, -4950],
    [2, 0, 1, -2, -1773, 4130],
    [2, 0, 0, 2, -1595, 0],
    [4, -1, -1, 0, 1215, -3958],
    [0, 0, 2, 2, -1110, 0],
];

/**
 * The main periodic terms of the latitude of the Moon, Meeus table 47.B (0.000001°): the terms of 0.001° and more (the
 * 31 left out add up to 0.0103° at most).
 */
const LATITUDE_TERMS: readonly (readonly [number, number, number, number, number])[] = [
    [0, 0, 0, 1, 5128122],
    [0, 0, 1, 1, 280602],
    [0, 0, 1, -1, 277693],
    [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413],
    [2, 0, -1, -1, 46271],
    [2, 0, 0, 1, 32573],
    [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266],
    [0, 0, 2, -1, 8822],
    [2, -1, 0, -1, 8216],
    [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200],
    [2, 1, 0, -1, -3359],
    [2, -1, -1, 1, 2463],
    [2, -1, 0, 1, 2211],
    [2, -1, -1, -1, 2065],
    [0, 1, -1, -1, -1870],
    [4, 0, -1, -1, 1828],
    [0, 1, 0, 1, -1794],
    [0, 0, 0, 3, -1749],
    [0, 1, -1, 1, -1565],
    [1, 0, 0, 1, -1491],
    [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410],
    [0, 1, 0, -1, -1344],
    [1, 0, 0, -1, -1335],
    [0, 0, 3, 1, 1107],
    [4, 0, 0, -1, 1021],
];

/** The fundamental arguments of the lunar theory (Meeus 47.1 to 47.6), in degrees, for `t` Julian centuries. */
function lunarArguments(t: number): {
    meanLongitude: number;
    elongation: number;
    sunAnomaly: number;
    moonAnomaly: number;
    latitudeArgument: number;
} {
    return {
        meanLongitude: degrees360(
            218.3164477 + t * (481_267.88123421 + t * (-0.0015786 + t * (1 / 538_841 - t / 65_194_000))),
        ),
        elongation: degrees360(
            297.8501921 + t * (445_267.1114034 + t * (-0.0018819 + t * (1 / 545_868 - t / 113_065_000))),
        ),
        sunAnomaly: degrees360(357.5291092 + t * (35_999.0502909 + t * (-0.0001536 + t / 24_490_000))),
        moonAnomaly: degrees360(
            134.9633964 + t * (477_198.8675055 + t * (0.0087414 + t * (1 / 69_699 - t / 14_712_000))),
        ),
        latitudeArgument: degrees360(
            93.272095 + t * (483_202.0175233 + t * (-0.0036539 + t * (-1 / 3_526_000 + t / 863_310_000))),
        ),
    };
}

/** Where the Moon is seen from the centre of the Earth, in the ecliptic of the date. */
export interface MoonEcliptic {
    /** Geocentric ecliptic longitude and latitude, in degrees. */
    longitude: number;
    latitude: number;
    /** Distance between the centres of the Earth and the Moon, in km. */
    distance: number;
    /** Equatorial horizontal parallax, in degrees. */
    parallax: number;
}

/**
 * The geocentric ecliptic position of the Moon (Meeus chapter 47, main terms only), good to about 0.02° in longitude
 * and latitude: a hundred sines, cheap enough to be computed once a second.
 */
export function moonEclipticAt(date: Date): MoonEcliptic {
    const t = centuriesOf(date);
    const { meanLongitude, elongation, sunAnomaly, moonAnomaly, latitudeArgument } = lunarArguments(t);
    const a1 = 119.75 + 131.849 * t;
    const a2 = 53.09 + 479_264.29 * t;
    const a3 = 313.45 + 481_266.484 * t;
    // The eccentricity of the orbit of the Earth weakens the terms that hold the anomaly of the Sun.
    const e = 1 - t * (0.002516 + 0.0000074 * t);
    const eccentricity = (sunMultiple: number): number =>
        sunMultiple === 0 ? 1 : Math.abs(sunMultiple) === 1 ? e : e * e;
    const argument = (d: number, m: number, mPrime: number, f: number): number =>
        (d * elongation + m * sunAnomaly + mPrime * moonAnomaly + f * latitudeArgument) * DEG;

    let sumLongitude = 0;
    let sumDistance = 0;
    for (const [d, m, mPrime, f, longitude, distance] of LONGITUDE_DISTANCE_TERMS) {
        const angle = argument(d, m, mPrime, f);
        sumLongitude += longitude * eccentricity(m) * Math.sin(angle);
        sumDistance += distance * eccentricity(m) * Math.cos(angle);
    }
    sumLongitude +=
        3958 * Math.sin(a1 * DEG) +
        1962 * Math.sin((meanLongitude - latitudeArgument) * DEG) +
        318 * Math.sin(a2 * DEG);

    let sumLatitude = 0;
    for (const [d, m, mPrime, f, latitude] of LATITUDE_TERMS) {
        sumLatitude += latitude * eccentricity(m) * Math.sin(argument(d, m, mPrime, f));
    }
    sumLatitude +=
        -2235 * Math.sin(meanLongitude * DEG) +
        382 * Math.sin(a3 * DEG) +
        175 * Math.sin((a1 - latitudeArgument) * DEG) +
        175 * Math.sin((a1 + latitudeArgument) * DEG) +
        127 * Math.sin((meanLongitude - moonAnomaly) * DEG) -
        115 * Math.sin((meanLongitude + moonAnomaly) * DEG);

    const distance = 385_000.56 + sumDistance / 1000;
    return {
        longitude: degrees360(meanLongitude + sumLongitude / 1_000_000),
        latitude: sumLatitude / 1_000_000,
        distance,
        parallax: Math.asin(EARTH_RADIUS_KM / distance) / DEG,
    };
}

/** Mean obliquity of the ecliptic (Meeus 22.2), in degrees. */
function meanObliquity(t: number): number {
    return 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
}

/** Where the Moon is seen from the centre of the Earth, on the celestial sphere: both in degrees. */
export interface MoonEquatorial {
    rightAscension: number;
    declination: number;
}

/** The geocentric right ascension and declination of the Moon (Meeus 13.3 and 13.4), without the nutation (0.005°). */
export function moonEquatorialAt(date: Date): MoonEquatorial {
    return equatorialOf(moonEclipticAt(date), meanObliquity(centuriesOf(date)));
}

function equatorialOf(moon: MoonEcliptic, obliquity: number): MoonEquatorial {
    const longitude = moon.longitude * DEG;
    const latitude = moon.latitude * DEG;
    const epsilon = obliquity * DEG;
    const rightAscension = Math.atan2(
        Math.sin(longitude) * Math.cos(epsilon) - Math.tan(latitude) * Math.sin(epsilon),
        Math.cos(longitude),
    );
    const declination = Math.asin(
        Math.sin(latitude) * Math.cos(epsilon) + Math.cos(latitude) * Math.sin(epsilon) * Math.sin(longitude),
    );
    return { rightAscension: degrees360(rightAscension / DEG), declination: declination / DEG };
}

/** Mean sidereal time at Greenwich (Meeus 12.4), in degrees. */
function greenwichSiderealTime(date: Date): number {
    const days = date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545;
    const t = days / 36_525;
    return degrees360(280.46061837 + 360.98564736629 * days + t * t * (0.000387933 - t / 38_710_000));
}

/**
 * Where the Moon is seen from a place, in degrees, with the same conventions as the sun (sunPositionAt): elevation of
 * its centre above the horizon, without refraction, as seen from the surface of the Earth (the parallax lowers it by
 * up to 1°: a spherical Earth is assumed, good to a few seconds of arc); azimuth from the north, clockwise.
 */
export function moonPositionAt(date: Date, place: MapPlace = PARIS): SunPosition {
    const ecliptic = moonEclipticAt(date);
    const { rightAscension, declination } = equatorialOf(ecliptic, meanObliquity(centuriesOf(date)));
    const hourAngle = (greenwichSiderealTime(date) + place.longitude - rightAscension) * DEG;
    const latitude = place.latitude * DEG;
    const delta = declination * DEG;
    const sinElevation =
        Math.sin(latitude) * Math.sin(delta) + Math.cos(latitude) * Math.cos(delta) * Math.cos(hourAngle);
    const geocentric = Math.asin(Math.min(1, Math.max(-1, sinElevation)));
    const elevation = geocentric - Math.asin(Math.sin(ecliptic.parallax * DEG) * Math.cos(geocentric));
    // Meeus measures from the south, westward; + 180° gives it from the north, clockwise.
    const fromSouth = Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(delta) * Math.cos(latitude),
    );
    return { elevation: elevation / DEG, azimuth: degrees360(fromSouth / DEG + 180) };
}

/** How much of the Moon is lit: from 0 (new moon) to 1 (full moon), and whether it is growing. */
export interface MoonPhase {
    illuminated: number;
    waxing: boolean;
}

/**
 * The illuminated fraction of the disk of the Moon, by the approximate phase angle of Meeus (48.4), good to about
 * 0.01; waxing from the new moon to the full moon (the Moon east of the Sun).
 */
export function moonPhaseAt(date: Date): MoonPhase {
    const { elongation, sunAnomaly, moonAnomaly } = lunarArguments(centuriesOf(date));
    const sin = (angle: number): number => Math.sin(angle * DEG);
    const phaseAngle =
        180 -
        elongation -
        6.289 * sin(moonAnomaly) +
        2.1 * sin(sunAnomaly) -
        1.274 * sin(2 * elongation - moonAnomaly) -
        0.658 * sin(2 * elongation) -
        0.214 * sin(2 * moonAnomaly) -
        0.11 * sin(elongation);
    // The true elongation of the Moon from the Sun: 180° less the phase angle, eastward while waxing.
    return {
        illuminated: (1 + Math.cos(phaseAngle * DEG)) / 2,
        waxing: degrees360(180 - phaseAngle) < 180,
    };
}
