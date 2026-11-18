import { describe, expect, it } from "vitest";
import { waterMarkLabel, waterMarkRadius, waterMarksOf } from "../../../../../src/front/Phaser/Game/Terrain/WaterMarks";

function wamOf(entities: Record<string, { x: number; y: number; properties?: unknown[] }>) {
    // Only the position and the properties of the objects are read.
    return { entities } as unknown as Parameters<typeof waterMarksOf>[0];
}
const source = (flow: number, more: object = {}) => ({ id: "s", type: "waterSourcePropertyData", flow, ...more });
const sink = (flow: number, more: object = {}) => ({ id: "k", type: "waterSinkPropertyData", flow, ...more });

describe("the sources and the sinks shown while the relief is edited", () => {
    it("finds every object with a water property, and no other", () => {
        const marks = waterMarksOf(
            wamOf({
                fountain: { x: 100, y: 200, properties: [source(600)] },
                hole: { x: 300, y: 40, properties: [sink(1200)] },
                chair: { x: 0, y: 0, properties: [{ id: "j", type: "jitsiRoomProperty", roomName: "a" }] },
                rock: { x: 10, y: 10 },
            }),
        );
        expect(marks.map((mark) => [mark.kind, mark.litresPerMinute])).toEqual([
            ["source", 600],
            ["sink", 1200],
        ]);
    });

    it("stands where the water comes out: the middle of the cell under the foot of the object", () => {
        const [mark] = waterMarksOf(
            wamOf({ fountain: { x: 100, y: 200, properties: [source(600, { anchorX: 32, anchorY: 60 })] } }),
        );
        // (132, 260) is in the cell (8, 16) of 16 px.
        expect([mark.x, mark.y]).toEqual([136, 264]);
    });

    it("shows a source or a sink that is turned off too: it is the one to find and set", () => {
        const marks = waterMarksOf(
            wamOf({ a: { x: 0, y: 0, properties: [source(0)] }, b: { x: 64, y: 0, properties: [sink(0)] } }),
        );
        expect(marks.map((mark) => mark.kind)).toEqual(["source", "sink"]);
    });

    it("knows the disc of each: at its foot for a source, a tile and a half for a sink, or the radius it was given", () => {
        const marks = waterMarksOf(
            wamOf({
                a: { x: 0, y: 0, properties: [source(60)] },
                b: { x: 0, y: 0, properties: [sink(60)] },
                c: { x: 0, y: 0, properties: [sink(60, { radius: 4 })] },
            }),
        );
        expect(marks.map((mark) => mark.discPx)).toEqual([0, 48, 128]);
    });

    it("leaves out a broken property", () => {
        expect(
            waterMarksOf(wamOf({ a: { x: 0, y: 0, properties: [source(-5), { type: "waterSinkPropertyData" }] } })),
        ).toEqual([]);
        expect(waterMarksOf(undefined)).toEqual([]);
    });

    it("says the flow in cubic metres an hour, + for a source and − for a sink", () => {
        const [fountain, hole, off] = waterMarksOf(
            wamOf({
                a: { x: 0, y: 0, properties: [source(1000)] },
                b: { x: 0, y: 0, properties: [sink(50)] },
                c: { x: 0, y: 0, properties: [sink(0)] },
            }),
        );
        expect(waterMarkLabel(fountain)).toBe("+60 m³/h");
        expect(waterMarkLabel(hole)).toBe("−3 m³/h");
        expect(waterMarkLabel(off)).toBe("0 m³/h");
    });

    it("keeps its size on the screen when the map is zoomed out, and never shrinks under its size on the map", () => {
        expect(waterMarkRadius(1)).toBe(14);
        expect(waterMarkRadius(0.25)).toBe(56);
        expect(waterMarkRadius(4)).toBe(10);
    });
});
