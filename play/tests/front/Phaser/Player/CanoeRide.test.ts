import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type * as Phaser from "phaser";
import { Player } from "@wa/front/Phaser/Player/Player";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { WOKA_SPEED } from "@wa/front/Enum/EnvironmentVariable";
import {
    CANOE_SPRINT_FACTOR,
    isCanoeAfloat,
    readVehicle,
    readVehicleState,
    Vehicle,
    VehicleMode,
    VEHICLE_VARIABLE,
    vehicleSpeedFactor,
} from "@wa/front/Phaser/Vehicle/Vehicle";

class Paddler extends Player {
    public pathSpeed(): number {
        return super.getPathWalkingSpeed();
    }
    public board(): void {
        this.updateCanoe();
    }
    public speed(speedUp: boolean): number {
        return this.canoeSpeed(speedUp);
    }
}

/** A player standing in `depth` pixels of water of the relief. */
function paddler(depth: number): { player: Paddler; publish: ReturnType<typeof vi.fn>; water: { depth: number } } {
    const player = Object.create(Paddler.prototype) as unknown as Paddler;
    const publish = vi.fn();
    const water = { depth };
    Object.assign(player, {
        x: 100,
        y: 100,
        floorZ: 0,
        vehicleState: readVehicleState(null),
        sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
        scene: {
            markDirty: vi.fn(),
            time: { now: 0 },
            getTerrainWater: () => ({ depthAt: () => water.depth }),
            getPlayerVariablesManager: () => ({ setVariableFromApp: publish }),
        },
        playAnimation: vi.fn(),
        standUp: vi.fn(),
        setAvatarAction: vi.fn(),
        isInWater: () => true,
        swimming: false,
        isSlidingToSeat: false,
    });
    return { player, publish, water };
}

beforeEach(() => {
    localStorage.clear();
    followStateStore.set("off");
    localUserStore.setVehicle(Vehicle.Canoe);
    localUserStore.setVehicleColors({ color: "#3258dd" });
});
afterEach(() => {
    followStateStore.set("off");
    vi.restoreAllMocks();
});

describe("the canoe", () => {
    it("is a vehicle one may choose, that goes at walking speed, twice as fast when paddling hard", () => {
        expect(readVehicle("canoe")).toBe(Vehicle.Canoe);
        expect(vehicleSpeedFactor(Vehicle.Canoe)).toBe(1);
        expect(CANOE_SPRINT_FACTOR).toBe(2);
        expect(isCanoeAfloat(readVehicleState({ vehicle: "canoe", mode: "always" }))).toBe(true);
        expect(isCanoeAfloat(readVehicleState({ vehicle: "canoe", mode: "off" }))).toBe(false);
        expect(isCanoeAfloat(readVehicleState({ vehicle: "skateboard", mode: "always" }))).toBe(false);
    });

    it("is boarded by itself over water deep enough to swim, and tells the others", () => {
        // 20 px of water: one would swim (16 px and more). The avatar is shown swimming for an instant: still boarded.
        const { player, publish } = paddler(20);
        player.board();
        expect(player.vehicleMode).toBe(VehicleMode.Always);
        expect(publish).toHaveBeenCalledWith(
            VEHICLE_VARIABLE,
            expect.objectContaining({ vehicle: Vehicle.Canoe, mode: VehicleMode.Always, color: "#3258dd" }),
            { public: true, persist: false, scope: "room" },
        );
        // Afloat: the speed of a walker, not the slower one of a swimmer; twice that when paddling hard.
        expect(player.pathSpeed()).toBe(WOKA_SPEED);
        expect(player.speed(false)).toBe(WOKA_SPEED);
        expect(player.speed(true)).toBe(WOKA_SPEED * 2);
        player.board();
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it("is left on the shore: out of deep water the avatar walks", () => {
        const { player, publish, water } = paddler(20);
        player.board();
        water.depth = 6;
        player.board();
        expect(player.vehicleMode).toBe(VehicleMode.Off);
        expect(publish).toHaveBeenCalledTimes(2);
    });

    it("is never ridden on the ground, by the wheel of actions nor by a sprint", () => {
        const { player, publish } = paddler(0);
        Object.assign(player, { isInWater: () => false });
        player.equipVehicle(VehicleMode.Always);
        player.equipVehicle(VehicleMode.Sprint);
        player.board();
        expect(player.vehicleMode).toBe(VehicleMode.Off);
        expect(publish).not.toHaveBeenCalled();
    });

    it("is not boarded in a pool, on a raised floor, while following someone, nor by an animal costume", () => {
        const pool = paddler(20);
        Object.assign(pool.player, { swimming: true });
        pool.player.board();
        expect(pool.player.vehicleMode).toBe(VehicleMode.Off);
        const upstairs = paddler(20);
        Object.assign(upstairs.player, { floorZ: 52 });
        upstairs.player.board();
        expect(upstairs.player.vehicleMode).toBe(VehicleMode.Off);
        const follower = paddler(20);
        followStateStore.set("active");
        follower.player.board();
        expect(follower.player.vehicleMode).toBe(VehicleMode.Off);
        followStateStore.set("off");
        const duck = paddler(20);
        Object.assign(duck.player, { sprites: new Map([["duck", mock<Phaser.GameObjects.Sprite>()]]) });
        duck.player.board();
        expect(duck.player.vehicleMode).toBe(VehicleMode.Off);
    });

    it("leaves the swimmers alone: with another vehicle chosen, deep water is swum", () => {
        localUserStore.setVehicle(Vehicle.Skateboard);
        const { player, publish } = paddler(20);
        player.board();
        expect(player.vehicleMode).toBe(VehicleMode.Off);
        expect(publish).not.toHaveBeenCalled();
    });
});
