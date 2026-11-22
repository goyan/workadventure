import { describe, expect, it } from "vitest";
import { isPointName, mapPlaceNames } from "../../../../../src/front/Phaser/Game/Weather/MapPlaceName";
import {
    nearestCityOf,
    placeOfPoint,
    pointCoordinates,
    roundedDistanceKm,
} from "../../../../../src/front/Phaser/Game/Night/WorldDaylight";
import type { PointWords } from "../../../../../src/front/Phaser/Game/Night/WorldDaylight";

const french: PointWords = {
    north: "N",
    south: "S",
    east: "E",
    west: "O",
    far: (point, city, distance) => `${point} · ${city} à ${distance} km`,
    short: (city, distance) => `${city} ${distance} km`,
    kilometres: (km) => new Intl.NumberFormat("fr-FR").format(km),
};
const english: PointWords = {
    ...french,
    west: "W",
    far: (point, city, distance) => `${point} · ${city} ${distance} km away`,
};

describe("isPointName", () => {
    it("knows the coordinates a point is saved with, in every language, and no town", () => {
        expect(isPointName("24° N 122° E")).toBe(true);
        expect(isPointName("72° S 170° O")).toBe(true);
        expect(isPointName("46° N 40° W")).toBe(true);
        expect(isPointName("0° 180°")).toBe(true);
        expect(isPointName(pointCoordinates({ latitude: -33.9, longitude: -70.6 }, french))).toBe(true);
        expect(isPointName("Lille, Hauts-de-France, France")).toBe(false);
        expect(isPointName("Hong Kong")).toBe(false);
        expect(isPointName("Hong Kong 770 km")).toBe(false);
    });
});

describe("mapPlaceNames", () => {
    it("names a town without its region and country, short and long alike (the maps saved so far)", () => {
        expect(
            mapPlaceNames({ name: "Lille, Hauts-de-France, France", latitude: 50.63, longitude: 3.06 }, () => french),
        ).toEqual({ short: "Lille", long: "Lille" });
        expect(mapPlaceNames(undefined, () => french)).toBeUndefined();
    });

    it("names a point of the world as a player's own point, in the language of the reader", () => {
        const point = { latitude: 24.2, longitude: 121.9 };
        const saved = { name: "24° N 122° E", ...point };
        const own = placeOfPoint(point, french);
        expect(mapPlaceNames(saved, () => french)).toEqual({ short: own.name, long: own.longName ?? own.name });
        const { city, distanceKm } = nearestCityOf(point);
        expect(mapPlaceNames(saved, () => english)?.long).toBe(
            `24° N 122° E · ${city.name} ${new Intl.NumberFormat("fr-FR").format(roundedDistanceKm(distanceKm))} km away`,
        );
    });
});
