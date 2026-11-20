import { describe, expect, it } from "vitest";
import {
    activeVehicleMedium,
    sharedVehicleState,
    Vehicle,
    VehicleMedium,
    VehicleMode,
    VEHICLE_VARIABLE,
    vehicleMedia,
} from "@wa/front/Phaser/Vehicle/Vehicle";

describe("vehicles by medium", () => {
    it("selects water independently of the vehicle choice, and land on the shore", () => {
        expect(activeVehicleMedium({ deepWater: true })).toBe(VehicleMedium.Water);
        expect(activeVehicleMedium({ deepWater: false })).toBe(VehicleMedium.Land);
    });
    it("reserves the air medium for an explicit airborne state", () => {
        expect(activeVehicleMedium({ deepWater: false, airborne: true })).toBe(VehicleMedium.Air);
        expect(activeVehicleMedium({ deepWater: true, airborne: true })).toBe(VehicleMedium.Air);
        expect(activeVehicleMedium({ deepWater: true, airborne: false })).toBe(VehicleMedium.Water);
    });
    it("reads old clients and prefers valid medium states over a stale legacy state", () => {
        const oldState = { vehicle: Vehicle.Skateboard, mode: VehicleMode.Always };
        const variables = new Map<string, unknown>([[VEHICLE_VARIABLE, oldState]]);
        expect(sharedVehicleState(variables).vehicle).toBe(Vehicle.Skateboard);
        for (const medium of vehicleMedia)
            variables.set(medium.variable, { vehicle: medium.vehicles[1], mode: VehicleMode.Off });
        expect(sharedVehicleState(variables).mode).toBe(VehicleMode.Off);
        const water = vehicleMedia.find((medium) => medium.id === VehicleMedium.Water);
        if (!water) throw new Error("Missing water medium");
        variables.set(water.variable, { vehicle: Vehicle.Canoe, mode: VehicleMode.Always });
        expect(sharedVehicleState(variables).vehicle).toBe(Vehicle.Canoe);
        variables.set(water.variable, { vehicle: Vehicle.ElectricUnicycle, mode: VehicleMode.Always });
        expect(sharedVehicleState(variables).mode).toBe(VehicleMode.Off);
    });
});
