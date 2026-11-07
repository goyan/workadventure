import { beforeEach, describe, expect, it } from "vitest";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { DEFAULT_VEHICLE_COLOR, Vehicle } from "@wa/front/Phaser/Vehicle/Vehicle";

describe("saved vehicle", () => {
    beforeEach(() => localStorage.clear());
    it("offers a skateboard by default and saves the selected vehicle and paint color", () => {
        expect(localUserStore.getVehicle()).toBe(Vehicle.Skateboard);
        localUserStore.setVehicle(Vehicle.Skateboard);
        localUserStore.setVehicleColors({ color: "#4B79D8", edgeColor: "#abcdef", wheelsColor: "#ee2288" });
        expect(localUserStore.getVehicle()).toBe(Vehicle.Skateboard);
        expect(localUserStore.getVehicleColors().color).toBe("#4b79d8");
    });
    it("respects the explicit choice to stay on foot", () => {
        localUserStore.setVehicle(Vehicle.None);
        expect(localUserStore.getVehicle()).toBe(Vehicle.None);
    });
    it("rejects invalid saved choices", () => {
        localUserStore.setVehicle("unknown");
        localUserStore.setVehicleColors({ color: "bad" });
        expect(localUserStore.getVehicle()).toBe(Vehicle.None);
        expect(localUserStore.getVehicleColors().color).toBe(DEFAULT_VEHICLE_COLOR);
    });
});
