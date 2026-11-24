import { describe, expect, it } from "vitest";
import {
    newWaterProperties,
    rotatedWaterProperties,
    waterAnchorOf,
} from "../../../../../src/front/Phaser/Game/Terrain/WaterAnchor";

describe("waterAnchorOf", () => {
    it("is the middle of the foot of the object, from the corner of its image", () => {
        // A tree 96 px wide and 160 px high: its trunk stands at the middle, half a tile up from the bottom.
        expect(waterAnchorOf({ displayWidth: 96, displayHeight: 160 })).toEqual({ anchorX: 48, anchorY: 144 });
        // A small object of one tile: its own middle.
        expect(waterAnchorOf({ displayWidth: 32, displayHeight: 32 })).toEqual({ anchorX: 16, anchorY: 16 });
        expect(waterAnchorOf({ displayWidth: 9, displayHeight: 9 })).toEqual({ anchorX: 5, anchorY: 0 });
    });

    it("is the point its catalogue entry gives, when it gives one (the basin of a fountain, the middle of a chasm)", () => {
        const fountain = {
            displayWidth: 64,
            displayHeight: 64,
            getPrefab: () => ({ waterFlow: { kind: "source" as const, flow: 100, anchor: { x: 32, y: 40 } } }),
        };
        expect(waterAnchorOf(fountain)).toEqual({ anchorX: 32, anchorY: 40 });
    });
});

describe("newWaterProperties", () => {
    it("gives nothing to an object that is neither a source nor a sink", () => {
        expect(newWaterProperties({}, () => "id")).toEqual([]);
    });

    it("makes an object of the catalogue a source or a sink ready to use, its flow given in cubic metres an hour", () => {
        // 60 m³ an hour: 1000 litres a minute, as the property stores it.
        expect(
            newWaterProperties({ waterFlow: { kind: "source", flow: 60, anchor: { x: 32, y: 40 } } }, () => "id"),
        ).toEqual([{ id: "id", type: "waterSourcePropertyData", flow: 1000, anchorX: 32, anchorY: 40 }]);
        expect(newWaterProperties({ waterFlow: { kind: "sink", flow: 600 } }, () => "id")).toEqual([
            { id: "id", type: "waterSinkPropertyData", flow: 10000 },
        ]);
    });

    it("gives the object the radius of its catalogue entry, in tiles", () => {
        const [property] = newWaterProperties({ waterFlow: { kind: "sink", flow: 600, radius: 2.5 } }, () => "id");
        expect(property).toMatchObject({ radius: 2.5 });
    });

    it("never asks more than the largest flow", () => {
        const [property] = newWaterProperties({ waterFlow: { kind: "sink", flow: 1e12 } }, () => "id");
        expect(property).toMatchObject({ flow: 60_000_000 });
    });
});

describe("rotatedWaterProperties", () => {
    it("moves the water point of a channel turned upright, keeping its flow, radius and adaptive switch", () => {
        const lying = [
            {
                id: "k",
                type: "waterSinkPropertyData" as const,
                flow: 1000,
                radius: 2,
                adaptive: false,
                anchorX: 16,
                anchorY: 5,
            },
            { id: "o", type: "openWebsite" as const, link: "https://example.org" },
        ];
        const upright = rotatedWaterProperties(lying as never, {
            waterFlow: { kind: "sink", flow: 60, anchor: { x: 5, y: 16 } },
        });

        expect(upright?.[0]).toEqual({ ...lying[0], anchorX: 5, anchorY: 16 });
        expect(upright?.[1]).toBe(lying[1]);
    });

    it("leaves the properties as they are when the catalog gives no point", () => {
        const properties = [{ id: "k", type: "waterSinkPropertyData" as const, flow: 1, anchorX: 3, anchorY: 4 }];
        expect(rotatedWaterProperties(properties as never, { waterFlow: { kind: "sink", flow: 1 } })).toBe(properties);
        expect(
            rotatedWaterProperties(undefined, { waterFlow: { kind: "sink", flow: 1, anchor: { x: 1, y: 1 } } }),
        ).toBe(undefined);
    });
});
