import { describe, expect, it } from "vitest";
import { CELL_LITRES_PER_PX } from "../src/Terrain/WaterGrid";
import { ratesOf, stepInputOf, WATER_STEP_MS, waterObjectsOf } from "../src/Terrain/WaterInputs";
import type { WAMFileFormat } from "../src/types";

const prefabRef = { collectionName: "eau", id: "x" };
const wam = (entities: Record<string, unknown>): WAMFileFormat =>
    ({ version: "2.1.0", mapUrl: "m.tmj", areas: [], entityCollections: [], entities }) as WAMFileFormat;
const water = { runoff: 10, evaporation: 1, speed: 1, absorption: 5 };

describe("waterObjectsOf", () => {
    it("reads the sources and the sinks of the map, at the foot of their object", () => {
        const objects = waterObjectsOf(
            wam({
                // A tree: its foot is 48 px right and 150 px down from the corner of its image.
                spring: {
                    x: 100,
                    y: 200,
                    prefabRef,
                    properties: [{ id: "s", type: "waterSourcePropertyData", flow: 1200, anchorX: 48, anchorY: 150 }],
                },
                drain: { x: 16, y: 16, prefabRef, properties: [{ id: "k", type: "waterSinkPropertyData", flow: 300 }] },
                chair: { x: 16, y: 16, prefabRef },
                broken: {
                    x: 0,
                    y: 0,
                    prefabRef,
                    properties: [{ id: "b", type: "waterSourcePropertyData", flow: "lots" }],
                },
            }),
        );
        expect(objects).toEqual([
            // A source pours at its foot, a sink takes a tile and a half around (3 cells), unless a radius is set.
            { cellX: 9, cellY: 21, litresPerMinute: 1200, radiusCells: 0 },
            { cellX: 1, cellY: 1, litresPerMinute: -300, radiusCells: 3 },
        ]);
        const sized = waterObjectsOf(
            wam({
                wide: {
                    x: 0,
                    y: 0,
                    prefabRef,
                    properties: [{ id: "s", type: "waterSourcePropertyData", flow: 1, radius: 2 }],
                },
                deep: {
                    x: 0,
                    y: 0,
                    prefabRef,
                    properties: [{ id: "k", type: "waterSinkPropertyData", flow: 1, radius: 4.5 }],
                },
            }),
        );
        // A radius is set in tiles: two cells a tile.
        expect(sized.map((object) => object.radiusCells)).toEqual([4, 9]);
        expect(stepInputOf(water, 0, sized, 1).flows.map((flow) => flow.radius)).toEqual([4, 9]);
        expect(waterObjectsOf(undefined)).toEqual([]);
    });
});

describe("stepInputOf", () => {
    it("steps ten times a second", () => {
        expect(WATER_STEP_MS).toBe(100);
    });

    it("turns the rain into water over each dug cell, the runoff of the ground around included", () => {
        // One hour of 10 mm/h: 10 litres a m², so 3 litres on a cell of 0.3 m², times 11 with a runoff of 10.
        const input = stepInputOf(water, 10, [], 3600);
        expect(input.rainPx * CELL_LITRES_PER_PX).toBeCloseTo(33);
        // It rains: nothing evaporates.
        expect(input.evaporationPx).toBe(0);
    });

    it("evaporates in dry weather only, and lets the ground drink in any weather", () => {
        const dry = stepInputOf(water, 0, [], 3600);
        // 1 mm/h on 0.3 m²: 0.3 litre; 5 mm/h drunk: 1.5 litre.
        expect(dry.evaporationPx * CELL_LITRES_PER_PX).toBeCloseTo(0.3);
        expect(dry.absorptionPx * CELL_LITRES_PER_PX).toBeCloseTo(1.5);
        expect(stepInputOf(water, 4, [], 3600).absorptionPx * CELL_LITRES_PER_PX).toBeCloseTo(1.5);
        expect(dry.rainPx).toBe(0);
    });

    it("pours the sources and drains the sinks by their flow", () => {
        const objects = [
            { cellX: 2, cellY: 3, litresPerMinute: 600, radiusCells: 0 },
            { cellX: 5, cellY: 5, litresPerMinute: -120, radiusCells: 3 },
        ];
        // One second: 10 litres in, 2 litres out.
        const input = stepInputOf(water, 0, objects, 1);
        expect(input.flows.map((flow) => [flow.cellX, flow.cellY])).toEqual([
            [2, 3],
            [5, 5],
        ]);
        expect(input.flows[0].px * CELL_LITRES_PER_PX).toBeCloseTo(10);
        expect(input.flows[1].px * CELL_LITRES_PER_PX).toBeCloseTo(-2);
    });

    it("goes as many times faster as the map says, and survives broken settings", () => {
        const fast = stepInputOf(
            { ...water, speed: 60 },
            10,
            [{ cellX: 0, cellY: 0, litresPerMinute: 600, radiusCells: 0 }],
            60,
        );
        const real = stepInputOf(water, 10, [{ cellX: 0, cellY: 0, litresPerMinute: 600, radiusCells: 0 }], 3600);
        expect(fast.rainPx).toBeCloseTo(real.rainPx);
        expect(fast.flows[0].px).toBeCloseTo(real.flows[0].px);
        const broken = stepInputOf(
            { runoff: Number.NaN, evaporation: -3, speed: Number.NaN, absorption: Number.NaN },
            Number.NaN,
            [],
            1,
        );
        expect(broken).toEqual({ rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] });
        expect(stepInputOf(undefined, 10, [], 3600).rainPx).toBeGreaterThan(0);
    });
});

describe("ratesOf", () => {
    it("tells what came in and went out in cubic metres an hour of the time of the map", () => {
        // 1000 litres of rain and 250 litres to the sinks over half an hour: 2 and 0.5 m³/h.
        const px = (litres: number): number => litres / CELL_LITRES_PER_PX;
        const rates = ratesOf(
            { rainPx: px(1000), sourcesPx: 0, sinksPx: px(250), evaporationPx: 0, absorptionPx: 0, lostPx: 0 },
            1800,
            1,
        );
        expect(rates.rain).toBeCloseTo(2);
        expect(rates.sinks).toBeCloseTo(0.5);
        expect(rates.sources).toBe(0);
        // At speed 60 the same water in 30 seconds is the same rate of the time of the map.
        expect(
            ratesOf(
                { rainPx: px(1000), sourcesPx: 0, sinksPx: 0, evaporationPx: 0, absorptionPx: 0, lostPx: 0 },
                30,
                60,
            ).rain,
        ).toBeCloseTo(2);
        expect(
            ratesOf({ rainPx: 5, sourcesPx: 0, sinksPx: 0, evaporationPx: 0, absorptionPx: 0, lostPx: 0 }, 0, 1).rain,
        ).toBe(0);
    });
});
