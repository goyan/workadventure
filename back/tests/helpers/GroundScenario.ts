import { cellKey, WeatherType, withHeights } from "@workadventure/map-editor";
import type { RealWeatherSlot, WAMFileFormat } from "@workadventure/map-editor";

/** A noon of November: the ground lives from there. */
export const GROUND_NOW = Date.UTC(2026, 10, 22, 12, 0);
/** A map of 48 × 48 cells of the relief (24 × 24 tiles). */
export const GROUND_MAP_CELLS = { width: 48, height: 48 };

/** A cold rain, quarter hour by quarter hour around `around`: part of it falls as snow. */
export function groundSlots(around: number, count = 12): RealWeatherSlot[] {
    const quarter = 15 * 60_000;
    const first = Math.floor(around / quarter) * quarter - 2 * quarter;
    return Array.from({ length: count }, (_, index) => ({
        at: first + index * quarter,
        weather: WeatherType.Rain,
        temperature: index % 3 === 0 ? -2 : 1,
        humidity: 85,
        rainRate: 30,
        windSpeed: 20,
        windFrom: 270,
    }));
}

/** A luck that gives the same numbers to each ground that asks. */
export function seededLuck(): () => number {
    let seed = 20261122;
    return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
}

/**
 * A map with all the ground has to deal with: a lake (cells 4..19), a source that pours next to a building, the floor
 * of that building (tiles 14..19, "Carte Sols") with a drain on it, a pond far from it, real weather, water with
 * inertia at sixty times reality.
 */
export function groundWam(): WAMFileFormat {
    const heights = new Map<string, number>();
    for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) heights.set(cellKey(x, y), -32);
    for (let y = 6; y < 12; y++) for (let x = 40; x < 46; x++) heights.set(cellKey(x, y), -8);
    const entities: WAMFileFormat["entities"] = {};
    for (let tileY = 14; tileY < 20; tileY++) {
        for (let tileX = 14; tileX < 20; tileX++) {
            entities[`floor-${tileX}-${tileY}`] = {
                x: tileX * 32,
                y: tileY * 32,
                prefabRef: { collectionName: "Carte Sols", id: "sol" },
            };
        }
    }
    entities.source = {
        x: 26 * 16 + 8,
        y: 34 * 16 + 8,
        prefabRef: { collectionName: "eau", id: "source" },
        properties: [{ id: "s", type: "waterSourcePropertyData", flow: 6000 }],
    };
    entities.drain = {
        x: 34 * 16 + 8,
        y: 34 * 16 + 8,
        prefabRef: { collectionName: "eau", id: "siphon" },
        properties: [{ id: "d", type: "waterSinkPropertyData", flow: 10 }],
    };
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities,
        settings: {
            weather: WeatherType.Real,
            weatherLocation: { name: "Nice", latitude: 43.7, longitude: 7.27, timezone: "Europe/Paris" },
            water: {
                runoff: 10,
                evaporation: 0.2,
                speed: 60,
                absorption: 5,
                current: 1,
                maxSurface: 18,
                indoorDrain: 300,
                inertia: true,
                updates: 5,
            },
        },
        terrain: withHeights(undefined, heights),
    };
}
