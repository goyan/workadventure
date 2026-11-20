import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import { Player } from "@wa/front/Phaser/Player/Player";
import { ActiveEventList, UserInputEvent } from "@wa/front/Phaser/UserInput/UserInputManager";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { userMovingStore } from "@wa/front/Stores/GameStore";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { Vehicle, readVehicleState } from "@wa/front/Phaser/Vehicle/Vehicle";

vi.mock("@wa/front/Phaser/Player/Seat", () => ({
    findSeatUnderFeet: vi.fn(),
    findSeatOfCharacter: vi.fn(),
    isSeatTaken: () => false,
}));
vi.mock("@wa/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));

/** A player in a current that carries it south at 30 px a second. */
function fixture(realMove = false) {
    const player: Player = Object.create(Player.prototype);
    const emit = vi.fn();
    const moveBy = vi.fn();
    const playAnimation = vi.fn();
    const velocity = { x: 0, y: 0 };
    Object.assign(player, {
        vehicleState: readVehicleState(null),
        x: 16,
        y: 0,
        _lastDirection: PositionMessage_Direction.LEFT,
        getBody: () => ({
            height: 16,
            offset: { y: 8 },
            velocity,
            setVelocity: (x: number, y: number) => Object.assign(velocity, { x, y }),
        }),
        stop: vi.fn(),
        snapToTileCenter: vi.fn(),
        getBodyBox: () => ({ left: 8, right: 24, top: 8, bottom: 24 }),
        updateSwimming: vi.fn(),
        updateCanoe: vi.fn(),
        updateObjectAction: vi.fn(),
        releaseSeatObjectWhenOut: vi.fn(),
        sitPrompt: { show: vi.fn(), hide: vi.fn() },
        waterCurrentPush: () => ({ x: 0, y: 30 }),
        isOnIceHere: () => false,
        playAnimation,
        runSmokeTrail: { emit: vi.fn() },
        emit,
        ...(realMove ? {} : { moveBy }),
    });
    return { player, emit, moveBy, playAnimation, velocity };
}

function input(...events: UserInputEvent[]): ActiveEventList {
    const active = new ActiveEventList();
    for (const event of events) active.set(event, true);
    return active;
}

beforeEach(() => {
    localStorage.clear();
    localUserStore.setVehicle(Vehicle.None);
    followStateStore.set("off");
    userMovingStore.set(false);
});
afterEach(() => {
    userMovingStore.set(false);
    followStateStore.set("off");
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("an avatar carried by the current of the water", () => {
    it("drifts without walking: it moves, and tells the others it does not walk", () => {
        const { player, emit, moveBy } = fixture();
        player.moveUser(16, input());
        // Carried at the speed of the current, not animated as a walker.
        expect(moveBy).toHaveBeenCalledWith(0, 30, false, false);
        expect(emit).toHaveBeenCalledWith(
            "hasMoved",
            expect.objectContaining({ moving: false, running: false, direction: PositionMessage_Direction.LEFT }),
        );
    });

    it("walks as usual when it is steered, the current added to its move", () => {
        const { player, emit, moveBy } = fixture();
        player.moveUser(16, input(UserInputEvent.MoveRight));
        const [x, y, running, walking] = moveBy.mock.calls[0];
        expect(x).toBeGreaterThan(0);
        expect(y).toBe(30);
        expect([running, walking]).toEqual([false, true]);
        expect(emit).toHaveBeenCalledWith(
            "hasMoved",
            expect.objectContaining({ moving: true, direction: PositionMessage_Direction.RIGHT }),
        );
    });

    it("keeps facing where it faced and stands still while it drifts", () => {
        const { player, playAnimation, velocity } = fixture(true);
        player.moveUser(16, input());
        expect(velocity).toEqual({ x: 0, y: 30 });
        // Not turned towards where the water takes it, and no walking animation.
        expect(playAnimation).toHaveBeenLastCalledWith(PositionMessage_Direction.LEFT, false, 1);
    });
});
