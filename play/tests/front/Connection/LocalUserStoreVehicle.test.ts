import { beforeEach, describe, expect, it } from "vitest";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import {
    AIRPLANE_DEFAULT_COLORS,
    DEFAULT_VEHICLE_COLOR,
    Vehicle,
    VehicleMedium,
    VEHICLE_PREFERENCE_KEY,
} from "@wa/front/Phaser/Vehicle/Vehicle";

describe("saved vehicle", () => {
    beforeEach(() => localStorage.clear());
    it("migrates the legacy choice to its medium without losing the other choice", () => {
        localStorage.setItem(VEHICLE_PREFERENCE_KEY, Vehicle.Canoe);
        expect(localUserStore.getVehicleForMedium(VehicleMedium.Water)).toBe(Vehicle.Canoe);
        expect(localUserStore.getVehicleForMedium(VehicleMedium.Land)).toBe(Vehicle.None);
        localUserStore.setVehicleForMedium(VehicleMedium.Land, Vehicle.ElectricUnicycle);
        expect(localUserStore.getVehicleForMedium(VehicleMedium.Water)).toBe(Vehicle.Canoe);
        expect(localUserStore.getVehicleForMedium(VehicleMedium.Land)).toBe(Vehicle.ElectricUnicycle);
        localUserStore.setVehicleForMedium(VehicleMedium.Water, Vehicle.Skateboard);
        expect(localUserStore.getVehicleForMedium(VehicleMedium.Water)).toBe(Vehicle.None);
    });
    it("saves the airplane independently of the land and water vehicles", () => {
        localUserStore.setVehicleForMedium(VehicleMedium.Land, Vehicle.ElectricUnicycle);
        localUserStore.setVehicleForMedium(VehicleMedium.Water, Vehicle.Canoe);
        localUserStore.setVehicleForMedium(VehicleMedium.Air, Vehicle.Airplane);
        expect(localUserStore.getVehiclePreferences()).toEqual({
            [VehicleMedium.Air]: Vehicle.Airplane,
            [VehicleMedium.Land]: Vehicle.ElectricUnicycle,
            [VehicleMedium.Water]: Vehicle.Canoe,
        });
    });
    it("offers a skateboard by default and saves the selected vehicle and paint color", () => {
        expect(localUserStore.getVehicle()).toBe(Vehicle.Skateboard);
        localUserStore.setVehicle(Vehicle.Skateboard);
        localUserStore.setVehicleColors(Vehicle.Skateboard, {
            color: "#4B79D8",
            edgeColor: "#abcdef",
            wheelsColor: "#ee2288",
        });
        expect(localUserStore.getVehicle()).toBe(Vehicle.Skateboard);
        expect(localUserStore.getVehicleColors(Vehicle.Skateboard).color).toBe("#4b79d8");
    });
    it("respects the explicit choice to stay on foot", () => {
        localUserStore.setVehicle(Vehicle.None);
        expect(localUserStore.getVehicle()).toBe(Vehicle.None);
    });
    it("rejects invalid saved choices", () => {
        localUserStore.setVehicle("unknown");
        localUserStore.setVehicleColors(Vehicle.Skateboard, { color: "bad" });
        expect(localUserStore.getVehicle()).toBe(Vehicle.None);
        expect(localUserStore.getVehicleColors(Vehicle.Skateboard).color).toBe(DEFAULT_VEHICLE_COLOR);
    });
    it("keeps the colours of each vehicle apart: painting the airplane leaves the unicycle as it was", () => {
        localUserStore.setVehicleColors(Vehicle.ElectricUnicycle, { color: "#123456" });
        localUserStore.setVehicleColors(Vehicle.Airplane, { color: "#ff0000", edgeColor: "#ffff00" });
        expect(localUserStore.getVehicleColors(Vehicle.ElectricUnicycle).color).toBe("#123456");
        expect(localUserStore.getVehicleColors(Vehicle.ElectricUnicycle).edgeColor).not.toBe("#ffff00");
        expect(localUserStore.getVehicleColors(Vehicle.Airplane)).toEqual({
            ...AIRPLANE_DEFAULT_COLORS,
            color: "#ff0000",
            edgeColor: "#ffff00",
        });
    });
    it("starts the airplane with the colours of its drawing", () => {
        expect(localUserStore.getVehicleColors(Vehicle.Airplane)).toEqual(AIRPLANE_DEFAULT_COLORS);
    });
    it("gives the former set shared by all vehicles to those of the ground and the water, not to the airplane", () => {
        localStorage.setItem(`${VEHICLE_PREFERENCE_KEY}Colors`, JSON.stringify({ color: "#4b79d8" }));
        expect(localUserStore.getVehicleColors(Vehicle.Skateboard).color).toBe("#4b79d8");
        expect(localUserStore.getVehicleColors(Vehicle.Canoe).color).toBe("#4b79d8");
        expect(localUserStore.getVehicleColors(Vehicle.Airplane)).toEqual(AIRPLANE_DEFAULT_COLORS);
        localUserStore.setVehicleColors(Vehicle.Skateboard, { color: "#000000" });
        expect(localUserStore.getVehicleColors(Vehicle.Canoe).color).toBe("#4b79d8");
    });
});
