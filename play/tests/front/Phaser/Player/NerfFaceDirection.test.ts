import { describe, expect, it, vi } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import { Player } from "@wa/front/Phaser/Player/Player";

vi.mock("@wa/front/Phaser/Player/Seat", () => ({
    findSeatUnderFeet: vi.fn(),
    findSeatOfCharacter: vi.fn(),
    isSeatTaken: () => false,
}));
vi.mock("@wa/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));

function fixture({ velocity = { x: 0, y: 0 }, seated = false, riding = false } = {}) {
    const player: Player = Object.create(Player.prototype);
    const emit = vi.fn();
    const playAnimation = vi.fn();
    Object.assign(player, {
        x: 100,
        y: 100,
        _lastDirection: PositionMessage_Direction.RIGHT,
        getBody: () => ({ velocity }),
        isSeated: () => seated,
        isRidingVehicle: () => riding,
        isSlidingToSeat: false,
        playAnimation,
        emit,
    });
    return { player, emit, playAnimation };
}

describe("Player.faceDirection", () => {
    it("turns a still avatar to face a shot at the pointer, and tells the others", () => {
        const { player, emit, playAnimation } = fixture();
        player.faceDirection(PositionMessage_Direction.LEFT);
        expect(player.lastDirection).toBe(PositionMessage_Direction.LEFT);
        expect(emit).toHaveBeenCalledWith("hasMoved", {
            moving: false,
            running: false,
            direction: PositionMessage_Direction.LEFT,
            x: 100,
            y: 100,
        });
        expect(playAnimation).toHaveBeenCalledWith(PositionMessage_Direction.LEFT, false);
    });

    it.each([
        { name: "walks", options: { velocity: { x: 0, y: 80 } } },
        { name: "sits", options: { seated: true } },
        { name: "rides", options: { riding: true } },
    ])("keeps its way while it $name", ({ options }) => {
        const { player, emit } = fixture(options);
        player.faceDirection(PositionMessage_Direction.LEFT);
        expect(player.lastDirection).toBe(PositionMessage_Direction.RIGHT);
        expect(emit).not.toHaveBeenCalled();
    });

    it("tells nothing when it already faces that way", () => {
        const { player, emit } = fixture();
        player.faceDirection(PositionMessage_Direction.RIGHT);
        expect(emit).not.toHaveBeenCalled();
    });
});
