import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type * as Phaser from "phaser";
import { Player } from "@wa/front/Phaser/Player/Player";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { WOKA_SPEED } from "@wa/front/Enum/EnvironmentVariable";
import {
    Vehicle,
    VehicleMode,
    VEHICLE_VARIABLE,
    VEHICLE_SPEED_FACTOR,
    readVehicleState,
} from "@wa/front/Phaser/Vehicle/Vehicle";

class Rider extends Player {
    public pathSpeed(): number {
        return super.getPathWalkingSpeed();
    }
}

function rider(): { player: Rider; publish: ReturnType<typeof vi.fn> } {
    const player = Object.create(Rider.prototype) as unknown as Rider;
    const publish = vi.fn();
    Object.assign(player, {
        vehicleState: readVehicleState(null),
        sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
        scene: { markDirty: vi.fn(), getPlayerVariablesManager: () => ({ setVariableFromApp: publish }) },
        playAnimation: vi.fn(),
        standUp: vi.fn(),
        setAvatarAction: vi.fn(),
        isInWater: () => false,
        swimming: false,
        isSlidingToSeat: false,
    });
    return { player, publish };
}

beforeEach(() => {
    localStorage.clear();
    followStateStore.set("off");
    localUserStore.setVehicle(Vehicle.Skateboard);
    localUserStore.setVehicleColors({ color: "#3258dd" });
});
afterEach(() => {
    followStateStore.set("off");
    vi.restoreAllMocks();
});

describe("vehicle riding", () => {
    it("uses the saved color, announces riding to peers and travels faster than sprinting", () => {
        const { player, publish } = rider();
        player.equipVehicle(VehicleMode.Always);
        expect(player.vehicleMode).toBe(VehicleMode.Always);
        expect(player.pathSpeed()).toBe(WOKA_SPEED * VEHICLE_SPEED_FACTOR);
        expect(player.pathSpeed()).toBeGreaterThan(WOKA_SPEED * 2.5);
        expect(publish).toHaveBeenCalledWith(
            VEHICLE_VARIABLE,
            {
                vehicle: Vehicle.Skateboard,
                mode: VehicleMode.Always,
                color: "#3258dd",
                edgeColor: "#d7aa6b",
                wheelsColor: "#b6383b",
            },
            { public: true, persist: false, scope: "room" },
        );
        player.equipVehicle(VehicleMode.Off);
        expect(player.pathSpeed()).toBe(WOKA_SPEED);
    });
    it("cannot mount in water, on an animal, or while following another player", () => {
        const { player, publish } = rider();
        Object.assign(player, { swimming: true });
        player.equipVehicle(VehicleMode.Always);
        Object.assign(player, { swimming: false, sprites: new Map([["duck", mock<Phaser.GameObjects.Sprite>()]]) });
        player.equipVehicle(VehicleMode.Always);
        Object.assign(player, { sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]) });
        followStateStore.set("active");
        player.equipVehicle(VehicleMode.Sprint);
        expect(publish).not.toHaveBeenCalled();
        expect(player.vehicleMode).toBe(VehicleMode.Off);
    });
    it("does not multiply swimming or sliding onto seats by the skateboard speed", () => {
        const { player } = rider();
        player.equipVehicle(VehicleMode.Always);
        Object.assign(player, { swimming: true });
        expect(player.pathSpeed()).toBe(WOKA_SPEED);
        Object.assign(player, { swimming: false, isSlidingToSeat: true });
        expect(player.pathSpeed()).toBe(WOKA_SPEED);
    });
});
