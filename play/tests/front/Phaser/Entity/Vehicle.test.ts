import { describe, expect, it } from "vitest";
import {
    AIRPLANE_DEFAULT_COLORS,
    DEFAULT_VEHICLE_COLOR,
    defaultVehicleColors,
    Vehicle,
    VehicleMode,
    readVehicleState,
    readVehicleColors,
} from "@wa/front/Phaser/Vehicle/Vehicle";

describe("vehicle state and colors", () => {
    it.each([
        null,
        "skateboard",
        {},
        { vehicle: "invalid", mode: VehicleMode.Always },
        { vehicle: Vehicle.Skateboard, mode: "invalid" },
    ])("rejects unrecognized public state %j", (state) => {
        expect(readVehicleState(state).mode).toBe(VehicleMode.Off);
    });

    it("accepts only a hex color and a supported riding mode", () => {
        expect(readVehicleState({ vehicle: Vehicle.Skateboard, mode: VehicleMode.Sprint, color: "#329BEA" })).toEqual({
            vehicle: Vehicle.Skateboard,
            mode: VehicleMode.Sprint,
            color: "#329bea",
            edgeColor: "#d7aa6b",
            wheelsColor: "#b6383b",
        });
        expect(
            readVehicleState({ vehicle: Vehicle.Skateboard, mode: VehicleMode.Always, color: "url(bad)" }).color,
        ).toBe(DEFAULT_VEHICLE_COLOR);
    });

    it("validates all three paint parts independently", () => {
        // A wrong value falls back on the default of its own part, for the vehicle it paints.
        expect(readVehicleColors({ color: "#112233", edgeColor: "bad", wheelsColor: "#AA33BB" })).toEqual({
            color: "#112233",
            edgeColor: defaultVehicleColors().edgeColor,
            wheelsColor: "#aa33bb",
        });
        expect(readVehicleColors({ edgeColor: "bad" }, Vehicle.Airplane)).toEqual(AIRPLANE_DEFAULT_COLORS);
    });
});
