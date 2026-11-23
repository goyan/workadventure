import { describe, expect, it } from "vitest";
import { fastWaterPace } from "../../../src/front/Stores/FastWaterStore";

describe("fastWaterPace", () => {
    it("says the water goes sixty times faster, its currents too while the computer holds them", () => {
        expect(fastWaterPace(undefined)).toEqual({ speed: 60 });
        expect(fastWaterPace(60)).toEqual({ speed: 60 });
    });

    it("says how fast the currents go when they cap, and how much higher the flowing water stands", () => {
        const pace = fastWaterPace(11);
        expect(pace.reached).toBe(11);
        // (60 / 11) ^ 0.6 = 2.77: Manning, the flow of a stream goes as its depth to the 5/3.
        expect(pace.higher).toBeCloseTo(2.8, 1);
    });
});
