import { describe, expect, it } from "vitest";
import { cellKey, GroundSimulation, MeadowSimulation, WaterSimulation, WeatherType, withHeights } from "../src";
import type { RealWeatherSlot, TerrainData, WAMFileFormat } from "../src";

const NOW = Date.UTC(2026, 10, 22, 12, 0);
// A hollow of 6 × 6 cells, one tile deep, on a map of 16 × 16 cells.
const hollow: TerrainData = withHeights(
    undefined,
    new Map(Array.from({ length: 36 }, (_, index) => [cellKey(4 + (index % 6), 4 + Math.floor(index / 6)), -32])),
);
const MAP_CELLS = { width: 16, height: 16 };
const wam: WAMFileFormat = {
    version: "2.1.0",
    mapUrl: "map.tmj",
    areas: [],
    entityCollections: [],
    entities: {},
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
        },
    },
    terrain: hollow,
};
/** A cold rain: part of it falls as snow, which melts on the meadow and runs to the water. */
const slots: RealWeatherSlot[] = [
    { at: NOW - 60_000, weather: WeatherType.Rain, temperature: 1, humidity: 85, rainRate: 30, windSpeed: 20 },
];
const air = { temperature: 1, humidity: 85 };

/** A random that gives the same numbers to each ground. */
function luck(): () => number {
    let seed = 12345;
    return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
}

interface Told {
    told: string[];
}

function parts(into: Told): { water: () => WaterSimulation; meadow: (water: WaterSimulation) => MeadowSimulation } {
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (message: unknown) => {
            into.told.push(
                JSON.stringify(message, (_key, value: unknown) =>
                    value instanceof Uint8Array ? Array.from(value) : value,
                ),
            );
        },
    };
    const rain = { slotsFor: () => slots };
    const asIs = (bytes: Uint8Array): Uint8Array => bytes;
    const random = luck();
    return {
        water: () =>
            new WaterSimulation(
                room,
                rain,
                asIs,
                () => NOW,
                () => MAP_CELLS,
                () => 0,
            ),
        meadow: (water) =>
            new MeadowSimulation(
                room,
                rain,
                () => water.getGrid(),
                asIs,
                () => NOW,
                () => MAP_CELLS,
                () => [],
                () => ({ danger: 0.2, windFrom: 270, windSpeed: 20 }),
                random,
            ),
    };
}

/** Stops the timers a start set: the steps are driven by hand. */
function byHand(simulation: { stop(): void }): void {
    simulation.stop();
}

describe("GroundSimulation", () => {
    it("wires the water and the meadow as wiring them by hand does: the same states are told", () => {
        // By hand, as the server and the browser each did.
        const hand: Told = { told: [] };
        const made = parts(hand);
        const water = made.water();
        water.fallThrough(() => air);
        water.setWalkers(() => [{ x: 100, y: 100 }]);
        const meadow = made.meadow(water);
        meadow.fallThrough(() => air);
        meadow.snowUnder(() => ({ ...air, windSpeed: 20 }));
        meadow.pourWith(water.pour.bind(water));
        water.start();
        meadow.start();
        byHand(water);
        byHand(meadow);

        const wired: Told = { told: [] };
        const same = parts(wired);
        let groundWater: WaterSimulation | undefined;
        const ground = new GroundSimulation({
            makeWater: () => (groundWater = same.water()),
            makeMeadow: () => same.meadow(groundWater as WaterSimulation),
            air: () => air,
            snow: () => ({ ...air, windSpeed: 20 }),
            walkers: () => [{ x: 100, y: 100 }],
        });
        ground.start();
        byHand(ground);

        for (let step = 0; step < 400; step++) {
            water.step();
            ground.water.step();
            if (step % 20 === 0) {
                meadow.step();
                ground.meadow.step();
            }
            if (step === 150) {
                water.strike(160, 160, 2);
                meadow.shatter(160, 160, 2);
                ground.strike(160, 160, 2);
            }
            if (step === 250) {
                water.vaporise(200, 200, 2);
                meadow.scorch(200, 200, 2, 7);
                ground.burn(200, 200, 2, 7);
            }
        }
        expect(wired.told.length).toBeGreaterThan(10);
        expect(wired.told).toEqual(hand.told);
        expect(ground.water.getGrid()?.writeDepths(true)).toEqual(water.getGrid()?.writeDepths(true));
    });

    it("gives the meadow the water it was made over", () => {
        const told: Told = { told: [] };
        const made = parts(told);
        let seen: unknown;
        const ground = new GroundSimulation({
            makeWater: made.water,
            makeMeadow: (water) => {
                seen = water;
                return made.meadow(
                    new WaterSimulation(
                        { getWam: () => wam, sendSubMessageToRoom: () => undefined },
                        { slotsFor: () => slots },
                        (bytes) => bytes,
                    ),
                );
            },
            air: () => air,
            snow: () => undefined,
            walkers: () => [],
        });
        ground.water.start();
        byHand(ground.water);
        expect((seen as () => unknown)()).toBe(ground.water.getGrid());
    });
});
