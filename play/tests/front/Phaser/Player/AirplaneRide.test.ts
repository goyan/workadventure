import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type * as Phaser from "phaser";
import { AirplaneFlight } from "@wa/front/Phaser/Vehicle/AirplaneFlight";
import { Player } from "@wa/front/Phaser/Player/Player";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { ActiveEventList, UserInputEvent } from "@wa/front/Phaser/UserInput/UserInputManager";
import {
    AIRPLANE_DEFAULT_COLORS,
    AIRPLANE_MIN_FLIGHT_ALTITUDE,
    readVehicleState,
    Vehicle,
    VehicleMedium,
    VehicleMode,
    VEHICLE_VARIABLE,
} from "@wa/front/Phaser/Vehicle/Vehicle";
import { loadLocaleAsync } from "@wa/i18n/i18n-util.async";
import { setLocale } from "@wa/i18n/i18n-svelte";

function pilot(): {
    player: Player;
    publish: ReturnType<typeof vi.fn>;
    landingClear: ReturnType<typeof vi.fn>;
    water: { depth: number };
} {
    const player = Object.create(Player.prototype) as unknown as Player;
    const publish = vi.fn();
    const landingClear = vi.fn(() => true);
    const water = { depth: 0 };
    Object.assign(player, {
        x: 100,
        y: 100,
        floorZ: 0,
        vehicleState: readVehicleState(null),
        flight: new AirplaneFlight(),
        sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
        scene: {
            markDirty: vi.fn(),
            time: { now: 0 },
            getTerrainWater: () => ({ depthAt: () => water.depth }),
            getPlayerVariablesManager: () => ({ setVariableFromApp: publish }),
            getGameMapFrontWrapper: () => ({
                getTileDimensions: () => ({ width: 32, height: 32 }),
                getCollisionGrid: () => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
                isTileCollisionPathClear: landingClear,
                getEntitiesManager: () => ({ getEntities: () => new Map() }),
                // The test's switch for occupied ground drives the landing obstacles.
                getLandingObstacles: () => ({ blocksPoint: () => !landingClear() }),
            }),
            getOutdoorGrid: () => undefined,
            isPositionAllowedForCurrentUser: () => true,
        },
        getBody: () => ({ x: 92, y: 100, width: 16, height: 16, offset: { y: 8 } }),
        playAnimation: vi.fn(),
        standUp: vi.fn(),
        setAvatarAction: vi.fn(),
        finishFollowingPath: vi.fn(),
        isInWater: () => false,
        swimming: false,
        isSlidingToSeat: false,
        landPrompt: { show: vi.fn(), hide: vi.fn() },
        leavePrompt: { show: vi.fn(), hide: vi.fn() },
    });
    return { player, publish, landingClear, water };
}

beforeAll(async () => {
    await loadLocaleAsync("en-US");
    setLocale("en-US");
});
beforeEach(() => {
    localStorage.clear();
    followStateStore.set("off");
    localUserStore.setVehicleForMedium(VehicleMedium.Land, Vehicle.Skateboard);
    localUserStore.setVehicleForMedium(VehicleMedium.Water, Vehicle.Canoe);
    localUserStore.setVehicleForMedium(VehicleMedium.Air, Vehicle.Airplane);
});
afterEach(() => {
    followStateStore.set("off");
    vi.restoreAllMocks();
});

