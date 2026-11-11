import { afterEach, describe, expect, it, vi } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import { Player } from "@wa/front/Phaser/Player/Player";
import { ActiveEventList, UserInputEvent } from "@wa/front/Phaser/UserInput/UserInputManager";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { userMovingStore } from "@wa/front/Stores/GameStore";
import { NERF_KNOCKBACK_MS, NERF_KNOCKBACK_PX } from "@wa/front/Phaser/Game/Nerf/NerfBlink";

vi.mock("@wa/front/Phaser/Player/Seat", () => ({
    findSeatUnderFeet: vi.fn(),
    findSeatOfCharacter: vi.fn(),
    isSeatTaken: () => false,
}));
vi.mock("@wa/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));

function fixture(seated = false) {
    const player: Player = Object.create(Player.prototype);
    const body = { height: 16, offset: { y: 8 }, velocity: { x: 0, y: 0 }, setVelocity: vi.fn() };
    const scene = { time: { now: 1000 }, markDirty: vi.fn() };
    const emit = vi.fn();
    const standUp = vi.fn();
    Object.assign(player, {
        x: 100,
        y: 100,
        scene,
        _lastDirection: PositionMessage_Direction.RIGHT,
        getBody: () => body,
        updateSwimming: vi.fn(),
        updateObjectAction: vi.fn(),
        isSeated: () => seated,
        standUp,
        stop: vi.fn(),
        finishFollowingPath: vi.fn(),
        snapToTileCenter: vi.fn(),
        trySitDown: vi.fn(),
        isOnIceHere: () => false,
        emit,
    });
    return { player, body, scene, emit, standUp };
}

function input(...events: UserInputEvent[]): ActiveEventList {
    const active = new ActiveEventList();
    for (const event of events) active.set(event, true);
    return active;
}

afterEach(() => {
    userMovingStore.set(false);
    followStateStore.set("off");
    vi.clearAllMocks();
});

describe("Nerf knockback", () => {
    it("pushes a still avatar along the dart for a short while, whatever the keys, facing the same way", () => {
        const { player, body, scene, emit } = fixture();
        player.knockBack(-1, 0);
        player.moveUser(16, input(UserInputEvent.MoveRight));
        const speed = (NERF_KNOCKBACK_PX * 1000) / NERF_KNOCKBACK_MS;
        expect(body.setVelocity).toHaveBeenLastCalledWith(-speed, 0);
        expect(player.lastDirection).toBe(PositionMessage_Direction.RIGHT);
        expect(emit).toHaveBeenLastCalledWith("hasMoved", expect.objectContaining({ moving: true, x: 100, y: 100 }));

        scene.time.now = 1000 + NERF_KNOCKBACK_MS;
        player.moveUser(16, input());
        expect(body.setVelocity).not.toHaveBeenLastCalledWith(-speed, 0);
        expect(emit).toHaveBeenLastCalledWith("hasMoved", expect.objectContaining({ moving: false }));
    });

    it("stands a seated avatar up before pushing it", () => {
        const { player, standUp } = fixture(true);
        player.knockBack(0, 1);
        expect(standUp).toHaveBeenCalledTimes(1);
    });
});
