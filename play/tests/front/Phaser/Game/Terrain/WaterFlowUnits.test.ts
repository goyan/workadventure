import { describe, expect, it } from "vitest";
import {
    flowInUnit,
    flowFromUnit,
    flowAtSlider,
    sliderOfFlow,
    WATER_FLOW_SLIDER_STEPS,
    steppedFlow,
    WATER_FLOW_UNITS,
} from "../../../../../src/front/Phaser/Game/Terrain/WaterFlowUnits";

describe("water flow units", () => {
    it("offers cubic metres an hour first, then litres a second, litres a minute and cubic metres a second", () => {
        expect(WATER_FLOW_UNITS.map((unit) => unit.id)).toEqual(["m3h", "ls", "lmin", "m3s"]);
    });

    it("shows a flow stored in litres a minute in each unit", () => {
        // 6000 litres a minute: 360 m³ an hour, 100 litres a second, 0.1 m³ a second.
        expect(flowInUnit(6000, "m3h")).toBe(360);
        expect(flowInUnit(6000, "ls")).toBe(100);
        expect(flowInUnit(6000, "lmin")).toBe(6000);
        expect(flowInUnit(6000, "m3s")).toBe(0.1);
        // No tail of digits from the division.
        expect(flowInUnit(1000, "ls")).toBe(16.667);
    });

    it("reads a typed value back to litres a minute, within the bounds of a flow", () => {
        expect(flowFromUnit(360, "m3h")).toBeCloseTo(6000, 6);
        expect(flowFromUnit(0.1, "m3s")).toBeCloseTo(6000, 6);
        expect(flowFromUnit(-5, "ls")).toBe(0);
        expect(flowFromUnit(Number.NaN, "ls")).toBe(0);
        expect(flowFromUnit(1e9, "m3s")).toBe(2_000_000);
    });

    it("steps up and down by the size of the value: units under 10, tens under 100, hundreds under 1000", () => {
        expect(steppedFlow(0, 1)).toBe(1);
        expect(steppedFlow(7, 1)).toBe(8);
        expect(steppedFlow(9, 1)).toBe(10);
        expect(steppedFlow(10, 1)).toBe(20);
        expect(steppedFlow(250, 1)).toBe(300);
        expect(steppedFlow(1000, 1)).toBe(2000);
        // Down from a round value: a step of the size below, so 100 goes to 90 and not to 0.
        expect(steppedFlow(100, -1)).toBe(90);
        expect(steppedFlow(20, -1)).toBe(10);
        expect(steppedFlow(10, -1)).toBe(9);
        expect(steppedFlow(1, -1)).toBe(0);
        expect(steppedFlow(0, -1)).toBe(0);
        // Small values of a large unit (cubic metres a second) step by tenths and hundredths.
        expect(steppedFlow(0.1, 1)).toBe(0.2);
        expect(steppedFlow(0.5, -1)).toBe(0.4);
        // A value between two steps lands on the next round one.
        expect(steppedFlow(257, 1)).toBe(300);
        expect(steppedFlow(257, -1)).toBe(200);
    });

    it("sets a flow with a slider that is fine near nothing and coarse near the largest flow", () => {
        expect(flowAtSlider(0)).toBe(0);
        expect(flowAtSlider(WATER_FLOW_SLIDER_STEPS)).toBe(2_000_000);
        // The middle of the slider is far under the middle of the range: about a thousandth of it.
        expect(flowAtSlider(WATER_FLOW_SLIDER_STEPS / 2)).toBeGreaterThan(500);
        expect(flowAtSlider(WATER_FLOW_SLIDER_STEPS / 2)).toBeLessThan(5000);
        // It never goes down when the slider goes up, and a flow finds its place back on it.
        let before = 0;
        for (let position = 1; position <= WATER_FLOW_SLIDER_STEPS; position++) {
            const flow = flowAtSlider(position);
            expect(flow).toBeGreaterThan(before);
            expect(sliderOfFlow(flow)).toBe(position);
            before = flow;
        }
        expect(sliderOfFlow(0)).toBe(0);
        expect(sliderOfFlow(1e12)).toBe(WATER_FLOW_SLIDER_STEPS);
        expect(sliderOfFlow(Number.NaN)).toBe(0);
    });
});