describe("airplane flight", () => {
    it("activates the airplane, surflies ground obstacles, publishes it and restores the equipped land vehicle", () => {
        const { player, publish } = pilot();
        player.equipVehicle(VehicleMode.Always);
        player.toggleAirVehicle();
        expect(player.isInAirplane()).toBe(true);
        expect(player.isFlying()).toBe(false);
        // What the others see: the airplane in its own colours, not those of the skateboard.
        expect(publish).toHaveBeenCalledWith(
            VEHICLE_VARIABLE,
            expect.objectContaining({ vehicle: Vehicle.Airplane, ...AIRPLANE_DEFAULT_COLORS }),
            { public: true, persist: false, scope: "room" },
        );
        player.setVehicle({ vehicle: Vehicle.Airplane, mode: VehicleMode.Always, altitude: 96 });
        expect(player.isInAirplane()).toBe(true);
        expect(player.isNearGround()).toBe(false);
        expect(player.isOnFloor(0)).toBe(false);
        expect(publish).toHaveBeenCalledWith(
            VEHICLE_VARIABLE,
            expect.objectContaining({ vehicle: Vehicle.Airplane, mode: VehicleMode.Always }),
            { public: true, persist: false, scope: "room" },
        );
        player.toggleAirVehicle();
        expect(player.isFlying()).toBe(false);
        expect(player.vehicle).toBe(Vehicle.Skateboard);
        expect(player.vehicleMode).toBe(VehicleMode.Always);
        expect(player.isNearGround()).toBe(true);
    });
    it("returns to the canoe when deactivated over deep terrain water", () => {
        const { player, water } = pilot();
        water.depth = 20;
        player.toggleAirVehicle();
        expect(player.vehicle).toBe(Vehicle.Airplane);
        player.toggleAirVehicle();
        expect(player.vehicle).toBe(Vehicle.Canoe);
        expect(player.vehicleMode).toBe(VehicleMode.Always);
    });
    it("keeps flying over an occupied landing spot, including when choosing no airplane", () => {
        const { player, landingClear } = pilot();
        player.toggleAirVehicle();
        landingClear.mockReturnValue(false);
        player.toggleAirVehicle();
        expect(player.isInAirplane()).toBe(true);
        player.chooseVehicle(VehicleMedium.Air, Vehicle.None);
        expect(localUserStore.getVehicleForMedium(VehicleMedium.Air)).toBe(Vehicle.Airplane);
        expect(player.isInAirplane()).toBe(true);
        landingClear.mockReturnValue(true);
        player.chooseVehicle(VehicleMedium.Air, Vehicle.None);
        expect(player.isFlying()).toBe(false);
    });
    it("lands to get off when asked with the key, and only cancels a landing the key asked for", () => {
        const { player } = pilot();
        player.toggleAirVehicle();
        const state = player as unknown as {
            flight: AirplaneFlight;
            landingRequested: boolean;
            exitOnLanding: boolean;
        };
        state.flight.altitude = 500;
        // Arrows let go: the plane lands by itself and will stay parked.
        state.landingRequested = true;
        player.toggleAirVehicle();
        expect(state.exitOnLanding).toBe(true);
        expect(state.landingRequested).toBe(true);
        // The key again: the pilot changed its mind, the plane keeps flying.
        player.toggleAirVehicle();
        expect(state.landingRequested).toBe(false);
        expect(state.exitOnLanding).toBe(false);
        expect(player.isInAirplane()).toBe(true);
    });
    it("requires a selected airplane and a human avatar, and does not take off while following", () => {
        const { player } = pilot();
        localUserStore.setVehicleForMedium(VehicleMedium.Air, Vehicle.None);
        player.toggleAirVehicle();
        expect(player.isFlying()).toBe(false);
        localUserStore.setVehicleForMedium(VehicleMedium.Air, Vehicle.Airplane);
        followStateStore.set("active");
        player.toggleAirVehicle();
        expect(player.isFlying()).toBe(false);
        followStateStore.set("off");
        Object.assign(player, { sprites: new Map([["duck", mock<Phaser.GameObjects.Sprite>()]]) });
        player.toggleAirVehicle();
        expect(player.isFlying()).toBe(false);
    });
});

describe("the altitude in the pilot's hands", () => {
    type Piloted = {
        flight: AirplaneFlight;
        landingRequested: boolean;
        exitOnLanding: boolean;
        airSteering: boolean;
        pilotAltitude(events: ActiveEventList): -1 | 0 | 1;
        steerAirplane(x: number, y: number): { x: number; y: number };
    };
    const keys = (...held: UserInputEvent[]): ActiveEventList => {
        const events = new ActiveEventList();
        for (const event of held) events.set(event, true);
        return events;
    };
    function flying(): Piloted {
        const { player } = pilot();
        player.toggleAirVehicle();
        const state = player as unknown as Piloted;
        state.flight.altitude = 500;
        return state;
    }

    it("lands by itself when the arrows are let go, until the pilot took the altitude in hand", () => {
        const untouched = flying();
        untouched.steerAirplane(300, 0);
        untouched.steerAirplane(0, 0);
        expect(untouched.landingRequested).toBe(true);

        const held = flying();
        held.steerAirplane(300, 0);
        expect(held.pilotAltitude(keys(UserInputEvent.Climb))).toBe(1);
        held.steerAirplane(0, 0);
        expect(held.landingRequested).toBe(false);
    });

    it("cancels a landing the plane began by itself when climbing, not one the airplane key asked for", () => {
        const state = flying();
        state.landingRequested = true;
        state.pilotAltitude(keys(UserInputEvent.Climb));
        expect(state.landingRequested).toBe(false);

        state.landingRequested = true;
        state.exitOnLanding = true;
        state.pilotAltitude(keys(UserInputEvent.Climb));
        expect(state.landingRequested).toBe(true);
    });

    it("lands, on clear ground as any landing, once come down to the lowest flight level", () => {
        const state = flying();
        expect(state.pilotAltitude(keys(UserInputEvent.Descend))).toBe(-1);
        expect(state.landingRequested).toBe(false);
        state.flight.altitude = AIRPLANE_MIN_FLIGHT_ALTITUDE;
        state.pilotAltitude(keys(UserInputEvent.Descend));
        expect(state.landingRequested).toBe(true);
        // The plane stays parked once landed: the pilot did not ask to get off.
        expect(state.exitOnLanding).toBeFalsy();
    });

    it("does nothing with the descent key on the ground", () => {
        const state = flying();
        state.flight.altitude = 0;
        expect(state.pilotAltitude(keys(UserInputEvent.Descend))).toBe(0);
        expect(state.landingRequested).toBe(false);
    });
});
